import { describe, expect, it } from 'vitest';
import { parsePolicyJson } from './workflow-verbs';
import { OkraRuntimeError } from '../../errors';

describe('parsePolicyJson (okra redact --policy)', () => {
  it('returns the parsed object for valid JSON', () => {
    expect(parsePolicyJson('{"rules":[{"type":"regex","pattern":"\\\\d+"}]}')).toEqual({
      rules: [{ type: 'regex', pattern: '\\d+' }],
    });
  });

  it('returns undefined when no policy is provided', () => {
    expect(parsePolicyJson(undefined)).toBeUndefined();
  });

  // Both failure modes previously threw a bare SyntaxError/Error → handleError
  // surfaced error:"error", code:1. They must now be a structured envelope.
  it('throws a structured invalid_policy_json (400) for malformed JSON (was error:"error"/code:1)', () => {
    const err = (() => { try { parsePolicyJson('{not valid json'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect((err as OkraRuntimeError).status).toBe(400);
    const details = (err as OkraRuntimeError).details as { error: string; next_actions: Array<{ cmd: string }> };
    expect(details.error).toBe('invalid_policy_json');
    expect(String((err as OkraRuntimeError).message)).toContain('valid JSON');
    expect(details.next_actions[0].cmd).toBe('okra redact --help');
  });

  it('throws structured invalid_policy_json for valid JSON that is not an object (array/scalar)', () => {
    for (const notObject of ['[1,2,3]', '"a string"', '42', 'null']) {
      const err = (() => { try { parsePolicyJson(notObject); } catch (e) { return e; } })();
      expect(err, `expected throw for ${notObject}`).toBeInstanceOf(OkraRuntimeError);
      expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_policy_json');
    }
  });
});
