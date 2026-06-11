import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { apiFetch } from '../api.js';

const GRID_COLOR = 'rgba(148, 163, 184, 0.12)';
const TICK_COLOR = '#8fa3bd';

// Les 8 canaux EU868 utilisés par TTN (MHz)
const EU868_CHANNELS = [867.1, 867.3, 867.5, 867.7, 867.9, 868.1, 868.3, 868.5];

// Répartition des trames par canal : histogramme construit à partir de la
// série brute des fréquences (un point = un uplink).
export default function ChannelUsage({ duration, span = 6 }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [counts, setCounts] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        apiFetch(`/api/data/frequency?duration=${encodeURIComponent(duration)}`)
            .then((rows) => {
                if (cancelled) return;
                const byChannel = new Map(EU868_CHANNELS.map((f) => [f, 0]));
                for (const row of rows) {
                    const freq = Math.round(row._value * 10) / 10;
                    byChannel.set(freq, (byChannel.get(freq) ?? 0) + 1);
                }
                setCounts([...byChannel.entries()].sort((a, b) => a[0] - b[0]));
            })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [duration]);

    useEffect(() => {
        if (!counts || !canvasRef.current) return;
        const total = counts.reduce((acc, [, n]) => acc + n, 0);

        if (chartRef.current) chartRef.current.destroy();
        chartRef.current = new Chart(canvasRef.current, {
            type: 'bar',
            data: {
                labels: counts.map(([freq]) => `${freq.toFixed(1)}`),
                datasets: [{
                    label: 'Trames',
                    data: counts.map(([, n]) => n),
                    backgroundColor: '#38bdf8',
                    borderRadius: 3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => `${items[0].label} MHz`,
                            label: (item) => {
                                const pct = total ? Math.round((item.raw / total) * 100) : 0;
                                return `${item.raw} trames (${pct} %)`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        title: { display: true, text: 'MHz', color: TICK_COLOR },
                        ticks: { color: TICK_COLOR },
                        grid: { display: false },
                    },
                    y: {
                        ticks: { color: TICK_COLOR, precision: 0 },
                        grid: { color: GRID_COLOR },
                    },
                },
            },
        });

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, [counts]);

    const total = counts ? counts.reduce((acc, [, n]) => acc + n, 0) : 0;

    return (
        <div className={`card span-${span}`}>
            <div className="card-header">
                <h2>📻 Canaux utilisés</h2>
            </div>
            <div className="card-chart">
                {error && <p className="card-message">⚠️ {error}</p>}
                {!error && !counts && <p className="card-message">Chargement…</p>}
                {!error && counts && total === 0 && <p className="card-message">Aucune donnée sur la période.</p>}
                <canvas ref={canvasRef} style={{ visibility: !error && total > 0 ? 'visible' : 'hidden' }} />
            </div>
            {total > 0 && (
                <div className="card-stats">
                    <span className="stat">
                        {total} trames réparties sur {counts.filter(([, n]) => n > 0).length} des 8 canaux EU868
                    </span>
                </div>
            )}
        </div>
    );
}
