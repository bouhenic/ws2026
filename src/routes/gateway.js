const express = require('express');
const config = require('../config');
const { queryRows } = require('../influx');
const { isValidDuration, isValidAggregate } = require('../fields');

const router = express.Router();

// Nombre de trames retournées par /gateway/traffic
const TRAFFIC_LIMIT_DEFAULT = 1000;
const TRAFFIC_LIMIT_MAX = 5000;

/**
 * @openapi
 * /api/gateway/traffic:
 *   get:
 *     tags: [Passerelle]
 *     summary: Trames LoRaWAN relayées par la passerelle
 *     description: |
 *       Toutes les trames entendues par la passerelle du lycée, y compris celles
 *       d'autres réseaux LoRaWAN. Uniquement des métadonnées radio — les payloads
 *       sont chiffrés de bout en bout et ne sont ni collectés ni déchiffrables.
 *
 *       Chaque trame : `devAddr` (adresse réseau, ou DevEUI pour un join request),
 *       `direction` (up/down), `mtype` (UNCONFIRMED_UP, JOIN_REQUEST…), `rssi` (dBm),
 *       `snr` (dB), `spreadingFactor`, `frequency` (MHz), `fCnt`.
 *     parameters:
 *       - in: query
 *         name: duration
 *         schema: { type: string, default: "-24h" }
 *         description: "Plage de temps relative au format Flux : `-6h`, `-24h`, `-7d`"
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 1000, maximum: 5000 }
 *         description: Nombre maximal de trames (les plus récentes d'abord)
 *     responses:
 *       200:
 *         description: Trames, de la plus récente à la plus ancienne
 *         content:
 *           application/json:
 *             example:
 *               - _time: "2026-06-12T15:07:43Z"
 *                 devAddr: "260BEA90"
 *                 direction: up
 *                 mtype: CONFIRMED_UP
 *                 rssi: -83
 *                 snr: 8
 *                 spreadingFactor: 7
 *                 frequency: 868.3
 *                 fCnt: 893
 *       400:
 *         description: Durée ou limite invalide
 *       401:
 *         description: Clé API manquante ou invalide
 */
router.get('/gateway/traffic', async (req, res) => {
    const duration = req.query.duration || '-24h';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : TRAFFIC_LIMIT_DEFAULT;

    if (!isValidDuration(duration)) {
        return res.status(400).json({ error: `Durée invalide : ${duration} (format attendu : -30m, -6h, -7d, max 1 an)` });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > TRAFFIC_LIMIT_MAX) {
        return res.status(400).json({ error: `Limite invalide : ${req.query.limit} (entier entre 1 et ${TRAFFIC_LIMIT_MAX})` });
    }

    const fluxQuery = `from(bucket: "${config.influx.bucket}")
        |> range(start: ${duration})
        |> filter(fn: (r) => r._measurement == "gateway_traffic")
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> group()
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${limit})`;

    try {
        const rows = await queryRows(fluxQuery);
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur InfluxDB (/api/gateway/traffic) :', error.message);
        res.status(500).json({ error: 'Erreur lors de la requête InfluxDB' });
    }
});

/**
 * @openapi
 * /api/gateway/noise:
 *   get:
 *     tags: [Passerelle]
 *     summary: Trames entendues vs trames valides (bruit radio)
 *     description: |
 *       Compteurs du packet forwarder agrégés par fenêtre : `rxin` (trames détectées),
 *       `rxok` (CRC valide), `rxfw` (relayées au réseau). L'écart entre rxin et rxok
 *       mesure le bruit radio ambiant et les collisions.
 *     parameters:
 *       - in: query
 *         name: duration
 *         schema: { type: string, default: "-24h" }
 *         description: "Plage de temps relative au format Flux"
 *       - in: query
 *         name: aggregate
 *         schema: { type: string, default: "1h" }
 *         description: "Fenêtre de cumul : `15m`, `1h`, `6h`"
 *     responses:
 *       200:
 *         description: Séries cumulées par fenêtre
 *         content:
 *           application/json:
 *             example:
 *               - _time: "2026-06-12T15:00:00Z"
 *                 rxin: 42
 *                 rxok: 12
 *                 rxfw: 12
 *       400:
 *         description: Durée ou agrégation invalide
 *       401:
 *         description: Clé API manquante ou invalide
 */
router.get('/gateway/noise', async (req, res) => {
    const duration = req.query.duration || '-24h';
    const aggregate = req.query.aggregate || '1h';

    if (!isValidDuration(duration)) {
        return res.status(400).json({ error: `Durée invalide : ${duration} (format attendu : -30m, -6h, -7d, max 1 an)` });
    }
    if (!isValidAggregate(aggregate)) {
        return res.status(400).json({ error: `Agrégation invalide : ${aggregate} (format attendu : 30s, 15m, 2h)` });
    }

    const fluxQuery = `from(bucket: "${config.influx.bucket}")
        |> range(start: ${duration})
        |> filter(fn: (r) => r._measurement == "gateway_status")
        |> filter(fn: (r) => r._field == "rxin" or r._field == "rxok" or r._field == "rxfw")
        |> aggregateWindow(every: ${aggregate}, fn: sum, createEmpty: false)
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> group()
        |> sort(columns: ["_time"])`;

    try {
        const rows = await queryRows(fluxQuery);
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur InfluxDB (/api/gateway/noise) :', error.message);
        res.status(500).json({ error: 'Erreur lors de la requête InfluxDB' });
    }
});

// Cache des stats de connexion TTN : une page ouverte ne doit pas marteler TTN
let statsCache = { at: 0, data: null };
const STATS_CACHE_MS = 30_000;

/**
 * @openapi
 * /api/gateway/stats:
 *   get:
 *     tags: [Passerelle]
 *     summary: État de connexion de la passerelle (temps réel TTN)
 *     description: |
 *       Stats de connexion fournies par le Gateway Server TTN : compteurs cumulés
 *       uplink/downlink, temps aller-retour, et utilisation du duty cycle par
 *       sous-bande EU868 (limite réglementaire de 1 % ou 10 % selon la bande).
 *       Mise en cache 30 s côté API.
 *     responses:
 *       200:
 *         description: Stats de connexion (structure TTN GatewayConnectionStats)
 *       401:
 *         description: Clé API manquante ou invalide
 *       502:
 *         description: TTN inaccessible
 *       503:
 *         description: Collecte passerelle non configurée
 */
router.get('/gateway/stats', async (req, res) => {
    if (!config.ttn.gatewayApiKey) {
        return res.status(503).json({ error: 'Collecte passerelle non configurée (TTN_GATEWAY_API_KEY absent)' });
    }
    if (statsCache.data && Date.now() - statsCache.at < STATS_CACHE_MS) {
        return res.json(statsCache.data);
    }

    try {
        const response = await fetch(
            `${config.ttn.baseUrl}/api/v3/gs/gateways/${config.ttn.gatewayId}/connection/stats`,
            { headers: { Authorization: `Bearer ${config.ttn.gatewayApiKey}` } },
        );
        if (!response.ok) throw new Error(`TTN HTTP ${response.status}`);
        const stats = await response.json();

        // Le site est public : on ne republie pas l'adresse IP de la passerelle
        delete stats.gateway_remote_address;
        if (stats.last_status) delete stats.last_status.ip;

        statsCache = { at: Date.now(), data: stats };
        res.json(stats);
    } catch (error) {
        console.error('❌ Erreur TTN (/api/gateway/stats) :', error.message);
        res.status(502).json({ error: 'Stats de connexion TTN indisponibles' });
    }
});

module.exports = router;
