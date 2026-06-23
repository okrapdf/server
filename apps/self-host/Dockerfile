# Single-container build of the whole self-host stack — for Railway, Fly,
# Render, or any "one image, one public port" host.
#
# Local dev uses docker-compose.yml (orchestrator + liteparse as two services
# on a private network). Some hosts only give you ONE container with ONE public
# port and an IPv6-only private network — so here we bake BOTH processes into a
# single image and have the orchestrator reach the parser over loopback
# (127.0.0.1), which is rock-solid everywhere. start.sh runs liteparse in the
# background and the orchestrator in the foreground.
#
# node:22-slim = Debian/glibc so the @llamaindex/liteparse native binary loads.
FROM node:22-slim
WORKDIR /app

# --- liteparse parser deps (native @llamaindex/liteparse) ---
COPY parsers/liteparse/package.json ./liteparse/package.json
RUN cd liteparse && npm install --omit=dev --no-audit --no-fund
COPY parsers/liteparse/server.mjs ./liteparse/server.mjs

# --- orchestrator deps (wrangler + workerd + agents) ---
COPY orchestrator/package.json ./orchestrator/package.json
RUN cd orchestrator && npm install --no-audit --no-fund
COPY orchestrator/tsconfig.json orchestrator/wrangler.toml ./orchestrator/
# The parser is in THIS container on loopback (compose points at the 'liteparse'
# service DNS instead) — rewrite the orchestrator's parser URL accordingly.
RUN sed -i 's#http://liteparse:8080#http://127.0.0.1:8080#' orchestrator/wrangler.toml
COPY orchestrator/src ./orchestrator/src
COPY orchestrator/public ./orchestrator/public

COPY start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /data

ENV CI=true
ENV WRANGLER_SEND_METRICS=false
# The host proxies public traffic to this port (the orchestrator binds it);
# start.sh pins liteparse to 8080 so it ignores an injected PORT.
ENV PORT=8787
EXPOSE 8787

CMD ["./start.sh"]
