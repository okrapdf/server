import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { normalizeOkraRpcArgs } from './rpc-schema';

describe('normalizeOkraRpcArgs', () => {
  it('converts Zod schema fields to JSON Schema before RPC transport', () => {
    const args = normalizeOkraRpcArgs([
      {
        schema: z.object({
          items: z.array(
            z.object({
              heading: z.string(),
              page: z.number().int(),
            }),
          ),
        }),
        prompt: 'Extract a table of contents.',
      },
    ]);

    expect(args).toHaveLength(1);
    const first = args[0] as { schema: Record<string, any>; prompt: string };
    expect(first.prompt).toBe('Extract a table of contents.');
    expect(first.schema.type).toBe('object');
    expect(first.schema.properties.items.type).toBe('array');
    expect(first.schema.properties.items.items.properties.heading.type).toBe('string');
    expect(first.schema.properties.items.items.properties.page.type).toBe('integer');
    expect(first.schema.safeParse).toBeUndefined();
  });

  it('leaves plain JSON Schema args intact', () => {
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title'],
    };

    expect(normalizeOkraRpcArgs([{ schema }])).toEqual([{ schema }]);
  });
});
