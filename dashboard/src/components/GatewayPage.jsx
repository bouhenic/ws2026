import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { apiFetch } from '../api.js';
import { DURATIONS, formatTick, formatValue } from '../fields.js';

const GRID_COLOR = 'rgba(148, 163, 184, 0.12)';
const TICK_COLOR = '#8fa3bd';

const EU868_CHANNELS = [867.1, 867.3, 867.5, 867.7, 867.9, 868.1, 868.3, 868.5];

// Taille des fenêtres de l'histogramme de trafic selon la plage affichée
const BUCKET_MS = {
    '-1h': 5 * 60_000,
    '-6h': 30 * 60_000,
    '-24h': 60 * 60_000,
    '-7d': 6 * 3_600_000,
    '-30d': 24 * 3_600_000,
};

// Fenêtre d'agrégation des compteurs de bruit (rxin/rxok) selon la plage
const NOISE_AGGREGATE = {
    '-1h': '5m',
    '-6h': '30m',
    '-24h': '1h',
    '-7d': '6h',
    '-30d': '1d',
};

const COLOR_TTN = '#4ade80';
const COLOR_OTHER = '#38bdf8';
const COLOR_DOWN = '#fb923c';

const MTYPE_LABELS = {
    UNCONFIRMED_UP: 'Uplink',
    CONFIRMED_UP: 'Uplink (confirmé)',
    UNCONFIRMED_DOWN: 'Downlink',
    CONFIRMED_DOWN: 'Downlink (confirmé)',
    JOIN_REQUEST: 'Join request',
    JOIN_ACCEPT: 'Join accept',
};

const GLOSSARY = [
    {
        term: 'Pourquoi voit-on des devices qui ne sont pas à nous ?',
        text: 'LoRaWAN émet en broadcast radio sur des fréquences partagées : la passerelle entend '
            + 'toutes les trames à portée, y compris celles destinées à d\'autres réseaux (Orange, '
            + 'Objenious…). Elle les relaie à The Things Network qui les écarte. On n\'observe ici '
            + 'que l\'enveloppe radio : les contenus sont chiffrés de bout en bout (AES-128) et '
            + 'personne d\'autre que leur propriétaire ne peut les lire.',
    },
    {
        term: 'DevAddr (adresse de device)',
        text: 'Adresse réseau de 4 octets transmise en clair dans chaque trame de données — c\'est '
            + 'elle qui permet de compter les devices distincts. Son préfixe identifie le réseau : '
            + '26 ou 27 pour The Things Network. Elle ne révèle pas l\'identité du device et change '
            + 'à chaque join.',
    },
    {
        term: 'Join request',
        text: 'Demande d\'entrée d\'un device sur son réseau. C\'est la seule trame où les '
            + 'identifiants matériels (DevEUI, JoinEUI) circulent en clair, avant que le réseau '
            + 'n\'attribue un DevAddr.',
    },
    {
        term: 'Trames entendues vs valides (bruit CRC)',
        text: 'Le concentrateur radio détecte parfois des signaux qui ressemblent à du LoRa mais dont '
            + 'la somme de contrôle (CRC) est invalide : bruit radio, collisions, trames trop faibles. '
            + 'Ces trames sont comptées (rxin) mais jamais relayées (rxok). En ville, le bruit dépasse '
            + 'souvent le trafic légitime.',
    },
    {
        term: 'Duty cycle (1 %)',
        text: 'La réglementation européenne limite le temps d\'émission à 1 % par sous-bande (10 % '
            + 'sur la bande dédiée aux downlinks). La jauge mesure les émissions de la passerelle '
            + 'elle-même : les downlinks, rares en LoRaWAN, sont coûteux en temps d\'antenne.',
    },
    {
        term: 'Retransmissions',
        text: 'Un device qui envoie une trame confirmée et ne reçoit pas son accusé de réception '
            + 'réémet la même trame : on la repère à son compteur (fCnt) identique. Des '
            + 'retransmissions fréquentes signalent un lien radio dégradé.',
    },
];

// Le préfixe 26/27 du DevAddr identifie The Things Network
function isTtnDevAddr(devAddr) {
    return typeof devAddr === 'string' && devAddr.length === 8
        && (devAddr.startsWith('26') || devAddr.startsWith('27'));
}

function timeAgo(iso) {
    if (!iso) return null;
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `il y a ${seconds} s`;
    if (seconds < 3600) return `il y a ${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `il y a ${Math.round(seconds / 3600)} h`;
    return `il y a ${Math.round(seconds / 86400)} j`;
}

// "0.021154778s" (proto Duration) → millisecondes
function parseTtnDuration(value) {
    const seconds = parseFloat(value);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
}

// Carte générique à graphique en barres (l'équivalent local de ChartCard,
// qui est lié aux champs capteurs de /api/data)
function BarChartCard({ title, icon, span = 6, labels, datasets, footer, options = {}, empty }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const hasData = labels.length > 0 && datasets.some((ds) => ds.data.some((v) => v > 0));

    useEffect(() => {
        if (!canvasRef.current || !hasData) return undefined;
        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = new Chart(canvasRef.current, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: datasets.length > 1
                        ? { labels: { color: TICK_COLOR, boxWidth: 12 } }
                        : { display: false },
                    ...options.plugins,
                },
                scales: {
                    x: {
                        stacked: Boolean(options.stacked),
                        // precision: 0 ne joue que si l'axe X porte les valeurs (barres horizontales)
                        ticks: { color: TICK_COLOR, maxRotation: 0, autoSkip: true, precision: 0 },
                        grid: { display: false },
                        ...options.x,
                    },
                    y: {
                        stacked: Boolean(options.stacked),
                        ticks: { color: TICK_COLOR, precision: 0 },
                        grid: { color: GRID_COLOR },
                        beginAtZero: true,
                        ...options.y,
                    },
                },
                ...(options.indexAxis ? { indexAxis: options.indexAxis } : {}),
            },
        });
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, [labels, datasets, options, hasData]);

    return (
        <div className={`card span-${span}`}>
            <div className="card-header">
                <h2>{icon} {title}</h2>
            </div>
            <div className="card-chart">
                {!hasData && <p className="card-message">{empty ?? 'Aucune donnée sur la période.'}</p>}
                <canvas ref={canvasRef} style={{ visibility: hasData ? 'visible' : 'hidden' }} />
            </div>
            {footer && (
                <div className="card-stats">
                    <span className="stat">{footer}</span>
                </div>
            )}
        </div>
    );
}

// Page passerelle : tout le trafic LoRaWAN relayé par la passerelle du lycée,
// métadonnées radio uniquement (les payloads restent chiffrés).
export default function GatewayPage() {
    const [duration, setDuration] = useState('-24h');
    const [frames, setFrames] = useState(null);
    const [noise, setNoise] = useState(null);
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    // Trames + bruit : rechargés au changement de plage puis chaque minute
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [trafficRows, noiseRows] = await Promise.all([
                    apiFetch(`/api/gateway/traffic?duration=${encodeURIComponent(duration)}`),
                    apiFetch(`/api/gateway/noise?duration=${encodeURIComponent(duration)}&aggregate=${NOISE_AGGREGATE[duration]}`),
                ]);
                if (cancelled) return;
                setFrames(trafficRows);
                setNoise(noiseRows);
                setError(null);
            } catch (err) {
                if (!cancelled) setError(err.message);
            }
        };
        load();
        const id = setInterval(load, 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [duration]);

    // Stats de connexion TTN : rafraîchies toutes les 30 s (cache côté API)
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await apiFetch('/api/gateway/stats');
                if (!cancelled) setStats(data);
            } catch {
                // le bandeau affiche « – », les graphiques restent utilisables
            }
        };
        load();
        const id = setInterval(load, 30_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    const derived = useMemo(() => {
        if (!frames) return null;
        const upFrames = frames.filter((f) => f.direction === 'up');
        const downFrames = frames.filter((f) => f.direction === 'down');

        // Histogramme temporel, empilé TTN / autres réseaux / downlinks
        const bucketMs = BUCKET_MS[duration];
        const buckets = new Map();
        const bucketOf = (f) => Math.floor(new Date(f._time).getTime() / bucketMs) * bucketMs;
        for (const f of frames) {
            const key = bucketOf(f);
            if (!buckets.has(key)) buckets.set(key, { ttn: 0, other: 0, down: 0 });
            const b = buckets.get(key);
            if (f.direction === 'down') b.down++;
            else if (isTtnDevAddr(f.devAddr)) b.ttn++;
            else b.other++;
        }
        const bucketKeys = [...buckets.keys()].sort((a, b) => a - b);
        const daily = bucketMs >= 24 * 3_600_000;

        // Trames par device (uplinks seulement)
        const byDevice = new Map();
        for (const f of upFrames) {
            byDevice.set(f.devAddr, (byDevice.get(f.devAddr) ?? 0) + 1);
        }
        const topDevices = [...byDevice.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

        // Répartition des spreading factors (uplinks)
        const bySf = new Map([7, 8, 9, 10, 11, 12].map((sf) => [sf, 0]));
        for (const f of upFrames) {
            if (bySf.has(f.spreadingFactor)) bySf.set(f.spreadingFactor, bySf.get(f.spreadingFactor) + 1);
        }

        // Répartition par canal EU868 (uplinks)
        const byChannel = new Map(EU868_CHANNELS.map((c) => [c, 0]));
        for (const f of upFrames) {
            const freq = Math.round(f.frequency * 10) / 10;
            if (byChannel.has(freq)) byChannel.set(freq, byChannel.get(freq) + 1);
        }

        return {
            upCount: upFrames.length,
            downCount: downFrames.length,
            deviceCount: byDevice.size,
            ttnCount: upFrames.filter((f) => isTtnDevAddr(f.devAddr)).length,
            recent: frames.slice(0, 12),
            timeline: {
                labels: bucketKeys.map((ms) => formatTick(ms, daily)),
                datasets: [
                    { label: 'The Things Network', data: bucketKeys.map((k) => buckets.get(k).ttn), backgroundColor: COLOR_TTN, borderRadius: 2 },
                    { label: 'Autres réseaux', data: bucketKeys.map((k) => buckets.get(k).other), backgroundColor: COLOR_OTHER, borderRadius: 2 },
                    { label: 'Downlinks', data: bucketKeys.map((k) => buckets.get(k).down), backgroundColor: COLOR_DOWN, borderRadius: 2 },
                ],
            },
            devices: {
                labels: topDevices.map(([devAddr]) => devAddr),
                datasets: [{
                    label: 'Trames',
                    data: topDevices.map(([, n]) => n),
                    backgroundColor: topDevices.map(([devAddr]) => (isTtnDevAddr(devAddr) ? COLOR_TTN : COLOR_OTHER)),
                    borderRadius: 3,
                }],
            },
            sf: {
                labels: [...bySf.keys()].map((sf) => `SF${sf}`),
                datasets: [{ label: 'Trames', data: [...bySf.values()], backgroundColor: '#a78bfa', borderRadius: 3 }],
            },
            channels: {
                labels: [...byChannel.keys()].map((c) => c.toFixed(1)),
                datasets: [{ label: 'Trames', data: [...byChannel.values()], backgroundColor: COLOR_OTHER, borderRadius: 3 }],
            },
        };
    }, [frames, duration]);

    const noiseChart = useMemo(() => {
        if (!noise) return null;
        const daily = (NOISE_AGGREGATE[duration] ?? '').endsWith('d');
        const rxin = noise.reduce((acc, row) => acc + (row.rxin ?? 0), 0);
        const rxok = noise.reduce((acc, row) => acc + (row.rxok ?? 0), 0);
        return {
            labels: noise.map((row) => formatTick(new Date(row._time).getTime(), daily)),
            datasets: [
                { label: 'Entendues (rxin)', data: noise.map((row) => row.rxin ?? 0), backgroundColor: 'rgba(148, 163, 184, 0.55)', borderRadius: 2 },
                { label: 'CRC valide (rxok)', data: noise.map((row) => row.rxok ?? 0), backgroundColor: COLOR_TTN, borderRadius: 2 },
            ],
            footer: rxin > 0
                ? `${rxok} trames valides sur ${rxin} détectées (${Math.round((rxok / rxin) * 100)} %) — le reste est du bruit radio`
                : null,
        };
    }, [noise, duration]);

    // Bandeau : stats de connexion TTN
    const connected = stats ? !stats.disconnected_at : null;
    const rttMs = stats ? parseTtnDuration(stats.round_trip_times?.median) : null;
    const dutyCycle = useMemo(() => {
        if (!stats?.sub_bands) return null;
        return stats.sub_bands.reduce((worst, band) => {
            const used = band.downlink_utilization ?? 0;
            const limit = band.downlink_utilization_limit ?? 1;
            return used / limit > (worst?.ratio ?? -1)
                ? { ratio: used / limit, used, limit }
                : worst;
        }, null);
    }, [stats]);

    return (
        <div className="app">
            <header className="topbar">
                <div>
                    <h1>🗼 Trafic de la passerelle</h1>
                    <p className="subtitle">Tout le LoRaWAN entendu par la passerelle du lycée — payloads chiffrés, métadonnées seules</p>
                </div>
                <a className="back-link" href="#/">← Retour au dashboard</a>
            </header>

            <main>
                {error && <p className="data-error">⚠️ Données indisponibles ({error})</p>}

                <section className="hero">
                    <div className="hero-metrics lorawan-metrics">
                        <div className="metric">
                            <span className="metric-label">🔌 Passerelle</span>
                            <span className="metric-value">
                                {connected == null ? '–' : connected ? (
                                    <span style={{ color: COLOR_TTN }}>● Connectée</span>
                                ) : (
                                    <span style={{ color: '#f87171' }}>● Déconnectée</span>
                                )}
                            </span>
                            {stats?.last_uplink_received_at && (
                                <span className="metric-sub">dernière trame {timeAgo(stats.last_uplink_received_at)}</span>
                            )}
                        </div>
                        <div className="metric">
                            <span className="metric-label">📥 Uplinks relayés</span>
                            <span className="metric-value">{stats ? Number(stats.uplink_count ?? 0).toLocaleString('fr-FR') : '–'}</span>
                            <span className="metric-sub">depuis la connexion</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">📤 Downlinks émis</span>
                            <span className="metric-value">{stats ? Number(stats.downlink_count ?? 0).toLocaleString('fr-FR') : '–'}</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">↔️ Latence TTN</span>
                            <span className="metric-value">{rttMs != null ? `${formatValue(rttMs, 1)} ms` : '–'}</span>
                            <span className="metric-sub">aller-retour médian</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">⏱️ Duty cycle émission</span>
                            <span className="metric-value">
                                {dutyCycle ? `${formatValue(dutyCycle.used * 100, 3)} %` : '–'}
                            </span>
                            {dutyCycle && (
                                <span className="metric-sub">limite {formatValue(dutyCycle.limit * 100, 0)} % (pire sous-bande)</span>
                            )}
                        </div>
                        <div className="metric">
                            <span className="metric-label">📡 Devices entendus</span>
                            <span className="metric-value">{derived ? derived.deviceCount : '–'}</span>
                            <span className="metric-sub">sur la période affichée</span>
                        </div>
                    </div>
                </section>

                <div className="toolbar">
                    <h2>Trafic relayé</h2>
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

                {derived && (
                    <div className="charts-grid">
                        <BarChartCard title="Trames relayées" icon="📶" span={8}
                            labels={derived.timeline.labels} datasets={derived.timeline.datasets}
                            options={{ stacked: true }}
                            footer={`${derived.upCount} uplinks (dont ${derived.ttnCount} TTN) et ${derived.downCount} downlinks sur la période`}
                            empty="Aucune trame sur la période — la collecte démarre avec le déploiement." />
                        <BarChartCard title="Trames par device" icon="📟" span={4}
                            labels={derived.devices.labels} datasets={derived.devices.datasets}
                            options={{ indexAxis: 'y', y: { ticks: { color: TICK_COLOR, font: { family: 'monospace' } } } }}
                            footer={`${derived.deviceCount} DevAddr distincts — vert : The Things Network`} />
                        {noiseChart && (
                            <BarChartCard title="Trames entendues vs valides" icon="🌫️" span={6}
                                labels={noiseChart.labels} datasets={noiseChart.datasets}
                                footer={noiseChart.footer}
                                empty="Compteurs indisponibles sur la période." />
                        )}
                        <BarChartCard title="Spreading factors" icon="🌀" span={3}
                            labels={derived.sf.labels} datasets={derived.sf.datasets} />
                        <BarChartCard title="Canaux EU868" icon="📻" span={3}
                            labels={derived.channels.labels} datasets={derived.channels.datasets}
                            options={{ x: { title: { display: true, text: 'MHz', color: TICK_COLOR } } }} />
                    </div>
                )}

                {derived && derived.recent.length > 0 && (
                    <div className="card traffic-table-card">
                        <div className="card-header">
                            <h2>🕓 Dernières trames</h2>
                        </div>
                        <table className="traffic-table">
                            <thead>
                                <tr>
                                    <th>Heure</th>
                                    <th>Device</th>
                                    <th>Type</th>
                                    <th>SF</th>
                                    <th>Canal</th>
                                    <th>RSSI</th>
                                    <th>SNR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {derived.recent.map((f) => (
                                    <tr key={`${f._time}-${f.devAddr}`}>
                                        <td>{new Date(f._time).toLocaleTimeString('fr-FR')}</td>
                                        <td className="mono">
                                            {f.devAddr}
                                            {isTtnDevAddr(f.devAddr) && (
                                                <span className="metric-badge" style={{ color: COLOR_TTN }}> ● TTN</span>
                                            )}
                                        </td>
                                        <td>{MTYPE_LABELS[f.mtype] ?? f.mtype}</td>
                                        <td>{f.spreadingFactor != null ? `SF${f.spreadingFactor}` : '–'}</td>
                                        <td>{f.frequency != null ? `${f.frequency.toFixed(1)} MHz` : '–'}</td>
                                        <td>{f.rssi != null ? `${f.rssi} dBm` : '–'}</td>
                                        <td>{f.snr != null ? `${f.snr} dB` : '–'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="card glossary-card">
                    <div className="card-header">
                        <h2>🎓 Comprendre ce trafic</h2>
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
                <a href="#/lorawan">Réseau LoRaWAN</a>
                <span>·</span>
                <a href="https://www.thethingsnetwork.org/" target="_blank" rel="noreferrer">The Things Network</a>
            </footer>
        </div>
    );
}
