import { describe, expect, it } from 'vitest';
import { handleCapabilityServiceRequest } from './capability-service.js';

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('self-host capability service adapter', () => {
  it('serves health and capability metadata without opening a port', async () => {
    const healthResponse = await handleCapabilityServiceRequest(
      new Request('http://localhost/health'),
      { capabilityId: 'parser.mineru' },
    );
    const capabilityResponse = await handleCapabilityServiceRequest(
      new Request('http://localhost/v1/capability'),
      { capabilityId: 'parser.mineru' },
    );

    expect(healthResponse.status).toBe(200);
    expect(await json(healthResponse)).toMatchObject({
      object: 'capability_service_health',
      ok: true,
      protocol: 'okra-capability-http/v1',
      capability_id: 'parser.mineru',
    });
    expect(capabilityResponse.status).toBe(200);
    expect(await json(capabilityResponse)).toMatchObject({
      object: 'capability_service',
      endpoint: '/v1/capability-runs',
    });
  });

  it('returns a parser graph patch through the capability protocol', async () => {
    const response = await handleCapabilityServiceRequest(
      new Request('http://localhost/v1/capability-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          object: 'capability_run_request',
          protocol: 'okra-capability-http/v1',
          run_id: 'caprun_test',
          workflow_run_id: 'run_test',
          recipe_id: 'recipe.parse-document',
          document_id: 'doc-capability-service',
          capability_id: 'parser.mineru',
          step: {
            id: 'parse',
            reads: ['source', 'document'],
            writes: ['pages', 'blocks', 'lineage'],
          },
          parameters: { engine: 'mineru' },
          graph: {
            schema_version: 'okra-document-graph/v1',
            pages: [{ page_number: 1, text_state: 'uploaded' }],
            blocks: [],
          },
        }),
      }),
      { capabilityId: 'parser.mineru' },
    );
    const body = await json(response);
    const graphPatch = body.graph_patch as Record<string, unknown>;
    const blocks = graphPatch.blocks as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      object: 'capability_run_result',
      protocol: 'okra-capability-http/v1',
      status: 'succeeded',
      capability_id: 'parser.mineru',
    });
    expect((body.output as Record<string, unknown>).mode).toBe('starter_capability_service');
    expect(blocks[0]).toMatchObject({
      id: 'blk_parse_service',
      created_by_run_id: 'caprun_test',
    });
  });

  it('rejects mismatched capability ids and invalid protocols', async () => {
    const mismatch = await handleCapabilityServiceRequest(
      new Request('http://localhost/v1/capability-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocol: 'okra-capability-http/v1',
          capability_id: 'auditor.wcag.basic',
        }),
      }),
      { capabilityId: 'parser.mineru' },
    );
    const invalidProtocol = await handleCapabilityServiceRequest(
      new Request('http://localhost/v1/capability-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocol: 'other',
          capability_id: 'parser.mineru',
        }),
      }),
      { capabilityId: 'parser.mineru' },
    );

    expect(mismatch.status).toBe(409);
    expect(await json(mismatch)).toMatchObject({
      object: 'error',
      error: 'capability service is bound to "parser.mineru"',
    });
    expect(invalidProtocol.status).toBe(400);
  });
});
