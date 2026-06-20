/**
 * okra auth - Manage authentication
 *
 * Usage:
 *   okra auth login              # Set API key in global config
 *   okra auth status             # Show current auth status
 *   okra auth logout             # Remove API key from global config
 */

import { readGlobalConfig, writeGlobalConfig, getApiKey, getApiKeySource, getGlobalConfigPath } from '../config';
import { getBaseUrl } from '../config';
import { writeOutput } from '../output';
import * as readline from 'readline';
import { OkraRuntimeError } from '../../errors';

const API_KEY_URL = 'https://app.okrapdf.com/settings';
const DEFAULT_BASE_URL = 'https://api.okrapdf.com';

export interface AuthVerificationResult {
  authenticated: true;
  user_id: string;
  key_id: string;
  key_name?: string | null;
  key_type?: string | null;
  scope?: string | null;
  scoped_orgs?: string[];
  scoped_projects?: string[];
}

function writeStdout(message: string): void {
  process.stdout.write(message + '\n');
}

function writeStderr(message: string): void {
  process.stderr.write(message + '\n');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isLikelyApiKey(value: string): boolean {
  return value.startsWith('okra_');
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return apiKey;
  return apiKey.slice(0, 10) + '...' + apiKey.slice(-4);
}

function persistApiKey(apiKey: string): void {
  // Read existing config or create new one
  const config = readGlobalConfig() || {};
  config.apiKey = apiKey;

  // Write to global config
  writeGlobalConfig(config);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.trim() !== '') return payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;

  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim() !== '') return record.error;
  if (typeof record.message === 'string' && record.message.trim() !== '') return record.message;
  return undefined;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function verifyApiKey(
  apiKey: string,
  options: { baseUrl?: string } = {},
): Promise<AuthVerificationResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl || getBaseUrl() || DEFAULT_BASE_URL);
  const verifyUrl = `${baseUrl}/auth/verify`;

  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    throw new OkraRuntimeError(
      'HTTP_ERROR',
      `Could not reach ${verifyUrl} to verify the API key`,
      503,
      error,
    );
  }

  const payload = await parseJsonSafely(response);

  if (response.status === 401) {
    throw new OkraRuntimeError(
      'UNAUTHORIZED',
      extractErrorMessage(payload) || 'Invalid API key',
      401,
      payload,
    );
  }

  if (!response.ok) {
    throw new OkraRuntimeError(
      'HTTP_ERROR',
      extractErrorMessage(payload) || `API key verification failed (${response.status})`,
      response.status || 500,
      payload,
    );
  }

  if (!payload || typeof payload !== 'object' || (payload as { authenticated?: unknown }).authenticated !== true) {
    throw new OkraRuntimeError(
      'INVALID_RESPONSE',
      'API key verification returned an unexpected response',
      502,
      payload,
    );
  }

  return payload as AuthVerificationResult;
}

/**
 * Prompt user for input.
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for a secret without echoing typed characters when a TTY is available.
 */
function promptSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return prompt(question);
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const chars: string[] = [];
    const wasRaw = stdin.isRaw === true;

    const cleanup = (): void => {
      stdin.removeListener('data', onData);
      stdin.setRawMode?.(wasRaw);
      stdin.pause();
    };

    const finish = (): void => {
      cleanup();
      stdout.write('\n');
      resolve(chars.join('').trim());
    };

    const cancel = (): void => {
      cleanup();
      stdout.write('\n');
      reject(new OkraRuntimeError('INVALID_REQUEST', 'Authentication cancelled', 400));
    };

    const onData = (chunk: Buffer | string): void => {
      const input = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const char of input) {
        if (char === '\u0003') {
          cancel();
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (chars.length > 0) chars.pop();
          continue;
        }
        chars.push(char);
      }
    };

    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/**
 * Login command - set API key in global config.
 */
export async function authLogin(providedApiKey?: string): Promise<void> {
  if (providedApiKey) {
    await authSetKey(providedApiKey);
    return;
  }

  writeStdout('okraPDF CLI authentication');
  writeStdout('');
  writeStdout('Get your API key at:');
  writeStdout(`  ${API_KEY_URL}`);
  writeStdout('');

  const apiKey = await promptSecret('Enter your API key: ');

  if (!apiKey) {
    writeStderr('Error: API key cannot be empty');
    process.exit(1);
  }

  if (!isLikelyApiKey(apiKey)) {
    writeStderr('Warning: API key should start with "okra_"');
  }

  const verified = await verifyApiKey(apiKey);
  persistApiKey(apiKey);

  writeStdout('');
  writeStdout(`Verified API key for ${verified.user_id}${verified.key_name ? ` (${verified.key_name})` : ''}`);
  writeStdout(`Saved API key to ${getGlobalConfigPath()}`);
  writeStdout('');
  writeStdout('Next:');
  writeStdout('  okra upload ./report.pdf');
}

/**
 * Set API key non-interactively.
 */
export async function authSetKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    writeStderr('Error: API key cannot be empty');
    process.exit(1);
  }

  if (!isLikelyApiKey(trimmed)) {
    writeStderr('Warning: API key should start with "okra_"');
  }

  const verified = await verifyApiKey(trimmed);
  persistApiKey(trimmed);
  writeStdout(`Verified API key for ${verified.user_id}${verified.key_name ? ` (${verified.key_name})` : ''}`);
  writeStdout(`Saved API key to ${getGlobalConfigPath()}`);
}

export interface AuthStatusOptions {
  validate?: boolean;
  json?: boolean;
  output?: string;
}

interface AuthStatusReport {
  object: 'auth_status';
  authenticated: boolean;
  validated: boolean;
  api_key: {
    configured: boolean;
    masked: string | null;
    source: string;
  };
  base_url: string;
  user_id?: string;
  key_id?: string;
  key_name?: string | null;
  key_type?: string | null;
  scope?: string | null;
  error?: {
    code: string;
    message: string;
    status: number;
  };
}

function writeAuthStatusJson(report: AuthStatusReport, output?: string): void {
  writeOutput(JSON.stringify(report), output);
}

/**
 * Status command - show current auth status.
 */
export async function authStatus(options: AuthStatusOptions = {}): Promise<void> {
  const apiKey = getApiKey();
  const source = getApiKeySource();
  const baseUrl = normalizeBaseUrl(getBaseUrl() || DEFAULT_BASE_URL);
  const report: AuthStatusReport = {
    object: 'auth_status',
    authenticated: apiKey !== undefined,
    validated: false,
    api_key: {
      configured: apiKey !== undefined,
      masked: apiKey ? maskApiKey(apiKey) : null,
      source,
    },
    base_url: baseUrl,
  };

  if (apiKey && options.validate) {
    try {
      const verified = await verifyApiKey(apiKey, { baseUrl });
      report.authenticated = true;
      report.validated = true;
      report.user_id = verified.user_id;
      report.key_id = verified.key_id;
      report.key_name = verified.key_name;
      report.key_type = verified.key_type;
      report.scope = verified.scope;
    } catch (error) {
      if (error instanceof OkraRuntimeError && error.status === 401) {
        report.authenticated = false;
        report.validated = true;
        report.error = {
          code: error.code,
          message: error.message,
          status: error.status,
        };
        if (options.json) {
          writeAuthStatusJson(report, options.output);
          process.exitCode = 1;
          return;
        }
        throw new OkraRuntimeError(
          'UNAUTHORIZED',
          `Configured API key is invalid (${maskApiKey(apiKey)} from ${source}). Replace it with \`okra auth login\` or update OKRA_API_KEY.`,
          401,
          error,
        );
      }
      if (error instanceof OkraRuntimeError && options.json) {
        report.authenticated = false;
        report.validated = true;
        report.error = {
          code: error.code,
          message: error.message,
          status: error.status,
        };
        writeAuthStatusJson(report, options.output);
        process.exitCode = error.status >= 500 ? 2 : 1;
        return;
      }
      throw error;
    }
  }

  if (options.json) {
    writeAuthStatusJson(report, options.output);
    return;
  }

  writeStdout('okraPDF CLI authentication status');
  writeStdout('');

  if (apiKey) {
    writeStdout(`API key: ${maskApiKey(apiKey)}`);
    writeStdout(`Source: ${source}`);
    writeStdout(`Base URL: ${baseUrl}`);
    if (options.validate && report.validated) {
      writeStdout(`User: ${report.user_id}`);
      if (report.key_name || report.key_type) {
        const name = report.key_name || 'API key';
        const type = report.key_type ? ` (${report.key_type})` : '';
        writeStdout(`Key: ${name}${type}`);
      }
      if (report.scope) {
        writeStdout(`Scope: ${report.scope}`);
      }
    } else {
      writeStdout('Validation: not run (use `okra auth status --validate`)');
    }
  } else {
    writeStdout('Not authenticated');
    writeStdout(`Source: ${source}`);
    writeStdout(`Base URL: ${baseUrl}`);
    writeStdout('');
    writeStdout('Set an API key with:');
    writeStdout('  okra auth login');
    writeStdout('  export OKRA_API_KEY="okra_xxx"');
    writeStdout('');
    writeStdout('Get a key at:');
    writeStdout(`  ${API_KEY_URL}`);
  }

  writeStdout('');
}

/**
 * Print active API key to stdout (for piping).
 */
export async function authToken(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    writeStderr('Error: No API key configured');
    process.exit(1);
  }
  writeStdout(apiKey);
}

/**
 * WhoAmI command - currently aliases auth status.
 */
export async function authWhoAmI(): Promise<void> {
  await authStatus({ validate: true });
}

/**
 * Logout command - remove API key from global config.
 */
export async function authLogout(): Promise<void> {
  const config = readGlobalConfig();

  if (!config || !config.apiKey) {
    writeStdout('No API key found in global config');
    return;
  }

  // Remove API key but keep other config
  delete config.apiKey;
  writeGlobalConfig(config);

  writeStdout(`Removed API key from ${getGlobalConfigPath()}`);
  writeStdout('');
  writeStdout('Environment variables and project configs are unchanged.');
}
