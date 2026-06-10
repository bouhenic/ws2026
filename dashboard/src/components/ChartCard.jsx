import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { apiFetch } from '../api.js';
import { MEAN_AGGREGATE, SUM_AGGREGATE, formatTick, formatValue } from '../fields.js';

const GRID_COLOR = 'rgba(148, 163, 184, 0.12)';
const TICK_COLOR = '#8fa3bd';

// Carte graphique générique : une ou plusieurs séries sur la même plage de temps.
// `series` doit être une constante de module (identité stable) pour éviter les refetchs.
// fn='sum' affiche des barres cumulables (pluviométrie) ; cumulative ajoute la courbe de cumul.
export default function ChartCard({
    title,
    icon,
    duration,
    series,
    type = 'line',
    fn = 'mean',
    cumulative = false,
    decimals = 1,
    unit = '',
    span = 6,
}) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        const aggregate = (fn === 'sum' ? SUM_AGGREGATE : MEAN_AGGREGATE)[duration];

        Promise.all(series.map(async (s) => {
            let url = `/api/data/${s.field}?duration=${encodeURIComponent(duration)}`;
            if (aggregate) url += `&aggregate=${aggregate}&fn=${fn}`;
            const rows = await apiFetch(url);
            return { ...s, points: rows.map((r) => ({ t: new Date(r._time).getTime(), v: r._value })) };
        }))
            .then((result) => { if (!cancelled) setData(result); })
            .catch((err) => { if (!cancelled) setError(err.message); });

        return () => { cancelled = true; };
    }, [duration, series, fn]);

    useEffect(() => {
        if (!data || !canvasRef.current) return;

        const timeKeys = [...new Set(data.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
        const daily = ['-7d', '-30d'].includes(duration);
        const labels = timeKeys.map((t) => formatTick(t, daily));
        const fullLabels = timeKeys.map((t) => new Date(t).toLocaleString('fr-FR'));

        const usesRightAxis = cumulative || data.some((s) => s.axis === 'y1');
        const datasets = data.map((s) => {
            const byTime = new Map(s.points.map((p) => [p.t, p.v]));
            const values = timeKeys.map((t) => (byTime.has(t) ? byTime.get(t) : null));
            if (type === 'bar') {
                return { label: s.label, data: values, backgroundColor: s.color, borderRadius: 3 };
            }
            return {
                label: s.label,
                data: values,
                borderColor: s.color,
                backgroundColor: `${s.color}26`,
                fill: data.length === 1 && !s.axis,
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.3,
                spanGaps: true,
                yAxisID: s.axis || 'y',
            };
        });

        if (cumulative) {
            let total = 0;
            const cumValues = datasets[0].data.map((v) => {
                if (v != null) total += v;
                return Math.round(total * 100) / 100;
            });
            datasets.push({
                type: 'line',
                label: 'Cumul',
                data: cumValues,
                borderColor: '#38bdf8',
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.2,
                yAxisID: 'y1',
            });
        }

        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = new Chart(canvasRef.current, {
            type,
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: datasets.length > 1,
                        labels: { color: '#e6edf6', boxWidth: 12, boxHeight: 12 },
                    },
                    tooltip: {
                        callbacks: { title: (items) => fullLabels[items[0].dataIndex] },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: TICK_COLOR, maxTicksLimit: 8, maxRotation: 0, autoSkip: true },
                        grid: { color: GRID_COLOR },
                    },
                    y: {
                        ticks: { color: TICK_COLOR },
                        grid: { color: GRID_COLOR },
                    },
                    ...(usesRightAxis && {
                        y1: {
                            position: 'right',
                            ticks: { color: TICK_COLOR },
                            grid: { drawOnChartArea: false },
                        },
                    }),
                },
            },
        });

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, [data, duration, type, cumulative]);

    const isEmpty = data && data.every((s) => s.points.length === 0);

    return (
        <div className={`card span-${span}`}>
            <div className="card-header">
                <h2>{icon} {title}</h2>
            </div>
            <div className="card-chart">
                {error && <p className="card-message">⚠️ {error}</p>}
                {!error && !data && <p className="card-message">Chargement…</p>}
                {!error && isEmpty && <p className="card-message">Aucune donnée sur la période.</p>}
                <canvas ref={canvasRef} style={{ visibility: !error && data && !isEmpty ? 'visible' : 'hidden' }} />
            </div>
            {data && !isEmpty && (
                <div className="card-stats">
                    {fn === 'sum' ? (
                        <span className="stat">
                            Cumul : <strong>{formatValue(data[0].points.reduce((acc, p) => acc + p.v, 0), decimals)} {unit}</strong>
                        </span>
                    ) : (
                        data.map((s) => {
                            const values = s.points.map((p) => p.v).filter((v) => typeof v === 'number');
                            if (!values.length) return null;
                            const min = Math.min(...values);
                            const max = Math.max(...values);
                            const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
                            const u = s.unit ?? unit;
                            const d = s.decimals ?? decimals;
                            return (
                                <span key={s.field} className="stat">
                                    <i style={{ background: s.color }} />
                                    {data.length > 1 && `${s.label} — `}
                                    min {formatValue(min, d)} · moy {formatValue(mean, d)} · max {formatValue(max, d)} {u}
                                </span>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
