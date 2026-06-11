import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import { DURATIONS } from './fields.js';
import CurrentConditions from './components/CurrentConditions.jsx';
import ChartCard from './components/ChartCard.jsx';
import AirQualityBand from './components/AirQualityBand.jsx';
import WindRose from './components/WindRose.jsx';
import PipelinePage from './components/PipelinePage.jsx';
import LorawanPage from './components/LorawanPage.jsx';

// Séries de chaque carte — constantes de module pour garder une identité stable
// entre les rendus (évite de refetch à chaque render de App).
const TEMPERATURE_SERIES = [
    { field: 'temperature', label: 'Air', color: '#fb923c' },
];
const HUMIDITY_SERIES = [{ field: 'humidity', label: 'Humidité', color: '#38bdf8' }];
const PRESSURE_SERIES = [{ field: 'pressure', label: 'Pression', color: '#a78bfa' }];
const WIND_SERIES = [
    { field: 'avgSpeed', label: 'Vent moyen', color: '#34d399' },
    { field: 'maxSpeed', label: 'Rafales', color: '#fbbf24' },
];
const RAIN_SERIES = [{ field: 'rainfall', label: 'Précipitations', color: '#38bdf8' }];
const BATTERY_SERIES = [{ field: 'batteryVoltage', label: 'Batterie', color: '#4ade80' }];

export default function App() {
    const [duration, setDuration] = useState('-24h');
    const [latest, setLatest] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [latestError, setLatestError] = useState(null);
    const [route, setRoute] = useState(() => window.location.hash);

    useEffect(() => {
        const onHashChange = () => setRoute(window.location.hash);
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const loadLatest = useCallback(async () => {
        try {
            const data = await apiFetch('/api/latest');
            setLatest(data);
            setLatestError(null);
            const times = Object.values(data).map((entry) => new Date(entry.time).getTime());
            if (times.length) setLastUpdate(new Date(Math.max(...times)));
        } catch (err) {
            // On garde les dernières valeurs connues, mais on affiche l'échec
            setLatestError(err.message);
        }
    }, []);

    // Les pages secondaires gèrent leurs propres données : pas de polling ici
    const isSubPage = route === '#/cicd' || route === '#/lorawan';

    useEffect(() => {
        if (isSubPage) return undefined;
        loadLatest();
        const id = setInterval(loadLatest, 60_000);
        return () => clearInterval(id);
    }, [isSubPage, loadLatest]);

    if (route === '#/cicd') return <PipelinePage />;
    if (route === '#/lorawan') return <LorawanPage />;

    return (
        <div className="app">
            <header className="topbar">
                <div>
                    <h1>🌤️ Station Météo LoRaWAN</h1>
                    <p className="subtitle">Lycée Newton — Clichy</p>
                </div>
                <div>
                    {latestError && (
                        <p className="data-error">
                            ⚠️ Données indisponibles ({latestError})
                        </p>
                    )}
                    {lastUpdate && (
                        <p className="last-update">
                            Dernier relevé : {lastUpdate.toLocaleString('fr-FR')}
                        </p>
                    )}
                </div>
            </header>

            <main>
                <CurrentConditions latest={latest} />

                <div className="toolbar">
                    <h2>Historique</h2>
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
                    <ChartCard title="Température" icon="🌡️" duration={duration}
                        series={TEMPERATURE_SERIES} unit="°C" decimals={1} span={8} />
                    <WindRose duration={duration} span={4} />
                    <ChartCard title="Humidité" icon="💧" duration={duration}
                        series={HUMIDITY_SERIES} unit="%" decimals={0} />
                    <ChartCard title="Pression" icon="🌀" duration={duration}
                        series={PRESSURE_SERIES} unit="hPa" decimals={0} />
                    <ChartCard title="Vent" icon="💨" duration={duration}
                        series={WIND_SERIES} unit="km/h" decimals={1} />
                    <ChartCard title="Précipitations" icon="🌧️" duration={duration}
                        series={RAIN_SERIES} unit="mm" decimals={1} type="bar" fn="sum" cumulative />
                    <AirQualityBand duration={duration} />
                    <ChartCard title="Batterie" icon="🔋" duration={duration}
                        series={BATTERY_SERIES} unit="V" decimals={2} />
                </div>
            </main>

            <footer>
                <a href="/api-docs" target="_blank" rel="noreferrer">Documentation API</a>
                <span>·</span>
                <a href="#/lorawan">Réseau LoRaWAN</a>
                <span>·</span>
                <a href="#/cicd">Pipeline CI/CD</a>
            </footer>
        </div>
    );
}
