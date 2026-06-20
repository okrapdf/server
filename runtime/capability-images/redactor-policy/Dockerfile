# syntax=docker/dockerfile:1
#
# Basic policy redactor capability image (capability id: redactor.policy.basic).
# Build from the repository root:
#   docker build -f runtime/capability-images/redactor-policy/Dockerfile .
#
# Regex-scans the extracted text in the document graph for PII (email/SSN/phone/
# card) and proposes redaction regions for human review. No PDF bytes or models
# required. Replace with a bbox-aware / semantic redactor for precise regions.

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
ENV OKRA_CAPABILITY_ID=redactor.policy.basic
ENV OKRA_CAPABILITY_HTTP_PORT=8080
ENV PATH=/app/node_modules/.bin:$PATH
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/okrapdf/package.json packages/okrapdf/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --filter @okrapdf/sdk... --prod

COPY --from=build /app/packages/okrapdf/dist packages/okrapdf/dist
COPY runtime /app/runtime

EXPOSE 8080
CMD ["node", "packages/okrapdf/dist/cli/bin.js", "capability", "serve", "redactor.policy.basic", "--host", "0.0.0.0", "--port", "8080"]
