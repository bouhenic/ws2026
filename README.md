# Station Météo LoRaWAN — ws2026

API REST + dashboard pour la station météo LoRaWAN du Lycée Newton (Clichy).
Les uplinks TTN sont ingérés via MQTT et stockés dans InfluxDB ; l'API Express les expose
derrière une authentification par clé API, et un dashboard statique (Chart.js) les affiche.

## Architecture

```
TTN (MQTT) ──► api (Node/Express) ──► InfluxDB 2.x
                    ▲
                    │ proxy /api + /api-docs
internet ──► nginx (TLS, rate-limit, dashboard statique)
                    ▲
              certbot (renouvellement Let's Encrypt)
```

| Service | Rôle |
|---|---|
| `api` | Ingestion MQTT → InfluxDB + API REST (port 3000, interne) |
| `influxdb` | Stockage des séries temporelles (8086, exposé uniquement sur localhost) |
| `nginx` | TLS, dashboard statique, reverse proxy, rate limiting |
| `certbot` | Émission/renouvellement des certificats Let's Encrypt |

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | non | État du service (MQTT, uptime) |
| `GET /api/latest` | clé API | Dernier relevé de tous les capteurs |
| `GET /api/data/{field}?duration=-24h&aggregate=30m` | clé API | Série temporelle d'un champ |
| `GET /api-docs` | non | Documentation Swagger |

L'authentification se fait par le header `X-API-Key`.

## Développement local

```bash
cp .env.example .env        # puis remplir les valeurs
npm install
docker compose up -d influxdb
npm run dev                 # API sur http://localhost:3000
```

Ou tout en docker : `docker compose up --build` (nginx nécessite un certificat,
voir l'amorçage TLS ci-dessous ; en local, utiliser l'API directement sur :3000).

## Déploiement (VM DigitalOcean)

### 1. Préparer la VM (une fois)

```bash
# Sur une VM Ubuntu fraîche
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
sudo mkdir -p /opt/ws2026 && sudo chown $USER /opt/ws2026
```

Créer `/opt/ws2026/.env` à partir de `.env.example` avec les vraies valeurs :
- `API_KEY` : `openssl rand -hex 32`
- `INFLUX_TOKEN` : `openssl rand -hex 32` (token admin créé au premier démarrage d'InfluxDB)
- `MQTT_PASSWORD` : nouvelle clé API générée sur la console TTN
- `GHCR_OWNER` : votre compte GitHub en minuscules
- `DOMAIN` / `LETSENCRYPT_EMAIL`

### 2. DNS

Faire pointer le domaine (`DOMAIN`) vers l'IP publique de la VM (enregistrement A).

### 3. Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Contenu |
|---|---|
| `DO_HOST` | IP de la VM |
| `DO_USER` | utilisateur SSH (ex. `deploy`) |
| `DO_SSH_KEY` | clé privée SSH (ed25519) dont la clé publique est dans `~/.ssh/authorized_keys` de la VM |
| `GHCR_PAT` | Personal Access Token GitHub avec scope `read:packages` (pour que la VM pull les images) |

### 4. Premier déploiement

1. Pousser sur `main` → le workflow construit les images, les pousse sur GHCR puis lance `docker compose up -d` sur la VM. Au premier passage, nginx échouera (pas encore de certificat) : c'est attendu.
2. Sur la VM, amorcer le certificat TLS :
   ```bash
   cd /opt/ws2026 && bash deploy/init-letsencrypt.sh
   ```
3. Vérifier : `https://<domaine>/` (dashboard), `https://<domaine>/api/health`, `https://<domaine>/api-docs`.

Les déploiements suivants sont entièrement automatiques à chaque push sur `main`.

### Migration des données historiques (optionnel)

Depuis l'ancienne instance InfluxDB :
```bash
influx backup /tmp/backup --org cielnewton --bucket ws2024 -t <ancien-token>
# copier /tmp/backup sur la VM puis :
docker compose exec influxdb influx restore /backup --org cielnewton --new-bucket ws2026 -t $INFLUX_TOKEN
```

## Sécurité

- Aucun secret dans le code : tout passe par `.env` (gitignoré) / secrets GitHub.
- Clé API vérifiée en temps constant (`crypto.timingSafeEqual`).
- Paramètres de requête validés par liste blanche / regex avant interpolation Flux.
- InfluxDB non exposé sur internet (uniquement réseau docker interne + localhost).
- Rate limiting nginx : 10 req/s par IP sur `/api/`.
- HTTPS obligatoire (redirection 301), HSTS, conteneur API non-root.

⚠️ **Les anciens tokens TTN et InfluxDB présents dans l'ancien `index.js` doivent être révoqués**
(console TTN → API keys ; InfluxDB → API Tokens).
