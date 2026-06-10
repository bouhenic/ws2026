#!/bin/bash
# Amorçage Let's Encrypt — à exécuter UNE SEULE FOIS sur la VM, depuis /opt/ws2026.
#
# Problème résolu : nginx refuse de démarrer si les certificats n'existent pas,
# mais certbot a besoin de nginx (challenge HTTP) pour les obtenir.
# Solution : certificat factice → démarrage nginx → vrai certificat → reload.
set -euo pipefail

cd "$(dirname "$0")/.."

# Charge DOMAIN et LETSENCRYPT_EMAIL depuis .env
set -a; source .env; set +a

if [ -z "${DOMAIN:-}" ] || [ -z "${LETSENCRYPT_EMAIL:-}" ]; then
    echo "❌ DOMAIN et LETSENCRYPT_EMAIL doivent être définis dans .env"
    exit 1
fi

LIVE_PATH="/etc/letsencrypt/live/${DOMAIN}"

echo "### Création d'un certificat factice pour ${DOMAIN}…"
docker compose run --rm --entrypoint "\
  sh -c 'mkdir -p ${LIVE_PATH} && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout ${LIVE_PATH}/privkey.pem \
    -out ${LIVE_PATH}/fullchain.pem \
    -subj /CN=${DOMAIN}'" certbot

echo "### Démarrage de nginx (recréation forcée)…"
# --force-recreate : si le conteneur existait déjà en crash-loop (pas de
# certificat au premier déploiement), un simple up -d ne le relancerait pas.
docker compose up -d --force-recreate nginx

echo "### Attente que nginx réponde sur le port 80…"
for i in $(seq 1 15); do
    if curl -s -o /dev/null -m 2 "http://localhost/.well-known/acme-challenge/"; then
        echo "nginx répond."
        break
    fi
    if [ "$i" -eq 15 ]; then
        echo "❌ nginx ne répond pas sur le port 80 après 30 s. Logs :"
        docker compose logs --tail 20 nginx
        exit 1
    fi
    sleep 2
done

echo "### Suppression du certificat factice…"
docker compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/${DOMAIN} \
         /etc/letsencrypt/archive/${DOMAIN} \
         /etc/letsencrypt/renewal/${DOMAIN}.conf" certbot

echo "### Demande du certificat Let's Encrypt pour ${DOMAIN}…"
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email ${LETSENCRYPT_EMAIL} \
    -d ${DOMAIN} \
    --agree-tos --no-eff-email" certbot

echo "### Redémarrage de nginx avec le vrai certificat…"
docker compose restart nginx

echo "✅ Certificat installé. Le conteneur certbot renouvellera automatiquement."
