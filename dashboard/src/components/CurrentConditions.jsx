import { formatValue, iaqLevel } from '../fields.js';

function metric(latest, field) {
    const entry = latest?.[field];
    return entry && typeof entry.value === 'number' ? entry.value : null;
}

// Bandeau des conditions actuelles : température en vedette + mesures clés.
export default function CurrentConditions({ latest }) {
    const temperature = metric(latest, 'temperature');
    const humidity = metric(latest, 'humidity');
    const pressure = metric(latest, 'pressure');
    const wind = metric(latest, 'avgSpeed');
    const gusts = metric(latest, 'maxSpeed');
    const rain = metric(latest, 'rainfall');
    const iaq = metric(latest, 'iaq');
    const battery = metric(latest, 'batteryVoltage');
    // L'API renvoie le cardinal en notation française (O = Ouest) ; on le passe
    // en notation anglaise (O→W : SO→SW, OSO→WSW, etc.).
    const cardinal = latest?.avgDirectionCardinal?.value?.replace(/O/g, 'W');
    const air = iaq != null ? iaqLevel(iaq) : null;

    return (
        <section className="hero">
            <div className="hero-temp">
                <span className="hero-value">{formatValue(temperature, 1)}<span className="hero-unit">°C</span></span>
            </div>
            <div className="hero-metrics">
                <div className="metric">
                    <span className="metric-label">💧 Humidity</span>
                    <span className="metric-value">{formatValue(humidity, 0)} %</span>
                </div>
                <div className="metric">
                    <span className="metric-label">🌡️ Pressure</span>
                    <span className="metric-value">{formatValue(pressure, 0)} hPa</span>
                </div>
                <div className="metric">
                    <span className="metric-label">💨 Wind</span>
                    <span className="metric-value">
                        {formatValue(wind, 1)} km/h{cardinal ? ` ${cardinal}` : ''}
                    </span>
                    {gusts != null && <span className="metric-sub">gusts {formatValue(gusts, 1)} km/h</span>}
                </div>
                <div className="metric">
                    <span className="metric-label">🌧️ Rain</span>
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
                    <span className="metric-label">🔋 Battery</span>
                    <span className="metric-value">{formatValue(battery, 2)} V</span>
                </div>
            </div>
        </section>
    );
}
