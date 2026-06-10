import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // En dev, l'API tourne en local (npm run dev à la racine)
        proxy: {
            '/api': 'http://localhost:3000',
        },
    },
});
