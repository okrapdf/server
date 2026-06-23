<div align="center">

# okraPDF Server

**Durable, parser-agnostic PDF parsing you run yourself.**

A durable [`workerd`](https://github.com/cloudflare/workerd) orchestrator drives each parse
job; parsers are swappable containers. No okraPDF cloud — your documents stay on your box.

MIT · self-hosted · bring-your-own parser

</div>

---

## Quick start

```bash
git clone https://github.com/okrapdf/server.git && cd server/apps/self-host
docker compose up --build
# → open http://127.0.0.1:8787  (web UI + API)
```

Full docs, the parser contract, durability details, and configuration live in
**[`apps/self-host/`](apps/self-host/README.md)**.

## What's inside

- **`apps/self-host/orchestrator`** — a `workerd` Cloudflare Agent. One Durable Object per
  document owns the parse run with native Agents-SDK durability (checkpointed to embedded
  SQLite; resumes after a restart). Serves the web UI + the
  `/v1/documents/:id/{upload,status,graph}` API.
- **`apps/self-host/parsers/liteparse`** — the reference parser container
  (`@llamaindex/liteparse`, native, real 0–1 bounding boxes) behind a tiny uniform HTTP
  contract. Add your own (GPU OCR, a cloud VLM) the same way — see the parser contract in the docs.

The architecture is one lean `docker compose`: orchestrator + parser, one durable volume, no
database. The page-resume durability guarantee is documented under
**["How durability works" in the self-host docs](apps/self-host/README.md#how-durability-works)**.

## Status

Public **beta**, single-tenant. The HTTP API is unauthenticated, so it binds to `127.0.0.1`
by default — set `HOST_BIND=0.0.0.0` only behind your own auth/ingress.

## License

[MIT](LICENSE).
