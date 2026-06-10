// Dashboard station météo — consomme l'API via /api (proxy nginx)
// La clé API est demandée au premier chargement et stockée en localStorage.

const FIELDS = {
    temperature:    { label: 'Température', unit: '°C', decimals: 1 },
    tempDS18B20:    { label: 'Temp. sonde', unit: '°C', decimals: 1 },
    humidity:       { label: 'Humidité', unit: '%', decimals: 0 },
    pressure:       { label: 'Pression', unit: 'hPa', decimals: 0 },
    rainfall:       { label: 'Précipitations', unit: 'mm', decimals: 1 },
    avgSpeed:       { label: 'Vent moyen', unit: 'km/h', decimals: 1 },
    maxSpeed:       { label: 'Rafales', unit: 'km/h', decimals: 1 },
    avgDirection:   { label: 'Direction vent', unit: '°', decimals: 0 },
    iaq:            { label: 'Qualité air (IAQ)', unit: '', decimals: 0 },
    gas:            { label: 'Gaz', unit: 'kΩ', decimals: 1 },
    batteryVoltage: { label: 'Batterie', unit: 'V', decimals: 2 },
};

// Agrégation automatique selon la plage pour limiter le volume de points
const AUTO_AGGREGATE = { '-1h': null, '-6h': null, '-24h': '10m', '-7d': '1h', '-30d': '6h' };

let currentField = 'temperature';
let currentDuration = '-24h';
let chart = null;
let latestData = {};

function getApiKey() {
    let key = localStorage.getItem('apiKey');
    if (!key) {
        key = prompt('Clé API de la station météo :');
        if (key) localStorage.setItem('apiKey', key.trim());
    }
    return key;
}

async function apiFetch(path) {
    const response = await fetch(path, { headers: { 'X-API-Key': getApiKey() || '' } });
    if (response.status === 401) {
        localStorage.removeItem('apiKey');
        throw new Error('Clé API invalide — rechargez la page pour la saisir à nouveau.');
    }
    if (!response.ok) throw new Error(`Erreur API ${response.status}`);
    return response.json();
}

// ── Cartes des valeurs courantes ─────────────
function renderCards() {
    const container = document.getElementById('cards');
    container.innerHTML = '';
    for (const [field, meta] of Object.entries(FIELDS)) {
        const entry = latestData[field];
        const value = entry && typeof entry.value === 'number'
            ? entry.value.toFixed(meta.decimals)
            : '–';

        let extra = '';
        if (field === 'avgDirection' && latestData.avgDirectionCardinal) {
            extra = ` ${latestData.avgDirectionCardinal.value}`;
        }

        const card = document.createElement('div');
        card.className = 'card' + (field === currentField ? ' selected' : '');
        card.innerHTML = `
            <div class="label">${meta.label}</div>
            <div class="value">${value}<span class="unit"> ${meta.unit}${extra}</span></div>
        `;
        card.addEventListener('click', () => {
            currentField = field;
            document.getElementById('field-select').value = field;
            renderCards();
            loadChart();
        });
        container.appendChild(card);
    }
}

async function loadLatest() {
    try {
        latestData = await apiFetch('/api/latest');
        renderCards();

        const times = Object.values(latestData).map((e) => new Date(e.time));
        if (times.length) {
            const lastTime = new Date(Math.max(...times));
            document.getElementById('last-update').textContent =
                `· dernier relevé : ${lastTime.toLocaleString('fr-FR')}`;
        }
    } catch (error) {
        document.getElementById('last-update').textContent = `· ${error.message}`;
    }
}

// ── Graphique historique ─────────────────────
async function loadChart() {
    const meta = FIELDS[currentField];
    const aggregate = AUTO_AGGREGATE[currentDuration];
    let url = `/api/data/${currentField}?duration=${encodeURIComponent(currentDuration)}`;
    if (aggregate) url += `&aggregate=${aggregate}`;

    try {
        const rows = await apiFetch(url);
        const labels = rows.map((r) => new Date(r._time));
        const values = rows.map((r) => r._value);

        if (chart) chart.destroy();
        chart = new Chart(document.getElementById('chart'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: `${meta.label} (${meta.unit})`,
                    data: values,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    fill: true,
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.25,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { color: '#e2e8f0' } } },
                scales: {
                    x: {
                        ticks: {
                            color: '#94a3b8',
                            maxTicksLimit: 10,
                            callback(value, index) {
                                const d = this.getLabelForValue(index);
                                const date = new Date(d);
                                return ['-7d', '-30d'].includes(currentDuration)
                                    ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
                                    : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            },
                        },
                        grid: { color: '#334155' },
                    },
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#334155' },
                    },
                },
            },
        });
    } catch (error) {
        console.error('Erreur de chargement du graphique :', error);
    }
}

// ── Initialisation ───────────────────────────
function init() {
    const select = document.getElementById('field-select');
    for (const [field, meta] of Object.entries(FIELDS)) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = meta.label;
        select.appendChild(option);
    }
    select.value = currentField;
    select.addEventListener('change', () => {
        currentField = select.value;
        renderCards();
        loadChart();
    });

    document.querySelectorAll('#duration-buttons button').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('#duration-buttons button').forEach((b) => b.classList.remove('active'));
            button.classList.add('active');
            currentDuration = button.dataset.duration;
            loadChart();
        });
    });

    document.getElementById('reset-key').addEventListener('click', () => {
        localStorage.removeItem('apiKey');
        location.reload();
    });

    loadLatest();
    loadChart();
    setInterval(loadLatest, 60_000); // rafraîchit les cartes toutes les minutes
}

init();
