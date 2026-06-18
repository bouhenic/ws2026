import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import { cardinalOf, formatTick, formatValue, windSpeedColor } from '../fields.js';

// Géométrie du tracé (coordonnées du viewBox, indépendantes de la taille à l'écran).
const W = 900;
const H = 200;
const PAD_L = 24;
const PAD_R = 24;
const MID_Y = 84;          // ligne des flèches
const AXIS_Y = H - 30;     // ligne de temps
const SLOTS = 24;          // nombre de créneaux temporels (flèches max)

const LEGEND = [
    { label: '< 10', color: windSpeedColor(5) },
    { label: '10–20', color: windSpeedColor(15) },
    { label: '20–30', color: windSpeedColor(25) },
    { label: '> 30 km/h', color: windSpeedColor(35) },
];

// Moyenne vectorielle d'un créneau : la direction résultante est pondérée par la
// vitesse (composantes u/v), ce qui évite l'artefact de la moyenne arithmétique
// au passage 360°→0°. La vitesse affichée reste une moyenne scalaire.
function binSamples(samples) {
    let u = 0, v = 0, speedSum = 0;
    for (const { dir, speed } of samples) {
        const rad = (dir * Math.PI) / 180;
        u += speed * Math.sin(rad);
        v += speed * Math.cos(rad);
        speedSum += speed;
    }
    const meanDir = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
    return { dir: meanDir, speed: speedSum / samples.length };
}

// Flèche orientée vers la provenance du vent (convention météo, cohérente avec la
// rose) : dessinée pointe en haut (= nord), puis tournée de `dir` degrés.
function Arrow({ x, dir, speed }) {
    const len = 14 + Math.min(speed / 40, 1) * 22; // 14 → 36 px selon la vitesse
    const half = len / 2;
    const color = windSpeedColor(speed);
    return (
        <g transform={`translate(${x} ${MID_Y}) rotate(${dir})`}>
            <line x1="0" y1={half} x2="0" y2={-half} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <path d={`M 0 ${-half} L -4 ${-half + 7} M 0 ${-half} L 4 ${-half + 7}`}
                stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <title>{`${cardinalOf(dir)} (${Math.round(dir)}°) · ${speed.toFixed(1)} km/h`}</title>
        </g>
    );
}

// Graphe temporel du vent : une flèche par créneau, orientée selon la direction
// et colorée selon la vitesse. Complète la rose (qui agrège tout sur la période)
// en montrant l'évolution relevé par relevé.
export default function WindTimeline({ duration, span = 12 }) {
    const [bins, setBins] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        setBins(null);

        Promise.all([
            apiFetch(`/api/data/avgDirection?duration=${encodeURIComponent(duration)}`),
            apiFetch(`/api/data/avgSpeed?duration=${encodeURIComponent(duration)}`),
        ]).then(([directions, speeds]) => {
            if (cancelled) return;
            const speedByTime = new Map(speeds.map((r) => [r._time, r._value]));
            const samples = [];
            for (const row of directions) {
                const speed = speedByTime.get(row._time);
                if (typeof row._value !== 'number' || typeof speed !== 'number') continue;
                samples.push({ t: new Date(row._time).getTime(), dir: row._value, speed });
            }
            if (samples.length === 0) { setBins([]); return; }

            const t0 = samples[0].t;
            const t1 = samples[samples.length - 1].t;
            const range = Math.max(t1 - t0, 1);
            const buckets = Array.from({ length: SLOTS }, () => []);
            for (const s of samples) {
                const i = Math.min(SLOTS - 1, Math.floor(((s.t - t0) / range) * SLOTS));
                buckets[i].push(s);
            }
            const result = buckets
                .map((group, i) => (group.length
                    ? { ...binSamples(group), t: t0 + ((i + 0.5) / SLOTS) * range }
                    : null))
                .filter(Boolean);
            setBins({ list: result, t0, t1 });
        }).catch((err) => { if (!cancelled) setError(err.message); });

        return () => { cancelled = true; };
    }, [duration]);

    const isEmpty = Array.isArray(bins) && bins.length === 0;
    const ready = bins && !Array.isArray(bins);

    const daily = ['-7d', '-30d'].includes(duration);
    const xOf = (t) => PAD_L + ((t - bins.t0) / Math.max(bins.t1 - bins.t0, 1)) * (W - PAD_L - PAD_R);
    const ticks = ready
        ? Array.from({ length: 6 }, (_, k) => bins.t0 + (k / 5) * (bins.t1 - bins.t0))
        : [];

    const speeds = ready ? bins.list.map((b) => b.speed) : [];
    const meanSpeed = speeds.length ? speeds.reduce((a, v) => a + v, 0) / speeds.length : 0;
    const maxSpeed = speeds.length ? Math.max(...speeds) : 0;

    return (
        <div className={`card span-${span}`}>
            <div className="card-header">
                <h2>💨 Wind over time</h2>
            </div>
            <div className="card-chart windtimeline">
                {error && <p className="card-message">⚠️ {error}</p>}
                {!error && !bins && <p className="card-message">Loading…</p>}
                {!error && isEmpty && <p className="card-message">No data for this period.</p>}
                {!error && ready && (
                    <svg viewBox={`0 0 ${W} ${H}`} role="img"
                        aria-label="Wind direction and speed over time">
                        <line x1={PAD_L} y1={AXIS_Y} x2={W - PAD_R} y2={AXIS_Y}
                            stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1" />
                        {ticks.map((t) => (
                            <g key={t}>
                                <line x1={xOf(t)} y1={AXIS_Y} x2={xOf(t)} y2={AXIS_Y + 5}
                                    stroke="rgba(148, 163, 184, 0.35)" strokeWidth="1" />
                                <text x={xOf(t)} y={AXIS_Y + 18} className="windtimeline-tick"
                                    textAnchor="middle">{formatTick(t, daily)}</text>
                            </g>
                        ))}
                        {bins.list.map((b) => (
                            <Arrow key={b.t} x={xOf(b.t)} dir={b.dir} speed={b.speed} />
                        ))}
                    </svg>
                )}
            </div>
            <div className="card-stats">
                {ready && !isEmpty && (
                    <span className="stat">
                        avg {formatValue(meanSpeed)} · max {formatValue(maxSpeed)} km/h
                    </span>
                )}
                {LEGEND.map((item) => (
                    <span key={item.label} className="stat">
                        <i style={{ background: item.color }} />{item.label}
                    </span>
                ))}
                <span className="stat windtimeline-note">↑ arrow = wind source</span>
            </div>
        </div>
    );
}
