FROM node:22-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg python3 make g++ \
      libcairo2 libcairo2-dev libpango1.0-0 libpango1.0-dev \
      libjpeg62-turbo libjpeg-dev libgif-dev librsvg2-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./

# Remove prebuilt native modules and rebuild from source
RUN npm ci --omit=dev || npm install --omit=dev
RUN npm rebuild sqlite3 --build-from-source 2>/dev/null || true
RUN npm rebuild better-sqlite3 --build-from-source 2>/dev/null || true
RUN npm rebuild canvas --build-from-source 2>/dev/null || true

COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
