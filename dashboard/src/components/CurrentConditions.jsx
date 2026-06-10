import { formatValue, iaqLevel } from '../fields.js';

function metric(latest, field) {
    const entry = latest?.[field];
    return entry && typeof entry.value === 'number' ? entry.value : null;
}

// Bandeau des conditions actuelles : température en vedette + mesures clés.
export default function CurrentConditions({ latest }) {
    const temperature = metric(latest, 'temperature');
    const sonde = metric(latest, 'tempDS18B20');
    const humidity = metric(latest, 'humidity');
    const pressure = metric(latest, 'pressure');
    const wind = metric(latest, 'avgSpeed');
    const gusts = metric(latest, 'maxSpeed');
    const rain = metric(latest, 'rainfall');
    const iaq = metric(latest, 'iaq');
    const battery = metric(latest, 'batteryVoltage');
    const cardinal = latest?.avgDirectionCardinal?.value;
    const air = iaq != null ? iaqLevel(iaq) : null;

    return (
        <section className="hero">
            <div className="hero-temp">
                <span className="hero-value">{formatValue(temperature, 1)}<span className="hero-unit">°C</span></span>
                {sonde != null && <span className="hero-sub">Sonde sol : {formatValue(sonde, 1)} °C</span>}
            </div>
            <div className="hero-metrics">
                <div className="metric">
                    <span className="metric-label">💧 Humidité</span>
                    <span className="metric-value">{formatValue(humidity, 0)} %</span>
                </div>
                <div className="metric">
                    <span className="metric-label">🌡️ Pression</span>
                    <span className="metric-value">{formatValue(pressure, 0)} hPa</span>
                </div>
                <div className="metric">
                    <span className="metric-label">💨 Vent</span>
                    <span className="metric-value">
                        {formatValue(wind, 1)} km/h{cardinal ? ` ${cardinal}` : ''}
                    </span>
                    {gusts != null && <span className="metric-sub">rafales {formatValue(gusts, 1)} km/h</span>}
                </div>
                <div className="metric">
                    <span className="metric-label">🌧️ Pluie</span>
                    <span className="metric-value">{formatValue(rain, 1)} mm</span>
                </div>
                <div className="metric">
                    <span className="metric-label">🍃 Air</span>
                    <span className="metric-value">
                        {formatValue(iaq, 0)}
                        {air && <span className="metric-badge" style={{ color: air.color }}> ● {air.label}</span>}
                    </span>
                </div>
                <div className="metric">
                    <span className="metric-label">🔋 Batterie</span>
                    <span className="metric-value">{formatValue(battery, 2)} V</span>
                </div>
            </div>
        </section>
    );
}
