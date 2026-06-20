/**
 * CLI subpath exports for okraPDF.
 *
 * The default public CLI experience focuses on auth, upload, extract, chat,
 * and collection workflows. This module still exports the lower-level
 * inspection helpers for advanced and internal uses.
 */

/**
 * Programmatic CLI entry — `@okrapdf/cli`'s `okra` bin is a thin shim over
 * this. bin.ts only self-executes under direct execution, so wrappers call
 * runCli() instead of importing the bin.
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const { runProgram } = await import('./bin');
  await runProgram(argv);
}

// Export types
export * from './types';

// Export query engine
export {
  parseSelector,
  filterEntities,
  executeQuery,
  calculateStats,
  type SelectorParts,
  type QueryOptions,
  type QueryStats,
  type QueryResult,
} from './query-engine';

// Export commands
export {
  // Find command (entity search)
  find,
  formatFindOutput,
  formatStats,
  type FindOptions,
  // Search command
  search,
  formatSearchOutput,
  type SearchOptions,
  // Auth commands
  authLogin,
  authSetKey,
  authStatus,
  authWhoAmI,
  authToken,
  authLogout,
  maskApiKey,
  verifyApiKey,
  type AuthStatusOptions,
  type AuthVerificationResult,
} from './commands';

// Export config utilities
export {
  getApiKey,
  getBaseUrl,
  getApiKeySource,
  getGlobalConfigPath,
  getGlobalConfigDir,
  readGlobalConfig,
  writeGlobalConfig,
  readProjectConfig,
  type OkraConfig,
} from './config';
