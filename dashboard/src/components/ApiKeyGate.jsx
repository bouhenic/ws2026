import { useState } from 'react';
import { apiFetch, storeApiKey } from '../api.js';

// Écran d'accueil : demande et vérifie la clé API avant d'afficher le dashboard.
export default function ApiKeyGate({ onValidKey }) {
    const [value, setValue] = useState('');
    const [error, setError] = useState(null);
    const [checking, setChecking] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        const key = value.trim();
        if (!key) return;
        setChecking(true);
        setError(null);
        try {
            await apiFetch('/api/latest', key);
            storeApiKey(key);
            onValidKey();
        } catch (err) {
            setError(err.status === 401
                ? 'Clé API invalide.'
                : `Impossible de joindre l'API (${err.message}).`);
        } finally {
            setChecking(false);
        }
    }

    return (
        <div className="gate">
            <form className="gate-card" onSubmit={handleSubmit}>
                <span className="gate-icon">🌤️</span>
                <h1>Station Météo</h1>
                <p>Lycée Newton — Clichy</p>
                <input
                    type="password"
                    name="api-key"
                    autoComplete="off"
                    placeholder="Clé API"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                />
                <button type="submit" disabled={checking || !value.trim()}>
                    {checking ? 'Vérification…' : 'Accéder au dashboard'}
                </button>
                {error && <p className="gate-error">{error}</p>}
            </form>
        </div>
    );
}
