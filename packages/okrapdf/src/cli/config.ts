/**
 * Configuration management for okra CLI
 *
 * Priority order (highest to lowest):
 * 1. Environment variable: OKRA_API_KEY
 * 2. Project config: .okrarc or .okra.json in current directory
 * 3. Active global profile: ~/.okra/config.json profiles[activeProfile]
 * 4. Global config: ~/.okra/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import { OkraRuntimeError } from '../errors';

export interface OkraConfig {
  apiKey?: string;
  baseUrl?: string;
  activeProfile?: string;
  profiles?: Record<string, OkraProfile>;
}

export interface OkraProfile {
  baseUrl?: string;
  apiKey?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Get the global config directory path.
 * Supports XDG_CONFIG_HOME convention.
 */
export function getGlobalConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    return join(xdgConfigHome, 'okra');
  }
  return join(homedir(), '.okra');
}

/**
 * Get the global config file path.
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.json');
}

/**
 * Read global config from ~/.okra/config.json
 */
export function readGlobalConfig(): OkraConfig | null {
  try {
    const configPath = getGlobalConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Silently fail and return null
    return null;
  }
}

/**
 * Write global config to ~/.okra/config.json
 */
export function writeGlobalConfig(config: OkraConfig): void {
  const configDir = getGlobalConfigDir();
  const configPath = getGlobalConfigPath();

  // Create directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function normalizeProfileName(name: string): string {
  return name.trim();
}

export function validateProfileName(name: string): string {
  const normalized = normalizeProfileName(name);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(normalized)) {
    const message = 'Profile name must be 1-64 characters and use letters, numbers, dot, underscore, or hyphen';
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'invalid_profile_name',
      message,
      next_actions: [
        { cmd: 'okra profile add my-profile --base-url https://api.okrapdf.com', why: 'Use a name of letters/numbers/dot/underscore/hyphen (no spaces), starting alphanumeric.' },
      ],
    });
  }
  return normalized;
}

export function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  const invalidBaseUrl = (message: string): OkraRuntimeError =>
    new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'invalid_base_url',
      message,
      next_actions: [
        { cmd: 'okra profile add my-profile --base-url https://api.okrapdf.com', why: 'Pass a full http(s) URL, e.g. https://my-okra.up.railway.app.' },
      ],
    });
  if (!normalized) {
    throw invalidBaseUrl('Base URL cannot be empty');
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw invalidBaseUrl('Base URL must be a valid http or https URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidBaseUrl('Base URL must use http or https');
  }
  return normalized;
}

export function getActiveProfile(config: OkraConfig | null = readGlobalConfig()): { name: string; profile: OkraProfile } | undefined {
  const activeProfile = config?.activeProfile;
  if (!activeProfile) return undefined;
  const profile = config?.profiles?.[activeProfile];
  return profile ? { name: activeProfile, profile } : undefined;
}

export function upsertGlobalProfile(
  name: string,
  profile: Omit<OkraProfile, 'createdAt' | 'updatedAt'>,
  options: { use?: boolean } = {},
): OkraConfig {
  const profileName = validateProfileName(name);
  const existing = readGlobalConfig() || {};
  const previous = existing.profiles?.[profileName];
  const now = new Date().toISOString();
  const nextProfile: OkraProfile = {
    ...previous,
    ...profile,
    ...(profile.baseUrl ? { baseUrl: normalizeBaseUrl(profile.baseUrl) } : {}),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  const nextConfig: OkraConfig = {
    ...existing,
    profiles: {
      ...(existing.profiles || {}),
      [profileName]: nextProfile,
    },
    ...(options.use ? { activeProfile: profileName } : {}),
  };
  writeGlobalConfig(nextConfig);
  return nextConfig;
}

export function useGlobalProfile(name: string): OkraConfig {
  const profileName = validateProfileName(name);
  const existing = readGlobalConfig() || {};
  if (!existing.profiles?.[profileName]) {
    throw new OkraRuntimeError('INVALID_REQUEST', `Profile "${profileName}" does not exist`, 404, {
      error: 'profile_not_found',
      message: `Profile "${profileName}" does not exist`,
      next_actions: [
        { cmd: 'okra profile list', why: 'List configured profiles to see valid names.' },
      ],
    });
  }
  const nextConfig = { ...existing, activeProfile: profileName };
  writeGlobalConfig(nextConfig);
  return nextConfig;
}

export function removeGlobalProfile(name: string): OkraConfig {
  const profileName = validateProfileName(name);
  const existing = readGlobalConfig() || {};
  if (!existing.profiles?.[profileName]) {
    throw new OkraRuntimeError('INVALID_REQUEST', `Profile "${profileName}" does not exist`, 404, {
      error: 'profile_not_found',
      message: `Profile "${profileName}" does not exist`,
      next_actions: [
        { cmd: 'okra profile list', why: 'List configured profiles to see valid names.' },
      ],
    });
  }

  const profiles = { ...existing.profiles };
  delete profiles[profileName];
  const nextConfig: OkraConfig = {
    ...existing,
    profiles,
  };
  if (nextConfig.activeProfile === profileName) {
    delete nextConfig.activeProfile;
  }
  writeGlobalConfig(nextConfig);
  return nextConfig;
}

/**
 * Find and read project config from current directory.
 * Checks for .okrarc and .okra.json
 */
export function readProjectConfig(): OkraConfig | null {
  const projectFiles = ['.okrarc', '.okra.json'];

  for (const filename of projectFiles) {
    try {
      const path = join(process.cwd(), filename);
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Continue to next file
      continue;
    }
  }

  return null;
}

/**
 * Get API key from all sources with proper priority.
 *
 * Priority order:
 * 1. Environment variable: OKRA_API_KEY
 * 2. Project config: .okrarc or .okra.json
 * 3. Active global profile: ~/.okra/config.json profiles[activeProfile]
 * 4. Global config: ~/.okra/config.json
 */
export function getApiKey(): string | undefined {
  // 1. Check environment variable
  if (process.env.OKRA_API_KEY) {
    return process.env.OKRA_API_KEY;
  }

  // 2. Check project config
  const projectConfig = readProjectConfig();
  if (projectConfig?.apiKey) {
    return projectConfig.apiKey;
  }

  // 3. Check active global profile
  const globalConfig = readGlobalConfig();
  const activeProfile = getActiveProfile(globalConfig);
  if (activeProfile?.profile.apiKey) {
    return activeProfile.profile.apiKey;
  }

  // 4. Check global config
  if (globalConfig?.apiKey) {
    return globalConfig.apiKey;
  }

  return undefined;
}

/**
 * Get base URL from all sources with proper priority.
 */
export function getBaseUrl(): string | undefined {
  // 1. Check environment variable
  if (process.env.OKRA_BASE_URL) {
    return process.env.OKRA_BASE_URL;
  }

  // 2. Check project config
  const projectConfig = readProjectConfig();
  if (projectConfig?.baseUrl) {
    return projectConfig.baseUrl;
  }

  // 3. Check active global profile
  const globalConfig = readGlobalConfig();
  const activeProfile = getActiveProfile(globalConfig);
  if (activeProfile?.profile.baseUrl) {
    return activeProfile.profile.baseUrl;
  }

  // 4. Check global config
  if (globalConfig?.baseUrl) {
    return globalConfig.baseUrl;
  }

  return 'https://api.okrapdf.com';
}

/**
 * Get source of API key for debugging.
 */
export function getApiKeySource(): string {
  if (process.env.OKRA_API_KEY) {
    return 'environment variable (OKRA_API_KEY)';
  }

  const projectConfig = readProjectConfig();
  if (projectConfig?.apiKey) {
    const files = ['.okrarc', '.okra.json'];
    for (const f of files) {
      if (existsSync(join(process.cwd(), f))) {
        return `project config (${f})`;
      }
    }
  }

  const globalConfig = readGlobalConfig();
  const activeProfile = getActiveProfile(globalConfig);
  if (activeProfile?.profile.apiKey) {
    return `profile ${activeProfile.name} (${getGlobalConfigPath()})`;
  }

  if (globalConfig?.apiKey) {
    return `global config (${getGlobalConfigPath()})`;
  }

  return 'not found';
}
