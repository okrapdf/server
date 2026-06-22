<div align="center">

# okraPDF self-host

**Durable, parser-agnostic PDF parsing you run yourself.** One container orchestrates the
job durably; parsers are swappable containers. No okraPDF cloud, your data stays on your box.

MIT · self-hosted · bring-your-own parser

</div>

---

## Quick start (one command)

```bash
git clone https://github.com/okrapdf/server.git && cd server/apps/self-host
docker compose up --build
# → orchestrator API on http://127.0.0.1:8787
```

…or the installer (checks Docker, brings the stack up, waits until healthy):

```bash
curl -fsSL https://raw.githubusercontent.com/okrapdf/server/main/apps/self-host/install.sh | sh
```

That's it — you now have a durable PDF parser running locally.

## Parse a PDF

```bash
# upload + start a durable parse run
curl -s 127.0.0.1:8787/v1/documents/mydoc/upload \
  -H 'content-type: application/pdf' --data-binary @your.pdf

# watch it (run status + per-page status)
curl -s 127.0.0.1:8787/v1/documents/mydoc/status | jq

# read the result: pages → blocks with normalized (0–1) bounding boxes
curl -s 127.0.0.1:8787/v1/documents/mydoc/graph | jq
```

You can also `POST …/upload` JSON: `{"pdf_base64": "...", "file_name": "your.pdf", "parser": "liteparse"}`.

## What you get

- **A durable orchestrator** (Cloudflare `workerd` + the Agents SDK). One Durable Object per
  document owns the parse run. If the box restarts mid-parse, it **resumes** — completed pages
  stay completed, and the final result has every page exactly once.
- **Parsers as containers.** Parsing runs in its own container behind a tiny HTTP contract, so
  it can be **native and fast** (no WASM limits). Ships with **liteparse** (native, local, real
  bounding boxes). Swap or add parsers without touching the orchestrator.
- **Bbox-cited output.** Every text block carries a 0–1 bounding box, so results are citable.

```
            ┌──────────────────────── docker compose ────────────────────────┐
            │  orchestrator  (workerd + Agents — durable run, 127.0.0.1:8787)  │
            │      │  calls a parser over HTTP (uniform contract)             │
            │      ▼                                                          │
            │  liteparse container   (native, /health /pages /parse)         │
            │  …add more: dots-ocr (GPU), gemini (cloud) — same contract     │
            └────────────────────────────────────────────────────────────────┘
```

## Add a parser

A parser is just a container that answers the parser contract:

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ ok, parser, version }` |
| POST | `/pages` | `{ pdf_base64 }` | `{ pageCount }` |
| POST | `/parse` | `{ pdf_base64, page }` | `{ page, blocks: [{ type, value, bbox{x,y,w,h}, confidence }] }` |

Add it to `docker-compose.yml` and point the orchestrator at it
(`OKRA_PARSER_<ID>_URL`). See `parsers/liteparse/` for a ~90-line reference.

## Configuration

| Env | Default | What |
|---|---|---|
| `PORT` | `8787` | orchestrator API port |
| `HOST_BIND` | `127.0.0.1` | host interface the API binds to (set `0.0.0.0` to expose on the network) |
| `OKRA_PARSER_LITEPARSE_URL` | `http://liteparse:8080` | parser container URL |

Durable state (page results + checkpoints) persists to the `okra-do-data` volume — back it up to
keep in-flight runs across `docker compose down`.

## How durability works

The orchestrator runs each parse as an Agents-SDK **durable fiber**: progress is checkpointed to
the Durable Object's embedded SQLite (persisted to the volume), and the SDK's `onFiberRecovered`
re-runs an interrupted parse after a restart. Verified by killing the orchestrator mid-parse of a
multi-page document: on restart it resumes and finishes. A crash between parsing a page and
committing it may cause that page to be re-parsed (at-least-once work), but the result is
idempotent — re-parsing overwrites the same page, so the final graph holds each page exactly once,
never a lost page.

## Status & security

Public **beta**, single-tenant. The HTTP API is **unauthenticated**, so by default it binds to
`127.0.0.1` (loopback) only. To expose it on a network, set `HOST_BIND=0.0.0.0` **and** put it
behind your own auth/ingress — a built-in API-key + webhook-HMAC gate is on the roadmap. Production
swaps the dev runtime for `workerd serve`.

## License

MIT.
