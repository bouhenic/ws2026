const express = require('express');
const config = require('../config');
const { queryRows } = require('../influx');
const { ALL_FIELDS, AGGREGATE_FNS, isValidDuration, isValidAggregate } = require('../fields');
const { status: mqttStatus } = require('../mqtt');

const router = express.Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Système]
 *     summary: État du service (sans authentification)
 *     security: []
 *     responses:
 *       200:
 *         description: État de l'API et de l'ingestion MQTT
 *         content:
 *           application/json:
 *             example:
 *               status: ok
 *               mqttConnected: true
 *               lastUplinkAt: "2026-06-10T09:42:00.000Z"
 *               uplinkCount: 128
 *               uptimeSeconds: 86400
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mqttConnected: mqttStatus.connected,
        lastUplinkAt: mqttStatus.lastUplinkAt,
        uplinkCount: mqttStatus.uplinkCount,
        uptimeSeconds: Math.round(process.uptime()),
    });
});

/**
 * @openapi
 * /api/latest:
 *   get:
 *     tags: [Données capteurs]
 *     summary: Dernier relevé de tous les capteurs
 *     description: Retourne la dernière valeur connue de chaque champ (recherche sur les 24 dernières heures).
 *     responses:
 *       200:
 *         description: Dernières valeurs par champ
 *         content:
 *           application/json:
 *             example:
 *               temperature: { value: 22.5, time: "2026-06-10T09:40:00Z" }
 *               humidity: { value: 61.2, time: "2026-06-10T09:40:00Z" }
 *       401:
 *         description: Clé API manquante ou invalide
 */
router.get('/latest', async (req, res) => {
    const fluxQuery = `from(bucket: "${config.influx.bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "${config.influx.measurement}")
        |> last()`;

    try {
        const rows = await queryRows(fluxQuery);
        const latest = {};
        for (const row of rows) {
            latest[row._field] = { value: row._value, time: row._time };
        }
        res.json(latest);
    } catch (error) {
        console.error('❌ Erreur InfluxDB (/api/latest) :', error.message);
        res.status(500).json({ error: 'Erreur lors de la requête InfluxDB' });
    }
});

/**
 * @openapi
 * /api/data/{field}:
 *   get:
 *     tags: [Données capteurs]
 *     summary: Série temporelle d'un champ météo
 *     description: |
 *       Retourne la série temporelle du champ demandé depuis InfluxDB.
 *
 *       **Champs numériques :** `temperature`, `humidity`, `pressure`, `rainfall`, `avgSpeed`,
 *       `maxSpeed`, `avgDirection`, `maxSpeedDirection`, `batteryVoltage`, `gas`, `iaq`, `tempDS18B20`
 *
 *       **Champs texte :** `avgDirectionCardinal`, `maxSpeedDirectionCardinal`
 *
 *       **Champs radio LoRaWAN** (métadonnées de l'enveloppe TTN, meilleure passerelle) :
 *       `rssi` (dBm), `snr` (dB), `spreadingFactor` (SF7-SF12), `frequency` (MHz),
 *       `gatewayCount`, `fCnt` (compteur de trames), `airtime` (ms), `gatewayId` (texte)
 *     parameters:
 *       - in: path
 *         name: field
 *         required: true
 *         schema:
 *           type: string
 *           enum: [temperature, humidity, pressure, rainfall, avgSpeed, maxSpeed,
 *                  avgDirection, avgDirectionCardinal, maxSpeedDirection,
 *                  maxSpeedDirectionCardinal, batteryVoltage, gas, iaq, tempDS18B20,
 *                  rssi, snr, spreadingFactor, frequency, gatewayCount, fCnt,
 *                  airtime, gatewayId]
 *         description: Nom du champ à récupérer
 *         example: temperature
 *       - in: query
 *         name: duration
 *         required: false
 *         schema:
 *           type: string
 *           default: "-1h"
 *         description: "Plage de temps relative au format Flux : `-30m`, `-6h`, `-24h`, `-7d` (max 1 an)"
 *       - in: query
 *         name: aggregate
 *         required: false
 *         schema:
 *           type: string
 *         description: "Fenêtre d'agrégation pour réduire le volume : `15m`, `1h`, `6h`"
 *         example: "30m"
 *       - in: query
 *         name: fn
 *         required: false
 *         schema:
 *           type: string
 *           enum: [mean, sum, min, max]
 *           default: mean
 *         description: "Fonction appliquée à chaque fenêtre d'agrégation (ex. `sum` pour cumuler les précipitations)"
 *     responses:
 *       200:
 *         description: Série temporelle
 *         content:
 *           application/json:
 *             example:
 *               - _time: "2026-06-10T09:30:00Z"
 *                 _value: 22.5
 *                 _field: temperature
 *                 _measurement: sensor_data
 *                 location: garden
 *       400:
 *         description: Champ, durée ou agrégation invalide
 *       401:
 *         description: Clé API manquante ou invalide
 *       500:
 *         description: Erreur serveur (InfluxDB inaccessible)
 */
router.get('/data/:field', async (req, res) => {
    const { field } = req.params;
    const duration = req.query.duration || '-1h';
    const aggregate = req.query.aggregate;
    const aggregateFn = req.query.fn || 'mean';

    // Validation stricte : tout est interpolé dans la requête Flux
    if (!ALL_FIELDS.includes(field)) {
        return res.status(400).json({ error: `Champ inconnu : ${field}`, fields: ALL_FIELDS });
    }
    if (!isValidDuration(duration)) {
        return res.status(400).json({ error: `Durée invalide : ${duration} (format attendu : -30m, -6h, -7d, max 1 an)` });
    }
    if (aggregate && !isValidAggregate(aggregate)) {
        return res.status(400).json({ error: `Agrégation invalide : ${aggregate} (format attendu : 30s, 15m, 2h)` });
    }
    if (!AGGREGATE_FNS.includes(aggregateFn)) {
        return res.status(400).json({ error: `Fonction d'agrégation invalide : ${aggregateFn}`, fns: AGGREGATE_FNS });
    }

    let fluxQuery = `from(bucket: "${config.influx.bucket}")
        |> range(start: ${duration})
        |> filter(fn: (r) => r._measurement == "${config.influx.measurement}" and r._field == "${field}")`;
    if (aggregate) {
        fluxQuery += `\n        |> aggregateWindow(every: ${aggregate}, fn: ${aggregateFn}, createEmpty: false)`;
    }

    try {
        const rows = await queryRows(fluxQuery);
        res.json(rows);
    } catch (error) {
        console.error(`❌ Erreur InfluxDB (/api/data/${field}) :`, error.message);
        res.status(500).json({ error: 'Erreur lors de la requête InfluxDB' });
    }
});

module.exports = router;
