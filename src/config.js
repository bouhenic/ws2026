require('dotenv').config();

function required(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`❌ Variable d'environnement manquante : ${name}`);
        process.exit(1);
    }
    return value;
}

module.exports = {
    port: parseInt(process.env.PORT || '3000', 10),
    apiKey: required('API_KEY'),
    mqtt: {
        url: process.env.MQTT_URL || 'mqtts://eu1.cloud.thethings.network:8883',
        username: required('MQTT_USERNAME'),
        password: required('MQTT_PASSWORD'),
        topic: process.env.MQTT_TOPIC || `v3/${process.env.MQTT_USERNAME}/devices/+/up`,
    },
    // Trafic de la passerelle LoRaWAN via l'API Events de TTN.
    // Optionnel : sans clé, le collecteur ne démarre pas (le reste fonctionne).
    ttn: {
        baseUrl: process.env.TTN_BASE_URL || 'https://eu1.cloud.thethings.network',
        gatewayId: process.env.TTN_GATEWAY_ID || 'newton-laird',
        gatewayApiKey: process.env.TTN_GATEWAY_API_KEY || null,
    },
    influx: {
        url: process.env.INFLUX_URL || 'http://localhost:8086',
        token: required('INFLUX_TOKEN'),
        org: required('INFLUX_ORG'),
        bucket: required('INFLUX_BUCKET'),
        measurement: 'sensor_data',
        locationTag: process.env.LOCATION_TAG || 'garden',
    },
};
