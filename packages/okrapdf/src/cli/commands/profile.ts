import {
  getActiveProfile,
  getGlobalConfigPath,
  normalizeBaseUrl,
  readGlobalConfig,
  removeGlobalProfile,
  upsertGlobalProfile,
  useGlobalProfile,
  validateProfileName,
} from '../config';

function writeStdout(message: string): void {
  process.stdout.write(message + '\n');
}

function writeStderr(message: string): void {
  process.stderr.write(message + '\n');
}

export interface ProfileAddOptions {
  baseUrl?: string;
  apiKey?: string;
  use?: boolean;
}

export function profileAdd(name: string, options: ProfileAddOptions): void {
  const profileName = validateProfileName(name);
  if (!options.baseUrl) {
    writeStderr('Error: --base-url is required');
    process.exit(1);
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  upsertGlobalProfile(
    profileName,
    {
      baseUrl,
      ...(options.apiKey ? { apiKey: options.apiKey.trim() } : {}),
    },
    { use: options.use === true },
  );

  writeStdout(`Saved profile "${profileName}" to ${getGlobalConfigPath()}`);
  writeStdout(`Base URL: ${baseUrl}`);
  if (options.use) {
    writeStdout(`Active profile: ${profileName}`);
  } else {
    writeStdout('');
    writeStdout('Use it with:');
    writeStdout(`  okra profile use ${profileName}`);
  }
}

export function profileUse(name: string): void {
  const profileName = validateProfileName(name);
  useGlobalProfile(profileName);
  writeStdout(`Active profile: ${profileName}`);
}

export function profileCurrent(): void {
  const config = readGlobalConfig();
  const active = getActiveProfile(config);
  if (!active) {
    writeStdout('No active profile');
    return;
  }

  writeStdout(`Active profile: ${active.name}`);
  if (active.profile.baseUrl) {
    writeStdout(`Base URL: ${active.profile.baseUrl}`);
  }
  writeStdout(`API key: ${active.profile.apiKey ? 'configured' : 'not configured in profile'}`);
}

export function profileList(): void {
  const config = readGlobalConfig();
  const profiles = config?.profiles || {};
  const names = Object.keys(profiles).sort();
  if (names.length === 0) {
    writeStdout('No profiles configured');
    return;
  }

  for (const name of names) {
    const marker = name === config?.activeProfile ? '*' : ' ';
    const profile = profiles[name];
    writeStdout(`${marker} ${name} ${profile.baseUrl || '(no base URL)'}`);
  }
}

export function profileRemove(name: string): void {
  const profileName = validateProfileName(name);
  removeGlobalProfile(profileName);
  writeStdout(`Removed profile "${profileName}"`);
}
