// Client de l'API station météo (proxy nginx en prod, proxy Vite en dev).
// La clé API est stockée en localStorage ; un 401 déclenche le handler
// installé par App pour revenir à l'écran de saisie de la clé.

const API_KEY_STORAGE = 'apiKey';

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

export function getStoredApiKey() {
    return localStorage.getItem(API_KEY_STORAGE);
}

export function storeApiKey(key) {
    localStorage.setItem(API_KEY_STORAGE, key.trim());
}

export function clearApiKey() {
    localStorage.removeItem(API_KEY_STORAGE);
}

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

export async function apiFetch(path, apiKey) {
    const response = await fetch(path, {
        headers: { 'X-API-Key': apiKey ?? getStoredApiKey() ?? '' },
    });
    if (response.status === 401) {
        if (!apiKey && onUnauthorized) onUnauthorized();
        throw new ApiError('Clé API invalide', 401);
    }
    if (!response.ok) {
        throw new ApiError(`Erreur API ${response.status}`, response.status);
    }
    return response.json();
}
