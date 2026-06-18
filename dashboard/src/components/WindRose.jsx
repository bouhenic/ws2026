import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import { CARDINALS, windSpeedColor as speedColor } from '../fields.js';

const LEGEND = [
    { label: '< 10', color: speedColor(5) },
    { label: '10–20', color: speedColor(15) },
    { label: '20–30', color: speedColor(25) },
    { label: '> 30 km/h', color: speedColor(35) },
];

// Chemin SVG d'un secteur : angle au centre `angle` (0 = nord), demi-ouverture 10°
function sectorPath(angle, radius) {
    const toXY = (deg, r) => {
        const rad = (deg * Math.PI) / 180;
        return `${(r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
    };
    return `M 0 0 L ${toXY(angle - 10, radius)} A ${radius} ${radius} 0 0 1 ${toXY(angle + 10, radius)} Z`;
}

// Rose des vents : fréquence d'occurrence par secteur (rayon) et vitesse moyenne (couleur),
// calculées à partir des relevés bruts de direction et de vitesse sur la période.
export default function WindRose({ duration, span = 4 }) {
    const [sectors, setSectors] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);

        Promise.all([
            apiFetch(`/api/data/avgDirection?duration=${encodeURIComponent(duration)}`),
            apiFetch(`/api/data/avgSpeed?duration=${encodeURIComponent(duration)}`),
        ]).then(([directions, speeds]) => {
            if (cancelled) return;
            const speedByTime = new Map(speeds.map((r) => [r._time, r._value]));
            const bins = CARDINALS.map(() => ({ count: 0, speedSum: 0 }));
            let total = 0;
            for (const row of directions) {
                if (typeof row._value !== 'number') continue;
                const bin = bins[Math.round(((row._value % 360) + 360) % 360 / 22.5) % 16];
                bin.count += 1;
                bin.speedSum += speedByTime.get(row._time) ?? 0;
                total += 1;
            }
            setSectors(bins.map((bin, i) => ({
                cardinal: CARDINALS[i],
                pct: total ? (bin.count / total) * 100 : 0,
                meanSpeed: bin.count ? bin.speedSum / bin.count : 0,
            })));
        }).catch((err) => { if (!cancelled) setError(err.message); });

        return () => { cancelled = true; };
    }, [duration]);

    const maxPct = sectors ? Math.max(...sectors.map((s) => s.pct), 1) : 1;
    const isEmpty = sectors && sectors.every((s) => s.pct === 0);

    return (
        <div className={`card span-${span}`}>
            <div className="card-header">
                <h2>🧭 Wind rose</h2>
            </div>
            <div className="card-chart windrose">
                {error && <p className="card-message">⚠️ {error}</p>}
                {!error && !sectors && <p className="card-message">Loading…</p>}
                {!error && isEmpty && <p className="card-message">No data for this period.</p>}
                {!error && sectors && !isEmpty && (
                    <svg viewBox="-110 -110 220 220" role="img" aria-label="Wind rose">
                        {[0.25, 0.5, 0.75, 1].map((ratio) => (
                            <circle key={ratio} r={ratio * 90} fill="none"
                                stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" />
                        ))}
                        {[['N', 0, -99], ['E', 101, 0], ['S', 0, 103], ['W', -101, 0]].map(([label, x, y]) => (
                            <text key={label} x={x} y={y} className="windrose-cardinal"
                                textAnchor="middle" dominantBaseline="middle">{label}</text>
                        ))}
                        {sectors.map((sector, i) => sector.pct > 0 && (
                            <path key={sector.cardinal}
                                d={sectorPath(i * 22.5, (sector.pct / maxPct) * 90)}
                                fill={speedColor(sector.meanSpeed)} fillOpacity="0.75"
                                stroke="rgba(11, 17, 32, 0.6)" strokeWidth="1">
                                <title>
                                    {`${sector.cardinal} : ${sector.pct.toFixed(1)} % of time · mean wind ${sector.meanSpeed.toFixed(1)} km/h`}
                                </title>
                            </path>
                        ))}
                    </svg>
                )}
            </div>
            <div className="card-stats">
                {LEGEND.map((item) => (
                    <span key={item.label} className="stat">
                        <i style={{ background: item.color }} />{item.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
