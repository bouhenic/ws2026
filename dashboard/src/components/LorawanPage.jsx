import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import { DURATIONS, formatValue, rssiLevel, snrLevel } from '../fields.js';
import ChartCard from './ChartCard.jsx';
import ChannelUsage from './ChannelUsage.jsx';

// Séries en constantes de module : identité stable entre les rendus (cf. ChartCard)
const SIGNAL_SERIES = [
    { field: 'rssi', label: 'RSSI', color: '#fb923c', unit: 'dBm', decimals: 0 },
    { field: 'snr', label: 'SNR', color: '#38bdf8', unit: 'dB', decimals: 1, axis: 'y1' },
];
const SF_SERIES = [{ field: 'spreadingFactor', label: 'Spreading factor', color: '#a78bfa' }];
const GATEWAY_SERIES = [{ field: 'gatewayCount', label: 'Passerelles', color: '#34d399' }];

// Axes adaptés aux grandeurs discrètes : SF va de 7 à 12, les passerelles se
// comptent en entiers (l'auto-échelle de Chart.js graduerait en décimales
// quand la valeur est constante).
const SF_YSCALE = { min: 7, max: 12, ticks: { stepSize: 1 } };
const GATEWAY_YSCALE = { min: 0, suggestedMax: 3, ticks: { stepSize: 1 } };

const GLOSSARY = [
    {
        term: 'RSSI (Received Signal Strength Indicator)',
        text: 'Puissance du signal reçu par la passerelle, en dBm. Plus la valeur est proche de 0, '
            + 'meilleur est le signal : -80 dBm est excellent, en dessous de -120 dBm on approche '
            + 'de la limite de réception LoRa.',
    },
    {
        term: 'SNR (rapport signal/bruit)',
        text: 'Écart entre le signal et le bruit radio ambiant, en dB. Particularité de la modulation '
            + 'LoRa : elle démodule des signaux jusqu\'à environ 20 dB sous le bruit (SNR négatif), '
            + 'ce qui explique sa longue portée.',
    },
    {
        term: 'Spreading Factor (SF7 à SF12)',
        text: 'Facteur d\'étalement de la modulation. Un SF élevé porte plus loin mais transmet plus '
            + 'lentement : chaque cran de SF double environ le temps d\'antenne. Avec l\'ADR '
            + '(Adaptive Data Rate), le réseau ajuste le SF au plus juste selon la qualité du lien.',
    },
    {
        term: 'Canaux EU868',
        text: 'En Europe, LoRaWAN utilise 8 canaux entre 867,1 et 868,5 MHz. La station change de '
            + 'canal aléatoirement à chaque trame pour répartir l\'occupation du spectre — '
            + 'l\'histogramme doit donc être à peu près uniforme.',
    },
    {
        term: 'Temps d\'antenne (airtime) et duty cycle',
        text: 'Durée d\'occupation du canal par une trame. La réglementation européenne limite '
            + 'l\'émission à 1 % du temps par bande : c\'est pour cela qu\'un objet LoRaWAN '
            + 'transmet peu et rarement.',
    },
    {
        term: 'Compteur de trames (FCnt)',
        text: 'Numéro de séquence des trames montantes, protégé par le chiffrement. Des sauts dans '
            + 'le compteur révèlent des trames perdues ; il repart de zéro à chaque join de la station.',
    },
];

// Page radio : métadonnées LoRaWAN des uplinks (qualité du lien, paramètres
// de modulation, occupation des canaux) + repères pédagogiques.
export default function LorawanPage() {
    const [duration, setDuration] = useState('-24h');
    const [latest, setLatest] = useState(null);
    const [latestError, setLatestError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await apiFetch('/api/latest');
                if (!cancelled) {
                    setLatest(data);
                    setLatestError(null);
                }
            } catch (err) {
                if (!cancelled) setLatestError(err.message);
            }
        };
        load();
        const id = setInterval(load, 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    const num = (field) => {
        const entry = latest?.[field];
        return entry && typeof entry.value === 'number' ? entry.value : null;
    };
    const rssi = num('rssi');
    const snr = num('snr');
    const sf = num('spreadingFactor');
    const frequency = num('frequency');
    const gatewayCount = num('gatewayCount');
    const fCnt = num('fCnt');
    const airtime = num('airtime');
    const gatewayId = latest?.gatewayId?.value;
    const rssiQuality = rssi != null ? rssiLevel(rssi) : null;
    const snrQuality = snr != null ? snrLevel(snr) : null;

    return (
        <div className="app">
            <header className="topbar">
                <div>
                    <h1>📡 Réseau LoRaWAN</h1>
                    <p className="subtitle">Qualité radio de la station — The Things Network</p>
                </div>
                <a className="back-link" href="#/">← Retour au dashboard</a>
            </header>

            <main>
                {latestError && (
                    <p className="data-error">⚠️ Données indisponibles ({latestError})</p>
                )}

                <section className="hero">
                    <div className="hero-metrics lorawan-metrics">
                        <div className="metric">
                            <span className="metric-label">📶 RSSI</span>
                            <span className="metric-value">
                                {formatValue(rssi, 0)} dBm
                                {rssiQuality && (
                                    <span className="metric-badge" style={{ color: rssiQuality.color }}> ● {rssiQuality.label}</span>
                                )}
                            </span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">🔊 SNR</span>
                            <span className="metric-value">
                                {formatValue(snr, 1)} dB
                                {snrQuality && (
                                    <span className="metric-badge" style={{ color: snrQuality.color }}> ● {snrQuality.label}</span>
                                )}
                            </span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">🌀 Spreading factor</span>
                            <span className="metric-value">{sf != null ? `SF${formatValue(sf, 0)}` : '–'}</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">📻 Canal</span>
                            <span className="metric-value">{formatValue(frequency, 1)} MHz</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">🗼 Passerelles</span>
                            <span className="metric-value">{formatValue(gatewayCount, 0)}</span>
                            {gatewayId && <span className="metric-sub">meilleure : {gatewayId}</span>}
                        </div>
                        <div className="metric">
                            <span className="metric-label">⏱️ Temps d'antenne</span>
                            <span className="metric-value">{formatValue(airtime, 1)} ms</span>
                            {fCnt != null && <span className="metric-sub">trame n° {formatValue(fCnt, 0)}</span>}
                        </div>
                    </div>
                </section>

                <div className="toolbar">
                    <h2>Historique radio</h2>
                    <div className="duration-buttons">
                        {DURATIONS.map(({ value, label }) => (
                            <button
                                key={value}
                                className={value === duration ? 'active' : ''}
                                onClick={() => setDuration(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="charts-grid">
                    <ChartCard title="Signal radio (RSSI / SNR)" icon="📶" duration={duration}
                        series={SIGNAL_SERIES} decimals={0} span={8} />
                    <ChannelUsage duration={duration} span={4} />
                    <ChartCard title="Spreading factor" icon="🌀" duration={duration}
                        series={SF_SERIES} unit="" decimals={0} yScale={SF_YSCALE} />
                    <ChartCard title="Passerelles en réception" icon="🗼" duration={duration}
                        series={GATEWAY_SERIES} unit="" decimals={0} yScale={GATEWAY_YSCALE} />
                </div>

                <div className="card glossary-card">
                    <div className="card-header">
                        <h2>🎓 Comprendre ces indicateurs</h2>
                    </div>
                    <dl className="glossary">
                        {GLOSSARY.map(({ term, text }) => (
                            <div key={term} className="glossary-entry">
                                <dt>{term}</dt>
                                <dd>{text}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </main>

            <footer>
                <a href="#/">Dashboard</a>
                <span>·</span>
                <a href="https://www.thethingsnetwork.org/" target="_blank" rel="noreferrer">The Things Network</a>
            </footer>
        </div>
    );
}
