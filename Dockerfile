# Image de l'API Node.js
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Exécution sans privilèges
USER node
EXPOSE 3000

CMD ["node", "src/index.js"]
