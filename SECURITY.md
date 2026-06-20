# Security

okraPDF self-host is designed so your documents never leave your infrastructure.

## What this server does and does not do

- **No okraPDF cloud calls.** The server parses, audits, and redacts entirely
  locally (poppler + tesseract). It does not phone home, and it has no okraPDF
  cloud key. The only required secret, `OKRA_API_KEY`, is a local auth secret
  **you generate** to gate mutating routes — it is not validated against our cloud.
- **No telemetry / analytics.** No PostHog, Sentry, or usage beacons.
- **By default, nothing leaves the box.** With the built-in in-process engines,
  uploaded PDFs, the extracted document graph, and run records are written only to
  `OKRA_DATA_DIR` on your volume. Configuring external capability services
  (`OKRA_CAPABILITY_*_URL`) sends the document graph to those endpoints you choose —
  point them at infrastructure you control.

## Hardening notes

- Always set a strong `OKRA_API_KEY` (`openssl rand -hex 24`). Do not run with a
  guessable key on a public network.
- Put the server behind your own TLS-terminating reverse proxy for production.
- The optional isolated capability services (MinerU, etc.) may fetch models from
  Hugging Face on first run — see each `runtime/capabilities/*.engine.json`
  `network_policy`. The default in-process engines are fully offline.

## Reporting a vulnerability

This is a **beta**. Please report security issues privately to
security@okrapdf.com rather than opening a public issue. Do not include real PII
or customer documents in reports.
