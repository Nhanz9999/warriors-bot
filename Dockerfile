FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg python3 make g++ \
      libcairo2 libcairo2-dev libpango1.0-0 libpango1.0-dev \
      libjpeg62-turbo libjpeg-dev libgif-dev librsvg2-dev \
      libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./

# Remove prebuilt binaries and rebuild all native modules from source
RUN rm -rf node_modules && npm install --build-from-source

COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
