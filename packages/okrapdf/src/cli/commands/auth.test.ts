import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  readGlobalConfig: vi.fn(() => null),
  writeGlobalConfig: vi.fn(),
  getApiKey: vi.fn(),
  getApiKeySource: vi.fn(() => 'environment variable (OKRA_API_KEY)'),
  getGlobalConfigPath: vi.fn(() => '/tmp/okra/config.json'),
  getBaseUrl: vi.fn(() => 'https://api.okrapdf.com'),
}));

import {
  getApiKey,
  getApiKeySource,
  readGlobalConfig,
  writeGlobalConfig,
} from '../config';
import { authSetKey, authStatus } from './auth';

const mockGetApiKey = vi.mocked(getApiKey);
const mockGetApiKeySource = vi.mocked(getApiKeySource);
const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockWriteGlobalConfig = vi.mocked(writeGlobalConfig);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('auth CLI commands', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadGlobalConfig.mockReturnValue(null);
    mockGetApiKey.mockReturnValue(undefined);
    mockGetApiKeySource.mockReturnValue('environment variable (OKRA_API_KEY)');
    vi.stubGlobal('fetch', vi.fn());
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('verifies a key before persisting it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {
      authenticated: true,
      user_id: 'user_123',
      key_id: 'key_123',
      key_name: 'CLI Key',
      key_type: 'secret',
      scope: '*',
      scoped_orgs: [],
      scoped_projects: [],
    }));

    await authSetKey(' okra_valid_key ');

    expect(fetch).toHaveBeenCalledWith('https://api.okrapdf.com/auth/verify', {
      method: 'GET',
      headers: { Authorization: 'Bearer okra_valid_key' },
    });
    expect(mockWriteGlobalConfig).toHaveBeenCalledWith({ apiKey: 'okra_valid_key' });

    const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(stdout).toContain('Verified API key for user_123 (CLI Key)');
    expect(stdout).toContain('Saved API key to /tmp/okra/config.json');
  });

  it('does not persist an invalid key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid API key' }));

    await expect(authSetKey('okra_bad_key')).rejects.toMatchObject({
      name: 'OkraRuntimeError',
      status: 401,
      message: 'Invalid API key',
    });

    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();
  });

  it('shows local auth details in auth status without validating', async () => {
    mockGetApiKey.mockReturnValue('okra_valid_key');
    mockGetApiKeySource.mockReturnValue('global config (/tmp/okra/config.json)');

    await authStatus();

    expect(fetch).not.toHaveBeenCalled();
    const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(stdout).toContain('API key: okra_valid..._key');
    expect(stdout).toContain('Source: global config (/tmp/okra/config.json)');
    expect(stdout).toContain('Base URL: https://api.okrapdf.com');
    expect(stdout).toContain('Validation: not run');
  });

  it('shows verified auth details in auth status --validate', async () => {
    mockGetApiKey.mockReturnValue('okra_valid_key');
    mockGetApiKeySource.mockReturnValue('global config (/tmp/okra/config.json)');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {
      authenticated: true,
      user_id: 'user_123',
      key_id: 'key_123',
      key_name: 'CLI Key',
      key_type: 'secret',
      scope: '*',
      scoped_orgs: [],
      scoped_projects: [],
    }));

    await authStatus({ validate: true });

    const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(stdout).toContain('API key: okra_valid..._key');
    expect(stdout).toContain('Source: global config (/tmp/okra/config.json)');
    expect(stdout).toContain('User: user_123');
    expect(stdout).toContain('Key: CLI Key (secret)');
    expect(stdout).toContain('Scope: *');
  });

  it('rejects invalid configured keys in auth status --validate', async () => {
    mockGetApiKey.mockReturnValue('okra_bad_key');
    mockGetApiKeySource.mockReturnValue('global config (/tmp/okra/config.json)');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid API key' }));

    const result = authStatus({ validate: true });

    await expect(result).rejects.toMatchObject({
      name: 'OkraRuntimeError',
      status: 401,
    });

    await expect(result).rejects.toThrow(
      'Configured API key is invalid (okra_bad_k..._key from global config (/tmp/okra/config.json)). Replace it with `okra auth login` or update OKRA_API_KEY.',
    );
  });

  it('writes structured JSON auth status when requested', async () => {
    mockGetApiKey.mockReturnValue('okra_valid_key');
    mockGetApiKeySource.mockReturnValue('environment variable (OKRA_API_KEY)');

    await authStatus({ json: true });

    const status = JSON.parse(stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('')) as Record<string, unknown>;
    expect(status).toMatchObject({
      object: 'auth_status',
      authenticated: true,
      validated: false,
      base_url: 'https://api.okrapdf.com',
      api_key: {
        configured: true,
        masked: 'okra_valid..._key',
        source: 'environment variable (OKRA_API_KEY)',
      },
    });
  });
});
