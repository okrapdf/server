# @okrapdf/schemas

Shared [Zod](https://zod.dev) schemas and TypeScript types for [okraPDF](https://okrapdf.com).

```
npm install @okrapdf/schemas
```

## Usage

```ts
import { DocumentStatusSchema, EntitySchema } from '@okrapdf/schemas';

// Validate API responses
const status = DocumentStatusSchema.parse(apiResponse);

// Import specific domain schemas
import { CollectionQueryEventSchema } from '@okrapdf/schemas/collection-query';
import { PageResourceSchema } from '@okrapdf/schemas/page-resource';
import { VendorPluginSpecSchema } from '@okrapdf/schemas/vendor-plugin';
import { CONTROL_PLANE_SERVER_EVENTS } from '@okrapdf/schemas/control-plane-protocol';
import {
  okraEngineManifestSchema,
  okraSelfHostRuntimeManifestSchema,
  okraWorkflowRecipeManifestSchema,
} from '@okrapdf/schemas/self-host';
```

## Transformation URLs

Use `Transformation.Builder` when building `res.okrapdf.com` image parameters.
Callers use friendly names; the package owns reserved URL tokens and ordering.

```ts
import { Transformation } from '@okrapdf/schemas';

const segment = Transformation.builder()
  .width(640)
  .height(840)
  .quality(82)
  .format('webp')
  .fit('scale-down')
  .segment();

// w_640,h_840,q_82,f_webp,c_scale-down
```

## Exports

| Path | Contents |
|------|----------|
| `@okrapdf/schemas` | All schemas re-exported |
| `@okrapdf/schemas/document` | Document metadata |
| `@okrapdf/schemas/entity` | Extracted entities/nodes |
| `@okrapdf/schemas/vendor` | Vendor pipeline types |
| `@okrapdf/schemas/vendor-plugin` | Plugin spec/config |
| `@okrapdf/schemas/collection` | Collection CRUD |
| `@okrapdf/schemas/collection-query` | Fan-out query events |
| `@okrapdf/schemas/page-resource` | Page image URLs |
| `@okrapdf/schemas/document-ref` | Document references |
| `@okrapdf/schemas/document-url` | URL builder schemas |
| `@okrapdf/schemas/export` | Export format types |
| `@okrapdf/schemas/lineage` | Cryptographic lineage |
| `@okrapdf/schemas/socket` | Wire-level session command and event payloads |
| `@okrapdf/schemas/control-plane-protocol` | Canonical control-plane requirements, event catalog, and stability metadata |
| `@okrapdf/schemas/self-host` | M-SH workflow recipes, runtime manifests, low-level capability manifests, and Okra document graph contracts |

## Self-Host Contracts

The M-SH contracts keep three layers separate:

- `okraSelfHostRuntimeManifestSchema` describes deploy targets, static UI/API
  runtime choices, services, Docker network boundaries, env, volumes,
  capability catalogs, and external recipe catalogs.
- `okraWorkflowRecipeManifestSchema` describes product-facing workflows over
  capability refs, so OCR, hybrid extraction, agents, audits, redaction, and
  review gates stay swappable.
- `okraEngineManifestSchema` describes the current low-level runnable
  capability record. Capabilities carry explicit workload isolation metadata:
  namespace, runtime boundary, network namespace, writable paths, volume mounts,
  and secret scope. The name is intentionally below the product surface and can
  be revisited later.

Self-host UI runtimes are constrained to static or Cloudflare-compatible
surfaces such as Vite/static assets, Cloudflare Pages, or Cloudflare Worker
static assets. A Next.js server is not a self-host runtime target. Self-host
capabilities should not rely on shared host networking; use declared bridges and
allowlisted egress for external services. Docker deployments should separate
public ingress, private runtime state, capability services, and external
integrations into named networks rather than attaching services to host
networking.

## Control Plane Protocol

The canonical event-driven client contract now lives in two places:

- `@okrapdf/schemas/socket` for wire-level payload shapes
- `@okrapdf/schemas/control-plane-protocol` for protocol requirements, command/event catalog, persistence rules, and stability metadata

It also carries the runtime scoping and TODO inventory:

- `CONTROL_PLANE_RUNTIME_SCOPES`
- `CONTROL_PLANE_TODOS`

If a client, endpoint, or event name is not described there, it should not be treated as a stable control-plane contract.

## License

MIT
