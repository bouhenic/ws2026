const { Point } = require('@influxdata/influxdb-client');
const config = require('./config');
const { writeApi } = require('./influx');

// Collecteur du trafic de la passerelle LoRaWAN via l'API Events de TTN.
// Contrairement au flux MQTT applicatif (nos capteurs uniquement), la
// passerelle relaie toutes les trames LoRaWAN qu'elle entend, y compris
// celles d'autres réseaux : on n'en voit que les métadonnées radio, les
// payloads restent chiffrés.
//
// Particularités du flux Events constatées en test :
// - TTN ferme le stream au bout d'une minute environ → reconnexion en boucle
// - le paramètre `tail` rejoue les derniers événements à la connexion, ce qui
//   couvre la coupure ; les doublons sont filtrés par unique_id (et InfluxDB
//   écrase de toute façon un point identique au même timestamp)

const TAIL = 50;
const SEEN_MAX = 1_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

const status = {
    enabled: Boolean(config.ttn.gatewayApiKey),
    connected: false,
    lastEventAt: null,
    frameCount: 0,
    reconnects: 0,
};

const seenIds = new Set();
let abortController = null;
let stopped = false;
let eventsThisConnection = 0;

function markSeen(uniqueId) {
    if (!uniqueId) return false;
    if (seenIds.has(uniqueId)) return true;
    seenIds.add(uniqueId);
    if (seenIds.size > SEEN_MAX) {
        for (const id of seenIds) {
            seenIds.delete(id);
            if (seenIds.size <= SEEN_MAX / 2) break;
        }
    }
    return false;
}

// Paramètres radio (tout en float, comme mqtt.js). Les uplinks les portent
// dans `settings`, les downlinks dans `scheduled`.
function addRadioSettings(point, settings) {
    let count = 0;
    const sf = settings?.data_rate?.lora?.spreading_factor;
    if (Number.isFinite(sf)) {
        point.floatField('spreadingFactor', sf);
        count++;
    }
    const frequencyHz = Number(settings?.frequency);
    if (Number.isFinite(frequencyHz) && frequencyHz > 0) {
        point.floatField('frequency', frequencyHz / 1e6); // MHz
        count++;
    }
    return count;
}

// Types de message LoRaWAN (3 bits de poids fort du MHDR)
const M_TYPES = [
    'JOIN_REQUEST', 'JOIN_ACCEPT', 'UNCONFIRMED_UP',
    'UNCONFIRMED_DOWN', 'CONFIRMED_UP', 'CONFIRMED_DOWN',
];

// L'en-tête d'une trame LoRaWAN n'est pas chiffré : type de message dans le
// premier octet, DevAddr (little-endian) dans les 4 suivants pour les trames
// de données. C'est le seul moyen d'identifier un downlink, que TTN fournit
// brut (raw_payload base64) dans gs.down.send.
function parseFrameHeader(rawPayloadB64) {
    if (typeof rawPayloadB64 !== 'string') return {};
    const buf = Buffer.from(rawPayloadB64, 'base64');
    if (buf.length < 1) return {};
    const mtype = M_TYPES[(buf[0] >> 5) & 0x07];
    const hasDevAddr = buf.length >= 5
        && ['UNCONFIRMED_UP', 'UNCONFIRMED_DOWN', 'CONFIRMED_UP', 'CONFIRMED_DOWN'].includes(mtype);
    return {
        mtype,
        devAddr: hasDevAddr ? buf.readUInt32LE(1).toString(16).toUpperCase().padStart(8, '0') : undefined,
    };
}

// gs.up.receive : une trame LoRaWAN entendue et relayée par la passerelle
function writeUplink(event) {
    const message = event.data?.message;
    const payload = message?.payload;
    if (!message || !payload?.m_hdr?.m_type) return;

    // Trame de données : DevAddr visible. Join request : pas encore de
    // DevAddr, on identifie par le DevEUI (transmis en clair par protocole).
    const devAddr = payload.mac_payload?.f_hdr?.dev_addr
        ?? payload.join_request_payload?.dev_eui
        ?? 'unknown';

    const point = new Point('gateway_traffic')
        .tag('direction', 'up')
        .tag('mtype', payload.m_hdr.m_type)
        .tag('devAddr', devAddr)
        .timestamp(new Date(message.received_at ?? event.time));

    const rx = message.rx_metadata?.[0];
    if (Number.isFinite(rx?.rssi)) point.floatField('rssi', rx.rssi);
    if (Number.isFinite(rx?.snr)) point.floatField('snr', rx.snr);
    addRadioSettings(point, message.settings);

    const fCnt = payload.mac_payload?.f_hdr?.f_cnt;
    point.floatField('fCnt', Number.isFinite(fCnt) ? fCnt : 0);

    // Pas de consumed_airtime dans l'événement gateway : il faudrait le
    // recalculer (SF, bande passante, taille) — hors périmètre pour l'instant.

    writeApi.writePoint(point);
    status.frameCount++;
}

// gs.down.send : un downlink émis par la passerelle. TTN ne fournit que la
// trame brute, on décode son en-tête (en clair par protocole).
function writeDownlink(event) {
    const data = event.data;
    if (!data) return;
    const header = parseFrameHeader(data.raw_payload);

    const point = new Point('gateway_traffic')
        .tag('direction', 'down')
        .tag('mtype', header.mtype ?? 'DOWNLINK')
        .tag('devAddr', header.devAddr ?? 'unknown')
        .timestamp(new Date(event.time));

    // Un point InfluxDB doit porter au moins un field
    if (addRadioSettings(point, data.scheduled) === 0) return;

    writeApi.writePoint(point);
    status.frameCount++;
}

// gs.status.receive : compteurs du packet forwarder depuis le dernier statut.
// rxin = trames entendues, rxok = CRC valide, rxfw = relayées au réseau :
// l'écart rxin/rxok mesure le bruit radio ambiant.
function writeStatus(event) {
    const metrics = event.data?.metrics;
    if (!metrics) return;

    const point = new Point('gateway_status')
        .timestamp(new Date(event.data.time ?? event.time));

    let fieldCount = 0;
    for (const name of ['rxin', 'rxok', 'rxfw', 'txin', 'txok', 'ackr']) {
        if (Number.isFinite(metrics[name])) {
            point.floatField(name, metrics[name]);
            fieldCount++;
        }
    }
    if (fieldCount > 0) writeApi.writePoint(point);
}

function handleLine(line) {
    let event;
    try {
        event = JSON.parse(line).result;
    } catch {
        return;
    }
    if (!event?.name) return;
    eventsThisConnection++;
    if (markSeen(event.unique_id)) return;

    status.lastEventAt = new Date().toISOString();
    switch (event.name) {
        case 'gs.up.receive': writeUplink(event); break;
        case 'gs.down.send': writeDownlink(event); break;
        case 'gs.status.receive': writeStatus(event); break;
        default: break; // stats de connexion, forwards… ignorés
    }
}

// Une connexion au stream : résout quand TTN ferme (normal), rejette en erreur
async function streamOnce() {
    abortController = new AbortController();
    const response = await fetch(`${config.ttn.baseUrl}/api/v3/events`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.ttn.gatewayApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            identifiers: [{ gateway_ids: { gateway_id: config.ttn.gatewayId } }],
            tail: TAIL,
        }),
        signal: abortController.signal,
    });

    if (!response.ok) {
        response.body?.cancel();
        throw new Error(`TTN Events HTTP ${response.status}`);
    }

    status.connected = true;
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line) handleLine(line);
        }
    }
    if (buffer.trim()) handleLine(buffer.trim());
}

async function run() {
    let backoff = BACKOFF_MIN_MS;
    while (!stopped) {
        eventsThisConnection = 0;
        let failure = null;
        try {
            await streamOnce();
        } catch (err) {
            if (stopped) break;
            failure = err;
        }
        status.connected = false;
        status.reconnects++;

        // TTN coupe le stream régulièrement (parfois après quelques secondes) :
        // tant que la connexion a livré des événements, c'est le régime normal
        // et on repart vite — le tail rejouera ce qui est passé entre-temps.
        // Le backoff exponentiel est réservé aux connexions stériles (réseau
        // coupé, clé révoquée, rate-limit TTN…).
        if (eventsThisConnection > 0) {
            backoff = BACKOFF_MIN_MS;
        } else {
            backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
            console.error(
                `❌ Stream TTN Events sans événement (${failure ? failure.message : 'fermé par le serveur'}), `
                + `nouvelle tentative dans ${Math.round(backoff / 1000)} s`,
            );
        }
        await new Promise((resolve) => setTimeout(resolve, backoff));
    }
}

function start() {
    if (!status.enabled) {
        console.warn('⚠️ TTN_GATEWAY_API_KEY absent : trafic passerelle non collecté');
        return;
    }
    console.log(`📡 Collecte du trafic de la passerelle ${config.ttn.gatewayId} (TTN Events)`);
    run();
}

function stop() {
    stopped = true;
    abortController?.abort();
}

module.exports = { start, stop, status };
