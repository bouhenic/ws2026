# Image nginx : reverse proxy + dashboard statique
# Contexte de build : la racine du dépôt (voir docker-compose.yml)
FROM nginx:1.27-alpine

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY public /usr/share/nginx/html
