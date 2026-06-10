const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'API Station Météo LoRaWAN',
        version: '2.0.0',
        description: `API REST pour la récupération des données météo issues d'une station LoRaWAN (TTN) stockées dans InfluxDB.

**Authentification :** toutes les routes \`/api/*\` (sauf \`/api/health\`) exigent le header \`X-API-Key\`.

**Champs numériques :** \`avgDirection\`, \`avgSpeed\`, \`batteryVoltage\`, \`gas\`, \`humidity\`, \`iaq\`, \`maxSpeed\`, \`maxSpeedDirection\`, \`pressure\`, \`rainfall\`, \`tempDS18B20\`, \`temperature\`

**Champs texte :** \`avgDirectionCardinal\`, \`maxSpeedDirectionCardinal\``,
        contact: {
            name: 'BTS CIEL - Lycée Newton',
        },
    },
    servers: [
        { url: 'https://weatherstation.cielnewton.fr', description: 'Serveur de production' },
        { url: 'http://localhost:3000', description: 'Serveur local (dev)' },
    ],
    tags: [
        { name: 'Données capteurs', description: 'Récupération des mesures météo depuis InfluxDB' },
        { name: 'Système', description: 'Supervision du service' },
    ],
    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Key',
            },
        },
    },
    security: [{ ApiKeyAuth: [] }],
};

module.exports = swaggerJsdoc({
    swaggerDefinition,
    apis: [path.join(__dirname, 'routes', '*.js')],
});
