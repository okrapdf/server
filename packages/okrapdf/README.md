# @okrapdf/sdk

Upload a PDF, get an OpenAI-compatible endpoint.

```
npm install @okrapdf/sdk
```

Just want the `okra` command? `npm install -g @okrapdf/cli` (this package is the library it wraps; the legacy unscoped `okrapdf` package is deprecated).

Get your API key at [app.okrapdf.com/settings](https://app.okrapdf.com/settings).

## Quick Start

```ts
import { OkraClient } from '@okrapdf/sdk';

const okra = new OkraClient({ apiKey: process.env.OKRA_API_KEY });
const session = await okra.sessions.create('./invoice.pdf');

// Every document gets its own chat/completions URL
console.log(session.modelEndpoint);
```

That prints a URL like:

```
https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982
```

This is a full OpenAI-compatible base URL. Plug it into any client.

## Choose Your Entry Point

| I want to... | Start here |
|---|---|
| **Use TypeScript/JS** | `okra.sessions.create()` + `session.prompt()` — [SDK Methods](#sdk-methods) |
| **Use the CLI** | `okra auth login` + `okra upload` — [CLI](#cli) |
| **Use Claude Code or AI agents** | MCP server — [Setup guide](https://okrapdf.com/add-to-claude) |
| **Use any LLM client** | OpenAI-compatible endpoint — [OpenAI SDK](#use-with-openai-sdk) |
| **Build a React app** | `@okrapdf/sdk/react` hooks — [Sub-path exports](#sub-path-exports) |
| **Query across documents** | Collections fan-out — [Collections](#collections--fan-out-query-to-csv) |

## What You Get

Upload a PDF and okraPDF gives you predictable URLs for everything:

```
Document:   doc-441a8a0be0e94914b982

Completion: https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/chat/completions
Status:     https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/status
Pages:      https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/pages
Entities:   https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/nodes
Download:   https://api.okrapdf.com/document/doc-441a8a0be0e94914b982/download

Page images:
  pg 1:     https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982/pg_1.png
  resized:  https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982/w_200,h_300/pg_1.png
  shimmer:  https://api.okrapdf.com/v1/documents/doc-441a8a0be0e94914b982/d_shimmer/pg_1.png
```

All URLs are deterministic. Build them from the document ID without calling the API first.

## Use with OpenAI SDK

```ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OKRA_API_KEY,
  baseURL: session.modelEndpoint,  // https://api.okrapdf.com/v1/documents/doc-...
});

const res = await openai.chat.completions.create({
  model: 'okra',
  messages: [{ role: 'user', content: 'What form is this?' }],
});

console.log(res.choices[0].message.content);
// → "This is Form W-9 (Request for Taxpayer Identification Number and
//    Certification), used by entities to collect a taxpayer's TIN..."
```

## Use with AI SDK

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const provider = createOpenAICompatible({
  name: 'okra',
  apiKey: process.env.OKRA_API_KEY,
  baseURL: session.modelEndpoint,
});

const { text } = await generateText({
  model: provider('okra'),
  prompt: 'Summarize this document in 3 bullet points',
});
```

## Use with curl

```bash
# Upload
curl -X POST https://api.okrapdf.com/document/doc-my-w9/upload-url \
  -H "Authorization: Bearer $OKRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.irs.gov/pub/irs-pdf/fw9.pdf"}'

# Ask a question
curl https://api.okrapdf.com/document/doc-my-w9/chat/completions \
  -H "Authorization: Bearer $OKRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "List all parts of this form."}]}'
```

Response:

```json
{
  "id": "chatcmpl-18g5qhmmrm",
  "object": "chat.completion",
  "model": "accounts/fireworks/models/kimi-k2p5",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Based on the Form W-9 document, there are two numbered parts:\n\n| Part | Title |\n|------|-------|\n| Part I | Taxpayer Identification Number (TIN) |\n| Part II | Certification |"
    },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 227, "completion_tokens": 404, "total_tokens": 631 }
}
```

## SDK Methods

The SDK wraps all of this so you don't need a separate client:

```ts
// Ask a question (non-streaming)
const { answer } = await session.prompt('What is the total amount due?');

// Stream
for await (const event of session.stream('Summarize this document')) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}

// Structured output with Zod
import { z } from 'zod';

const Invoice = z.object({
  vendor: z.string(),
  total: z.number(),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.number(),
  })),
});

const { data } = await session.prompt('Extract the invoice', { schema: Invoice });
// data: { vendor: "Acme Corp", total: 1250.00, lineItems: [...] }
```

## Pages & Entities

```ts
const pages = await session.pages();           // { pageCount: 6, pages: [...] }
const { nodes } = await session.entities();    // extracted text, tables, etc.
const { nodes } = await session.entities({ type: 'table' });
```

## Upload

Accepts file paths, URLs, `Blob`, `ArrayBuffer`, or `Uint8Array`:

```ts
// URL
const session = await okra.sessions.create('https://example.com/report.pdf');

// Bytes
const session = await okra.sessions.create(pdfBytes, {
  upload: { fileName: 'report.pdf' },
});

// Attach to existing document (no upload, no wait)
const session = okra.sessions.from('doc-441a8a0be0e94914b982');
```

If you want a passive PDF asset upload instead of an immediate document workflow, use `files.upload()`:

```ts
const file = await okra.files.upload('./report.pdf');

console.log(file.id);              // doc-...
console.log(file.urls.bytes);      // direct PDF bytes URL
console.log(file.workflow_bound);  // false
```

`okra.sessions.create()` / `okra.upload()` still mean "upload and start document processing."
`okra.files.upload()` means "store this PDF as a first-class file asset and let me decide later what workflow to run."

## Parse Jobs & Polling

Use `okra.parse()` for a passive-file parse job, or create a document reparse job
with `okra.createJob({ type: 'document.parse', document_id: 'doc-...' })`.
The same job envelope is returned from `POST /v1/parse`, `POST /v1/jobs`,
`GET /v1/jobs/{id}`, and `okra jobs wait`:

```ts
const job = await okra.parse({ fileId: file.id, parser: 'textlayer' });

console.log(job.terminal);                 // false until completed/failed/cancelled
console.log(job.progress?.percent);        // best-known 0-100 progress
console.log(job.next_poll_after_ms);       // n8n-friendly poll delay
console.log(job.retryable, job.error_code, job.user_message);
console.log(job.cost_usd);                 // real vendor usage at completion when available
```

Parse jobs expose live page/chunk counters while work is running:
`pages_completed`, `pages_failed`, `pages_running`, `pages_pending`,
`pages_total`, `chunks_completed`, and `chunks_total`. Empty parser output now
fails with `error_code: "empty_result"` instead of reporting a completed job
with no page coverage.

## Document Wait-For Subscriptions

`okra documents wait-for <docId> --match "<term>"` creates a document
subscription, then long-polls until matching nodes are ingested:

```bash
okra documents wait-for doc-abc123 --match "table of contents" --timeout 120
okra documents wait-for doc-abc123 --match "Revenue" --literal
```

The CLI prints a structured envelope with `result.matched_nodes[]` entries:
`node_id`, `page`, `value_excerpt`, optional `bbox`, and optional `bbox_source`.
It also includes `next_actions` such as reading the matched page. The underlying
API is `POST /v1/documents/{id}/subscriptions` followed by
`GET /v1/documents/{id}/subscriptions/{subscription_id}/wait?timeout=...`;
wait responses return `status: "active" | "matched" | "timeout"`, `matched`,
and `matches[]`.

## Deterministic URLs

Build page image and export URLs from a document ID — no API call needed:

```ts
import { doc } from 'okrapdf/doc';

const d = doc('doc-441a8a0be0e94914b982');

d.pages(1).image();                    // .../pg_1.png
d.pages(1).image({ w: 200, h: 300 }); // .../w_200,h_300/pg_1.png
d.export('markdown');                  // .../export.md
```

## Collections — Fan-Out Query to CSV

Ask the same question across every document in a collection. Each doc answers independently in parallel, results stream back as NDJSON.

```ts
import { OkraClient } from '@okrapdf/sdk';
import { z } from 'zod';
import { writeFileSync } from 'fs';

const okra = new OkraClient({ apiKey: process.env.OKRA_API_KEY });

// Fan-out: ask every doc in the collection the same question
const stream = okra.collections.query(
  'col-40da068481cf4f248853507cba6be611',
  'Who are the top 3 people mentioned in this document?',
);

// Gather all results
const result = await stream.gather();

// Write CSV
const header = 'doc_id,doc_name,answer,cost_usd';
const rows = [...result.answers.values()].map(a =>
  `"${a.docId}","${a.answer.slice(0, 200)}",${a.costUsd}`
);
writeFileSync('results.csv', [header, ...rows].join('\n'));

console.log(`${result.completed} docs, $${result.totalCostUsd.toFixed(4)} total`);
```

Real output from a 10-K earnings collection:

```csv
doc_id,file_name,answer,cost_usd
"doc-9a3f21...","NVDA-10K-2025.pdf","Revenue: $130.5B, Net Income: $72.9B, YoY Growth: 114%",0.0048
"doc-b7e810...","AAPL-10K-2025.pdf","Revenue: $391.0B, Net Income: $101.2B, YoY Growth: 5%",0.0039
"doc-c4d562...","MSFT-10K-2025.pdf","Revenue: $254.2B, Net Income: $97.1B, YoY Growth: 16%",0.0051
```

Experimental: structured collection fan-out is still available via a schema, but it is not part of the stable v0.14 surface:

```ts
const FinancialReport = z.object({
  company: z.string(),
  revenue: z.number(),
  netIncome: z.number(),
  quarter: z.string(),
});

const stream = okra.collections.query(
  'col-financials',
  'Extract the financial summary',
  { schema: FinancialReport },
);

const result = await stream.gather();
for (const [docId, answer] of result.answers) {
  console.log(answer.data); // { company: "NVIDIA", revenue: 35082, ... }
}
```

Or stream per-doc events in real time:

```ts
for await (const event of stream) {
  if (event.type === 'result') {
    console.log(`${event.doc_id}: ${event.answer.slice(0, 80)}...`);
  }
}
```

## Sub-path Exports

| Import | Use |
|--------|-----|
| `@okrapdf/sdk` | `OkraClient`, types, errors |
| `@okrapdf/sdk/doc` | `doc()` URL builder |
| `@okrapdf/sdk/browser` | Browser-safe client (no Node.js deps) |
| `@okrapdf/sdk/worker` | Cloudflare Worker adapter |
| `@okrapdf/sdk/react` | React hooks (`useSession`, `usePages`) |
| `@okrapdf/sdk/content-types` | Typed extraction contracts — `getContentType`, `listContentTypes`, manifests (dependency-light: no client/CLI bundle) |

## CLI

```bash
npm install -g @okrapdf/cli   # the `okra` binary lives in @okrapdf/cli, a thin wrapper over this SDK
okra auth login

okra upload ./invoice.pdf
okra context ask "What is the total?" --source-id doc-abc123   # cited answer
okra extract ./invoice.pdf --content-type invoice              # typed + grounded; or --schema ./schema.json --cite
okra invoice extract ./invoice.pdf                             # the same, as a first-class noun
okra collections query earnings "What changed quarter over quarter?" -o earnings.csv
```

Use `npx @okrapdf/sdk ...` for one-off runs if you do not want a global install.

### Agent Skill Install

For skill-aware coding agents, the intended distribution form is:

```bash
npx skills add okrapdf/okra-agent
```

Publishing the public `okrapdf/okra-agent` skill repo is a follow-up release step. The form that works today from an installed CLI package is:

```bash
npm install @okrapdf/sdk
npx skills add ./node_modules/@okrapdf/sdk/skills/okra-agent
```

If your install path differs, use `./node_modules/<pkg>/skills/okra-agent`, where `<pkg>` is the installed okra package directory.

To point the same CLI commands at a self-hosted or Railway instance, create and
activate a profile:

```bash
okra profile add local --base-url https://my-okra.up.railway.app
okra profile use local
okra upload ./invoice.pdf
okra parse doc-abc123 --engine mineru
okra audit doc-abc123 --standard wcag
okra redact doc-abc123 --model local
okra open doc-abc123 --view review
```

Self-host runtime bundles can be checked locally without starting a server:

```bash
okra self-host validate ./runtime
okra self-host plan ./runtime --target railway
okra self-host railway ./runtime > railway.json
okra self-host env ./runtime
okra self-host compose ./runtime --mode stack > docker-compose.yml
okra self-host compose ./runtime --mode networks > docker-compose.networks.yml
okra self-host smoke https://my-okra.up.railway.app --workflow both
```

The same bundle can be launched with the lightweight self-host runtime when you
actually want to bind a port:

```bash
okra serve ./runtime --port 8787
npx @okrapdf/sdk serve ./runtime --port 8787
```

For Docker/Railway, the example image runs the same command against
`/app/runtime` and exposes `/health`, `/v1/self-host/status`,
`/v1/workflows/catalog`, `/v1/capabilities`, SDK-compatible document routes
under `/document/:id/*`, shared graph routes under `/v1/documents/:id/*`,
`/v1/sources/n8n`, and `/v1/workflows`. Starter uploads and workflow runs write
`OkraDocumentGraph` artifacts under `OKRA_DATA_DIR`; workflow runs also persist
one inspectable `capability_run` per declared recipe step.
Set `OKRA_API_KEY` on public self-host deployments to require bearer auth on
uploads, URL ingestion, n8n source intake, and workflow execution.

The CLI focuses on the core workflows: auth, upload, extract, chat/ask,
list/delete, render, collection query, endpoint profiles, and self-host bundle
validation/planning/runtime launch. Advanced
inspection commands (`find`, `search`, `status`) and the `facet`/`lens`
deployment commands remain available but are hidden from default help.
Experimental structured collection extraction is available via
`okra collection extract ...` and `okra collection query ... --schema ...`.

## License

MIT
