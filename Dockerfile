FROM node:22-slim

ARG CACHE_BUST=1
RUN echo "Rebuilding: $(date)"

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

# Force EncryptFeature to false at build time
RUN node -e "
const fs = require('fs');
const f = '/app/FastConfigFca.json';
const d = JSON.parse(fs.readFileSync(f));
d.EncryptFeature = false;
d.AutoLogin = false;
fs.writeFileSync(f, JSON.stringify(d, null, 2));
console.log('EncryptFeature:', d.EncryptFeature);
"

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
