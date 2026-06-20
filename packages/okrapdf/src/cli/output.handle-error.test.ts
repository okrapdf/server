import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError, resetOutputContext, setOutputContext } from './output';
import { OkraRuntimeError } from '../errors';

/**
 * handleError must emit a machine FAILURE envelope on STDOUT in JSON mode so
 * `okra ... --json | jq` parses errors too (agents read a uniform
 * { ok:false, command, error, message, next_actions } contract). Regression
 * guard for the resolve-error-to-stderr bug.
 */
describe('handleError JSON failure envelope', () => {
  afterEach(() => {
    resetOutputContext();
    vi.restoreAllMocks();
  });

  function capture(run: () => void): { stdout: string; stderr: string; exit: number | undefined } {
    let exit: number | undefined;
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exit = code;
      return undefined as never;
    }) as never);
    run();
    return {
      stdout: stdoutSpy.mock.calls.map(([c]) => String(c)).join(''),
      stderr: stderrSpy.mock.calls.map(([c]) => String(c)).join(''),
      exit,
    };
  }

  it('writes {ok:false,...} on stdout (not stderr) with the server error code + next_actions', () => {
    setOutputContext({ json: true, command: 'context resolve' });
    const err = new OkraRuntimeError('HTTP_ERROR', 'No owned document matches this source.', 404, {
      error: 'not_found',
      message: 'No owned document matches this source. Upload it first (okra upload).',
      next_actions: [{ cmd: 'okra upload <file>', why: 'Index the document first.' }],
    });

    const { stdout, stderr, exit } = capture(() => handleError(err, true));

    const env = JSON.parse(stdout);
    expect(env.ok).toBe(false);
    expect(env.command).toBe('context resolve');
    expect(env.error).toBe('not_found'); // stable server code, not the human string
    expect(env.message).toContain('No owned document matches');
    expect(env.code).toBe(404);
    expect(env.next_actions).toEqual([{ cmd: 'okra upload <file>', why: 'Index the document first.' }]);
    // Nothing on stderr in JSON mode; the envelope is the contract.
    expect(stderr).toBe('');
    expect(exit).toBe(1); // 404 < 500 → exit 1
  });

  it('surfaces the stable code from the context-live nested body shape ({error:{code},code,...})', () => {
    setOutputContext({ json: true, command: 'context resolve' });
    // context-live errorJson returns: { error: { code, message }, code, message, ...details }
    const err = new OkraRuntimeError('HTTP_ERROR', 'No owned document matches this source.', 404, {
      error: { code: 'not_found', message: 'No owned document matches this source.' },
      code: 'not_found',
      message: 'No owned document matches this source.',
    });
    const { stdout } = capture(() => handleError(err, true));
    const env = JSON.parse(stdout);
    expect(env.error).toBe('not_found'); // not the generic HTTP_ERROR fallback
    expect(env.message).toContain('No owned document matches');
  });

  it('surfaces the server body\'s extra structured fields (available_engines, engine) at the top level', () => {
    setOutputContext({ json: true, command: 'parse' });
    const err = new OkraRuntimeError('HTTP_ERROR', "engine 'bogus-engine' is not available", 400, {
      error: "engine 'bogus-engine' is not available",
      code: 'INVALID_REQUEST',
      engine: 'bogus-engine',
      available_engines: ['textlayer', 'llamaparse', 'mineru', 'google_document_ai'],
      message: "Engine 'bogus-engine' is not registered.",
      next_actions: [{ cmd: 'okra parse <documentId>', why: 'default routing' }],
    });
    const { stdout } = capture(() => handleError(err, true));
    const env = JSON.parse(stdout);
    // Recovery fields are top-level where the skill says to read them.
    expect(env.available_engines).toEqual(['textlayer', 'llamaparse', 'mineru', 'google_document_ai']);
    expect(env.engine).toBe('bogus-engine');
    // Canonical fields still win and aren't clobbered by the spread.
    expect(env.ok).toBe(false);
    expect(env.command).toBe('parse');
    expect(env.code).toBe(400); // numeric status, not the body's 'INVALID_REQUEST'
    expect(env.next_actions).toEqual([{ cmd: 'okra parse <documentId>', why: 'default routing' }]);
  });

  it('falls back to the exception message + code when there is no structured server body', () => {
    setOutputContext({ json: true, command: 'context get' });
    const { stdout } = capture(() => handleError(new Error('boom'), true));
    const env = JSON.parse(stdout);
    expect(env).toMatchObject({ ok: false, command: 'context get', error: 'error', message: 'boom', code: 1 });
    expect(env.next_actions).toEqual([]);
  });

  it('upgrades a generic HTTP_ERROR to a status-derived semantic code (extract 404 == context not_found)', () => {
    setOutputContext({ json: true, command: 'extract' });
    // The extract/generate client path throws a bare HTTP_ERROR with no
    // structured body — historically the envelope leaked error:"HTTP_ERROR".
    const err = new OkraRuntimeError('HTTP_ERROR', 'Document data not found', 404);
    const { stdout } = capture(() => handleError(err, true));
    const env = JSON.parse(stdout);
    expect(env.error).toBe('not_found'); // stable, matches context ask/get
    expect(env.code).toBe(404);
  });

  it('maps common statuses to stable codes (401→unauthorized, 400→invalid_request, 500→server_error)', () => {
    const cases: Array<[number, string]> = [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [400, 'invalid_request'],
      [429, 'rate_limited'],
      [503, 'server_error'],
    ];
    for (const [status, expected] of cases) {
      setOutputContext({ json: true, command: 'extract' });
      const { stdout } = capture(() => handleError(new OkraRuntimeError('HTTP_ERROR', 'x', status), true));
      expect(JSON.parse(stdout).error).toBe(expected);
      resetOutputContext();
    }
  });

  it('never overrides a meaningful (non-generic) error code with a status-derived one', () => {
    setOutputContext({ json: true, command: 'upload' });
    // TIMEOUT is a real semantic code — must stay TIMEOUT, not become 'timeout'.
    const err = new OkraRuntimeError('TIMEOUT', 'wait timed out', 408, { document_id: 'doc-x' });
    const { stdout } = capture(() => handleError(err, true));
    expect(JSON.parse(stdout).error).toBe('TIMEOUT');
  });

  it('uses a server-class exit code (2) for >=500 errors', () => {
    setOutputContext({ json: true, command: 'extract' });
    const err = new OkraRuntimeError('HTTP_ERROR', 'upstream exploded', 500);
    const { exit } = capture(() => handleError(err, true));
    expect(exit).toBe(2);
  });

  it('treats a freeform server `error` message as NOT a code → status-derived code, message preserved (#666)', () => {
    // `documents reparse <bogus>` / `documents delete <bogus>` server bodies put
    // a human message ("document not found" / "Document not found") in `error`.
    // That has spaces, so it is not a stable code: the envelope `error` must fall
    // back to the 404-derived `not_found`, while the message keeps the detail.
    for (const human of ['document not found', 'Document not found']) {
      setOutputContext({ json: true, command: 'documents reparse' });
      const err = new OkraRuntimeError('HTTP_ERROR', human, 404, { error: human });
      const env = JSON.parse(capture(() => handleError(err, true)).stdout);
      expect(env.error).toBe('not_found'); // stable, branchable — was the freeform string
      expect(env.message).toBe(human); // human detail still surfaced
      expect(env.code).toBe(404);
      resetOutputContext();
    }
  });

  it('a freeform 500 `error` blob becomes server_error unless the body has a code-shaped `code` (#666)', () => {
    // No code-shaped field anywhere → status-derived server_error.
    setOutputContext({ json: true, command: 'facet list' });
    const blob = 'D1_ERROR: no such column: kind at offset 22: SQLITE_ERROR';
    let env = JSON.parse(capture(() => handleError(new OkraRuntimeError('HTTP_ERROR', blob, 500, { error: blob }), true)).stdout);
    expect(env.error).toBe('server_error');
    expect(env.message).toBe(blob);
    resetOutputContext();

    // A code-shaped `code` alongside the freeform `error` wins (the server's real
    // stable code, previously shadowed by the message).
    setOutputContext({ json: true, command: 'facet list' });
    env = JSON.parse(capture(() => handleError(new OkraRuntimeError('HTTP_ERROR', blob, 500, { error: blob, code: 'user_facet_error' }), true)).stdout);
    expect(env.error).toBe('user_facet_error');
    expect(env.message).toBe(blob);
  });

  it('writes a human line to stderr (and nothing to stdout) in non-JSON mode', () => {
    setOutputContext({ json: false, command: 'context resolve' });
    const { stdout, stderr } = capture(() => handleError(new Error('nope'), false));
    expect(stdout).toBe('');
    expect(stderr).toBe('Error: nope\n');
  });
});
