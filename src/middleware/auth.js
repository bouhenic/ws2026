const crypto = require('crypto');
const config = require('../config');

// Comparaison en temps constant via hachage (gère les longueurs différentes).
function safeEqual(a, b) {
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

function apiKeyAuth(req, res, next) {
    const providedKey = req.get('X-API-Key');
    if (!providedKey || !safeEqual(providedKey, config.apiKey)) {
        return res.status(401).json({ error: 'Clé API manquante ou invalide (header X-API-Key)' });
    }
    next();
}

module.exports = { apiKeyAuth };
