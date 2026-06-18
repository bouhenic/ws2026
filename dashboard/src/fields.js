// Constantes partagées du dashboard.

export const DURATIONS = [
    { value: '-1h', label: '1h' },
    { value: '-6h', label: '6h' },
    { value: '-24h', label: '24h' },
    { value: '-7d', label: '7d' },
    { value: '-30d', label: '30d' },
];

// Fenêtre d'agrégation (moyenne) selon la plage, pour limiter le volume de points
export const MEAN_AGGREGATE = {
    '-1h': null,
    '-6h': null,
    '-24h': '10m',
    '-7d': '1h',
    '-30d': '6h',
};

// Fenêtres de cumul pour la pluviométrie (barres = somme par fenêtre)
export const SUM_AGGREGATE = {
    '-1h': '5m',
    '-6h': '30m',
    '-24h': '1h',
    '-7d': '6h',
    '-30d': '1d',
};

export const CARDINALS = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

// Point cardinal le plus proche d'un cap en degrés (0 = N, sens horaire).
export function cardinalOf(deg) {
    return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

// Couleur d'une vitesse de vent (bleu → rouge, plafonnée à 40 km/h) — partagée
// par la rose des vents et le graphe temporel des flèches.
export function windSpeedColor(speed) {
    const hue = 200 - Math.min(speed / 40, 1) * 200;
    return `hsl(${hue} 80% 55%)`;
}

export function formatTick(ms, daily) {
    const date = new Date(ms);
    return daily
        ? date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
        : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatValue(value, decimals = 1) {
    return typeof value === 'number' ? value.toFixed(decimals) : '–';
}

// Échelle IAQ du capteur BME680 (indice Bosch)
export const IAQ_LEVELS = [
    { max: 50, label: 'Excellent', color: '#4ade80' },
    { max: 100, label: 'Good', color: '#a3e635' },
    { max: 150, label: 'Moderate', color: '#facc15' },
    { max: 200, label: 'Poor', color: '#fb923c' },
    { max: 300, label: 'Bad', color: '#f87171' },
    { max: Infinity, label: 'Very bad', color: '#c084fc' },
];

export function iaqLevel(iaq) {
    return IAQ_LEVELS.find((level) => iaq <= level.max);
}

// Qualité du signal radio selon le RSSI (dBm) — ordres de grandeur LoRa usuels
export const RSSI_LEVELS = [
    { min: -80, label: 'Excellent', color: '#4ade80' },
    { min: -95, label: 'Bon', color: '#a3e635' },
    { min: -110, label: 'Moyen', color: '#facc15' },
    { min: -120, label: 'Faible', color: '#fb923c' },
    { min: -Infinity, label: 'Limite', color: '#f87171' },
];

export function rssiLevel(rssi) {
    return RSSI_LEVELS.find((level) => rssi >= level.min);
}

// Qualité selon le SNR (dB) : LoRa démodule jusqu'à ≈ -20 dB (SF12)
export const SNR_LEVELS = [
    { min: 5, label: 'Excellent', color: '#4ade80' },
    { min: 0, label: 'Bon', color: '#a3e635' },
    { min: -10, label: 'Moyen', color: '#facc15' },
    { min: -Infinity, label: 'Limite', color: '#fb923c' },
];

export function snrLevel(snr) {
    return SNR_LEVELS.find((level) => snr >= level.min);
}
