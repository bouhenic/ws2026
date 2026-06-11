// Liste blanche des champs de la station : seule source de vérité
// pour l'ingestion MQTT, la validation des routes et la doc Swagger.

const NUMERIC_FIELDS = [
    'avgDirection',
    'avgSpeed',
    'batteryVoltage',
    'gas',
    'humidity',
    'iaq',
    'maxSpeed',
    'maxSpeedDirection',
    'pressure',
    'rainfall',
    'tempDS18B20',
    'temperature',
];

const STRING_FIELDS = [
    'avgDirectionCardinal',
    'maxSpeedDirectionCardinal',
];

// Métadonnées radio LoRaWAN, extraites de l'enveloppe TTN (pas du payload décodé)
const LORAWAN_NUMERIC_FIELDS = [
    'airtime',
    'fCnt',
    'frequency',
    'gatewayCount',
    'rssi',
    'snr',
    'spreadingFactor',
];

const LORAWAN_STRING_FIELDS = [
    'gatewayId',
];

const ALL_FIELDS = [...NUMERIC_FIELDS, ...STRING_FIELDS, ...LORAWAN_NUMERIC_FIELDS, ...LORAWAN_STRING_FIELDS];

// Plage de temps Flux relative : -30m, -6h, -7d… (bornée à 365 jours)
const DURATION_REGEX = /^-(\d{1,3})(m|h|d|w)$/;

// Fenêtre d'agrégation : 30s, 15m, 2h…
const AGGREGATE_REGEX = /^(\d{1,4})(s|m|h|d)$/;

// Fonctions d'agrégation autorisées (interpolées dans la requête Flux)
const AGGREGATE_FNS = ['mean', 'sum', 'min', 'max'];

function isValidDuration(duration) {
    const match = DURATION_REGEX.exec(duration);
    if (!match) return false;
    const value = parseInt(match[1], 10);
    const maxByUnit = { m: 527040, h: 8784, d: 366, w: 53 };
    return value > 0 && value <= maxByUnit[match[2]];
}

function isValidAggregate(aggregate) {
    return AGGREGATE_REGEX.test(aggregate);
}

module.exports = {
    NUMERIC_FIELDS,
    STRING_FIELDS,
    LORAWAN_NUMERIC_FIELDS,
    LORAWAN_STRING_FIELDS,
    ALL_FIELDS,
    AGGREGATE_FNS,
    isValidDuration,
    isValidAggregate,
};
