# Contributing

okraPDF Server is in **beta** — contributions, bug reports, and durability war
stories are all welcome.

## Provenance

`packages/okrapdf` (`@okrapdf/sdk`) and `packages/schemas` are **vendored from the
okraPDF monorepo**. Don't hand-edit them for anything beyond a quick local fix —
upstream changes there. Re-sync with:

```bash
node scripts/sync-from-monorepo.mjs /path/to/okra
```

The parts that live natively in this repo: the `runtime/` bundle (engines + recipes),
the `Dockerfile` / `docker-compose.yml`, and the docs.

## Dev loop

```bash
pnpm install
pnpm build                       # tsup build of @okrapdf/sdk (schemas bundled from src)
pnpm test                        # self-host runtime tests
OKRA_API_KEY=$(openssl rand -hex 24) pnpm serve
```

Requires Node 22+, `poppler-utils`, and `tesseract-ocr` on PATH. Run `pnpm doctor`
to verify the local extraction toolchain.

## Ground rules

- **No PII, no secrets, ever** — not in code, fixtures, tests, or commit history. Use
  synthetic data (`jane.doe@example.com`, fake SSNs). CI runs a secret scan.
- **No okraPDF cloud dependency in the server path.** The self-host server must run
  fully offline with only a local `OKRA_API_KEY`. Don't add calls to `okrapdf.com`.
- **Durability changes** must keep the self-host backend honest against the
  [Document Durability Contract](./DURABILITY.md). Don't claim a guarantee the code
  doesn't deliver — update the parity map and status instead.

## Adding an engine

Engines are data. Add a `runtime/capabilities/<id>.engine.json` declaring `kind`,
`runtime`, `reads`/`writes` over the document graph, `isolation`, `network_policy`,
and `license`, then reference it from a recipe in `runtime/recipes/`.
