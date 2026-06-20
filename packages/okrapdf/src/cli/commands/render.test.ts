import { describe, expect, it } from 'vitest';
import { parseRenderJson } from './render';
import { OkraRuntimeError } from '../../errors';

describe('parseRenderJson (okra render spec/input JSON files)', () => {
  it('returns the parsed value for valid JSON', () => {
    expect(parseRenderJson('{"pages":[]}', './spec.json', 'spec')).toEqual({ pages: [] });
    expect(parseRenderJson('[1,2,3]', './data.json', 'input')).toEqual([1, 2, 3]);
  });

  // A malformed file previously threw a bare SyntaxError → handleError surfaced
  // error:"error", code:1. Must now be a structured envelope.
  it('throws invalid_spec_json (400) for a malformed designed spec', () => {
    const err = (() => { try { parseRenderJson('{bad json', './spec.json', 'spec'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect((err as OkraRuntimeError).status).toBe(400);
    const details = (err as OkraRuntimeError).details as { error: string };
    expect(details.error).toBe('invalid_spec_json');
    expect(String((err as OkraRuntimeError).message)).toContain('./spec.json is not valid JSON');
  });

  it('throws invalid_input_json (400) for a malformed exec --input file', () => {
    const err = (() => { try { parseRenderJson('{bad', './data.json', 'input'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_input_json');
  });
});
