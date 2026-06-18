import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { apiFetch } from '../api.js';
import { IAQ_LEVELS, MEAN_AGGREGATE, formatTick, formatValue, iaqLevel } from '../fields.js';

const TICK_COLOR = '#8fa3bd';

// Qualité de l'air en bande colorée : une barre pleine hauteur par relevé, colorée
// selon le palier IAQ (échelle Bosch 0-500) — on lit la qualité, pas la valeur brute.
export default function AirQualityBand({ duration, span = 6 }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [points, setPoints] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        const aggregate = MEAN_AGGREGATE[duration];
        let url = `/api/data/iaq?duration=${encodeURIComponent(duration)}`;
        if (aggregate) url += `&aggregate=${aggregate}&fn=mean`;

        apiFetch(url)
            .then((rows) => {
                if (cancelled) return;
                setPoints(rows
                    .filter((r) => typeof r._value === 'number')
                    .map((r) => ({ t: new Date(r._time).getTime(), v: r._value })));
            })
            .catch((err) => { if (!cancelled) setError(err.message); });

        return () => { cancelled = true; };
    }, [duration]);

    useEffect(() => {
        if (!points || !points.length || !canvasRef.current) return;

        const daily = ['-7d', '-30d'].includes(duration);
        const labels = points.map((p) => formatTick(p.t, daily));
        const fullLabels = points.map((p) => new Date(p.t).toLocaleString('en-GB'));

        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = new Chart(canvasRef.current, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: points.map(() => 1),
                    backgroundColor: points.map((p) => iaqLevel(p.v).color),
                    barPercentage: 1,
                    categoryPercentage: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => fullLabels[items[0].dataIndex],
                            label: (item) => {
                                const value = points[item.dataIndex].v;
                                return `IAQ ${formatValue(value, 0)} (${iaqLevel(value).label})`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: TICK_COLOR, maxTicksLimit: 8, maxRotation: 0, autoSkip: true },
                        grid: { display: false },
                    },
                    y: { display: false, max: 1 },
                },
            },
        });

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, [points, duration]);

    const isEmpty = points && points.length === 0;

    return (
        <div className={`card span-${span}`}>
            <div className="card-header">
                <h2>🍃 Air quality</h2>
            </div>
            <div className="card-chart">
                {error && <p className="card-message">⚠️ {error}</p>}
                {!error && !points && <p className="card-message">Loading…</p>}
                {!error && isEmpty && <p className="card-message">No data for this period.</p>}
                <canvas ref={canvasRef} style={{ visibility: !error && points && !isEmpty ? 'visible' : 'hidden' }} />
            </div>
            <div className="card-stats">
                {IAQ_LEVELS.map((level) => (
                    <span key={level.label} className="stat">
                        <i style={{ background: level.color }} />{level.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
