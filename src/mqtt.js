const mqtt = require('mqtt');
const { Point } = require('@influxdata/influxdb-client');
const config = require('./config');
const { writeApi } = require('./influx');
const { NUMERIC_FIELDS, STRING_FIELDS } = require('./fields');

const status = {
    connected: false,
    lastUplinkAt: null,
    uplinkCount: 0,
};

// Métadonnées radio LoRaWAN de l'enveloppe TTN. La trame peut être reçue par
// plusieurs passerelles (rx_metadata) : on garde la meilleure (RSSI max).
// Tout est stocké en float pour éviter les conflits de type InfluxDB.
function addLorawanFields(point, uplink) {
    const gateways = (uplink.rx_metadata ?? []).filter((gw) => Number.isFinite(gw.rssi));
    if (gateways.length > 0) {
        const best = gateways.reduce((a, b) => (b.rssi > a.rssi ? b : a));
        point.floatField('rssi', best.rssi);
        if (Number.isFinite(best.snr)) point.floatField('snr', best.snr);
        point.floatField('gatewayCount', gateways.length);
        const gatewayId = best.gateway_ids?.gateway_id;
        if (gatewayId) point.stringField('gatewayId', gatewayId);
    }

    const sf = uplink.settings?.data_rate?.lora?.spreading_factor;
    if (Number.isFinite(sf)) point.floatField('spreadingFactor', sf);

    const frequencyHz = Number(uplink.settings?.frequency);
    if (Number.isFinite(frequencyHz) && frequencyHz > 0) {
        point.floatField('frequency', frequencyHz / 1e6); // MHz
    }

    // f_cnt est omis du JSON TTN quand il vaut 0 (proto3)
    point.floatField('fCnt', uplink.f_cnt ?? 0);

    const airtimeS = parseFloat(uplink.consumed_airtime); // ex. "0.061696s"
    if (Number.isFinite(airtimeS)) point.floatField('airtime', airtimeS * 1000); // ms
}

function start() {
    const client = mqtt.connect(config.mqtt.url, {
        username: config.mqtt.username,
        password: config.mqtt.password,
        reconnectPeriod: 5_000,
    });

    client.on('connect', () => {
        status.connected = true;
        console.log(`✅ Connecté au broker MQTT ${config.mqtt.url}`);
        client.subscribe(config.mqtt.topic, (err) => {
            if (err) {
                console.error(`❌ Abonnement impossible au topic ${config.mqtt.topic}`, err);
            } else {
                console.log(`📡 Abonné au topic ${config.mqtt.topic}`);
            }
        });
    });

    client.on('close', () => {
        status.connected = false;
    });

    client.on('error', (err) => {
        console.error('❌ Erreur MQTT :', err.message);
    });

    client.on('message', (topic, message) => {
        try {
            const payload = JSON.parse(message.toString());
            const decoded = payload.uplink_message?.decoded_payload;
            if (!decoded) return;

            const point = new Point(config.influx.measurement)
                .tag('location', config.influx.locationTag)
                .timestamp(new Date());

            const deviceId = payload.end_device_ids?.device_id;
            if (deviceId) point.tag('device', deviceId);

            let fieldCount = 0;
            for (const field of NUMERIC_FIELDS) {
                if (typeof decoded[field] === 'number' && Number.isFinite(decoded[field])) {
                    point.floatField(field, decoded[field]);
                    fieldCount++;
                }
            }
            for (const field of STRING_FIELDS) {
                if (typeof decoded[field] === 'string') {
                    point.stringField(field, decoded[field]);
                    fieldCount++;
                }
            }

            if (fieldCount === 0) {
                console.warn(`⚠️ Uplink sans champ exploitable sur ${topic}`);
                return;
            }

            addLorawanFields(point, payload.uplink_message);

            writeApi.writePoint(point);
            status.lastUplinkAt = new Date().toISOString();
            status.uplinkCount++;
            const bestGw = payload.uplink_message.rx_metadata?.[0];
            console.log(
                `📥 Uplink ${deviceId || '?'} : ${fieldCount} champs ` +
                `(temp=${decoded.temperature}°C, hum=${decoded.humidity}%, batt=${decoded.batteryVoltage}V, ` +
                `rssi=${bestGw?.rssi ?? '?'}dBm, snr=${bestGw?.snr ?? '?'}dB)`
            );
        } catch (error) {
            console.error(`❌ Erreur de traitement du message sur ${topic} :`, error.message);
        }
    });

    return client;
}

module.exports = { start, status };
