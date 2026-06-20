import type { Command } from 'commander';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json';
import {
  ADVANCED_COLLECTION_SUBCOMMANDS,
  ADVANCED_COMMANDS,
  CLI_VERSION,
  COLLECTION_HELP_FOOTER,
  PRIMARY_COLLECTION_SUBCOMMANDS,
  PRIMARY_COMMANDS,
  ROOT_HELP_FOOTER,
  SELF_HOST_HELP_FOOTER,
  compareSemver,
  getMissingApiKeyMessage,
  parseInlineJsonArg,
  parseOptionalJsonObject,
  program,
  runProgram,
} from './bin.js';
import { OkraRuntimeError } from '../errors.js';
import { resetOutputContext, setOutputContext, writeOutput } from './output.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const selfHostExampleRoot = join(repoRoot, 'runtime');

function copySelfHostExample(prefix: string): { tmpRoot: string; bundleRoot: string } {
  const tmpRoot = mkdtempSync(join(tmpdir(), prefix));
  const bundleRoot = join(tmpRoot, 'self-host-runtime');
  cpSync(selfHostExampleRoot, bundleRoot, { recursive: true });
  return { tmpRoot, bundleRoot };
}

function visibleCommandNames(command: Command): string[] {
  return command.commands
    .filter((child) => !(child as Command & { _hidden?: boolean })._hidden)
    .map((child) => child.name());
}

async function runCli(args: string[], stdoutIsTTY: boolean): Promise<string> {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  try {
    program.setOptionValue('json', undefined);
    program.setOptionValue('quiet', undefined);
    program.setOptionValue('output', undefined);
    resetOutputContext();
    process.argv = ['node', 'okra', ...args];
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: stdoutIsTTY,
    });

    await program.parseAsync(process.argv, { from: 'node' });
    return stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    resetOutputContext();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    if (originalIsTTY) {
      Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
    } else {
      delete (process.stdout as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    }
  }
}

function restoreEnv(name: 'OKRA_API_KEY' | 'OKRA_BASE_URL' | 'XDG_CONFIG_HOME', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function nextActionCommands(envelope: Record<string, unknown>): string[] {
  return ((envelope.next_actions as Array<{ cmd?: unknown }> | undefined) ?? [])
    .map((action) => String(action.cmd ?? ''));
}

function wrapMachineOutput(command: string, result: unknown): Record<string, unknown> {
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  try {
    resetOutputContext();
    setOutputContext({ json: true, command });
    writeOutput(JSON.stringify(result));
    return JSON.parse(stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('')) as Record<string, unknown>;
  } finally {
    resetOutputContext();
    stdoutSpy.mockRestore();
  }
}

describe('compareSemver (okra doctor version check)', () => {
  it('orders MAJOR.MINOR.PATCH numerically', () => {
    expect(compareSemver('0.16.2', '0.16.1')).toBe(1); // ahead — was mislabeled "behind"
    expect(compareSemver('0.16.1', '0.16.2')).toBe(-1); // behind
    expect(compareSemver('0.16.2', '0.16.2')).toBe(0); // current
    expect(compareSemver('1.0.0', '0.99.99')).toBe(1); // major beats minor/patch
    expect(compareSemver('0.16.10', '0.16.9')).toBe(1); // numeric, not lexical (10 > 9)
  });

  it('treats a prerelease as older than its release', () => {
    expect(compareSemver('0.16.2-beta.1', '0.16.2')).toBe(-1);
    expect(compareSemver('0.16.2', '0.16.2-beta.1')).toBe(1);
    expect(compareSemver('v0.16.2', '0.16.2')).toBe(0); // tolerates a leading v
  });
});

describe('parseInlineJsonArg / parseOptionalJsonObject (inline JSON CLI args)', () => {
  // Bare JSON.parse on a user --flag '<json>' threw a SyntaxError → handleError
  // rendered error:"error", code:1. These now produce a structured envelope
  // (facet/lens --payload/--cursor/--state, workflows run --metadata).
  it('parseInlineJsonArg returns the value for valid JSON of any type', () => {
    expect(parseInlineJsonArg('{"a":1}', '--payload')).toEqual({ a: 1 });
    expect(parseInlineJsonArg('[1,2]', '--payload')).toEqual([1, 2]);
    expect(parseInlineJsonArg('42', '--cursor')).toBe(42);
  });

  it('parseInlineJsonArg throws a structured invalid_json_argument (400) on malformed JSON', () => {
    const err = (() => { try { parseInlineJsonArg('{bad', '--payload'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(OkraRuntimeError);
    expect((err as OkraRuntimeError).status).toBe(400);
    expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_json_argument');
    expect(String((err as OkraRuntimeError).message)).toContain('--payload must be valid JSON');
  });

  it('parseOptionalJsonObject returns undefined for empty, the object for valid, and errors on non-object/malformed', () => {
    expect(parseOptionalJsonObject(undefined, '--metadata')).toBeUndefined();
    expect(parseOptionalJsonObject('{"k":"v"}', '--metadata')).toEqual({ k: 'v' });
    for (const bad of ['{bad', '[1,2,3]', '"str"', '5']) {
      const err = (() => { try { parseOptionalJsonObject(bad, '--metadata'); } catch (e) { return e; } })();
      expect(err, `expected throw for ${bad}`).toBeInstanceOf(OkraRuntimeError);
      expect(((err as OkraRuntimeError).details as { error: string }).error).toBe('invalid_json_argument');
    }
  });
});

describe('okra CLI clean-house help surface', () => {
  it('keeps the CLI version in sync with package.json', () => {
    expect(CLI_VERSION).toBe(packageJson.version);
  });

  it('shows only promoted commands in root help', () => {
    const visible = visibleCommandNames(program);

    for (const command of PRIMARY_COMMANDS) {
      expect(visible).toContain(command);
    }

    for (const command of ADVANCED_COMMANDS) {
      expect(visible).not.toContain(command);
    }

    // Clean-house guard: nothing outside the curated PRIMARY set may leak into
    // root help (commander's implicit `help` command is allowed). This catches
    // commands that are registered but neither promoted nor explicitly hidden.
    const promoted = new Set<string>(PRIMARY_COMMANDS);
    const leaked = visible.filter((name) => name !== 'help' && !promoted.has(name));
    expect(leaked).toEqual([]);
  });

  it('shows only promoted collection subcommands in default help', () => {
    const collection = program.commands.find((command) => command.name() === 'collections');
    expect(collection).toBeDefined();

    const visible = visibleCommandNames(collection!);

    for (const command of PRIMARY_COLLECTION_SUBCOMMANDS) {
      expect(visible).toContain(command);
    }

    expect(visible).not.toContain('extract');

    for (const command of ADVANCED_COLLECTION_SUBCOMMANDS) {
      expect(visible).not.toContain(command);
    }
  });

  it('registers noun-first resource command groups', () => {
    const resources = program.commands.find((command) => command.name() === 'resources');
    const documents = program.commands.find((command) => command.name() === 'documents');
    const files = program.commands.find((command) => command.name() === 'files');
    const jobs = program.commands.find((command) => command.name() === 'jobs');
    const agents = program.commands.find((command) => command.name() === 'agents');
    const workflows = program.commands.find((command) => command.name() === 'workflows');
    const profile = program.commands.find((command) => command.name() === 'profile');
    const selfHost = program.commands.find((command) => command.name() === 'self-host');
    const serve = program.commands.find((command) => command.name() === 'serve');
    const parse = program.commands.find((command) => command.name() === 'parse');
    const audit = program.commands.find((command) => command.name() === 'audit');
    const redact = program.commands.find((command) => command.name() === 'redact');
    const doctor = program.commands.find((command) => command.name() === 'doctor');

    expect(visibleCommandNames(resources!)).toEqual(expect.arrayContaining(['list', 'show']));
    expect(visibleCommandNames(documents!)).toEqual(expect.arrayContaining(['list', 'upload', 'get', 'read', 'wait-for', 'urls', 'reparse', 'verify', 'delete']));
    expect(visibleCommandNames(files!)).toEqual(expect.arrayContaining(['list', 'upload', 'get', 'url', 'delete']));
    expect(visibleCommandNames(jobs!)).toEqual(expect.arrayContaining(['list', 'get', 'wait', 'events', 'cancel', 'retry', 'resume']));
    expect(visibleCommandNames(agents!)).toEqual(expect.arrayContaining(['list', 'get', 'profiles']));
    expect(visibleCommandNames(workflows!)).toEqual(expect.arrayContaining(['catalog', 'steps', 'examples', 'example', 'validate', 'build', 'run']));
    expect(visibleCommandNames(profile!)).toEqual(expect.arrayContaining(['add', 'use', 'current', 'list', 'remove']));
    expect(visibleCommandNames(selfHost!)).toEqual(
      expect.arrayContaining([
        'validate',
        'materialize',
        'proof',
        'plan',
        'env',
        'compose',
        'railway',
        'network-plan',
        'template',
        'template-listing',
        'template-evidence',
        'implementations',
        'capability-evidence',
        'evidence-bundle',
        'publish-pack',
        'readiness',
        'smoke',
        'serve',
      ]),
    );
    expect(serve?.description()).toContain('self-host runtime');
    expect(parse?.description()).toContain('document.parse job');
    expect(audit?.description()).toContain('audit workflow');
    expect(redact?.description()).toContain('redaction workflow');
    expect(doctor?.description()).toContain('diagnostics');
  });

  it('includes the new guided help text and auth instructions', () => {
    expect(ROOT_HELP_FOOTER).toContain('Primary workflows:');
    expect(ROOT_HELP_FOOTER).toContain('okra auth login');
    expect(ROOT_HELP_FOOTER).toContain('okra profile add local --base-url');
    expect(ROOT_HELP_FOOTER).toContain('okra resources list');
    expect(ROOT_HELP_FOOTER).toContain('okra documents list');
    expect(ROOT_HELP_FOOTER).toContain('okra open doc-abc123 --view review');
    expect(ROOT_HELP_FOOTER).toContain('okra parse doc-abc123 --model gemini-3-flash --prompt layout-bbox-gemini-multipage@1');
    expect(ROOT_HELP_FOOTER).toContain('okra audit doc-abc123 --standard wcag');
    expect(ROOT_HELP_FOOTER).toContain('okra redact doc-abc123 --model local');
    expect(ROOT_HELP_FOOTER).toContain('okra workflows steps');
    expect(ROOT_HELP_FOOTER).toContain('okra workflows build ./workflow.json --json');
    expect(ROOT_HELP_FOOTER).toContain('okra doctor --json');
    expect(ROOT_HELP_FOOTER).toContain('okra collections query earnings');
    // Grounded-context loop is front and center in root help.
    expect(ROOT_HELP_FOOTER).toContain('okra context structure doc-abc123');
    expect(ROOT_HELP_FOOTER).toContain('okra context get "termination clause" --source-id doc-abc123');
    expect(ROOT_HELP_FOOTER).toContain('okra jobs wait doc-abc123');
    // Self-host detail moved off the root footer — one pointer remains.
    expect(ROOT_HELP_FOOTER).toContain('okra self-host --help');
    expect(ROOT_HELP_FOOTER).toContain('okra serve ./runtime');
    expect(ROOT_HELP_FOOTER).not.toContain('okra self-host publish-pack');
    // The full pipeline lives on the self-host group help.
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host validate');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host materialize');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host proof');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host railway');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host network-plan');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host template');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host template-listing');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host template-evidence');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host implementations');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host capability-evidence');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host evidence-bundle');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host publish-pack');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host readiness');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host env');
    expect(SELF_HOST_HELP_FOOTER).toContain('okra self-host smoke');
    expect(COLLECTION_HELP_FOOTER).toContain('Stable v0.14 collection workflow:');
    expect(COLLECTION_HELP_FOOTER).toContain('Experimental structured fan-out remains available via:');
    expect(COLLECTION_HELP_FOOTER).toContain('okra collections extract <name> --schema ./schema.json');

    const authMessage = getMissingApiKeyMessage();
    expect(authMessage).toContain('No API key found.');
    expect(authMessage).toContain('okra auth login');
    expect(authMessage).toContain('https://app.okrapdf.com/settings');
  });

  it('points overlapping legacy Q&A commands at the canonical context ask surface', () => {
    const ask = program.commands.find((command) => command.name() === 'ask');
    const chat = program.commands.find((command) => command.name() === 'chat');

    expect(ask?.description()).toContain('(canonical: okra context ask)');
    expect(chat?.description()).toContain('(canonical: okra context ask)');
  });

  it('supports self-host API profiles from the CLI', async () => {
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-cli-profile-bin-'));
    const xdgConfigHome = join(tmpRoot, 'xdg');

    try {
      mkdirSync(xdgConfigHome, { recursive: true });
      process.env.XDG_CONFIG_HOME = xdgConfigHome;

      const addOutput = await runCli(
        [
          'profile',
          'add',
          'local',
          '--base-url',
          'https://my-okra.up.railway.app/',
          '--api-key',
          'okra_local_key',
        ],
        true,
      );
      const useOutput = await runCli(['profile', 'use', 'local'], true);
      const currentOutput = await runCli(['profile', 'current'], true);

      expect(addOutput).toContain('Saved profile "local"');
      expect(useOutput).toContain('Active profile: local');
      expect(currentOutput).toContain('Base URL: https://my-okra.up.railway.app');
      expect(currentOutput).toContain('API key: configured');

      const config = JSON.parse(
        readFileSync(join(xdgConfigHome, 'okra', 'config.json'), 'utf-8'),
      ) as Record<string, unknown>;
      expect(config).toMatchObject({
        activeProfile: 'local',
        profiles: {
          local: {
            baseUrl: 'https://my-okra.up.railway.app',
            apiKey: 'okra_local_key',
          },
        },
      });
    } finally {
      restoreEnv('XDG_CONFIG_HOME', originalXdgConfigHome);
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('prints the active self-host web-shell URL for document open', async () => {
    const originalBaseUrl = process.env.OKRA_BASE_URL;

    try {
      process.env.OKRA_BASE_URL = 'https://my-okra.up.railway.app/';

      const humanOutput = await runCli(['open', 'doc-self-host-upload', '--view', 'review'], true);
      const machineOutput = await runCli(['open', 'doc-self-host-upload', '--view', 'graph'], false);
      const envelope = JSON.parse(machineOutput) as Record<string, unknown>;

      expect(humanOutput.trim()).toBe(
        'https://my-okra.up.railway.app/?doc=doc-self-host-upload&view=review',
      );
      expect(envelope).toMatchObject({
        ok: true,
        command: 'open',
        result: {
          object: 'document_open_url',
          document_id: 'doc-self-host-upload',
          view: 'graph',
          url: 'https://my-okra.up.railway.app/?doc=doc-self-host-upload&view=graph',
        },
      });
    } finally {
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
    }
  });

  it('validates the self-host runtime bundle from the CLI', async () => {
    const stdout = await runCli(['self-host', 'validate', selfHostExampleRoot], true);

    expect(stdout).toContain('Self-host bundle valid');
    expect(stdout).toContain('Recipes: 5');
    expect(stdout).toContain('n8n workflows: 1');
    expect(stdout).toContain('Capabilities: 9');
    expect(stdout).toContain('Docker networks: 4');
    expect(stdout).toContain('UI runtime: cloudflare_worker_static_assets');
  });

  it('emits structured self-host validation output for agents', async () => {
    const stdout = await runCli(['self-host', 'validate', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const summary = result.summary as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host validate');
    expect(result.object).toBe('self_host_validation');
    expect(result.ok).toBe(true);
    expect(summary.capabilities).toBe(9);
    expect(summary.recipes).toBe(5);
    expect(summary.n8nWorkflows).toBe(1);
    expect(summary.dockerNetworks).toBe(4);
  });

  it('materializes deterministic self-host publish artifacts', async () => {
    const { tmpRoot, bundleRoot } = copySelfHostExample('okra-materialize-');

    try {
      rmSync(join(bundleRoot, 'railway-publish.readiness.json'), { force: true });

      const stdout = await runCli(['self-host', 'materialize', bundleRoot], true);
      const listing = JSON.parse(
        readFileSync(join(bundleRoot, 'railway-template.listing.json'), 'utf-8'),
      ) as Record<string, unknown>;
      const readiness = JSON.parse(
        readFileSync(join(bundleRoot, 'railway-publish.readiness.json'), 'utf-8'),
      ) as Record<string, unknown>;
      const gates = readiness.gates as Array<Record<string, unknown>>;
      const templatePublicationGate = gates.find((gate) => gate.id === 'template_publication');

      expect(stdout).toContain('Self-host publish artifacts materialized');
      expect(stdout).toContain('railway-template.listing.json');
      expect(stdout).toContain('docker-compose.integrations.yml');
      expect(listing.object).toBe('railway_template_listing');
      expect(readiness.status).toBe('blocked');
      expect(readiness.blockers).toHaveLength(3);
      expect(templatePublicationGate?.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining('evidenceBundle=')]),
      );
      expect(readFileSync(join(bundleRoot, 'docker-compose.integrations.yml'), 'utf-8')).toContain(
        'okra-integrations',
      );
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('emits structured self-host materialization output for agents', async () => {
    const { tmpRoot, bundleRoot } = copySelfHostExample('okra-materialize-json-');

    try {
      const stdout = await runCli(['self-host', 'materialize', bundleRoot], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;
      const artifacts = result.artifacts as Array<Record<string, unknown>>;

      expect(envelope.ok).toBe(true);
      expect(envelope.command).toBe('self-host materialize');
      expect(result.object).toBe('self_host_materialize_artifacts');
      expect(result.ok).toBe(true);
      expect(result.readinessStatus).toBe('blocked');
      expect(artifacts.map((artifact) => artifact.path)).toEqual(expect.arrayContaining([
        'railway-template.listing.json',
        'railway-publish.evidence.json',
        'railway-publish.readiness.json',
        'railway-publish.pack.json',
        'docker-compose.capabilities.yml',
        'docker-compose.integrations.yml',
      ]));
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('runs no-server self-host draft proof checks and writes evidence', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-draft-proof-'));
    const evidencePath = join(tmpRoot, 'self-host-draft.proof.json');

    try {
      const stdout = await runCli([
        'self-host',
        'proof',
        selfHostExampleRoot,
        '--generated-at',
        '2026-01-01T00:00:00.000Z',
        '--evidence-out',
        evidencePath,
      ], true);
      const proof = JSON.parse(readFileSync(evidencePath, 'utf-8')) as Record<string, unknown>;
      const checks = proof.checks as Array<Record<string, unknown>>;
      const smoke = proof.smoke as Record<string, unknown>;
      const dispatch = proof.externalCapabilityDispatch as Record<string, unknown>;

      expect(stdout).toContain('Self-host draft proof passed');
      expect(stdout).toContain('external_capability_dispatch');
      expect(proof).toMatchObject({
        object: 'self_host_draft_proof',
        schema_version: 'okra-self-host-draft-proof/v1',
        status: 'passed',
        generated_at: '2026-01-01T00:00:00.000Z',
      });
      expect(checks.map((check) => check.name)).toEqual([
        'bundle_validation',
        'static_review_shell',
        'catalog_routes',
        'api_key_auth_gate',
        'starter_workflow_smoke',
        'document_graph_contract',
        'capability_run_inspection',
        'external_capability_dispatch',
      ]);
      expect(smoke.passedChecks).toEqual([
        'health',
        'status',
        'upload',
        'parse',
        'audit',
        'redact',
        'graph',
        'open',
      ]);
      expect((dispatch.requests as Array<Record<string, unknown>>).map((request) => request.capabilityId)).toEqual([
        'parser.mineru',
        'auditor.wcag.basic',
        'redactor.policy.basic',
      ]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('emits structured no-server draft proof output for agents', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-draft-proof-json-'));
    const evidencePath = join(tmpRoot, 'self-host-draft.proof.json');

    try {
      const stdout = await runCli([
        'self-host',
        'proof',
        selfHostExampleRoot,
        '--generated-at',
        '2026-01-01T00:00:00.000Z',
        '--evidence-out',
        evidencePath,
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const proof = envelope.result as Record<string, unknown>;
      const publication = proof.publication as Record<string, unknown>;

      expect(envelope.ok).toBe(true);
      expect(envelope.command).toBe('self-host proof');
      expect(proof.object).toBe('self_host_draft_proof');
      expect(proof.status).toBe('passed');
      expect((proof.summary as Record<string, unknown>).externalCapabilityRequests).toBe(3);
      expect(publication).toMatchObject({
        publishedTemplateRequired: false,
        satisfiesLiveDeploySmokeGate: false,
      });
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('renders a Railway self-host deployment plan from the CLI', async () => {
    const stdout = await runCli(
      ['-o', 'table', 'self-host', 'plan', selfHostExampleRoot, '--target', 'railway'],
      false,
    );

    expect(stdout).toContain('Self-host railway plan ready');
    expect(stdout).toContain('Railway services');
    expect(stdout).toContain('okra-app');
    expect(stdout).toContain('Environment');
    expect(stdout).toContain('OKRA_DATA_DIR');
    expect(stdout).toContain('Docker networks');
    expect(stdout).toContain('okra-integrations');
    expect(stdout).toContain('Capability namespaces');
  });

  it('emits structured self-host deployment plans for agents', async () => {
    const stdout = await runCli(['self-host', 'plan', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const plan = result.plan as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host plan');
    expect(result.object).toBe('self_host_deployment_plan');
    expect(result.ok).toBe(true);
    expect(plan.target).toBe('railway');
    expect(plan.services).toHaveLength(5);
    expect(plan.dockerNetworks).toHaveLength(4);
    expect(plan.recipes).toHaveLength(5);
    expect(plan.capabilities).toHaveLength(9);
  });

  it('renders a self-host env artifact from the runtime manifest', async () => {
    const stdout = await runCli(['self-host', 'env', selfHostExampleRoot], true);

    expect(stdout).toContain('# okraPDF self-host environment');
    expect(stdout).toContain('OKRA_BASE_URL=https://okra-self-host.up.railway.app');
    expect(stdout).toContain('OKRA_DATA_DIR=/data/okrapdf');
    expect(stdout).toContain('OKRA_FIRST_OWNER_EMAIL=owner@example.com');
    expect(stdout).toContain('OKRA_API_KEY=');
    expect(stdout).toContain('HF_HOME=/data/huggingface');
  });

  it('emits structured self-host env artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'env', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const env = result.env as unknown[];

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host env');
    expect(result.object).toBe('self_host_env_artifact');
    expect(result.ok).toBe(true);
    expect(env).toHaveLength(14);
    expect(env.map((item) => (item as Record<string, unknown>).name)).toEqual(expect.arrayContaining([
      'OKRA_FIRST_OWNER_EMAIL',
      'OKRA_CAPABILITY_ENDPOINTS',
      'OKRA_CAPABILITY_PARSER_MINERU_URL',
      'OKRA_CAPABILITY_AUDITOR_WCAG_BASIC_URL',
      'OKRA_CAPABILITY_REDACTOR_POLICY_BASIC_URL',
      'OKRA_CAPABILITY_HTTP_PORT',
    ]));
    expect(result.dotenv).toEqual(expect.stringContaining('OKRA_N8N_WEBHOOK_SECRET='));
  });

  it('renders the checked-in Docker Compose network topology fragment', async () => {
    const stdout = await runCli(['self-host', 'compose', selfHostExampleRoot], true);
    const expected = readFileSync(
      join(selfHostExampleRoot, 'docker-compose.networks.yml'),
      'utf-8',
    );

    expect(stdout.trimEnd()).toBe(expected.trimEnd());
    expect(stdout).toContain('okra-integrations');
    expect(stdout).toContain('external: true');
  });

  it('renders the checked-in full Docker Compose stack', async () => {
    const stdout = await runCli(['self-host', 'compose', selfHostExampleRoot, '--mode', 'stack'], true);
    const expected = readFileSync(
      join(selfHostExampleRoot, 'docker-compose.yml'),
      'utf-8',
    );

    expect(stdout.trimEnd()).toBe(expected.trimEnd());
    // Filesystem-state runtime: no Postgres service in the stack.
    expect(stdout).not.toContain('okra-postgres');
    expect(stdout).toContain('profiles: ["capabilities"]');
    expect(stdout).toContain('okra-integrations');
    // The full stack creates the bridge network (attachable) so `docker compose up`
    // works without a pre-created external network; overlays attach as external.
    expect(stdout).toContain('attachable: true');
  });

  it('renders the checked-in Docker Compose capability service overlay', async () => {
    const stdout = await runCli(['self-host', 'compose', selfHostExampleRoot, '--mode', 'capabilities'], true);
    const expected = readFileSync(
      join(selfHostExampleRoot, 'docker-compose.capabilities.yml'),
      'utf-8',
    );

    expect(stdout.trimEnd()).toBe(expected.trimEnd());
    expect(stdout).toContain('name: okrapdf-capabilities');
    expect(stdout).toContain('external: true');
    expect(stdout).toContain(
      '["node", "packages/okrapdf/dist/cli/bin.js", "capability", "serve", "parser.mineru"',
    );
  });

  it('renders the checked-in Docker Compose external integrations overlay', async () => {
    const stdout = await runCli(['self-host', 'compose', selfHostExampleRoot, '--mode', 'integrations'], true);
    const expected = readFileSync(
      join(selfHostExampleRoot, 'docker-compose.integrations.yml'),
      'utf-8',
    );

    expect(stdout.trimEnd()).toBe(expected.trimEnd());
    expect(stdout).toContain('name: okrapdf-integrations');
    expect(stdout).toContain('image: n8nio/n8n:latest');
    expect(stdout).toContain('OKRA_N8N_WEBHOOK_SECRET');
  });

  it('emits structured self-host compose artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'compose', selfHostExampleRoot, '--mode', 'networks'], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const services = result.services as unknown[];
    const networks = result.networks as unknown[];
    const volumes = result.volumes as unknown[];
    const commands = result.commands as string[];

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host compose');
    expect(result.object).toBe('self_host_compose_artifact');
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('networks');
    expect(services).toHaveLength(5);
    expect(networks).toHaveLength(4);
    expect(volumes).toHaveLength(1);
    expect(commands).toContain(
      'docker network inspect okra-integrations >/dev/null 2>&1 || docker network create --attachable okra-integrations',
    );
  });

  it('emits launch prep commands for separated Compose overlays', async () => {
    const capabilityStdout = await runCli(['self-host', 'compose', selfHostExampleRoot, '--mode', 'capabilities'], false);
    const integrationStdout = await runCli(['self-host', 'compose', selfHostExampleRoot, '--mode', 'integrations'], false);
    const capabilityEnvelope = JSON.parse(capabilityStdout) as Record<string, unknown>;
    const integrationEnvelope = JSON.parse(integrationStdout) as Record<string, unknown>;
    const capabilityResult = capabilityEnvelope.result as Record<string, unknown>;
    const integrationResult = integrationEnvelope.result as Record<string, unknown>;

    expect(capabilityResult.mode).toBe('capabilities');
    expect(capabilityResult.commands).toEqual(expect.arrayContaining([
      'docker network inspect okra-capabilities >/dev/null 2>&1 || docker network create --internal okra-capabilities',
      'docker volume inspect okrapdf-self-host_okra-data >/dev/null 2>&1 || docker volume create okrapdf-self-host_okra-data',
    ]));
    expect(integrationResult.mode).toBe('integrations');
    expect(integrationResult.commands).toEqual([
      'docker network inspect okra-integrations >/dev/null 2>&1 || docker network create --attachable okra-integrations',
    ]);
  });

  it('renders Railway config-as-code for the public app service', async () => {
    const stdout = await runCli(['self-host', 'railway', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway.json'), 'utf-8'),
    ) as Record<string, unknown>;

    expect(JSON.parse(stdout)).toEqual(expected);
    expect(stdout).toContain('"builder": "DOCKERFILE"');
    expect(stdout).toContain('"healthcheckPath": "/health"');
  });

  it('renders Railway config-as-code for optional capability services', async () => {
    const stdout = await runCli([
      'self-host',
      'railway',
      selfHostExampleRoot,
      '--service',
      'okra-parser-mineru',
    ], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway.okra-parser-mineru.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const railwayJson = JSON.parse(stdout) as Record<string, unknown>;

    expect(railwayJson).toEqual(expected);
    expect(railwayJson).toMatchObject({
      build: {
        builder: 'DOCKERFILE',
        dockerfilePath: 'runtime/capability-images/parser-mineru/Dockerfile',
      },
      deploy: {
        startCommand: 'node packages/okrapdf/dist/cli/bin.js capability serve parser.mineru --host 0.0.0.0 --port 8080',
        healthcheckPath: '/health',
      },
    });
  });

  it('emits structured Railway config artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'railway', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const railwayJson = result.railwayJson as Record<string, unknown>;
    const templateChecklist = result.templateChecklist as string[];

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host railway');
    expect(result.object).toBe('self_host_railway_config_artifact');
    expect(result.ok).toBe(true);
    expect(result.configPath).toBe('railway.json');
    expect(railwayJson).toMatchObject({
      build: { builder: 'DOCKERFILE', dockerfilePath: 'runtime/Dockerfile' },
      deploy: { healthcheckPath: '/health', healthcheckTimeout: 300 },
    });
    expect(templateChecklist.some((item) => item.includes('okra-data'))).toBe(true);
    expect(templateChecklist.some((item) => item.includes('n8n as an external'))).toBe(true);
  });

  it('emits structured Railway config artifacts for named services', async () => {
    const stdout = await runCli([
      'self-host',
      'railway',
      selfHostExampleRoot,
      '--service',
      'okra-redactor-policy',
    ], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const service = result.service as Record<string, unknown>;
    const railwayJson = result.railwayJson as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.configPath).toBe('railway.okra-redactor-policy.json');
    expect(service.id).toBe('okra-redactor-policy');
    expect(railwayJson).toMatchObject({
      build: {
        dockerfilePath: 'runtime/capability-images/redactor-policy/Dockerfile',
      },
      deploy: {
        startCommand: 'node packages/okrapdf/dist/cli/bin.js capability serve redactor.policy.basic --host 0.0.0.0 --port 8080',
      },
    });
  });

  it('renders a Railway template composer handoff artifact', async () => {
    const stdout = await runCli(['self-host', 'template', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway-template.handoff.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const handoff = JSON.parse(stdout) as Record<string, unknown>;
    const services = handoff.services as Array<Record<string, unknown>>;
    const publication = handoff.publication as Record<string, unknown>;

    expect(handoff).toEqual(expected);
    expect(handoff).toMatchObject({
      object: 'railway_template_handoff',
      schema_version: 'okra-railway-template-handoff/v1',
      status: 'handoff_ready',
      deployButton: {
        state: 'pending_template_url',
        markdown: null,
      },
    });
    expect(publication.state).toBe('not_published');
    expect(services.map((service) => service.id)).toEqual([
      'okra-app',
      'okra-parser-mineru',
      'okra-auditor-wcag',
      'okra-redactor-policy',
    ]);
    expect(services.map((service) => service.configPath)).toEqual([
      'railway.json',
      'railway.okra-parser-mineru.json',
      'railway.okra-auditor-wcag.json',
      'railway.okra-redactor-policy.json',
    ]);
  });

  it('emits structured Railway template handoff artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'template', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const handoff = result.handoff as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host template');
    expect(result.object).toBe('self_host_railway_template_artifact');
    expect(result.ok).toBe(true);
    expect(handoff.object).toBe('railway_template_handoff');
    expect((handoff.docs as string[])).toEqual(expect.arrayContaining([
      'https://docs.railway.com/templates/create',
      'https://docs.railway.com/templates/publish-and-share',
    ]));
    // Filesystem-state runtime: no managed (Postgres) services in the handoff.
    expect(handoff.managedServices as Array<Record<string, unknown>>).toEqual([]);
  });

  it('renders a Railway template listing artifact', async () => {
    const stdout = await runCli(['self-host', 'template-listing', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway-template.listing.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const listing = JSON.parse(stdout) as Record<string, unknown>;
    const template = listing.template as Record<string, unknown>;
    const positioning = listing.positioning as string[];
    const references = listing.referenceTemplates as Array<Record<string, unknown>>;
    const prompts = listing.environmentPrompts as Record<string, unknown>;

    expect(listing).toEqual(expected);
    expect(listing).toMatchObject({
      object: 'railway_template_listing',
      schema_version: 'okra-railway-template-listing/v1',
      status: 'listing_ready',
    });
    expect(template.slug).toBe('okrapdf-self-host-runtime');
    expect(template.tagline).toContain('Postiz for PDFs');
    expect(positioning.join(' ')).toContain('Cloudflare-compatible hosting');
    expect(positioning.join(' ')).toContain('Docker lanes separate');
    expect(references.map((reference) => reference.name)).toEqual([
      'Postiz',
      'Stirling PDF',
      'MinerU',
      'n8n',
      'n8n workers',
      'PostHog',
    ]);
    expect(prompts.requiredSecrets).toEqual(expect.arrayContaining([
      'OKRA_API_KEY',
    ]));
  });

  it('emits structured Railway template listing artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'template-listing', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const listing = result.listing as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host template-listing');
    expect(result.object).toBe('self_host_railway_template_listing_artifact');
    expect(result.ok).toBe(true);
    expect(listing.object).toBe('railway_template_listing');
  });

  it('renders a Docker network handoff artifact', async () => {
    const stdout = await runCli(['self-host', 'network-plan', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'docker-network.handoff.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const handoff = JSON.parse(stdout) as Record<string, unknown>;
    const networks = handoff.networks as Array<Record<string, unknown>>;
    const separatedLaunches = handoff.separatedLaunches as Array<Record<string, unknown>>;

    expect(handoff).toEqual(expected);
    expect(handoff).toMatchObject({
      object: 'docker_network_handoff',
      schema_version: 'okra-docker-network-handoff/v1',
      status: 'handoff_ready',
    });
    expect(networks.map((network) => network.id)).toEqual([
      'okra-edge',
      'okra-core',
      'okra-capabilities',
      'okra-integrations',
    ]);
    expect(networks.find((network) => network.id === 'okra-capabilities')).toMatchObject({
      internal: true,
      owner: 'compose_stack_or_operator_created',
    });
    expect(networks.find((network) => network.id === 'okra-integrations')).toMatchObject({
      external: true,
      attachable: true,
      owner: 'operator_created',
    });
    expect(separatedLaunches.map((launch) => launch.id)).toEqual([
      'capability-services',
      'external-integrations',
    ]);
  });

  it('emits structured Docker network handoff artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'network-plan', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const handoff = result.handoff as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host network-plan');
    expect(result.object).toBe('self_host_docker_network_handoff_artifact');
    expect(result.ok).toBe(true);
    expect(handoff.object).toBe('docker_network_handoff');
  });

  it('renders a Railway template publication evidence scaffold artifact', async () => {
    const stdout = await runCli(['self-host', 'template-evidence', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway-template.evidence.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const evidence = JSON.parse(stdout) as Record<string, unknown>;

    expect(evidence).toEqual(expected);
    expect(evidence).toMatchObject({
      object: 'railway_template_publication_evidence',
      schema_version: 'okra-railway-template-publication-evidence/v1',
      status: 'pending',
      templateUrl: null,
      readiness: {
        eligible: false,
      },
    });
    expect(evidence.serviceConfigFiles).toEqual([
      'railway.json',
      'railway.okra-parser-mineru.json',
      'railway.okra-auditor-wcag.json',
      'railway.okra-redactor-policy.json',
    ]);
    expect(evidence.requiredChecks).toEqual([
      'template_url_published',
      'deploy_button_ready',
      'service_config_paths_attached',
      'required_env_documented',
      'public_app_networking_configured',
    ]);
  });

  it('emits structured Railway template publication evidence artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'template-evidence', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const evidence = result.evidence as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host template-evidence');
    expect(result.object).toBe('self_host_railway_template_publication_evidence_artifact');
    expect(result.ok).toBe(true);
    expect(evidence.object).toBe('railway_template_publication_evidence');
  });

  it('renders a capability implementation handoff artifact', async () => {
    const stdout = await runCli(['self-host', 'implementations', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'capability-implementations.handoff.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const handoff = JSON.parse(stdout) as Record<string, unknown>;
    const implementations = handoff.implementations as Array<Record<string, unknown>>;
    const summary = handoff.summary as Record<string, unknown>;

    expect(handoff).toEqual(expected);
    expect(handoff).toMatchObject({
      object: 'capability_implementations_handoff',
      schema_version: 'okra-capability-implementations-handoff/v1',
      status: 'handoff_ready',
    });
    expect(summary.implementations).toBe(3);
    expect(summary.starterAdapters).toBe(3);
    expect(implementations.map((implementation) => implementation.capabilityRef)).toEqual([
      'parser.mineru',
      'auditor.wcag.basic',
      'redactor.policy.basic',
    ]);
    expect(implementations.every((implementation) =>
      (implementation.networkRefs as string[]).includes('okra-capabilities'),
    )).toBe(true);
  });

  it('emits structured capability implementation handoff artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'implementations', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const handoff = result.handoff as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host implementations');
    expect(result.object).toBe('self_host_capability_implementations_artifact');
    expect(result.ok).toBe(true);
    expect(handoff.object).toBe('capability_implementations_handoff');
  });

  it('renders a capability promotion evidence scaffold artifact', async () => {
    const stdout = await runCli(['self-host', 'capability-evidence', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'capability-promotion.evidence.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const evidence = JSON.parse(stdout) as Record<string, unknown>;
    const capabilities = evidence.capabilities as Array<Record<string, unknown>>;
    const readiness = evidence.readiness as Record<string, unknown>;

    expect(evidence).toEqual(expected);
    expect(evidence).toMatchObject({
      object: 'capability_promotion_evidence',
      schema_version: 'okra-capability-promotion-evidence/v1',
      status: 'pending',
    });
    expect(readiness.eligible).toBe(false);
    expect(capabilities.map((capability) => capability.capabilityRef)).toEqual([
      'parser.mineru',
      'auditor.wcag.basic',
      'redactor.policy.basic',
    ]);
    expect(capabilities[0].requiredChecks).toEqual([
      'image_published',
      'capability_health',
      'capability_run_smoke',
      'graph_contract_output',
      'private_network_route',
    ]);
  });

  it('emits structured capability promotion evidence artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'capability-evidence', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const evidence = result.evidence as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host capability-evidence');
    expect(result.object).toBe('self_host_capability_promotion_evidence_artifact');
    expect(result.ok).toBe(true);
    expect(evidence.object).toBe('capability_promotion_evidence');
  });

  it('renders a Railway publish evidence bundle scaffold artifact', async () => {
    const stdout = await runCli(['self-host', 'evidence-bundle', selfHostExampleRoot], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway-publish.evidence.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const evidenceBundle = JSON.parse(stdout) as Record<string, unknown>;
    const evidence = evidenceBundle.evidence as Record<string, Record<string, unknown>>;

    expect(evidenceBundle).toEqual(expected);
    expect(evidenceBundle).toMatchObject({
      object: 'railway_publish_evidence_bundle',
      schema_version: 'okra-railway-publish-evidence-bundle/v1',
      status: 'pending',
      readiness: {
        eligible: false,
      },
    });
    expect(evidenceBundle.evidencePaths).toMatchObject({
      templatePublication: 'railway-template.evidence.json',
      capabilityPromotion: 'capability-promotion.evidence.json',
      liveDeploySmoke: 'railway-smoke.evidence.json',
    });
    expect(evidence.templatePublication.passed).toBe(false);
    expect(evidence.capabilityPromotion.passed).toBe(false);
    expect(evidence.liveDeploySmoke.passed).toBe(false);
  });

  it('emits structured Railway publish evidence bundle artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'evidence-bundle', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const evidenceBundle = result.evidenceBundle as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host evidence-bundle');
    expect(result.object).toBe('self_host_railway_publish_evidence_bundle_artifact');
    expect(result.ok).toBe(true);
    expect(evidenceBundle.object).toBe('railway_publish_evidence_bundle');
  });

  it('renders a Railway publish pack artifact', async () => {
    const stdout = await runCli([
      'self-host',
      'publish-pack',
      selfHostExampleRoot,
      '--evidence-bundle',
      'railway-publish.evidence.json',
    ], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway-publish.pack.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const pack = JSON.parse(stdout) as Record<string, unknown>;
    const railway = pack.railway as Record<string, unknown>;
    const docker = pack.docker as Record<string, unknown>;
    const publication = pack.publication as Record<string, unknown>;
    const serviceConfigFiles = railway.serviceConfigFiles as Array<Record<string, unknown>>;
    const composeFiles = docker.composeFiles as Array<Record<string, unknown>>;

    expect(pack).toEqual(expected);
    expect(pack).toMatchObject({
      object: 'railway_publish_pack',
      schema_version: 'okra-railway-publish-pack/v1',
      status: 'pack_ready',
      publication: {
        state: 'blocked_external_evidence',
      },
    });
    expect(serviceConfigFiles.map((file) => file.configPath)).toEqual([
      'railway.json',
      'railway.okra-parser-mineru.json',
      'railway.okra-auditor-wcag.json',
      'railway.okra-redactor-policy.json',
    ]);
    expect(composeFiles.map((file) => file.path)).toEqual([
      'docker-compose.yml',
      'docker-compose.capabilities.yml',
      'docker-compose.integrations.yml',
      'docker-compose.networks.yml',
    ]);
    expect(docker.organization).toBe('separated_compose_overlays');
    expect(publication.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('template_publication'),
      expect.stringContaining('model_backed_capabilities'),
      expect.stringContaining('live_deploy_smoke'),
    ]));
  });

  it('emits structured Railway publish pack artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'publish-pack', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const pack = result.pack as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host publish-pack');
    expect(result.object).toBe('self_host_railway_publish_pack_artifact');
    expect(result.ok).toBe(true);
    expect(pack.object).toBe('railway_publish_pack');
    expect((pack.artifacts as Array<Record<string, unknown>>).map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        'railway-publish.pack.json',
        'railway-publish.evidence.json',
        'railway-template.listing.json',
        'railway-template.evidence.json',
        'capability-promotion.evidence.json',
        'railway.okra-parser-mineru.json',
        'runtime/capability-images/parser-mineru/Dockerfile',
      ]),
    );
  });

  it('renders a Railway publish-readiness artifact', async () => {
    const stdout = await runCli([
      'self-host',
      'readiness',
      selfHostExampleRoot,
      '--evidence-bundle',
      'railway-publish.evidence.json',
    ], true);
    const expected = JSON.parse(
      readFileSync(join(selfHostExampleRoot, 'railway-publish.readiness.json'), 'utf-8')
        .replaceAll('/workspace/okra', repoRoot),
    ) as Record<string, unknown>;
    const readiness = JSON.parse(stdout) as Record<string, unknown>;
    const gates = readiness.gates as Array<Record<string, unknown>>;

    expect(readiness).toEqual(expected);
    expect(readiness).toMatchObject({
      object: 'railway_publish_readiness',
      schema_version: 'okra-railway-publish-readiness/v1',
      status: 'blocked',
      publishable: false,
    });
    expect(gates.map((gate) => gate.id)).toEqual(expect.arrayContaining([
      'first_owner_bootstrap',
      'capability_implementation_handoff',
      'template_publication',
      'model_backed_capabilities',
      'live_deploy_smoke',
    ]));
    const generatedArtifactsGate = gates.find((gate) => gate.id === 'generated_artifacts');
    expect(generatedArtifactsGate?.evidence).toEqual(expect.arrayContaining([
      'railway-template.listing.json: present',
      'railway-template.evidence.json: present',
      'railway-publish.evidence.json: present',
      'capability-promotion.evidence.json: present',
      'railway.okra-parser-mineru.json: present',
      'railway.okra-auditor-wcag.json: present',
      'railway.okra-redactor-policy.json: present',
      'runtime/capability-images/parser-mineru/Dockerfile: present',
      'runtime/capability-images/auditor-wcag/Dockerfile: present',
      'runtime/capability-images/redactor-policy/Dockerfile: present',
    ]));
    expect(gates.filter((gate) => gate.status === 'blocked').map((gate) => gate.id)).toEqual([
      'template_publication',
      'model_backed_capabilities',
      'live_deploy_smoke',
    ]);
  });

  it('emits structured Railway publish-readiness artifacts for agents', async () => {
    const stdout = await runCli(['self-host', 'readiness', selfHostExampleRoot], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const readiness = result.readiness as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('self-host readiness');
    expect(result.object).toBe('self_host_railway_publish_readiness_artifact');
    expect(result.ok).toBe(true);
    expect(readiness.object).toBe('railway_publish_readiness');
    expect(readiness.status).toBe('blocked');
    expect((readiness.blockers as string[])).toEqual(expect.arrayContaining([
      expect.stringContaining('template_publication'),
      expect.stringContaining('model_backed_capabilities'),
      expect.stringContaining('live_deploy_smoke'),
    ]));
  });

  it('can mark Railway publish readiness gates as ready from external evidence', async () => {
    const stdout = await runCli([
      'self-host',
      'readiness',
      selfHostExampleRoot,
      '--template-url',
      'https://railway.com/deploy/okrapdf',
      '--base-url',
      'https://okra-self-host.up.railway.app',
      '--model-backed',
      'parser.mineru,auditor.wcag.basic',
      '--smoke-passed',
    ], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const readiness = result.readiness as Record<string, unknown>;

    expect(readiness.status).toBe('ready');
    expect(readiness.publishable).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it('can mark Railway template publication ready from a template evidence file', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-template-evidence-'));
    const evidencePath = join(tmpRoot, 'railway-template.evidence.json');

    try {
      writeFileSync(evidencePath, JSON.stringify({
        object: 'railway_template_publication_evidence',
        schema_version: 'okra-railway-template-publication-evidence/v1',
        name: 'fixture',
        source_manifest: 'runtime.manifest.json',
        status: 'published',
        generated_at: '2026-01-01T00:00:00.000Z',
        templateUrl: 'https://railway.com/deploy/okrapdf',
        deployButtonMarkdown: '[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/okrapdf)',
        railwayProjectId: 'project_fixture',
        railwayTemplateId: 'template_fixture',
        serviceConfigFiles: [
          'railway.json',
          'railway.okra-parser-mineru.json',
          'railway.okra-auditor-wcag.json',
          'railway.okra-redactor-policy.json',
        ],
        passedChecks: [
          'template_url_published',
          'deploy_button_ready',
          'service_config_paths_attached',
          'required_env_documented',
          'public_app_networking_configured',
        ],
      }, null, 2));

      const stdout = await runCli([
        'self-host',
        'readiness',
        selfHostExampleRoot,
        '--template-evidence',
        evidencePath,
        '--base-url',
        'https://okra-self-host.up.railway.app',
        '--model-backed',
        'parser.mineru,auditor.wcag.basic',
        '--smoke-passed',
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;
      const readiness = result.readiness as Record<string, unknown>;
      const gates = readiness.gates as Array<Record<string, unknown>>;
      const templateGate = gates.find((gate) => gate.id === 'template_publication');

      expect(readiness.status).toBe('ready');
      expect(readiness.templateUrl).toBe('https://railway.com/deploy/okrapdf');
      expect(readiness.blockers).toEqual([]);
      expect(templateGate?.status).toBe('pass');
      expect(templateGate?.evidence).toEqual(expect.arrayContaining([
        expect.stringContaining(`templateEvidence=${evidencePath}`),
      ]));
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('can mark model-backed capabilities ready from a capability evidence file', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-capability-evidence-'));
    const evidencePath = join(tmpRoot, 'capability-promotion.evidence.json');
    const passedChecks = [
      'image_published',
      'capability_health',
      'capability_run_smoke',
      'graph_contract_output',
      'private_network_route',
    ];

    try {
      writeFileSync(evidencePath, JSON.stringify({
        object: 'capability_promotion_evidence',
        schema_version: 'okra-capability-promotion-evidence/v1',
        name: 'fixture',
        source_manifest: 'runtime.manifest.json',
        status: 'passed',
        generated_at: '2026-01-01T00:00:00.000Z',
        capabilities: [
          {
            capabilityRef: 'parser.mineru',
            serviceId: 'okra-parser-mineru',
            targetStatus: 'model_backed',
            status: 'passed',
            protocol: 'okra-capability-http/v1',
            endpointPath: '/v1/capability-runs',
            imageRef: 'ghcr.io/okrapdf/okra-parser-mineru:0.1.0',
            imageDigest: 'sha256:parserfixture',
            sourceRevision: null,
            passedChecks,
          },
          {
            capabilityRef: 'auditor.wcag.basic',
            serviceId: 'okra-auditor-wcag',
            targetStatus: 'policy_backed',
            status: 'passed',
            protocol: 'okra-capability-http/v1',
            endpointPath: '/v1/capability-runs',
            imageRef: 'ghcr.io/okrapdf/okra-auditor-wcag:0.1.0',
            imageDigest: 'sha256:auditorfixture',
            sourceRevision: null,
            passedChecks,
          },
        ],
      }, null, 2));

      const stdout = await runCli([
        'self-host',
        'readiness',
        selfHostExampleRoot,
        '--template-url',
        'https://railway.com/deploy/okrapdf',
        '--base-url',
        'https://okra-self-host.up.railway.app',
        '--capability-evidence',
        evidencePath,
        '--smoke-passed',
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;
      const readiness = result.readiness as Record<string, unknown>;
      const gates = readiness.gates as Array<Record<string, unknown>>;
      const modelBacked = gates.find((gate) => gate.id === 'model_backed_capabilities');

      expect(readiness.status).toBe('ready');
      expect(readiness.blockers).toEqual([]);
      expect(modelBacked?.status).toBe('pass');
      expect(modelBacked?.evidence).toEqual(expect.arrayContaining([
        expect.stringContaining(`capabilityEvidence=${evidencePath}`),
        expect.stringContaining('parser.mineru'),
        expect.stringContaining('auditor.wcag.basic'),
      ]));
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('can mark live deploy smoke ready from a smoke evidence file', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-smoke-evidence-'));
    const evidencePath = join(tmpRoot, 'railway-smoke.evidence.json');

    try {
      writeFileSync(evidencePath, JSON.stringify({
        object: 'self_host_smoke_evidence',
        schema_version: 'okra-self-host-smoke-evidence/v1',
        status: 'passed',
        generated_at: '2026-01-01T00:00:00.000Z',
        base_url: 'https://okra-self-host.up.railway.app',
        document_id: 'doc-smoke-ready',
        workflow: 'both',
        readiness: {
          eligible: true,
          reason: 'fixture',
          required_checks: ['health', 'status', 'upload', 'parse', 'audit', 'redact', 'graph', 'open'],
          passed_checks: ['health', 'status', 'upload', 'parse', 'audit', 'redact', 'graph', 'open'],
          failed_checks: [],
        },
        smoke: {
          object: 'self_host_smoke',
          ok: true,
          base_url: 'https://okra-self-host.up.railway.app',
          document_id: 'doc-smoke-ready',
          workflow: 'both',
          checks: ['health', 'status', 'upload', 'parse', 'audit', 'redact', 'graph', 'open'].map((name) => ({
            name,
            status: 'passed',
          })),
        },
      }, null, 2));

      const stdout = await runCli([
        'self-host',
        'readiness',
        selfHostExampleRoot,
        '--template-url',
        'https://railway.com/deploy/okrapdf',
        '--model-backed',
        'parser.mineru,auditor.wcag.basic',
        '--smoke-evidence',
        evidencePath,
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;
      const readiness = result.readiness as Record<string, unknown>;
      const gates = readiness.gates as Array<Record<string, unknown>>;
      const liveSmoke = gates.find((gate) => gate.id === 'live_deploy_smoke');

      expect(readiness.status).toBe('ready');
      expect(readiness.deploymentBaseUrl).toBe('https://okra-self-host.up.railway.app');
      expect(readiness.blockers).toEqual([]);
      expect(liveSmoke?.status).toBe('pass');
      expect(liveSmoke?.evidence).toEqual(expect.arrayContaining([
        expect.stringContaining(`smokeEvidence=${evidencePath}`),
      ]));
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('can consume a publish evidence bundle with bundle-relative evidence paths', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-publish-evidence-bundle-'));
    const evidenceBundlePath = join(tmpRoot, 'railway-publish.evidence.json');
    const templateChecks = [
      'template_url_published',
      'deploy_button_ready',
      'service_config_paths_attached',
      'required_env_documented',
      'public_app_networking_configured',
    ];
    const capabilityChecks = [
      'image_published',
      'capability_health',
      'capability_run_smoke',
      'graph_contract_output',
      'private_network_route',
    ];
    const smokeChecks = ['health', 'status', 'upload', 'parse', 'audit', 'redact', 'graph', 'open'];

    try {
      writeFileSync(join(tmpRoot, 'railway-template.evidence.json'), JSON.stringify({
        object: 'railway_template_publication_evidence',
        status: 'published',
        templateUrl: 'https://railway.com/deploy/okrapdf',
        passedChecks: templateChecks,
      }, null, 2));
      writeFileSync(join(tmpRoot, 'capability-promotion.evidence.json'), JSON.stringify({
        object: 'capability_promotion_evidence',
        status: 'passed',
        capabilities: [
          {
            capabilityRef: 'parser.mineru',
            targetStatus: 'model_backed',
            status: 'passed',
            protocol: 'okra-capability-http/v1',
            imageRef: 'ghcr.io/okrapdf/okra-parser-mineru:0.1.0',
            imageDigest: 'sha256:parserfixture',
            passedChecks: capabilityChecks,
          },
          {
            capabilityRef: 'redactor.policy.basic',
            targetStatus: 'policy_backed',
            status: 'passed',
            protocol: 'okra-capability-http/v1',
            imageRef: 'ghcr.io/okrapdf/okra-redactor-policy:0.1.0',
            imageDigest: 'sha256:redactorfixture',
            passedChecks: capabilityChecks,
          },
        ],
      }, null, 2));
      writeFileSync(join(tmpRoot, 'railway-smoke.evidence.json'), JSON.stringify({
        object: 'self_host_smoke_evidence',
        status: 'passed',
        smoke: {
          object: 'self_host_smoke',
          ok: true,
          base_url: 'https://okra-self-host.up.railway.app',
          workflow: 'both',
          checks: smokeChecks.map((name) => ({ name, status: 'passed' })),
        },
      }, null, 2));
      writeFileSync(evidenceBundlePath, JSON.stringify({
        object: 'railway_publish_evidence_bundle',
        schema_version: 'okra-railway-publish-evidence-bundle/v1',
        status: 'ready',
        evidencePaths: {
          templatePublication: 'railway-template.evidence.json',
          capabilityPromotion: 'capability-promotion.evidence.json',
          liveDeploySmoke: 'railway-smoke.evidence.json',
        },
      }, null, 2));

      const stdout = await runCli([
        'self-host',
        'readiness',
        selfHostExampleRoot,
        '--evidence-bundle',
        evidenceBundlePath,
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;
      const readiness = result.readiness as Record<string, unknown>;
      const gates = readiness.gates as Array<Record<string, unknown>>;
      const templateGate = gates.find((gate) => gate.id === 'template_publication');
      const modelBacked = gates.find((gate) => gate.id === 'model_backed_capabilities');
      const liveSmoke = gates.find((gate) => gate.id === 'live_deploy_smoke');

      expect(readiness.status).toBe('ready');
      expect(readiness.templateUrl).toBe('https://railway.com/deploy/okrapdf');
      expect(readiness.deploymentBaseUrl).toBe('https://okra-self-host.up.railway.app');
      expect(readiness.blockers).toEqual([]);
      expect(templateGate?.evidence).toEqual(expect.arrayContaining([
        expect.stringContaining(`evidenceBundle=${evidenceBundlePath}`),
      ]));
      expect(modelBacked?.status).toBe('pass');
      expect(liveSmoke?.status).toBe('pass');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('okra CLI agent-first output', () => {
  it('defaults to a JSON envelope when stdout is not a TTY', async () => {
    const stdout = await runCli(['context', 'resolve', '--offline', 'earnings-release-pl-table'], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('context resolve');
    expect(envelope.cost).toEqual({ usd: null });
    expect(envelope.citations).toEqual(expect.any(Array));
    expect(envelope.next_actions).toEqual(expect.any(Array));
    expect((envelope.next_actions as unknown[]).length).toBeGreaterThan(0);

    const result = envelope.result as Record<string, unknown>;
    expect(result.object).toBe('pdf_source');
    expect(result.source_id).toBe('src_demo_earnings_q4_2025');
  });

  it('keeps human output for interactive TTY users', async () => {
    const stdout = await runCli(['context', 'resolve', '--offline', 'earnings-release-pl-table'], true);

    expect(stdout).toContain('Northwind Systems Q4 2025 Earnings Release');
    expect(stdout).toContain('source_id: src_demo_earnings_q4_2025');
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('lets explicit -o table override piped stdout detection', async () => {
    const stdout = await runCli(['-o', 'table', 'context', 'resolve', '--offline', 'earnings-release-pl-table'], false);

    expect(stdout).toContain('Northwind Systems Q4 2025 Earnings Release');
    expect(stdout).toContain('source_id: src_demo_earnings_q4_2025');
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('lets explicit -o json override TTY detection', async () => {
    const stdout = await runCli(['-o', 'json', 'context', 'fixtures'], true);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('context fixtures');
    expect(envelope.result).toEqual(expect.any(Array));
    expect(envelope.next_actions).toEqual(expect.any(Array));
  });

  it('keeps piped workflow examples as raw reusable JSON artifacts', async () => {
    const stdout = await runCli(['workflows', 'example', 'parsebench_chart_numeric_eval'], false);
    const definition = JSON.parse(stdout) as Record<string, unknown>;

    expect(definition.ok).toBeUndefined();
    expect(definition.id).toBe('parsebench-chart-numeric-eval');
    expect(definition.steps).toEqual(expect.any(Array));
  });

  it('still envelopes workflow examples when JSON output is explicit', async () => {
    const stdout = await runCli(['--json', 'workflows', 'example', 'parsebench_chart_numeric_eval'], true);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('workflows example');
    expect(envelope.result).toMatchObject({ id: 'parsebench-chart-numeric-eval' });
  });

  it('envelopes the workflow step-building guide for agents', async () => {
    const stdout = await runCli(['workflows', 'steps'], false);
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    const result = envelope.result as Record<string, unknown>;
    const primitives = result.primitives as Array<Record<string, unknown>>;

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('workflows steps');
    expect(result.object).toBe('dynamic_workflow_steps_guide');
    expect((result.execution_model as Record<string, unknown>).unit).toBe('versioned_workflow_definition');
    expect(primitives.map((primitive) => primitive.kind)).toEqual(['ocr', 'gate', 'code', 'vlm']);
    expect(nextActionCommands(envelope)).toEqual([
      'okra workflows example parsebench_chart_numeric_eval > workflow.json',
      'okra workflows build workflow.json --json',
    ]);
  });

  it('keeps extract JSON results citation-stable and accepts whitespace-prefixed inline schemas', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify({
        id: 'chatcmpl-extract',
        choices: [
          {
            message: {
              content: JSON.stringify({ vendor: 'Northwind', total: 42 }),
            },
          },
        ],
        // #505: with --cite the server returns the Anthropic-shaped grounded
        // citation array in meta.citations (no field_citations map).
        meta: {
          confidence: 1,
          model: 'kimi-k2p5',
          durationMs: 15,
          citations: [
            {
              type: 'page_location',
              field: 'vendor',
              cited_text: 'Northwind total 42',
              start_page_number: 7,
              end_page_number: 7,
              bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
              block_id: 'node_vendor',
              match: 'exact',
            },
          ],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli([
        '--json',
        'extract',
        'doc-extract123',
        '--cite',
        '--schema',
        '  {"type":"object","properties":{"vendor":{"type":"string"},"total":{"type":"number"}}}',
      ], true);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://api.example.test/document/doc-extract123/chat/completions');
      expect(calls[0]?.body).toMatchObject({
        response_format: {
          type: 'json_schema',
        },
      });
      // --cite threads the opt-in header to the server.
      expect(calls[0]?.headers['x-okra-cite']).toBe('true');
      expect(envelope.command).toBe('extract');
      // Human envelope renders the grounded citation (Anthropic vocab).
      expect(envelope.citations).toContain('page 7: Northwind total 42');
      expect(result).toMatchObject({
        doc_id: 'doc-extract123',
        data: { vendor: 'Northwind', total: 42 },
      });
      // #592: extract emits the canonical `document_id` alongside the back-compat
      // `doc_id`, so the `upload → extract` chain reads the same id field name.
      expect(result.document_id).toBe('doc-extract123');
      expect(result.document_id).toBe(result.doc_id);
      // No field_citations map — one Anthropic-shaped citations array, surfaced verbatim.
      expect(result).not.toHaveProperty('field_citations');
      expect(result.citations).toEqual([
        {
          type: 'page_location',
          field: 'vendor',
          cited_text: 'Northwind total 42',
          start_page_number: 7,
          end_page_number: 7,
          bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
          block_id: 'node_vendor',
          match: 'exact',
        },
      ]);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('extract with a missing schema file emits a stable invalid_schema envelope (not a raw ENOENT)', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    // The schema is loaded before any network call, so a missing file must fail
    // fast with a clean envelope — fetch must NOT be reached.
    const fetchMock: typeof fetch = async () => {
      throw new Error('network must not be called when schema load fails');
    };
    // handleError writes the envelope to stdout then process.exit(1); stub exit
    // so parseAsync resolves and runCli can return the captured stdout.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);
      const stdout = await runCli([
        '--json', 'extract', 'doc-existing12345', '--schema', '/nonexistent/definitely-not-here.json',
      ], true);
      const env = JSON.parse(stdout) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(env.command).toBe('extract');
      expect(env.error).toBe('invalid_schema'); // stable code, not 'error'
      expect(env.code).toBe(400); // not exit-code 1
      expect(String(env.message)).toContain('Schema file not found');
      expect(Array.isArray(env.next_actions) && (env.next_actions as unknown[]).length).toBeTruthy();
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('render with a missing source file emits a stable source_not_found envelope (not a raw ENOENT)', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    // The source file is checked before any render request, so a missing file
    // must fail fast with a clean envelope — fetch must NOT be reached.
    const fetchMock: typeof fetch = async () => {
      throw new Error('network must not be called when the render source is missing');
    };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);
      const stdout = await runCli([
        '--json', 'render', '/nonexistent/definitely-not-here.html', '-o', '/tmp/okra-render-test.pdf',
      ], true);
      const env = JSON.parse(stdout) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(env.error).toBe('source_not_found'); // stable code, not the generic 'error'
      expect(env.code).toBe(400); // not exit-code 1
      expect(String(env.message)).toContain('Render source file not found');
      expect(Array.isArray(env.next_actions) && (env.next_actions as unknown[]).length).toBeTruthy();
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('render with an existing source but unresolvable mode emits structured envelopes (not raw Errors)', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    // All three checks fire after the existsSync gate but before any render
    // request, so fetch must never run. Each must produce a stable code + 400 +
    // next_actions, not the generic error:"error"/code:1 of a bare Error.
    const fetchMock: typeof fetch = async () => {
      throw new Error('network must not be called when the render mode is invalid');
    };
    const dir = mkdtempSync(join(tmpdir(), 'okra-render-mode-'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);

      // .js source with no --mode → ambiguous_render_mode
      const jsPath = join(dir, 'codemode.js');
      writeFileSync(jsPath, 'export default async () => ({});');
      let env = JSON.parse(await runCli(['--json', 'render', jsPath, '-o', join(dir, 'a.pdf')], true)) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(env.error).toBe('ambiguous_render_mode');
      expect(env.code).toBe(400);
      expect((env.next_actions as unknown[]).length).toBeTruthy();

      // unknown extension with no --mode → unknown_render_mode
      const mdPath = join(dir, 'notes.md');
      writeFileSync(mdPath, '# hi');
      env = JSON.parse(await runCli(['--json', 'render', mdPath, '-o', join(dir, 'b.pdf')], true)) as Record<string, unknown>;
      expect(env.error).toBe('unknown_render_mode');
      expect(env.code).toBe(400);

      // designed (.json) + --save → unsupported_render_option
      const jsonPath = join(dir, 'spec.json');
      writeFileSync(jsonPath, '{"pages":[]}');
      env = JSON.parse(await runCli(['--json', 'render', jsonPath, '--save', '-o', join(dir, 'c.pdf')], true)) as Record<string, unknown>;
      expect(env.error).toBe('unsupported_render_option');
      expect(env.code).toBe(400);
    } finally {
      exitSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('parse with an unavailable --engine returns available_engines + a recovery next_action', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    // The engine is validated client-side before any request — fetch must NOT run.
    const fetchMock: typeof fetch = async () => {
      throw new Error('network must not be called when the engine is invalid');
    };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);
      const stdout = await runCli([
        '--json', 'parse', 'doc-existing12345', '--engine', 'bogus-engine-xyz',
      ], true);
      const env = JSON.parse(stdout) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(env.error).toBe('engine_not_available'); // stable code, not 'INVALID_REQUEST'/human string
      const engines = env.available_engines as unknown[];
      expect(Array.isArray(engines) && engines.length).toBeTruthy(); // the agent can now pick a valid one
      expect(engines).toContain('llamaparse');
      const cmds = ((env.next_actions as Array<{ cmd?: unknown }> | undefined) ?? []).map((a) => String(a.cmd ?? ''));
      expect(cmds.some((c) => c.includes('--engine'))).toBe(true);
      // The recovery cmds must be directly runnable: substitute the REAL doc id,
      // not a literal `<doc-id>` placeholder the agent would have to fill in.
      expect(cmds.some((c) => c.includes('okra parse doc-existing12345'))).toBe(true);
      expect(cmds.every((c) => !c.includes('<doc-id>'))).toBe(true);
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('routes a Commander usage error (missing required arg) through the JSON envelope under --json', async () => {
    // `context ask <question...>` requires the question; Commander throws a
    // missingArgument error that normally writes only to stderr + exits 1. Under
    // --json an agent parsing stdout must still get the { ok:false, error, code,
    // next_actions } contract.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      program.setOptionValue('json', undefined);
      resetOutputContext();
      await runProgram(['node', 'okra', '--json', 'context', 'ask']);
      const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
      const env = JSON.parse(stdout) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(env.error).toBe('invalid_usage'); // stable code, not empty stdout
      expect(env.code).toBe(400); // not the bare exit code 1
      expect(String(env.message).toLowerCase()).toContain('question');
      const cmds = ((env.next_actions as Array<{ cmd?: unknown }> | undefined) ?? []).map((a) => String(a.cmd ?? ''));
      expect(cmds.some((c) => c.includes('--help'))).toBe(true);
    } finally {
      exitSpy.mockRestore();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      resetOutputContext();
    }
  });

  it('lets --version pass through runProgram without an error envelope (exitCode 0)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await runProgram(['node', 'okra', '--version']);
      const stdout = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(stdout).not.toContain('"ok":false'); // version is informational, not an error
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      resetOutputContext();
    }
  });

  it('context get without --source-id emits a stable source_required envelope with recovery actions', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    // The source id is resolved before any network call, so a missing one must
    // fail fast with the structured { error, code, next_actions } envelope — not
    // a bare Error that renders as error:"error", code:1, empty next_actions.
    const fetchMock: typeof fetch = async () => {
      throw new Error('network must not be called when the source id is missing');
    };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);
      const stdout = await runCli(['--json', 'context', 'get', 'termination clause'], true);
      const env = JSON.parse(stdout) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(String(env.command)).toContain('context');
      expect(env.error).toBe('source_required'); // stable code, not the generic 'error'
      expect(env.code).toBe(400); // not exit-code 1
      expect(String(env.message)).toContain('--source-id');
      const cmds = ((env.next_actions as Array<{ cmd?: unknown }> | undefined) ?? []).map((a) => String(a.cmd ?? ''));
      expect(cmds.length).toBeTruthy(); // the agent gets a recovery path, not a dead end
      expect(cmds.some((c) => c.includes('okra documents list'))).toBe(true);
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('content-types list returns the registered content types (local, no network)', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock: typeof fetch = async () => { throw new Error('content-types list must not hit the network'); };
    try {
      vi.stubGlobal('fetch', fetchMock);
      const env = JSON.parse(await runCli(['--json', 'content-types', 'list'], true)) as Record<string, unknown>;
      expect(env.ok).toBe(true);
      expect(env.command).toBe('content-types list');
      const result = env.result as { content_types: Array<{ id: string; cli_noun: string; citation_required: boolean }> };
      const invoice = result.content_types.find((c) => c.id === 'invoice');
      expect(invoice).toMatchObject({ id: 'invoice', cli_noun: 'invoice', citation_required: true });
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('content-types show <id> returns the manifest, and an unknown id is a not_found envelope', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock: typeof fetch = async () => { throw new Error('content-types show must not hit the network'); };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      vi.stubGlobal('fetch', fetchMock);
      const shown = JSON.parse(await runCli(['--json', 'content-types', 'show', 'invoice'], true)) as Record<string, unknown>;
      expect(shown.ok).toBe(true);
      expect((shown.result as { id: string }).id).toBe('invoice');
      expect((shown.result as { schema?: unknown }).schema).toBeDefined();

      const missing = JSON.parse(await runCli(['--json', 'content-types', 'show', 'nope'], true)) as Record<string, unknown>;
      expect(missing.ok).toBe(false);
      expect(missing.error).toBe('not_found');
      expect(missing.code).toBe(404);
      expect(Array.isArray(missing.next_actions) && (missing.next_actions as unknown[]).length).toBeTruthy();
    } finally {
      exitSpy.mockRestore();
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('extract --content-type invoice supplies the manifest schema and forces grounding', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const fetchMock: typeof fetch = async (_input, init) => {
      calls.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify({
        id: 'chatcmpl-ct',
        choices: [{ message: { content: JSON.stringify({ invoice_no: '123' }) } }],
        meta: { citations: [] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);
      // commander's shared `program` retains --schema across parses; clear it so
      // a prior test's --schema doesn't trip the content-type/schema conflict.
      const ext = program.commands.find((c) => c.name() === 'extract');
      ext?.setOptionValue('schema', undefined);
      // No --schema and no --cite: the content type supplies both.
      await runCli(['--json', 'extract', 'doc-existing12345', '--content-type', 'invoice'], true);
      expect(calls).toHaveLength(1);
      // The invoice manifest's schema reached the server (line_items is invoice-specific).
      expect(JSON.stringify(calls[0].body)).toContain('line_items');
      // Grounding is forced by the manifest's evidence policy — no --cite passed.
      expect(calls[0].headers['x-okra-cite']).toBe('true');
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('invoice extract supplies the manifest schema and forces grounding', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const fetchMock: typeof fetch = async (_input, init) => {
      calls.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify({
        id: 'chatcmpl-ct-noun',
        choices: [{ message: { content: JSON.stringify({ invoice_no: '123' }) } }],
        meta: { citations: [] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const rootExtract = program.commands.find((c) => c.name() === 'extract');
    const invoiceExtract = program.commands.find((c) => c.name() === 'invoice')?.commands.find((c) => c.name() === 'extract');
    const reset = () => {
      rootExtract?.setOptionValue('schema', undefined);
      invoiceExtract?.setOptionValue('schema', undefined);
      invoiceExtract?.setOptionValue('cite', undefined);
      invoiceExtract?.setOptionValue('prompt', undefined);
      invoiceExtract?.setOptionValue('wait', undefined);
    };
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);
      reset();
      const stdout = await runCli(['invoice', 'extract', 'doc-existing12345', '--json'], true);
      expect(calls).toHaveLength(1);
      expect(JSON.stringify(calls[0].body)).toContain('line_items');
      expect(calls[0].headers['x-okra-cite']).toBe('true');
      // The generated noun must be enveloped exactly like `extract` — command
      // "extract" (not "invoice") and the same extract next_actions, not empty.
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      expect(envelope.command).toBe('extract');
      expect(Array.isArray(envelope.next_actions) && (envelope.next_actions as unknown[]).length).toBeTruthy();
    } finally {
      reset();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('invoice help lists the extract subcommand', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      const stdout = await runCli(['invoice', '--help'], true);
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('extract');
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('extract rejects --content-type + --schema together', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock: typeof fetch = async () => { throw new Error('must not hit the network on a bad --content-type'); };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);
      const conflict = JSON.parse(await runCli(['--json', 'extract', 'doc-x', '--content-type', 'invoice', '--schema', '/tmp/s.json'], true)) as Record<string, unknown>;
      expect(conflict.ok).toBe(false);
      expect(conflict.error).toBe('invalid_request');
      expect(conflict.code).toBe(400);
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('extract with an unknown --content-type is a not_found envelope', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock: typeof fetch = async () => { throw new Error('must not hit the network on a bad --content-type'); };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);
      // Clear any --schema retained on the shared commander program from a prior test.
      program.commands.find((c) => c.name() === 'extract')?.setOptionValue('schema', undefined);
      const unknown = JSON.parse(await runCli(['--json', 'extract', 'doc-x', '--content-type', 'nope'], true)) as Record<string, unknown>;
      expect(unknown.ok).toBe(false);
      expect(unknown.error).toBe('not_found');
      expect(unknown.code).toBe(404);
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('collections extract has --content-type/clean-schema parity with single-doc extract', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock: typeof fetch = async () => { throw new Error('collections extract must not hit the network on a bad schema/content-type'); };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    const collExtract = program.commands.find((c) => c.name() === 'collections')?.commands.find((s) => s.name() === 'extract');
    const reset = () => { collExtract?.setOptionValue('schema', undefined); collExtract?.setOptionValue('contentType', undefined); };
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      vi.stubGlobal('fetch', fetchMock);

      // Missing schema file → invalid_schema (was a raw ENOENT leaking as error:"error").
      reset();
      const badSchema = JSON.parse(await runCli(['--json', 'collections', 'extract', 'col-x', '--schema', '/nonexistent/nope.json'], true)) as Record<string, unknown>;
      expect(badSchema.error).toBe('invalid_schema');
      expect(badSchema.code).toBe(400);

      // Neither --schema nor --content-type → schema_required.
      reset();
      const neither = JSON.parse(await runCli(['--json', 'collections', 'extract', 'col-x'], true)) as Record<string, unknown>;
      expect(neither.error).toBe('schema_required');

      // Unknown --content-type → not_found (shared resolver with single-doc extract).
      reset();
      const unknown = JSON.parse(await runCli(['--json', 'collections', 'extract', 'col-x', '--content-type', 'nope'], true)) as Record<string, unknown>;
      expect(unknown.error).toBe('not_found');
    } finally {
      reset();
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('reports auth status as local-only JSON unless validation is requested', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test/';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['--json', 'auth', 'status'], true);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope.command).toBe('auth status');
      expect(result).toMatchObject({
        object: 'auth_status',
        authenticated: true,
        validated: false,
        base_url: 'https://api.example.test',
        api_key: {
          configured: true,
          masked: 'okra_test_..._key',
          source: 'environment variable (OKRA_API_KEY)',
        },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('validates auth status only when --validate is present', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        authenticated: true,
        user_id: 'user_123',
        key_id: 'key_123',
        key_name: 'CLI Key',
        key_type: 'secret',
        scope: '*',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test/';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['--json', 'auth', 'status', '--validate'], true);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.example.test/auth/verify');
      expect(result).toMatchObject({
        object: 'auth_status',
        authenticated: true,
        validated: true,
        user_id: 'user_123',
        key_name: 'CLI Key',
        scope: '*',
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('returns a structured doctor report and normalizes --base-url', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const originalFetch = globalThis.fetch;
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-doctor-ok-'));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/verify')) {
        return new Response(JSON.stringify({
          authenticated: true,
          user_id: 'user_123',
          key_id: 'key_123',
          key_name: 'CLI Key',
          key_type: 'secret',
          scope: '*',
          scoped_orgs: [],
          scoped_projects: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === 'https://registry.npmjs.org/@okrapdf/cli/latest') {
        return new Response(JSON.stringify({ version: packageJson.version }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'unexpected URL' }), { status: 404 });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://ignored.example.test';
      process.env.XDG_CONFIG_HOME = tmpRoot;
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['--json', 'doctor', '--base-url', 'https://api.example.test/'], true);
      const report = JSON.parse(stdout) as Record<string, unknown>;
      const checks = report.checks as Array<Record<string, unknown>>;

      expect(report).toMatchObject({
        object: 'doctor_report',
        ok: true,
        command: 'doctor',
        base_url: 'https://api.example.test',
      });
      expect(checks.map((check) => check.id)).toEqual(['config', 'auth', 'api_reachability', 'cli_version']);
      expect(checks.every((check) => check.status === 'ok')).toBe(true);
      expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
        'https://api.example.test/auth/verify',
        'https://api.example.test/health',
        'https://registry.npmjs.org/@okrapdf/cli/latest',
      ]);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      restoreEnv('XDG_CONFIG_HOME', originalXdgConfigHome);
      vi.stubGlobal('fetch', originalFetch);
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('runs doctor without an API key and keeps version-check failures non-fatal', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const originalFetch = globalThis.fetch;
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-doctor-no-key-'));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === 'https://registry.npmjs.org/@okrapdf/cli/latest') {
        throw new Error('registry offline');
      }
      return new Response(JSON.stringify({ error: 'unexpected URL' }), { status: 404 });
    });

    try {
      delete process.env.OKRA_API_KEY;
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      process.env.XDG_CONFIG_HOME = tmpRoot;
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['--json', 'doctor'], true);
      const report = JSON.parse(stdout) as Record<string, unknown>;
      const checks = report.checks as Array<Record<string, unknown>>;
      const auth = checks.find((check) => check.id === 'auth');
      const version = checks.find((check) => check.id === 'cli_version');

      expect(report.ok).toBe(false);
      expect(auth).toMatchObject({
        status: 'fail',
        data: { authenticated: false },
      });
      expect(version).toMatchObject({
        status: 'unknown',
      });
      expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
        'https://api.example.test/health',
        'https://registry.npmjs.org/@okrapdf/cli/latest',
      ]);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      restoreEnv('XDG_CONFIG_HOME', originalXdgConfigHome);
      vi.stubGlobal('fetch', originalFetch);
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('builds workflow step definitions into hosted agent-workflow source', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-workflow-build-'));
    const workflowPath = join(tmpRoot, 'workflow.json');

    try {
      writeFileSync(workflowPath, JSON.stringify({
        id: 'invoice-check',
        name: 'Invoice check',
        steps: [
          {
            id: 'parse_pages',
            kind: 'ocr',
            provider: 'mineru',
            outputs: ['markdown', 'tables', 'bbox', 'json'],
          },
          {
            id: 'has_tables',
            kind: 'gate',
            needs: ['parse_pages'],
            condition: {
              type: 'json_path_exists',
              stepId: 'parse_pages',
              path: '$.tables[0]',
            },
          },
          {
            id: 'normalize_totals',
            kind: 'code',
            needs: ['parse_pages', 'has_tables'],
            runtime: 'javascript',
            code: 'return normalizeNumbers(inputs.parse_pages);',
          },
          {
            id: 'extract_answer',
            kind: 'vlm',
            needs: ['normalize_totals'],
            model: 'qwen-vl',
            prompt: 'Extract total revenue.',
          },
        ],
      }));

      const stdout = await runCli(['workflows', 'build', workflowPath], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;
      const result = envelope.result as Record<string, unknown>;
      const source = String(result.agent_workflow_source ?? '');

      expect(envelope.ok).toBe(true);
      expect(envelope.command).toBe('workflows build');
      expect(result.object).toBe('dynamic_workflow_build');
      expect(result.validation).toMatchObject({ ok: true });
      expect(result.source_path).toBe(workflowPath);
      expect(source).toContain('label: "parse_pages"');
      expect(source).toContain('label: "extract_answer"');
      expect(nextActionCommands(envelope)).toEqual([
        `okra workflows run ${workflowPath} --dry-run --json`,
      ]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('prefers aggregate collection summary cost before row costs', () => {
    const envelope = wrapMachineOutput('collections query', {
      results: [
        {
          doc_id: 'doc_1',
          status: 'fulfilled',
          answer: 'One row',
          cost_usd: 0.01,
          duration_ms: 12,
        },
      ],
      summary: {
        completed: 2,
        failed: 0,
        total_cost_usd: 0.37,
      },
    });

    expect(envelope.cost).toEqual({ usd: 0.37 });
  });

  it('extract WITHOUT citations leads next_actions with a --cite re-run nudge', () => {
    const envelope = wrapMachineOutput('extract', {
      document_id: 'doc-abc123',
      doc_id: 'doc-abc123',
      data: { vendor: 'Acme', total: 42 },
    });
    const cmds = nextActionCommands(envelope);
    // First suggestion grounds the values via the differentiator.
    expect(cmds[0]).toBe('okra extract doc-abc123 --schema ./schema.json --cite');
    expect(cmds.some((c) => c.includes('context get'))).toBe(true);
  });

  it('extract WITH citations does not nudge --cite (already grounded)', () => {
    const envelope = wrapMachineOutput('extract', {
      document_id: 'doc-abc123',
      doc_id: 'doc-abc123',
      data: { vendor: 'Acme' },
      citations: [{ type: 'page_location', field: 'vendor', cited_text: 'Acme', start_page_number: 1, end_page_number: 1, citation_url: 'https://res.okrapdf.com/x', match: 'exact' }],
    });
    const cmds = nextActionCommands(envelope);
    expect(cmds.some((c) => c.includes('--cite'))).toBe(false);
    expect(cmds.some((c) => c.includes('context get'))).toBe(true);
  });

  it('routes top-level ask source/question through the context ask path', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({
        object: 'pdf_answer',
        source_id: 'src_earnings',
        question: 'Which page has the P/L table?',
        answer: 'The P/L table is on page 6.',
        citations: [
          {
            page: 6,
            citation_url: 'https://res.okrapdf.com/src_earnings/page/6',
          },
        ],
        confidence: 0.91,
        follow_up_sections: ['earnings-income-statement'],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['ask', 'src_earnings', 'Which page has the P/L table?'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        url: 'https://api.example.test/v1/context/ask',
        body: {
          source_id: 'src_earnings',
          question: 'Which page has the P/L table?',
        },
      });
      expect(envelope.command).toBe('ask');
      expect(envelope.result).toMatchObject({
        object: 'pdf_answer',
        source_id: 'src_earnings',
        answer: 'The P/L table is on page 6.',
      });
      expect(nextActionCommands(envelope)).toEqual(['okra context structure src_earnings']);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('keeps legacy ask --doc and chat --doc on the document chat path', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({
        id: 'chatcmpl-test',
        choices: [
          {
            message: { content: 'Revenue increased.' },
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const askStdout = await runCli(['ask', 'Summarize this document', '--doc', 'doc-legacy-ask'], false);
      const chatStdout = await runCli(['chat', 'Summarize this document', '--doc', 'doc-legacy-chat'], false);
      const askEnvelope = JSON.parse(askStdout) as Record<string, unknown>;
      const chatEnvelope = JSON.parse(chatStdout) as Record<string, unknown>;

      expect(calls.map((call) => call.url)).toEqual([
        'https://api.example.test/document/doc-legacy-ask/chat/completions',
        'https://api.example.test/document/doc-legacy-chat/chat/completions',
      ]);
      expect(calls[0]?.body).toMatchObject({
        messages: [{ role: 'user', content: 'Summarize this document' }],
      });
      expect(calls[1]?.body).toMatchObject({
        messages: [{ role: 'user', content: 'Summarize this document' }],
      });
      expect(askEnvelope).toMatchObject({
        command: 'ask',
        result: { docId: 'doc-legacy-ask', answer: 'Revenue increased.' },
      });
      expect(chatEnvelope).toMatchObject({
        command: 'chat',
        result: { docId: 'doc-legacy-chat', answer: 'Revenue increased.' },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('envelopes piped collection aliases with canonical next actions', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const fetchMock = vi.fn(async () =>
      new Response([
        JSON.stringify({ type: 'start', query_id: 'qry_123', prompt: 'Revenue?', doc_count: 1 }),
        JSON.stringify({
          type: 'result',
          query_id: 'qry_123',
          doc_id: 'doc_1',
          status: 'fulfilled',
          answer: 'Revenue increased.',
          usage: { cost_usd: 0.01 },
          duration_ms: 10,
          data: { collection: 'earnings' },
        }),
        JSON.stringify({ type: 'done', query_id: 'qry_123', completed: 1, failed: 0, total_cost_usd: 0.19 }),
        '',
      ].join('\n'), {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }));
    const originalFetch = globalThis.fetch;

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['col', 'query', 'earnings', 'Revenue?'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(envelope.ok).toBe(true);
      expect(envelope.command).toBe('collections query');
      expect(envelope.cost).toEqual({ usd: 0.19 });
      expect(nextActionCommands(envelope)).toEqual(['okra collections export earnings --flat']);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('refuses public collection publish without an explicit rights confirmation', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();

    try {
      delete process.env.OKRA_API_KEY;
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['collections', 'publish', 'earnings'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope).toMatchObject({
        ok: false,
        command: 'collections publish',
        error: 'confirmation_required',
        code: 400, // every failure envelope carries a numeric code, not null
        gate: {
          id: 'public_publish_rights',
          confirm_flag: '--confirm-rights',
        },
      });
      expect(nextActionCommands(envelope)).toEqual([
        'okra collections publish earnings --confirm-rights',
      ]);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('publishes collections only after rights confirmation is explicit', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['collections', 'publish', 'earnings', '--confirm-rights'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.example.test/v1/collections/earnings');
      expect(envelope).toMatchObject({
        ok: true,
        command: 'collections publish',
        result: {
          ok: true,
          visibility: 'public',
          collection: 'earnings',
        },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('refuses audit attestation as a human review gate before calling the API', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();

    try {
      delete process.env.OKRA_API_KEY;
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['audit', 'doc-attest', '--attest'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope).toMatchObject({
        ok: false,
        command: 'audit',
        error: 'human_review_required',
        code: 400, // every failure envelope carries a numeric code, not null
        state: 'audited',
        gate: {
          id: 'audit_attestation',
          kind: 'human_attestation',
        },
      });
      expect(nextActionCommands(envelope)).toEqual(['okra open doc-attest --view audit']);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('creates a document.parse job from documents reparse', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({
        object: 'job',
        id: 'job_reparse_123',
        type: 'document.parse',
        status: 'queued',
        document_id: 'doc-abcdefghijkl',
        status_url: '/v1/jobs/job_reparse_123',
      }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['documents', 'reparse', 'doc-abcdefghijkl'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(calls).toEqual([
        {
          url: 'https://api.example.test/v1/jobs',
          body: {
            type: 'document.parse',
            document_id: 'doc-abcdefghijkl',
          },
        },
      ]);
      expect(envelope).toMatchObject({
        command: 'documents reparse',
        result: {
          object: 'job',
          id: 'job_reparse_123',
          type: 'document.parse',
          document_id: 'doc-abcdefghijkl',
        },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it.each([
    ['contradicted', 'The invoice total is $400'],
    ['not_visible', 'The invoice includes payment terms'],
  ])('prints a documents verify envelope with context next_actions for %s verdicts', async (verdict, claim) => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({
        verdict,
        page: 2,
        bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        evidence_snippet: verdict === 'contradicted' ? 'Total: $300' : '',
        page_image_url: 'https://res.okrapdf.com/v1/documents/doc-abcdefghijkl/pg_2.png',
        confidence: verdict === 'contradicted' ? 0.9 : 0.6,
        model: 'qwen/test',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli([
        'documents',
        'verify',
        'doc-abcdefghijkl',
        claim,
        '--page',
        '2',
        '--bbox',
        '{"x":0.1,"y":0.2,"w":0.3,"h":0.4}',
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(calls).toEqual([
        {
          url: 'https://api.example.test/v1/documents/doc-abcdefghijkl/verify',
          body: {
            claim,
            page: 2,
            bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
          },
        },
      ]);
      expect(envelope).toMatchObject({
        ok: true,
        command: 'documents verify',
        result: {
          verdict,
          page: 2,
          document_id: 'doc-abcdefghijkl',
          claim,
        },
        next_actions: expect.any(Array),
      });
      expect(nextActionCommands(envelope)).toContain(
        `okra context get ${JSON.stringify(claim)} --source-id doc-abcdefghijkl`,
      );
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('omits documents verify context next_actions when the verdict is supported', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      verdict: 'supported',
      page: 1,
      bbox: null,
      evidence_snippet: 'Total: $300',
      page_image_url: 'https://res.okrapdf.com/v1/documents/doc-abcdefghijkl/pg_1.png',
      confidence: 0.9,
      model: 'qwen/test',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli([
        'documents',
        'verify',
        'doc-abcdefghijkl',
        'The invoice total is $300',
        '--page',
        '1',
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(envelope).toMatchObject({
        ok: true,
        command: 'documents verify',
        result: {
          verdict: 'supported',
          page: 1,
          document_id: 'doc-abcdefghijkl',
          claim: 'The invoice total is $300',
        },
        next_actions: [],
      });
      expect(nextActionCommands(envelope)).toEqual([]);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('refuses unknown --engine values before creating a parse job', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      await runCli(['parse', 'doc-abcdefghijkl', '--engine', 'not-a-real-engine'], false);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('creates a document.parse job from parse --model/--prompt', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
      });
      return new Response(JSON.stringify({
        object: 'job',
        id: 'job_parse_profile_123',
        type: 'document.parse',
        status: 'queued',
        document_id: 'doc-abcdefghijkl',
        model: 'gemini-3-flash-preview',
        prompt_id: 'layout-bbox-gemini-multipage',
        prompt_version: 1,
        confidence_kind: 'vlm_self_reported',
        cost_usd: 0.003,
        status_url: '/v1/jobs/job_parse_profile_123',
      }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli([
        'parse',
        'doc-abcdefghijkl',
        '--model',
        'gemini-3-flash',
        '--prompt',
        'layout-bbox-gemini-multipage@1',
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        url: 'https://api.example.test/v1/jobs',
        body: {
          type: 'document.parse',
          document_id: 'doc-abcdefghijkl',
          parser: {
            id: 'gemini-3-flash-minimal',
            options: {
              model: 'gemini-3-flash',
              prompt: 'layout-bbox-gemini-multipage@1',
            },
          },
          parser_profile: {
            id: 'gemini-3-flash-minimal',
            model: 'gemini-3-flash-preview',
            prompt_id: 'layout-bbox-gemini-multipage',
            prompt_version: 1,
            confidence_kind: 'vlm_self_reported',
          },
        },
      });
      expect(envelope).toMatchObject({
        command: 'parse',
        cost: { usd: 0.003 },
        result: {
          id: 'job_parse_profile_123',
          model: 'gemini-3-flash-preview',
          prompt_id: 'layout-bbox-gemini-multipage',
          prompt_version: 1,
          confidence_kind: 'vlm_self_reported',
          cost_usd: 0.003,
        },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('refuses non-executable parser profiles instead of stamping fiction (#431)', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      await runCli([
        'parse',
        'doc-abcdefghijkl',
        '--model',
        'gemini-3-flash',
        '--prompt',
        'layout-bbox-parsebench@1',
      ], false);

      // The hard contract: refused BEFORE any network call, server-class exit.
      // (The JSON failure envelope now goes to stdout; message/profile-list
      // content is covered by the schemas registry tests.)
      expect(fetchMock).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('resolves deprecated --engine aliases through parser profiles', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {},
      });
      return new Response(JSON.stringify({
        object: 'job',
        id: 'job_reparse_profile_123',
        type: 'document.parse',
        status: 'queued',
        document_id: 'doc-abcdefghijkl',
        status_url: '/v1/jobs/job_reparse_profile_123',
      }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      await runCli(['documents', 'reparse', 'doc-abcdefghijkl', '--engine', 'gemini-vision'], false);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        url: 'https://api.example.test/v1/jobs',
        body: {
          type: 'document.parse',
          document_id: 'doc-abcdefghijkl',
          parser: { id: 'gemini-3-flash-minimal' },
          parser_profile: {
            id: 'gemini-3-flash-minimal',
            model: 'gemini-3-flash-preview',
            prompt_id: 'layout-bbox-gemini-multipage',
            prompt_version: 1,
            confidence_kind: 'vlm_self_reported',
          },
        },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('waits on the latest document.parse job when jobs wait receives a document id', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const seenUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      seenUrls.push(url);
      if (url.includes('/v1/jobs?')) {
        return new Response(JSON.stringify({
          object: 'list',
          data: [
            {
              object: 'job',
              id: 'job_latest_parse',
              type: 'document.parse',
              status: 'running',
              document_id: 'doc-abcdefghijkl',
            },
          ],
          has_more: false,
          next_cursor: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        object: 'job',
        id: 'job_latest_parse',
        type: 'document.parse',
        status: 'completed',
        document_id: 'doc-abcdefghijkl',
        model: 'gemini-3-flash-preview',
        prompt_id: 'layout-bbox-gemini-multipage',
        prompt_version: 1,
        confidence_kind: 'vlm_self_reported',
        cost_usd: 0.006,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['jobs', 'wait', 'doc-abcdefghijkl', '--timeout', '1'], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(seenUrls).toEqual([
        'https://api.example.test/v1/jobs?type=document.parse&document_id=doc-abcdefghijkl&limit=1',
        'https://api.example.test/v1/jobs/job_latest_parse',
      ]);
      expect(envelope).toMatchObject({
        command: 'jobs wait',
        cost: { usd: 0.006 },
        result: {
          object: 'job',
          id: 'job_latest_parse',
          status: 'completed',
          document_id: 'doc-abcdefghijkl',
          model: 'gemini-3-flash-preview',
          prompt_id: 'layout-bbox-gemini-multipage',
          prompt_version: 1,
          confidence_kind: 'vlm_self_reported',
          cost_usd: 0.006,
        },
      });
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('surfaces the failure reason + recovery next_actions when jobs wait hits a failed parse (#465)', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        object: 'job',
        id: 'job_failed_1',
        type: 'document.parse',
        status: 'failed',
        document_id: 'doc-abcdefghijkl',
        error_code: 'auth_failure',
        error: 'Gemini API error 403: API_KEY_SERVICE_BLOCKED',
        user_message: 'OCR provider rejected the request (auth_failure).',
        recovery_hint: { action: 'create_job', job_type: 'document.parse' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    // handleError writes the envelope to stdout then process.exit(2); stub exit
    // so parseAsync resolves and runCli can return the captured stdout.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => undefined) as never));
    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli(['--json', 'jobs', 'wait', 'job_failed_1', '--timeout', '1'], true);
      const env = JSON.parse(stdout) as Record<string, unknown>;
      expect(env.ok).toBe(false);
      expect(env.command).toBe('jobs wait');
      // The actual reason is in the message now (was a bare "ended with status failed").
      expect(String(env.message)).toContain('OCR provider rejected the request');
      // error_code is hoisted to the top level so agents can branch on a stable code.
      expect(env.error_code).toBe('auth_failure');
      // Concrete recovery actions, not the loop-inducing recovery_hint.
      const actions = env.next_actions as Array<{ cmd: string }>;
      expect(actions.some((a) => a.cmd === 'okra jobs get job_failed_1')).toBe(true);
      expect(actions.some((a) => a.cmd === 'okra parse doc-abcdefghijkl')).toBe(true);
      // The full job stays in details for `--json` consumers / `okra jobs get`.
      expect((env.details as Record<string, unknown>).status).toBe('failed');
    } finally {
      exitSpy.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('creates a document subscription and emits a matched-node envelope from documents wait-for', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });

      if (url === 'https://api.example.test/v1/documents/doc-abcdefghijkl/subscriptions') {
        return new Response(JSON.stringify({
          object: 'document_subscription',
          document_id: 'doc-abcdefghijkl',
          subscription_id: 'sub-1',
          status: 'active',
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://api.example.test/v1/documents/doc-abcdefghijkl/subscriptions/sub-1/wait?timeout=120') {
        return new Response(JSON.stringify({
          object: 'document_subscription_wait',
          document_id: 'doc-abcdefghijkl',
          subscription_id: 'sub-1',
          status: 'matched',
          matched: true,
          matches: [
            {
              node_id: 'node-1',
              page: 2,
              value_excerpt: 'Table of contents',
              bbox: { x: 1, y: 2, w: 3, h: 4 },
              bbox_source: 'node',
            },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: 'unexpected', url }), { status: 500 });
    });

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';
      vi.stubGlobal('fetch', fetchMock);

      const stdout = await runCli([
        'documents',
        'wait-for',
        'doc-abcdefghijkl',
        '--match',
        'table of contents',
        '--timeout',
        '120',
      ], false);
      const envelope = JSON.parse(stdout) as Record<string, unknown>;

      expect(calls).toEqual([
        {
          url: 'https://api.example.test/v1/documents/doc-abcdefghijkl/subscriptions',
          method: 'POST',
          body: { match: 'table of contents', kind: 'fts' },
        },
        {
          url: 'https://api.example.test/v1/documents/doc-abcdefghijkl/subscriptions/sub-1/wait?timeout=120',
          method: 'GET',
          body: undefined,
        },
      ]);
      expect(envelope).toMatchObject({
        ok: true,
        command: 'documents wait-for',
        result: {
          object: 'document_subscription_match',
          document_id: 'doc-abcdefghijkl',
          subscription_id: 'sub-1',
          status: 'matched',
          matched_nodes: [
            {
              node_id: 'node-1',
              page: 2,
              value_excerpt: 'Table of contents',
              bbox: { x: 1, y: 2, w: 3, h: 4 },
              bbox_source: 'node',
            },
          ],
        },
      });
      expect(nextActionCommands(envelope)).toEqual([
        'okra documents read doc-abcdefghijkl --pages 2',
        'okra context get "<target context>" --source-id doc-abcdefghijkl',
      ]);
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('does not suggest document chat for file and job URL results', async () => {
    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;

    try {
      process.env.OKRA_API_KEY = 'okra_test_key';
      process.env.OKRA_BASE_URL = 'https://api.example.test';

      const fileEnvelope = JSON.parse(await runCli(['files', 'url', 'file_123'], false)) as Record<string, unknown>;
      const jobEnvelope = JSON.parse(await runCli(['jobs', 'events', 'job_123'], false)) as Record<string, unknown>;

      expect(fileEnvelope.command).toBe('files url');
      expect(fileEnvelope.result).toMatchObject({ object: 'file_url', id: 'file_123' });
      expect(nextActionCommands(fileEnvelope)).toEqual(['okra files get file_123']);
      expect(nextActionCommands(fileEnvelope).join('\n')).not.toContain('chat');
      expect(nextActionCommands(fileEnvelope).join('\n')).not.toContain('--doc');

      expect(jobEnvelope.command).toBe('jobs events');
      expect(jobEnvelope.result).toMatchObject({ object: 'job_events_url', id: 'job_123' });
      expect(nextActionCommands(jobEnvelope)).toEqual(['okra jobs get job_123']);
      expect(nextActionCommands(jobEnvelope).join('\n')).not.toContain('chat');
      expect(nextActionCommands(jobEnvelope).join('\n')).not.toContain('--doc');
    } finally {
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
    }
  });
});

describe('upload stdin hygiene (#391)', () => {
  // Scripted batches (`jq -c ... | while read -r t; do okra upload "$pdf"; done`)
  // died when upload touched fd 0 — the CLI must never read stdin unless the
  // source argument is '-'.
  it('okra upload <file> never attaches to process.stdin', async () => {
    const { createServer } = await import('http');
    const server = createServer((req, res) => {
      if (req.method === 'POST' && /^\/document\/[^/]+\/upload$/.test(req.url ?? '')) {
        req.resume();
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ phase: 'uploading' }));
        });
        return;
      }
      if (req.method === 'GET' && (req.url ?? '').startsWith('/v1/jobs')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ object: 'list', data: [], has_more: false, next_cursor: null }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const port = (server.address() as { port: number }).port;

    const tmpRoot = mkdtempSync(join(tmpdir(), 'okra-stdin-test-'));
    const pdfPath = join(tmpRoot, 'tiny.pdf');
    writeFileSync(pdfPath, '%PDF-1.4\n%%EOF\n');

    const originalApiKey = process.env.OKRA_API_KEY;
    const originalBaseUrl = process.env.OKRA_BASE_URL;
    process.env.OKRA_API_KEY = 'okra_test_key';
    process.env.OKRA_BASE_URL = `http://127.0.0.1:${port}`;

    const stdinOn = vi.spyOn(process.stdin, 'on');
    const stdinAddListener = vi.spyOn(process.stdin, 'addListener');
    const stdinResume = vi.spyOn(process.stdin, 'resume');
    const stdinPipe = vi.spyOn(process.stdin, 'pipe');
    const stdinAsyncIterator = vi.spyOn(
      process.stdin as unknown as { [Symbol.asyncIterator](): AsyncIterator<unknown> },
      Symbol.asyncIterator as never,
    );

    try {
      const out = await runCli(['upload', pdfPath, '--no-wait', '--json'], false);
      const envelope = JSON.parse(out) as Record<string, unknown>;
      expect(envelope.ok).toBe(true);
      expect((envelope.result as Record<string, unknown>).object).toBe('document_upload');

      expect(stdinOn).not.toHaveBeenCalled();
      expect(stdinAddListener).not.toHaveBeenCalled();
      expect(stdinResume).not.toHaveBeenCalled();
      expect(stdinPipe).not.toHaveBeenCalled();
      expect(stdinAsyncIterator).not.toHaveBeenCalled();
    } finally {
      stdinOn.mockRestore();
      stdinAddListener.mockRestore();
      stdinResume.mockRestore();
      stdinPipe.mockRestore();
      stdinAsyncIterator.mockRestore();
      restoreEnv('OKRA_API_KEY', originalApiKey);
      restoreEnv('OKRA_BASE_URL', originalBaseUrl);
      rmSync(tmpRoot, { recursive: true, force: true });
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });
});
