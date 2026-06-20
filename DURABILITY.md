# Document Durability Contract

This is the durability contract okraPDF is built around: **one guarantee, two
backends** — the open-source self-host server (filesystem) and the okraPDF cloud
(Durable Objects + Workflows). By design the cloud's only *additional* job is
**horizontal scaling**; the durability guarantee itself is identical. Scaling is kept
*orthogonal* to durability.

> [!IMPORTANT]
> **This document is the target contract and the gap-closure plan — not a claim that
> self-host already delivers it.** The okraPDF cloud implements this contract today.
> The self-host server in this repo is at **Stage 0**: durable at the *run* boundary,
> **not yet the *page* boundary** (no mid-parse resume). See
> [Current status](#current-status-in-this-repo) and the [parity map](#parity-map-cloud-vs-self-host-today)
> for exactly what is and isn't implemented.

> **Do we need Temporal / Inngest?** No. This contract is plain application-level
> TypeScript — the same model n8n uses (persist progress, recover on boot, queue
> only for scale). A parse is page-decomposable, so okra can checkpoint at **page**
> granularity, finer than n8n's per-node checkpoint. Reviewed by an independent
> Codex pass against both the cloud (Durable Objects + Cloudflare Workflows) and the
> self-host (Node + filesystem) implementations.

## The guarantee

A durable parse is a document run whose **durable boundary is the page**, plus a
small set of named lifecycle steps around the page loop. Once a page is marked
`completed` with an immutable artifact/content hash, neither cloud nor self-host
may redo or overwrite it during crash recovery. **Interrupted runs resume from
`pending`/`failed-retryable` pages, never from page 1.** All writes are idempotent
by `runId + pageNumber + stepName/attempt/artifactHash`, and status is always
reconstructable as `queued | running | completed | completed_with_errors | failed |
cancelled` with `pagesCompleted / pagesFailed / pagesRunning / pagesPending /
pagesTotal`.

## The contract interface (the durability "port")

Both backends implement one interface. Cloud and self-host differ only in the
adapter behind it.

```ts
type JobStatus =
  | 'queued' | 'running' | 'completed' | 'completed_with_errors'
  | 'failed' | 'cancelled';

type PageStatus = 'pending' | 'running' | 'completed' | 'failed';

interface RunRecord {
  runId: string;
  documentId: string;
  sourceHash: string;
  status: JobStatus;
  pagesTotal: number;
  createdAt: number;
  updatedAt: number;
  error?: string | null;
}

interface PageRecord {
  runId: string;
  pageNumber: number;
  status: PageStatus;
  attempt: number;
  artifactKey?: string;
  artifactHash?: string;
  error?: string | null;
}

interface DocumentDurabilityStore {
  createRun(input: Pick<RunRecord, 'runId' | 'documentId' | 'sourceHash' | 'pagesTotal'>): Promise<RunRecord>;
  getRun(runId: string): Promise<RunRecord | null>;
  claimPages(runId: string, limit: number): Promise<PageRecord[]>;
  markPageRunning(runId: string, pageNumber: number, attempt: number): Promise<void>;
  markPageCompleted(runId: string, pageNumber: number, artifactKey: string, artifactHash: string): Promise<void>;
  markPageFailed(runId: string, pageNumber: number, error: string, retryable: boolean): Promise<void>;
  writeArtifact(key: string, bytes: Uint8Array | string, hash: string): Promise<void>;
  readArtifact(key: string): Promise<Uint8Array | string | null>;
  recoverInterruptedRuns(): Promise<RunRecord[]>;
  summarize(runId: string): Promise<RunRecord & {
    pagesCompleted: number; pagesFailed: number; pagesRunning: number; pagesPending: number;
  }>;
}
```

- **`CloudflareDOAdapter`** — maps to the per-document Durable Object (SQLite + R2)
  and Cloudflare Workflows.
- **`FilesystemAdapter`** — maps to append-safe local SQLite/JSON + artifact files
  under `OKRA_DATA_DIR`. This is what this repo ships.

## Parity map (cloud vs self-host today)

| Guarantee clause | okraPDF cloud | Self-host (this repo) |
|---|---|---|
| Durable run record | Yes — lifecycle workflow id in DO meta, indexed to D1. | **Partial** — run JSON written only after the handler completes; no `queued`/`running` persisted before work starts. |
| Page checkpoint | Yes for the layout/VLM paths (`page_ledger` updates per page/chunk); coarser for plain text-layer paths, then backfilled. | **Gap** — the local parser processes the whole PDF synchronously and writes the graph once at the end. |
| Resume after crash | CF Workflows resume from completed `step.do()`/`step.sleep()`; DO storage preserves page state; an alarm watchdog detects stale runs. | **Gap** — no boot recovery, no interrupted-run scan, no page ledger. A crash mid-parse loses in-flight work. |
| Idempotent writes | Mostly — page-ledger upserts make completed pages sticky; run artifacts use immutable run-scoped keys. | **Partial** — stable IDs avoid duplicate graph entries, but writes are whole-file, not page-level idempotent checkpoints. |
| Observable status | Yes — DO derives page counts; public progress endpoint. | **Partial** — status is derived from the graph and always reports `phase: complete`; no per-page `running`/`failed`. |
| Async (out of request) | Yes — the workflow runs outside the request. | **Gap** — `/v1/workflows` awaits the run before responding. |

## What self-host must add to reach full parity

Ordered, single-node, **no Redis or Temporal required for the guarantee**:

1. **(required)** Persist run state (`runs/{runId}`) with `queued/running/terminal`
   + `pagesTotal` **before** work starts.
2. **(required)** Add a **page ledger** — local SQLite for atomic per-page updates
   (or temp-file + rename if staying JSON-only).
3. **(required)** Refactor the local extractor into a **page iterator**: detect
   `pagesTotal`, then process and *commit* each page independently. (`pdftotext`
   can still emit all text up front; completion must be committed per page. OCR
   fallback is already page-scoped.)
4. **(required)** Make `/v1/workflows` **enqueue and return immediately** with a
   status URL. The worker is a single in-process queue — no Redis.
5. **(required)** On boot, **scan non-terminal runs**, reset stale `running` pages to
   `pending`/`failed-retryable`, and resume from the ledger.
6. **(nice-to-have)** Atomic artifact writes (`*.tmp` → rename, optional `fsync`).
7. **(nice-to-have)** Per-page retry policy with bounded attempts → terminal
   `completed_with_errors`.

## How scaling stays separate

The contract never mentions Cloudflare, queues, Redis, or worker count. Scaling
plugs in **behind `claimPages()`**: the cloud shards by document DO and runs many
workflows (and can later put a queue in front of the same store); self-host keeps a
single in-process worker claiming one or a few pages at a time. Under this contract
the guarantee is the same on both backends because **completed page records and
artifacts are the source of truth, not the scheduler** — once both implement it
(cloud does today; self-host is at [Stage 0](#current-status-in-this-repo)).

## Current status in this repo

> ⚠️ **Beta.** This server ships **Stage 0** durability: a run either completes and
> persists its graph, or it is re-run from scratch — durable at the *run* boundary,
> not yet the *page* boundary. Steps 1–5 above (page-ledger parity with cloud) are
> the top beta roadmap item. Large multi-hundred-page parses are best run on the
> cloud until page-level checkpointing lands here. We will not claim page-level
> crash-resume on self-host until the ledger ships.
