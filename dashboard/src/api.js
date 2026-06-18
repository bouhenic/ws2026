// Client de l'API station météo. Le site est public : la clé API est injectée
// côté proxy (nginx en prod, proxy Vite en dev) et ne transite jamais par le
// navigateur.

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

export async function apiFetch(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new ApiError(`API error ${response.status}`, response.status);
    }
    return response.json();
}
