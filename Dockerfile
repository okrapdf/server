# syntax=docker/dockerfile:1
#
# okraPDF self-host server. Build + run from the repo root:
#   docker compose up --build
#
# Parses PDFs locally with poppler (text layer) + tesseract (OCR fallback).
# No external paid services, no okraPDF cloud, no key that calls our cloud.
# @okrapdf/sdk inlines @okrapdf/schemas at build time (tsup noExternal), so the
# schemas source is bundled into the server — no separate schemas build needed.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/okrapdf/package.json packages/okrapdf/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --frozen-lockfile --filter @okrapdf/sdk...
COPY packages/schemas packages/schemas
COPY packages/okrapdf packages/okrapdf
RUN pnpm --filter @okrapdf/sdk run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV OKRA_DATA_DIR=/data/okrapdf
ENV PATH=/app/node_modules/.bin:$PATH

# Real local extraction toolchain: poppler-utils (pdftotext/pdfinfo/pdftoppm)
# + tesseract-ocr (OCR for scanned pages). This is what makes a cloned
# `docker compose up` produce document-derived text instead of a placeholder.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/okrapdf/package.json packages/okrapdf/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --frozen-lockfile --filter @okrapdf/sdk... --prod

COPY --from=build /app/packages/okrapdf/dist packages/okrapdf/dist
COPY runtime /app/runtime

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/okrapdf/dist/cli/bin.js", "serve", "/app/runtime", "--host", "0.0.0.0", "--port", "8787"]
