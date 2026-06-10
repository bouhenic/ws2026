const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const { writeApi } = require('./influx');
const ingester = require('./mqtt');
const { apiKeyAuth } = require('./middleware/auth');
const dataRoutes = require('./routes/data');
const swaggerSpec = require('./swagger');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false })); // CSP gérée côté nginx, et Swagger UI a besoin d'inline scripts

// ── Documentation (publique) ─────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'API Météo LoRaWAN',
    swaggerOptions: {
        docExpansion: 'list',
        filter: true,
        displayRequestDuration: true,
    },
}));

app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
});

// ── Routes API ───────────────────────────────
// /api/health est public, tout le reste exige la clé API
app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    return apiKeyAuth(req, res, next);
}, dataRoutes);

app.use((req, res) => {
    res.status(404).json({ error: 'Route inconnue' });
});

// ── Démarrage ────────────────────────────────
const mqttClient = ingester.start();

const server = app.listen(config.port, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${config.port}`);
    console.log(`📚 Documentation Swagger : http://localhost:${config.port}/api-docs`);
});

// ── Arrêt propre ─────────────────────────────
async function shutdown(signal) {
    console.log(`\n${signal} reçu, arrêt en cours…`);
    server.close();
    mqttClient.end();
    try {
        await writeApi.close();
        console.log('InfluxDB writeApi fermé proprement.');
        process.exit(0);
    } catch (err) {
        console.error('Erreur lors de la fermeture InfluxDB writeApi', err);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
