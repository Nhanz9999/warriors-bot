FROM node:22-slim

# Force rebuild 2026-08-28-22
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg python3 make g++ \
      libcairo2 libcairo2-dev libpango1.0-0 libpango1.0-dev \
      libjpeg62-turbo libjpeg-dev libgif-dev librsvg2-dev \
      libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN rm -rf node_modules && npm install --build-from-source
COPY . .

# Verify encrypt feature is disabled
RUN node -e "const d=JSON.parse(require('fs').readFileSync('FastConfigFca.json'));console.log('EncryptFeature:',d.EncryptFeature)"

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
