<div align="center">

# okraPDF Server

**Self-host okraPDF. Parse, audit, and redact PDFs on your own infrastructure.**

No okraPDF cloud. No telemetry. By default, your documents never leave your box.

[![ci](https://github.com/okrapdf/server/actions/workflows/ci.yml/badge.svg)](https://github.com/okrapdf/server/actions/workflows/ci.yml)
&nbsp;·&nbsp; License: MIT &nbsp;·&nbsp; **Status: Beta**

</div>

> [!WARNING]
> **This is a public beta.** The runtime works and is tested, but interfaces and the
> durability story are still moving. Read [Durability & reliability](#durability--reliability)
> before you put large or production workloads on it. Feedback and issues welcome.

---

## What it is

`okrapdf/server` is the self-hostable okraPDF document runtime. Upload a PDF and the
server gives you a **document graph with page-region citations** (per-token bbox is on
the roadmap), runs an **accessibility audit**, and
proposes **PII redactions** — all locally, with the same primitives as the okraPDF
cloud. It is the n8n model for documents: one container, runs on your box, your data
never leaves.

- **Parse** — poppler text layer + tesseract OCR fallback → a normalized document
  graph (pages, blocks, page-region bboxes). Zero paid services.
- **Audit** — basic WCAG checks derived from the real graph (missing text layer,
  missing title).
- **Redact** — PII detection (email, SSN, …) over the actually-extracted text, as
  reviewable proposals.
- **Compose** — engines are data (`runtime/capabilities/*.engine.json`) and workflows
  are declarative recipes (`runtime/recipes/`). Swap or add engines without forking.

### The three guarantees

1. **No okraPDF cloud calls.** The server never phones home. It has no okraPDF cloud
   key. The one required secret, `OKRA_API_KEY`, is a **local** auth secret *you*
   generate to gate mutating routes.
2. **By default, nothing leaves the box.** With the built-in in-process engines,
   uploaded PDFs, the document graph, and run records live only under `OKRA_DATA_DIR`
   on your volume. If you opt into external capability services via
   `OKRA_CAPABILITY_*_URL`, the document graph is sent to those endpoints *you* choose
   — point them at infrastructure you control.
3. **No telemetry.** No analytics, no usage beacons.

See [SECURITY.md](./SECURITY.md).

## Quickstart

```bash
git clone https://github.com/okrapdf/server.git
cd server
cp .env.example .env

# set a local auth secret (NOT an okraPDF cloud key) — in .env and your shell
export OKRA_API_KEY=$(openssl rand -hex 24)
echo "OKRA_API_KEY=$OKRA_API_KEY" >> .env

docker compose up --build
# → http://localhost:8787   (GET /health)
```

Then upload a PDF, run a recipe, and read the cited document graph over plain HTTP
(mutating routes take `Authorization: Bearer $OKRA_API_KEY`):

```bash
# 1. health
curl -fsS http://localhost:8787/health

# 2. discover engines + recipes
curl -s http://localhost:8787/v1/capabilities      -H "Authorization: Bearer $OKRA_API_KEY"
curl -s http://localhost:8787/v1/workflows/catalog -H "Authorization: Bearer $OKRA_API_KEY"

# 3. upload a PDF — you pick the document id; raw PDF as the body
curl -X POST http://localhost:8787/document/mydoc/upload \
  -H "Authorization: Bearer $OKRA_API_KEY" \
  -H "Content-Type: application/pdf" -H "x-file-name: your.pdf" \
  --data-binary @your.pdf

# 4. run the parse recipe (poppler text layer + tesseract OCR → document graph)
curl -X POST http://localhost:8787/v1/workflows \
  -H "Authorization: Bearer $OKRA_API_KEY" -H "Content-Type: application/json" \
  -d '{"recipe_id":"recipe.parse-document","document_id":"mydoc"}'

# 5. read the cited document graph
curl -s http://localhost:8787/v1/documents/mydoc/graph -H "Authorization: Bearer $OKRA_API_KEY"
```

Recipes: `recipe.parse-document`, `recipe.audit-review`, `recipe.redact-review`,
`recipe.hybrid-ocr-a11y-review` (list them at `GET /v1/workflows/catalog`).

### Run from source (no Docker)

```bash
pnpm install
pnpm build
OKRA_API_KEY=$(openssl rand -hex 24) pnpm serve   # serves ./runtime on :8787
```

Requires Node 22+, plus `poppler-utils` and `tesseract-ocr` on your PATH for real
local extraction (`pnpm doctor` checks this).

## Durability & reliability

okraPDF is built around **one durability contract** for both self-host and cloud — the
cloud's only extra job is Cloudflare-managed scaling, and **no Temporal or external
durable-execution engine is required** (durability is plain TypeScript, the n8n model).
The contract's durable boundary is the **page**; the okraPDF cloud implements it today,
and self-host is converging on it — see the status note below.

The full contract — guarantee, the `DocumentDurabilityStore` port, the cloud↔self-host
parity map, and the gap-closure roadmap — is in **[DURABILITY.md](./DURABILITY.md)**.

> [!IMPORTANT]
> **Current status: Stage 0.** This server is durable at the *run* boundary (a run
> completes and persists, or is re-run from scratch), **not yet the *page* boundary**.
> Page-level checkpoint + crash-resume (full parity with cloud) is the top beta
> roadmap item. Run very large parses on the cloud until it lands here.

## Architecture

```
your PDF ──▶ sourcer ──▶ parser ──▶ document graph ──▶ auditor ──▶ redactor ──▶ viewer
                         (poppler/        (pages,         (WCAG)      (PII)
                          tesseract)       blocks,
                                           bboxes)
```

- **`runtime/runtime.manifest.json`** — the runtime bundle (engines + recipes).
- **`runtime/capabilities/*.engine.json`** — engines as data: each declares its
  `reads`/`writes` over the document graph, runtime, isolation, license, and network
  policy. Swappable.
- **`runtime/recipes/`** — declarative workflow DAGs (parse / audit / redact /
  hybrid-ocr-a11y) with per-step graph contracts and human-review gates.
- **`packages/okrapdf`** — the `@okrapdf/sdk` runtime + `okra` CLI (`okra serve`).
- **`packages/schemas`** — shared Zod schemas (the document-graph + engine-manifest
  contracts), bundled into the server at build time.

> These packages are vendored from the okraPDF monorepo. Re-sync with
> `node scripts/sync-from-monorepo.mjs <path-to-okra-monorepo>`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OKRA_API_KEY` | *(required)* | **Local** secret gating mutating routes. Generate with `openssl rand -hex 24`. Not a cloud key. |
| `PORT` | `8787` | Server port. |
| `OKRA_DATA_DIR` | `/data/okrapdf` (Docker), `./data` (`pnpm serve`) | Where uploaded PDFs, the document graph, and run records persist. Keep it outside the repo. |
| `OKRA_AUTH_MODE` | `single_owner` | Auth mode. |
| `OKRA_FIRST_OWNER_EMAIL` | `owner@example.com` | First-owner bootstrap. |
| `OKRA_CAPABILITY_*_URL` | *(empty)* | Optional: route a stage to an isolated capability service. Empty → built-in in-process engines. |

## Roadmap (beta)

- [ ] **Page-level durability parity with cloud** — run/page ledger, async
      execution, boot recovery, per-page retry (see [DURABILITY.md](./DURABILITY.md)).
- [ ] First-class VLM parser engine (`vision_hybrid`: layout → VLM → merge).
- [ ] Per-token bbox (`pdftotext -bbox`) for tighter citations.
- [ ] One-click deploy templates (Railway / Fly).

## License

[MIT](./LICENSE) © okraPDF
