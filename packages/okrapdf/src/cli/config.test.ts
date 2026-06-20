import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getApiKey,
  getApiKeySource,
  getBaseUrl,
  normalizeBaseUrl,
  readGlobalConfig,
  removeGlobalProfile,
  upsertGlobalProfile,
  useGlobalProfile,
  validateProfileName,
} from './config';
import { OkraRuntimeError } from '../errors';

describe('CLI profiles', () => {
  const originalCwd = process.cwd();
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalApiKey = process.env.OKRA_API_KEY;
  const originalBaseUrl = process.env.OKRA_BASE_URL;
  let tmpRoot: string;
  let projectDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'okra-cli-profile-'));
    projectDir = join(tmpRoot, 'project');
    mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);
    process.env.XDG_CONFIG_HOME = join(tmpRoot, 'xdg');
    delete process.env.OKRA_API_KEY;
    delete process.env.OKRA_BASE_URL;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    restoreEnv('XDG_CONFIG_HOME', originalXdgConfigHome);
    restoreEnv('OKRA_API_KEY', originalApiKey);
    restoreEnv('OKRA_BASE_URL', originalBaseUrl);
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('uses the active global profile for base URL and optional API key', () => {
    upsertGlobalProfile(
      'local',
      {
        baseUrl: 'https://my-okra.up.railway.app/',
        apiKey: 'okra_local_key',
      },
      { use: true },
    );

    expect(getBaseUrl()).toBe('https://my-okra.up.railway.app');
    expect(getApiKey()).toBe('okra_local_key');
    expect(getApiKeySource()).toContain('profile local');
    expect(readGlobalConfig()).toMatchObject({
      activeProfile: 'local',
      profiles: {
        local: {
          baseUrl: 'https://my-okra.up.railway.app',
          apiKey: 'okra_local_key',
        },
      },
    });
  });

  it('keeps environment and project config above the active profile', () => {
    upsertGlobalProfile(
      'local',
      {
        baseUrl: 'https://profile.example.test',
        apiKey: 'okra_profile_key',
      },
      { use: true },
    );

    process.env.OKRA_BASE_URL = 'https://env.example.test';
    process.env.OKRA_API_KEY = 'okra_env_key';
    expect(getBaseUrl()).toBe('https://env.example.test');
    expect(getApiKey()).toBe('okra_env_key');

    delete process.env.OKRA_BASE_URL;
    delete process.env.OKRA_API_KEY;
    writeFileSync(
      join(projectDir, '.okra.json'),
      JSON.stringify({
        baseUrl: 'https://project.example.test',
        apiKey: 'okra_project_key',
      }),
    );

    expect(getBaseUrl()).toBe('https://project.example.test');
    expect(getApiKey()).toBe('okra_project_key');
  });

  it('removes the active profile without deleting root global config', () => {
    upsertGlobalProfile(
      'local',
      {
        baseUrl: 'https://profile.example.test',
      },
      { use: true },
    );

    removeGlobalProfile('local');

    expect(readGlobalConfig()).toMatchObject({ profiles: {} });
    expect(getBaseUrl()).toBe('https://api.okrapdf.com');
  });

  it('rejects missing profiles when switching', () => {
    expect(() => useGlobalProfile('missing')).toThrow('Profile "missing" does not exist');
  });

  // The profile commands route every throw through handleError; a bare Error
  // surfaced the generic error:"error"/code:1 dead-end. These now carry a stable
  // code + HTTP status + next_actions like the rest of the CLI.
  it('throws a structured profile_not_found (404) envelope when switching to a missing profile', () => {
    const err = (() => { try { useGlobalProfile('missing'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect((err as OkraRuntimeError).status).toBe(404);
    const details = (err as OkraRuntimeError).details as { error: string; next_actions: Array<{ cmd: string }> };
    expect(details.error).toBe('profile_not_found');
    expect(details.next_actions[0].cmd).toBe('okra profile list');
  });

  it('throws structured profile_not_found when removing a missing profile', () => {
    const err = (() => { try { removeGlobalProfile('nope'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect((err as OkraRuntimeError).status).toBe(404);
    expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('profile_not_found');
  });

  it('throws structured invalid_profile_name (400) for a bad profile name', () => {
    const err = (() => { try { validateProfileName('bad name with spaces'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect((err as OkraRuntimeError).status).toBe(400);
    expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_profile_name');
  });

  it('throws structured invalid_base_url (400) for empty / non-http URLs', () => {
    for (const bad of ['', 'not-a-url', 'ftp://x.test']) {
      const err = (() => { try { normalizeBaseUrl(bad); } catch (e) { return e; } })();
      expect(err, `expected throw for "${bad}"`).toBeInstanceOf(OkraRuntimeError);
      expect((err as OkraRuntimeError).status).toBe(400);
      expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_base_url');
    }
    // a valid https URL still normalizes (trailing slash stripped).
    expect(normalizeBaseUrl('https://api.okrapdf.com/')).toBe('https://api.okrapdf.com');
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
