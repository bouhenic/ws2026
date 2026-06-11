// Métadonnées des champs et constantes partagées du dashboard.

export const FIELD_META = {
    temperature:    { label: 'Température', unit: '°C', decimals: 1 },
    tempDS18B20:    { label: 'Temp. sonde', unit: '°C', decimals: 1 },
    humidity:       { label: 'Humidité', unit: '%', decimals: 0 },
    pressure:       { label: 'Pression', unit: 'hPa', decimals: 0 },
    rainfall:       { label: 'Précipitations', unit: 'mm', decimals: 1 },
    avgSpeed:       { label: 'Vent moyen', unit: 'km/h', decimals: 1 },
    maxSpeed:       { label: 'Rafales', unit: 'km/h', decimals: 1 },
    avgDirection:   { label: 'Direction vent', unit: '°', decimals: 0 },
    iaq:            { label: 'Qualité air (IAQ)', unit: '', decimals: 0 },
    gas:            { label: 'Gaz', unit: 'kΩ', decimals: 1 },
    batteryVoltage: { label: 'Batterie', unit: 'V', decimals: 2 },
};

export const DURATIONS = [
    { value: '-1h', label: '1h' },
    { value: '-6h', label: '6h' },
    { value: '-24h', label: '24h' },
    { value: '-7d', label: '7j' },
    { value: '-30d', label: '30j' },
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
    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
];

export function formatTick(ms, daily) {
    const date = new Date(ms);
    return daily
        ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
        : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatValue(value, decimals = 1) {
    return typeof value === 'number' ? value.toFixed(decimals) : '–';
}

// Échelle IAQ du capteur BME680 (indice Bosch)
export const IAQ_LEVELS = [
    { max: 50, label: 'Excellent', color: '#4ade80' },
    { max: 100, label: 'Bon', color: '#a3e635' },
    { max: 150, label: 'Moyen', color: '#facc15' },
    { max: 200, label: 'Dégradé', color: '#fb923c' },
    { max: 300, label: 'Mauvais', color: '#f87171' },
    { max: Infinity, label: 'Très mauvais', color: '#c084fc' },
];

export function iaqLevel(iaq) {
    return IAQ_LEVELS.find((level) => iaq <= level.max);
}
