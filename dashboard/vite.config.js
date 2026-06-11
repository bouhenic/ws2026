import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // En dev, le proxy Vite joue le rôle de nginx : il injecte la clé API
    // (lue dans le .env à la racine du dépôt) dans les requêtes vers l'API.
    const rootDir = fileURLToPath(new URL('..', import.meta.url));
    const env = loadEnv(mode, rootDir, 'API_KEY');

    return {
        plugins: [react()],
        server: {
            proxy: {
                '/api': {
                    target: 'http://localhost:3000',
                    headers: { 'X-API-Key': env.API_KEY ?? '' },
                },
            },
        },
    };
});
