# Image nginx : reverse proxy + dashboard React (build Vite multi-étapes)
# Contexte de build : la racine du dépôt (voir docker-compose.yml)

FROM node:22-alpine AS build
WORKDIR /app
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard ./
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
