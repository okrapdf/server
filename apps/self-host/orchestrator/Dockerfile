# okra self-host orchestrator. Runs the workerd worker via wrangler (miniflare),
# which bundles src/index.ts, runs the DocumentAgent DO, and persists its SQLite
# to /data (mount a volume). (SH-5: swap to `workerd serve` + capnp for production.)
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json wrangler.toml ./
COPY src ./src
COPY public ./public
ENV CI=true
ENV WRANGLER_SEND_METRICS=false
RUN mkdir -p /data
EXPOSE 8787
CMD ["npx", "--no-install", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787", "--persist-to", "/data"]
