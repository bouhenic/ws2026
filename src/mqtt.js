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

            writeApi.writePoint(point);
            status.lastUplinkAt = new Date().toISOString();
            status.uplinkCount++;
            console.log(
                `📥 Uplink ${deviceId || '?'} : ${fieldCount} champs ` +
                `(temp=${decoded.temperature}°C, hum=${decoded.humidity}%, batt=${decoded.batteryVoltage}V)`
            );
        } catch (error) {
            console.error(`❌ Erreur de traitement du message sur ${topic} :`, error.message);
        }
    });

    return client;
}

module.exports = { start, status };
