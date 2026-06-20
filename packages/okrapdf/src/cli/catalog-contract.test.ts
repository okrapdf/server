import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { program } from './bin.js';
import catalog from './resource-catalog.generated.json';

/**
 * Cross-package contract test (W.4.24e #459).
 *
 * The committed fixture `resource-catalog.generated.json` is generated from the
 * API's `/v1/resources` catalog (`getApiResourceCatalog()` in
 * `apps/api/packages/server/src/http/routes/resource-routes.ts`) — it is the
 * single source of truth for the agent surface. This test pins the CLI's
 * commander tree (`program`) against that fixture so the two packages can't
 * silently drift:
 *
 *   - every `tier: 'core'` noun must have a matching top-level CLI command
 *     (by name OR alias);
 *   - every operation that carries a `cli` hint must name a command that
 *     actually resolves in the commander tree;
 *   - `advanced` / `internal` primitives are explicitly scoped OUT of the core
 *     agent loop and are NOT required to have a CLI command.
 *
 * RED when a core primitive loses its CLI command, or a `cli` hint points at a
 * command that doesn't exist.
 */

type Op = { action: string; cli?: string };
type Noun = { name: string; tier: string; aliases: string[]; operations: Op[] };
type Action = { name: string; tier: string; primary_resource: string; operations: Op[] };
type Fixture = { object: string; version: string; nouns: Noun[]; actions: Action[] };

const fixture = catalog as Fixture;

/** All names a top-level command answers to (canonical name + aliases). */
function commandNames(command: Command): string[] {
  return [command.name(), ...command.aliases()];
}

/** Find a top-level command that answers to `name` (by name or alias). */
function findTopLevelCommand(name: string): Command | undefined {
  return program.commands.find((command) => commandNames(command).includes(name));
}

/**
 * Resolve an `okra <noun> [verb] ...` invocation against the commander tree.
 * Returns true when the full noun→verb path resolves (matching names/aliases at
 * each level). Flags and positional placeholders (`<id>`, `--standard wcag`) are
 * ignored — we only walk the command path.
 */
function cliCommandResolves(cli: string): boolean {
  const tokens = cli.trim().split(/\s+/);
  if (tokens[0] !== 'okra') return false;

  // Drop the leading `okra` and keep only command-path tokens: stop at the first
  // flag (`--x`) or positional placeholder (`<id>` / `[id]`).
  const pathTokens: string[] = [];
  for (const token of tokens.slice(1)) {
    if (token.startsWith('-') || token.startsWith('<') || token.startsWith('[')) break;
    pathTokens.push(token);
  }
  if (pathTokens.length === 0) return false;

  let current: Command | undefined = findTopLevelCommand(pathTokens[0]);
  for (const verb of pathTokens.slice(1)) {
    if (!current) return false;
    current = current.commands.find((child) => commandNames(child).includes(verb));
  }
  return current !== undefined;
}

const CORE = 'core';

describe('CLI ↔ resource-catalog contract (W.4.24e #459)', () => {
  it('the committed fixture is the API catalog crystallized', () => {
    expect(fixture.object).toBe('okra_resource_catalog_fixture');
    expect(fixture.nouns.length).toBeGreaterThan(0);
    expect(fixture.actions.length).toBeGreaterThan(0);
    // No duplicate names across nouns/actions/aliases (would have caught the
    // historical `context` dup — see #459).
    const seen = new Map<string, string>();
    const dups: string[] = [];
    const claim = (name: string, owner: string) => {
      const key = name.toLowerCase();
      const prior = seen.get(key);
      if (prior) dups.push(`"${key}" claimed by ${prior} and ${owner}`);
      else seen.set(key, owner);
    };
    for (const noun of fixture.nouns) {
      claim(noun.name, `noun:${noun.name}`);
      for (const alias of noun.aliases) claim(alias, `alias-of:${noun.name}`);
    }
    for (const action of fixture.actions) claim(action.name, `action:${action.name}`);
    expect(dups).toEqual([]);
  });

  it('every core noun has a matching top-level CLI command (by name or alias)', () => {
    const missing: string[] = [];
    for (const noun of fixture.nouns) {
      if (noun.tier !== CORE) continue;
      const candidates = [noun.name, ...noun.aliases];
      const resolved = candidates.some((name) => findTopLevelCommand(name) !== undefined);
      if (!resolved) {
        missing.push(`core noun "${noun.name}" (tried: ${candidates.join(', ')})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every operation cli hint resolves to a real command in the commander tree', () => {
    const allOps: Array<{ owner: string; op: Op }> = [
      ...fixture.nouns.flatMap((n) => n.operations.map((op) => ({ owner: `noun:${n.name}`, op }))),
      ...fixture.actions.flatMap((a) => a.operations.map((op) => ({ owner: `action:${a.name}`, op }))),
    ];
    const broken: string[] = [];
    for (const { owner, op } of allOps) {
      if (op.cli === undefined) continue;
      if (!cliCommandResolves(op.cli)) {
        broken.push(`${owner}.${op.action}: cli "${op.cli}" does not resolve in the commander tree`);
      }
    }
    // Sanity: there is at least one cli hint to check (otherwise this guard is vacuous).
    const hintCount = allOps.filter(({ op }) => op.cli !== undefined).length;
    expect(hintCount).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });

  it('core actions that name a top-level verb resolve in the commander tree', () => {
    // Core ACTIONS (parse/redact/upload/extract/audit) surface as top-level CLI
    // verbs. `renders` is the exception — its CLI verb is `render`, encoded via
    // the op `cli` hint (checked above), so the bare action name is not required
    // to be a command.
    const missing: string[] = [];
    for (const action of fixture.actions) {
      if (action.tier !== CORE) continue;
      const hasCliHint = action.operations.some((op) => op.cli !== undefined);
      if (hasCliHint) continue; // covered by the cli-hint resolution test
      if (!findTopLevelCommand(action.name)) {
        missing.push(`core action "${action.name}" has no top-level command and no cli hint`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('advanced/internal primitives are allowed to be absent from the CLI (scoped out)', () => {
    const scopedOut = [...fixture.nouns, ...fixture.actions].filter(
      (entry) => entry.tier === 'advanced' || entry.tier === 'internal',
    );
    // There IS a scoped-out set (sessions/layerizations/tables/agents/...) — the
    // contract is that we don't *require* a command for them, not that they must
    // be missing. Just assert the classification is present and non-empty so the
    // "covered by decision, not silently missing" intent holds.
    expect(scopedOut.length).toBeGreaterThan(0);
    for (const entry of scopedOut) {
      expect(['advanced', 'internal']).toContain(entry.tier);
    }
  });
});
