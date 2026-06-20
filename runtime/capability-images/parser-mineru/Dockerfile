# syntax=docker/dockerfile:1
#
# Local parser capability image (capability id: parser.mineru).
# Build from the repository root:
#   docker build -f runtime/capability-images/parser-mineru/Dockerfile .
#
# Runs real local extraction (poppler text layer + tesseract OCR) against PDFs on
# the shared okra-data volume. Swap to a model-backed MinerU HTTP service when one
# exists; the capability contract (okra-capability-http/v1) stays the same.

FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/okrapdf/package.json packages/okrapdf/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --filter @okrapdf/sdk...

FROM deps AS build
COPY packages/schemas packages/schemas
COPY packages/okrapdf packages/okrapdf
RUN pnpm --filter @okrapdf/sdk run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV OKRA_CAPABILITY_ID=parser.mineru
ENV OKRA_CAPABILITY_HTTP_PORT=8080
ENV HF_HOME=/data/huggingface
# Read the same shared okra-data volume the app writes uploads to, so this
# isolated parser service extracts the real PDF (not a fallback placeholder).
ENV OKRA_DATA_DIR=/data/okrapdf
ENV PATH=/app/node_modules/.bin:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/okrapdf/package.json packages/okrapdf/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --filter @okrapdf/sdk... --prod

COPY --from=build /app/packages/okrapdf/dist packages/okrapdf/dist
COPY runtime /app/runtime

EXPOSE 8080
CMD ["node", "packages/okrapdf/dist/cli/bin.js", "capability", "serve", "parser.mineru", "--host", "0.0.0.0", "--port", "8080"]
