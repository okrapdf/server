import { createHash } from 'crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { localAudit, localParse, localRedact } from './local-capabilities.js';

export interface CapabilityServiceRequestOptions {
  capabilityId: string;
}

export interface CapabilityServiceServerOptions extends CapabilityServiceRequestOptions {
  host?: string;
  port?: number;
}

export interface StartedCapabilityServiceServer {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${sha256Hex(JSON.stringify(value)).slice(0, 16)}`;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readRequestJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function firstPageNumber(graph: Record<string, unknown>): number {
  const page = recordArray(graph.pages)[0];
  const pageNumber = page && typeof page.page_number === 'number' ? page.page_number : 1;
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
}

function capabilityServicePatch(
  capabilityId: string,
  body: Record<string, unknown>,
): { output: Record<string, unknown>; graphPatch: Record<string, unknown> } {
  const graph = isRecord(body.graph) ? body.graph : {};
  const runId = typeof body.run_id === 'string'
    ? body.run_id
    : stableId('caprun', {
        capabilityId,
        workflowRunId: body.workflow_run_id,
        recipeId: body.recipe_id,
      });
  const step = isRecord(body.step) ? body.step : {};
  const writes = stringArray(step.writes);
  const pageNumber = firstPageNumber(graph);
  const documentId = typeof body.document_id === 'string' ? body.document_id : undefined;
  const dataDir = process.env.OKRA_DATA_DIR;

  if (capabilityId.startsWith('parser.')) {
    const parsed = localParse(dataDir, documentId, runId, `blk_${String(step.id ?? 'parse')}_local`);
    if (parsed.ok && parsed.blocks.length) {
      const textPages = new Set(parsed.blocks.map((block) => block.page_number as number));
      const pages = recordArray(graph.pages).length
        ? recordArray(graph.pages).map((page) =>
            textPages.has(page.page_number as number)
              ? { page_number: page.page_number, text_state: parsed.ocrUsed ? 'ocr' : 'text' }
              : { page_number: page.page_number },
          )
        : parsed.blocks.map((block) => ({
            page_number: block.page_number,
            text_state: parsed.ocrUsed ? 'ocr' : 'text',
          }));
      return {
        output: {
          capability_id: capabilityId,
          mode: parsed.ocrUsed ? 'local_ocr' : 'local_text',
          blocks_written: parsed.blocks.length,
        },
        graphPatch: { pages, blocks: parsed.blocks },
      };
    }
    return {
      output: {
        capability_id: capabilityId,
        mode: 'starter_capability_service',
        blocks_written: 1,
        reason: parsed.reason,
      },
      graphPatch: {
        blocks: [{
          id: `blk_${String(step.id ?? 'parse')}_service`,
          kind: 'paragraph',
          page_number: pageNumber,
          text: `Local PDF extraction unavailable in this capability service (${parsed.reason ?? 'unknown'}). Mount the shared okra-data volume and install poppler-utils + tesseract-ocr in this image.`,
          bbox: { x: 0.1, y: 0.22, w: 0.8, h: 0.08 },
          confidence: 0.2,
          created_by_run_id: runId,
        }],
      },
    };
  }

  if (capabilityId === 'auditor.wcag.basic') {
    const findings = localAudit(graph, runId, `finding_${String(step.id ?? 'audit')}_service`);
    return {
      output: {
        capability_id: capabilityId,
        mode: 'local_basic_audit',
        findings_written: findings.length,
      },
      graphPatch: { findings },
    };
  }

  if (capabilityId === 'redactor.policy.basic') {
    const redactions = localRedact(graph, runId, `redaction_${String(step.id ?? 'redact')}_service`);
    return {
      output: {
        capability_id: capabilityId,
        mode: 'local_basic_redact',
        redactions_written: redactions.length,
      },
      graphPatch: { redactions },
    };
  }

  if (capabilityId === 'review.a11y.findings' || capabilityId === 'review.redactions') {
    const subjectType = capabilityId === 'review.redactions' ? 'redaction' : 'finding';
    const subjects = recordArray(subjectType === 'redaction' ? graph.redactions : graph.findings);
    return {
      output: {
        capability_id: capabilityId,
        mode: 'starter_capability_service',
        reviews_written: 1,
      },
      graphPatch: {
        reviews: [{
          id: `review_${String(step.id ?? 'review')}_service`,
          kind: subjectType === 'redaction' ? 'redaction' : 'audit',
          status: 'pending',
          subject_type: subjectType,
          subject_id: typeof subjects[0]?.id === 'string' ? subjects[0].id : 'document',
          reviewer_notes: `Starter external review gate opened by ${capabilityId}.`,
          final_claim_level: 'machine_only',
          created_by_run_id: runId,
        }],
      },
    };
  }

  if (capabilityId === 'viewer.document-graph') {
    const documentId = typeof body.document_id === 'string' ? body.document_id : '';
    return {
      output: {
        capability_id: capabilityId,
        viewer_url: `/?doc=${encodeURIComponent(documentId)}&view=review`,
      },
      graphPatch: {},
    };
  }

  return {
    output: {
      capability_id: capabilityId,
      mode: 'starter_capability_service',
      writes,
    },
    graphPatch: {},
  };
}

export async function handleCapabilityServiceRequest(
  request: Request,
  options: CapabilityServiceRequestOptions,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const capabilityId = options.capabilityId.trim();

  if (!capabilityId) {
    return jsonResponse({ object: 'error', error: 'capabilityId is required' }, 500);
  }

  if (method === 'GET' || method === 'HEAD') {
    if (url.pathname === '/health' || url.pathname === '/ready') {
      return jsonResponse({
        object: 'capability_service_health',
        ok: true,
        protocol: 'okra-capability-http/v1',
        capability_id: capabilityId,
      });
    }

    if (url.pathname === '/v1/capability') {
      return jsonResponse({
        object: 'capability_service',
        protocol: 'okra-capability-http/v1',
        capability_id: capabilityId,
        endpoint: '/v1/capability-runs',
      });
    }

    return jsonResponse({ object: 'error', error: 'not found' }, 404);
  }

  if (method === 'POST' && url.pathname === '/v1/capability-runs') {
    const body = await readRequestJson(request);
    if (body.protocol !== 'okra-capability-http/v1') {
      return jsonResponse({
        object: 'error',
        error: 'protocol must be okra-capability-http/v1',
      }, 400);
    }
    if (body.capability_id !== capabilityId) {
      return jsonResponse({
        object: 'error',
        error: `capability service is bound to "${capabilityId}"`,
      }, 409);
    }

    const result = capabilityServicePatch(capabilityId, body);
    return jsonResponse({
      object: 'capability_run_result',
      protocol: 'okra-capability-http/v1',
      status: 'succeeded',
      run_id: typeof body.run_id === 'string' ? body.run_id : undefined,
      capability_id: capabilityId,
      output: result.output,
      graph_patch: result.graphPatch,
    }, 200);
  }

  return jsonResponse({ object: 'error', error: 'method not allowed' }, 405);
}

function headersFromIncoming(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (typeof value === 'string') {
      headers.set(name, value);
    }
  }
  return headers;
}

async function writeFetchResponse(response: Response, target: ServerResponse, method: string): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, key) => target.setHeader(key, value));
  if (method === 'HEAD') {
    target.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  target.setHeader('content-length', String(body.byteLength));
  target.end(body);
}

function readIncomingBody(request: IncomingMessage): Promise<string | undefined> {
  const method = (request.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return Promise.resolve(undefined);

  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.once('error', reject);
    request.once('end', () => {
      resolveBody(chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined);
    });
  });
}

export function startCapabilityServiceServer(
  options: CapabilityServiceServerOptions,
): Promise<StartedCapabilityServiceServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8080;
  const server = createServer((incoming, outgoing) => {
    readIncomingBody(incoming)
      .then((body) => {
        const requestUrl = `http://${incoming.headers.host ?? `${host}:${port}`}${incoming.url ?? '/'}`;
        const request = new Request(requestUrl, {
          method: incoming.method ?? 'GET',
          headers: headersFromIncoming(incoming),
          ...(body ? { body } : {}),
        });
        return handleCapabilityServiceRequest(request, options);
      })
      .then((response) => writeFetchResponse(response, outgoing, incoming.method ?? 'GET'))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        void writeFetchResponse(
          jsonResponse({ object: 'error', error: message }, 500),
          outgoing,
          incoming.method ?? 'GET',
        );
      });
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolveServer({
        server,
        url: `http://${host}:${actualPort}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          }),
      });
    });
  });
}
