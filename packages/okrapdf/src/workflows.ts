import type { ProcessingCapabilities } from './types';

export type WorkflowPresetName =
  | 'default'
  | 'llamaparse_ocr'
  | 'parse_proxy_ocr'
  | 'docling_ocr';

export const DEFAULT_WORKFLOW_CAPABILITIES: ProcessingCapabilities = {
  vlm_qwen: false,
  structural_check: false,
  sandbox_verify: false,
  search: false,
};

export const WORKFLOW_PRESETS: Record<WorkflowPresetName, ProcessingCapabilities> = {
  default: { ...DEFAULT_WORKFLOW_CAPABILITIES },
  llamaparse_ocr: {
    vlm_qwen: false,
    structural_check: false,
    sandbox_verify: false,
    search: false,
    phases: {
      ocr: { vendor: 'llamaparse', enabled: true },
    },
  },
  parse_proxy_ocr: {
    vlm_qwen: false,
    structural_check: false,
    sandbox_verify: false,
    search: false,
    phases: {
      ocr: { vendor: 'parse-proxy', enabled: true },
    },
  },
  // Alias for teams routing Docling through parse-proxy-compatible HTTP endpoints.
  docling_ocr: {
    vlm_qwen: false,
    structural_check: false,
    sandbox_verify: false,
    search: false,
    phases: {
      ocr: { vendor: 'parse-proxy', enabled: true },
    },
  },
};

export type DynamicWorkflowStepKind = 'ocr' | 'gate' | 'code' | 'vlm';

export type DynamicWorkflowOutputKind =
  | 'text'
  | 'markdown'
  | 'layout'
  | 'bbox'
  | 'tables'
  | 'figures'
  | 'json';

export type DynamicWorkflowDatasetProvider =
  | 'huggingface'
  | 'okra'
  | 'local'
  | 'url';

export interface DynamicWorkflowDatasetRef {
  provider: DynamicWorkflowDatasetProvider;
  id: string;
  split?: string;
  revision?: string;
  documentColumn?: string;
  expectedColumn?: string;
  metadataColumns?: string[];
  sourceUrl?: string;
  license?: string;
}

export interface DynamicWorkflowStepBase {
  id: string;
  kind: DynamicWorkflowStepKind;
  label?: string;
  needs?: string[];
  metadata?: Record<string, unknown>;
}

export interface DynamicWorkflowOcrStep extends DynamicWorkflowStepBase {
  kind: 'ocr';
  provider: string;
  tier?: 'fast' | 'standard' | 'premium';
  pages?: string;
  outputs?: DynamicWorkflowOutputKind[];
  vendorOptions?: Record<string, unknown>;
}

export type DynamicWorkflowGateCondition =
  | {
      type: 'min_confidence';
      stepId: string;
      min: number;
      path?: string;
    }
  | {
      type: 'json_path_exists';
      stepId: string;
      path: string;
    }
  | {
      type: 'numeric_tolerance';
      stepId: string;
      expected: string | number;
      tolerance: number;
      path?: string;
    }
  | {
      type: 'expression';
      expression: string;
    };

export interface DynamicWorkflowGateStep extends DynamicWorkflowStepBase {
  kind: 'gate';
  condition: DynamicWorkflowGateCondition;
  onFail?: 'continue' | 'skip_item' | 'escalate' | 'fail_run';
}

export interface DynamicWorkflowCodeStep extends DynamicWorkflowStepBase {
  kind: 'code';
  runtime: 'javascript' | 'python';
  code: string;
  input?: Record<string, string>;
  timeoutMs?: number;
}

export interface DynamicWorkflowVlmStep extends DynamicWorkflowStepBase {
  kind: 'vlm';
  model: string;
  prompt: string;
  scope?: 'document' | 'page' | 'region' | 'table' | 'figure';
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  vendorOptions?: Record<string, unknown>;
}

export type DynamicWorkflowStep =
  | DynamicWorkflowOcrStep
  | DynamicWorkflowGateStep
  | DynamicWorkflowCodeStep
  | DynamicWorkflowVlmStep;

export type DynamicWorkflowEvalMetric =
  | {
      id: string;
      kind: 'exact_numeric';
      targetStepId: string;
      outputPath: string;
      expectedPath: string;
    }
  | {
      id: string;
      kind: 'numeric_tolerance';
      targetStepId: string;
      outputPath: string;
      expectedPath: string;
      tolerance: number;
    }
  | {
      id: string;
      kind: 'json_schema';
      targetStepId: string;
      schema: Record<string, unknown>;
    }
  | {
      id: string;
      kind: 'custom_code';
      targetStepId: string;
      runtime: 'javascript' | 'python';
      code: string;
    };

export interface DynamicWorkflowEvalConfig {
  dataset: DynamicWorkflowDatasetRef;
  metrics: DynamicWorkflowEvalMetric[];
  primaryMetricId?: string;
  maxItems?: number;
}

export interface DynamicWorkflowDefinition {
  object?: 'okra.dynamic_workflow';
  version?: '2026-06-08';
  id: string;
  name: string;
  description?: string;
  inputs?: Record<string, unknown>;
  steps: DynamicWorkflowStep[];
  eval?: DynamicWorkflowEvalConfig;
  metadata?: Record<string, unknown>;
}

export interface DynamicWorkflowValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stepKinds: Record<DynamicWorkflowStepKind, number>;
}

export interface DynamicWorkflowRunOptions {
  dataset?: DynamicWorkflowDatasetRef;
  inputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
  signal?: AbortSignal;
}

export interface DynamicWorkflowRun {
  id: string;
  object: 'workflow_eval_run' | 'workflow_run' | 'workflow_plan';
  status: 'planned' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  workflowId: string;
  dataset?: DynamicWorkflowDatasetRef;
  evalRunId?: string;
  summary?: Record<string, unknown>;
  eventsUrl?: string;
  resultsUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DynamicWorkflowRunListOptions {
  workflowId?: string;
  datasetId?: string;
  status?: DynamicWorkflowRun['status'];
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}

export interface DynamicWorkflowRunList {
  object: 'list';
  data: DynamicWorkflowRun[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface DynamicWorkflowExample {
  id: string;
  title: string;
  paperIds: string[];
  definition: DynamicWorkflowDefinition;
}

export interface DynamicWorkflowStepPrimitive {
  kind: DynamicWorkflowStepKind;
  purpose: string;
  required: string[];
  optional: string[];
  emits: string[];
  example: DynamicWorkflowStep;
  notes: string[];
}

export interface DynamicWorkflowBuildStepsGuide {
  object: 'dynamic_workflow_steps_guide';
  version: '2026-06-08';
  execution_model: {
    unit: 'versioned_workflow_definition';
    step_order: string;
    hosted_runtime: string;
    versioning: string;
  };
  primitives: DynamicWorkflowStepPrimitive[];
  usage: string[];
  example_workflow: DynamicWorkflowDefinition;
}

export interface DynamicWorkflowBuildResult {
  object: 'dynamic_workflow_build';
  version: '2026-06-08';
  workflow_id: string;
  name: string;
  source_path?: string;
  validation: DynamicWorkflowValidationResult;
  execution_model: DynamicWorkflowBuildStepsGuide['execution_model'];
  step_graph: Array<{
    id: string;
    kind: DynamicWorkflowStepKind;
    label?: string;
    needs: string[];
  }>;
  capabilities: ProcessingCapabilities | null;
  agent_workflow_source: string | null;
}

function countStepKinds(steps: DynamicWorkflowStep[]): Record<DynamicWorkflowStepKind, number> {
  return steps.reduce<Record<DynamicWorkflowStepKind, number>>(
    (counts, step) => {
      counts[step.kind] += 1;
      return counts;
    },
    { ocr: 0, gate: 0, code: 0, vlm: 0 },
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushMissing(errors: string[], label: string, value: unknown): void {
  if (!isNonEmptyString(value)) errors.push(`${label} is required`);
}

function validateStepReferences(
  step: DynamicWorkflowStep,
  knownStepIds: Set<string>,
  errors: string[],
): void {
  for (const dep of step.needs ?? []) {
    if (!knownStepIds.has(dep)) {
      errors.push(`step "${step.id}" depends on unknown prior step "${dep}"`);
    }
  }

  if (step.kind === 'gate' && 'stepId' in step.condition && !knownStepIds.has(step.condition.stepId)) {
    errors.push(`gate "${step.id}" condition references unknown prior step "${step.condition.stepId}"`);
  }
}

function validateStepShape(step: DynamicWorkflowStep, errors: string[], warnings: string[]): void {
  pushMissing(errors, 'step.id', step.id);

  if (step.kind === 'ocr') {
    pushMissing(errors, `ocr step "${step.id}".provider`, step.provider);
    if (!step.outputs?.length) {
      warnings.push(`ocr step "${step.id}" has no outputs; downstream gates may be under-specified`);
    }
    return;
  }

  if (step.kind === 'gate') {
    if (!step.condition) errors.push(`gate step "${step.id}" requires condition`);
    if (step.condition?.type === 'min_confidence' && step.condition.min > 1) {
      errors.push(`gate step "${step.id}" min_confidence must be between 0 and 1`);
    }
    return;
  }

  if (step.kind === 'code') {
    pushMissing(errors, `code step "${step.id}".code`, step.code);
    if (step.runtime !== 'javascript' && step.runtime !== 'python') {
      errors.push(`code step "${step.id}" runtime must be javascript or python`);
    }
    return;
  }

  if (step.kind === 'vlm') {
    pushMissing(errors, `vlm step "${step.id}".model`, step.model);
    pushMissing(errors, `vlm step "${step.id}".prompt`, step.prompt);
  }
}

/**
 * Validate the contract shape locally. Execution still belongs to the hosted
 * dynamic workflow runtime and its permissioned arsenal.
 */
export function validateDynamicWorkflow(
  definition: DynamicWorkflowDefinition,
): DynamicWorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  pushMissing(errors, 'workflow.id', definition.id);
  pushMissing(errors, 'workflow.name', definition.name);

  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push('workflow.steps must include at least one step');
  }
  // Coerce a non-array `steps` (e.g. a string/object from a malformed file) to []
  // BEFORE iterating/counting — `?? []` only catches null/undefined, so a string
  // would iterate per-character and crash countStepKinds' `.reduce`. validate
  // must report the error above, never throw an unhandled TypeError.
  const steps = Array.isArray(definition.steps) ? definition.steps : [];

  const stepIds = new Set<string>();
  for (const step of steps) {
    validateStepReferences(step, stepIds, errors);
    validateStepShape(step, errors, warnings);
    if (stepIds.has(step.id)) {
      errors.push(`duplicate step id "${step.id}"`);
    }
    stepIds.add(step.id);
  }

  if (definition.eval) {
    pushMissing(errors, 'eval.dataset.id', definition.eval.dataset?.id);
    if (!definition.eval.metrics.length) {
      errors.push('eval.metrics must include at least one metric');
    }
    for (const metric of definition.eval.metrics) {
      if (!stepIds.has(metric.targetStepId)) {
        errors.push(`eval metric "${metric.id}" targets unknown step "${metric.targetStepId}"`);
      }
    }
  }

  const stepKinds = countStepKinds(steps);
  if (stepKinds.ocr === 0) warnings.push('workflow has no ocr/parser step');
  if (stepKinds.gate === 0) warnings.push('workflow has no gate step');
  if (stepKinds.vlm === 0) warnings.push('workflow has no vlm step');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stepKinds,
  };
}

export function defineDynamicWorkflow(
  definition: DynamicWorkflowDefinition,
): DynamicWorkflowDefinition {
  const normalized: DynamicWorkflowDefinition = {
    object: 'okra.dynamic_workflow',
    version: '2026-06-08',
    ...definition,
  };
  const validation = validateDynamicWorkflow(normalized);
  if (!validation.ok) {
    throw new Error(`Invalid dynamic workflow: ${validation.errors.join('; ')}`);
  }
  return normalized;
}

export function dynamicWorkflowToCapabilities(
  definition: DynamicWorkflowDefinition,
): ProcessingCapabilities {
  const normalized = defineDynamicWorkflow(definition);
  const firstOcr = normalized.steps.find((step): step is DynamicWorkflowOcrStep => step.kind === 'ocr');
  const capabilities: ProcessingCapabilities = {
    vlm_qwen: normalized.steps.some((step) => step.kind === 'vlm'),
    structural_check: normalized.steps.some((step) => step.kind === 'gate'),
    sandbox_verify: normalized.steps.some((step) => step.kind === 'code'),
    search: true,
    workflow: {
      id: normalized.id,
      object: normalized.object,
      version: normalized.version,
      step_kinds: countStepKinds(normalized.steps),
    },
  };

  if (firstOcr) {
    capabilities.phases = {
      ocr: {
        vendor: firstOcr.provider,
        enabled: true,
        tier: firstOcr.tier,
      },
    };
  }

  if (normalized.eval) {
    capabilities.eval = {
      dataset: normalized.eval.dataset,
      metric_ids: normalized.eval.metrics.map((metric) => metric.id),
      primary_metric_id: normalized.eval.primaryMetricId,
    };
  }

  return capabilities;
}

function agentSchemaForDynamicStep(step: DynamicWorkflowStep): Record<string, unknown> {
  if (step.kind === 'vlm' && step.schema && typeof step.schema === 'object') {
    return step.schema;
  }

  if (step.kind === 'gate') {
    return {
      type: 'object',
      required: ['pass', 'reason'],
      properties: {
        pass: { type: 'boolean' },
        reason: { type: 'string' },
        confidence: { type: 'number' },
      },
    };
  }

  if (step.kind === 'code') {
    return {
      type: 'object',
      required: ['ok', 'result'],
      properties: {
        ok: { type: 'boolean' },
        result: {},
        errors: { type: 'array', items: { type: 'string' } },
      },
    };
  }

  return {
    type: 'object',
    required: ['ok', 'confidence', 'output'],
    properties: {
      ok: { type: 'boolean' },
      confidence: { type: 'number' },
      output: { type: 'object' },
      evidence: { type: 'array', items: { type: 'object' } },
    },
  };
}

function promptForDynamicStep(
  workflow: DynamicWorkflowDefinition,
  step: DynamicWorkflowStep,
): string {
  const needs = step.needs?.length ? step.needs.join(', ') : 'none';
  const base = [
    `Workflow: ${workflow.name} (${workflow.id}).`,
    `Primitive: ${step.kind} / ${step.id}.`,
    `Needs: ${needs}.`,
    'Use the workflow args dataset/input and prior labeled outputs. Return only JSON matching the schema.',
  ];

  if (step.kind === 'ocr') {
    base.push(
      `Run OCR/layout extraction with provider "${step.provider}".`,
      `Requested outputs: ${(step.outputs ?? ['text']).join(', ')}.`,
      step.pages ? `Pages: ${step.pages}.` : 'Pages: dataset item default.',
    );
  } else if (step.kind === 'gate') {
    base.push(
      `Evaluate gate condition: ${JSON.stringify(step.condition)}.`,
      `On failure policy: ${step.onFail ?? 'continue'}.`,
    );
  } else if (step.kind === 'code') {
    base.push(
      `Run deterministic ${step.runtime} code. Use execute_code if tool execution is needed.`,
      `Code:\n${step.code}`,
    );
  } else {
    base.push(
      `Run scoped VLM extraction with model "${step.model}" and scope "${step.scope ?? 'document'}".`,
      `Task prompt: ${step.prompt}`,
    );
  }

  return base.join('\n');
}

function evalAgentSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['metric_scores'],
    properties: {
      metric_scores: { type: 'object' },
      primary_metric: { type: 'string' },
      primary_score: { type: 'number' },
      items_scored: { type: 'number' },
      failures: { type: 'array', items: { type: 'object' } },
    },
  };
}

const DYNAMIC_WORKFLOW_EXECUTION_MODEL: DynamicWorkflowBuildStepsGuide['execution_model'] = {
  unit: 'versioned_workflow_definition',
  step_order: 'Steps run in declaration order unless `needs` names prior step ids; validation rejects forward or missing dependencies.',
  hosted_runtime: 'The CLI compiles typed OCR/gate/code/VLM steps into one hosted agent-workflow source with labeled phases and outputs keyed by step id.',
  versioning: 'A hosted workflow run is the durable/versioned unit; step ids remain stable addresses for logs, gates, eval metrics, and downstream outputs.',
};

export const DYNAMIC_WORKFLOW_STEP_PRIMITIVES: readonly DynamicWorkflowStepPrimitive[] = [
  {
    kind: 'ocr',
    purpose: 'Parse pages into text, markdown, layout nodes, tables, figures, bbox evidence, or provider JSON.',
    required: ['id', 'kind', 'provider'],
    optional: ['label', 'needs', 'tier', 'pages', 'outputs', 'vendorOptions', 'metadata'],
    emits: ['text', 'markdown', 'layout', 'bbox', 'tables', 'figures', 'json'],
    example: {
      id: 'parse_pages',
      kind: 'ocr',
      provider: 'mineru',
      tier: 'standard',
      outputs: ['markdown', 'tables', 'bbox', 'json'],
    },
    notes: [
      'Use one OCR step as the document grounding root.',
      'Provider-specific knobs belong in vendorOptions so the public step shape stays stable.',
    ],
  },
  {
    kind: 'gate',
    purpose: 'Evaluate a typed condition before spending more work or promoting a result.',
    required: ['id', 'kind', 'condition'],
    optional: ['label', 'needs', 'onFail', 'metadata'],
    emits: ['pass', 'reason', 'confidence'],
    example: {
      id: 'has_tables',
      kind: 'gate',
      needs: ['parse_pages'],
      condition: {
        type: 'json_path_exists',
        stepId: 'parse_pages',
        path: '$.tables[0]',
      },
      onFail: 'skip_item',
    },
    notes: [
      'Gates are the cheap review/checkpoint primitive, not a separate queue runtime.',
      'Use fail_run only when the whole workflow should stop.',
    ],
  },
  {
    kind: 'code',
    purpose: 'Run deterministic JavaScript or Python normalization after parse/model steps.',
    required: ['id', 'kind', 'runtime', 'code'],
    optional: ['label', 'needs', 'input', 'timeoutMs', 'metadata'],
    emits: ['ok', 'result', 'errors'],
    example: {
      id: 'normalize_totals',
      kind: 'code',
      needs: ['parse_pages', 'has_tables'],
      runtime: 'javascript',
      code: 'return normalizeNumbers(inputs.parse_pages);',
      timeoutMs: 5000,
    },
    notes: [
      'Keep code steps deterministic and bounded.',
      'Use code for normalization/scoring, not for long-lived orchestration.',
    ],
  },
  {
    kind: 'vlm',
    purpose: 'Ask a scoped vision/language model for structured extraction from a document, page, region, table, or figure.',
    required: ['id', 'kind', 'model', 'prompt'],
    optional: ['label', 'needs', 'scope', 'schema', 'temperature', 'maxOutputTokens', 'vendorOptions', 'metadata'],
    emits: ['schema-shaped JSON', 'evidence', 'confidence'],
    example: {
      id: 'extract_answer',
      kind: 'vlm',
      needs: ['normalize_totals'],
      model: 'qwen-vl',
      scope: 'table',
      prompt: 'Extract total revenue and cite the source bbox.',
      schema: {
        type: 'object',
        required: ['total_revenue'],
        properties: {
          total_revenue: { type: 'number' },
          citation: { type: 'string' },
        },
      },
    },
    notes: [
      'Prefer a narrow scope after OCR/gate/code have selected the target.',
      'Attach schemas when an agent needs stable machine-readable output.',
    ],
  },
];

export function createDynamicWorkflowBuildStepsGuide(
  exampleId = 'parsebench_chart_numeric_eval',
): DynamicWorkflowBuildStepsGuide {
  const example = getDynamicWorkflowExample(exampleId) ?? getDynamicWorkflowExample('parsebench_chart_numeric_eval');
  if (!example) {
    throw new Error('Built-in dynamic workflow examples are unavailable');
  }

  return {
    object: 'dynamic_workflow_steps_guide',
    version: '2026-06-08',
    execution_model: DYNAMIC_WORKFLOW_EXECUTION_MODEL,
    primitives: DYNAMIC_WORKFLOW_STEP_PRIMITIVES.map((primitive) => ({
      ...primitive,
      required: [...primitive.required],
      optional: [...primitive.optional],
      emits: [...primitive.emits],
      notes: [...primitive.notes],
      example: { ...primitive.example },
    })),
    usage: [
      'okra workflows steps --json',
      'okra workflows example parsebench_chart_numeric_eval > workflow.json',
      'okra workflows validate workflow.json',
      'okra workflows build workflow.json --json',
      'okra workflows run workflow.json --dry-run --json',
    ],
    example_workflow: example.definition,
  };
}

/**
 * Compiles the typed OCR/gate/code/VLM contract into the existing hosted
 * agent-workflow grammar. This keeps the public primitive surface strongly
 * typed while avoiding a second workflow executor.
 */
export function dynamicWorkflowToAgentWorkflowSource(
  definition: DynamicWorkflowDefinition,
): string {
  const workflow = defineDynamicWorkflow(definition);
  const lines: string[] = [
    `const okraDynamicWorkflow = ${JSON.stringify(workflow, null, 2)};`,
    'const okraRunInput = await workflow.args();',
    'const okraDataset = okraRunInput.dataset || (okraDynamicWorkflow.eval && okraDynamicWorkflow.eval.dataset) || null;',
    'const okraInputs = okraRunInput.inputs || {};',
    'const outputs = {};',
    'phase("Prepare dataset");',
    'log("dynamic_workflow", okraDynamicWorkflow.id);',
    'log("dataset", okraDataset ? JSON.stringify(okraDataset) : "none");',
  ];

  for (const step of workflow.steps) {
    lines.push(`phase(${JSON.stringify(step.label ?? step.id)});`);
    lines.push(
      `outputs[${JSON.stringify(step.id)}] = await agent(${JSON.stringify(promptForDynamicStep(workflow, step))}, {`,
      `  label: ${JSON.stringify(step.id)},`,
      `  schema: ${JSON.stringify(agentSchemaForDynamicStep(step), null, 2)}`,
      '});',
    );
    if (step.kind === 'gate') {
      const onFail = step.onFail ?? 'continue';
      lines.push(
        `if (outputs[${JSON.stringify(step.id)}] && outputs[${JSON.stringify(step.id)}].pass === false) {`,
        `  log("gate_failed", ${JSON.stringify(step.id)}, outputs[${JSON.stringify(step.id)}].reason || "");`,
      );
      if (onFail === 'fail_run') {
        lines.push(`  throw new Error("Dynamic workflow gate failed: ${step.id}");`);
      } else if (onFail === 'skip_item') {
        lines.push(
          '  return {',
          '    workflow: okraDynamicWorkflow,',
          '    dataset: okraDataset,',
          '    inputs: okraInputs,',
          '    skipped: true,',
          `    gate: outputs[${JSON.stringify(step.id)}],`,
          '    outputs,',
          '  };',
        );
      }
      lines.push('}');
    }
  }

  if (workflow.eval) {
    lines.push(
      'phase("Evaluate");',
      `const evalResult = await agent(${JSON.stringify([
        `Score workflow ${workflow.id} against dataset-backed expectations.`,
        `Dataset: ${JSON.stringify(workflow.eval.dataset)}.`,
        `Metrics: ${JSON.stringify(workflow.eval.metrics)}.`,
        'Use outputs and expected values from the dataset item. Return metric_scores keyed by metric id.',
      ].join('\n'))}, {`,
      '  label: "eval_score",',
      `  schema: ${JSON.stringify(evalAgentSchema(), null, 2)}`,
      '});',
    );
  } else {
    lines.push('const evalResult = null;');
  }

  lines.push(
    'return {',
    '  workflow: okraDynamicWorkflow,',
    '  dataset: okraDataset,',
    '  inputs: okraInputs,',
    '  outputs,',
    '  eval: evalResult,',
    '  metadata: okraRunInput.metadata || null,',
    '};',
  );

  return lines.join('\n');
}

export function buildDynamicWorkflowDefinition(
  definition: DynamicWorkflowDefinition,
  options: { sourcePath?: string } = {},
): DynamicWorkflowBuildResult {
  const validation = validateDynamicWorkflow(definition);
  const stepGraph = Array.isArray(definition.steps)
    ? definition.steps.map((step) => ({
      id: step.id,
      kind: step.kind,
      ...(step.label ? { label: step.label } : {}),
      needs: [...(step.needs ?? [])],
    }))
    : [];

  return {
    object: 'dynamic_workflow_build',
    version: '2026-06-08',
    workflow_id: definition.id,
    name: definition.name,
    ...(options.sourcePath ? { source_path: options.sourcePath } : {}),
    validation,
    execution_model: DYNAMIC_WORKFLOW_EXECUTION_MODEL,
    step_graph: stepGraph,
    capabilities: validation.ok ? dynamicWorkflowToCapabilities(definition) : null,
    agent_workflow_source: validation.ok ? dynamicWorkflowToAgentWorkflowSource(definition) : null,
  };
}

export const DYNAMIC_WORKFLOW_EXAMPLES: Record<string, DynamicWorkflowExample> = {
  engineering_drawing_numeric_eval: {
    id: 'engineering_drawing_numeric_eval',
    title: 'Engineering drawing numeric extraction with gated VLM parsing',
    paperIds: ['2510.21862'],
    definition: {
      id: 'engineering-drawing-numeric-eval',
      name: 'Engineering drawing numeric eval',
      description:
        'Reproduce the multi-stage pattern from arXiv 2510.21862: detect regions, gate numeric candidates, normalize values in code, and use a scoped VLM for final structured extraction.',
      steps: [
        {
          id: 'layout_regions',
          kind: 'ocr',
          label: 'Detect drawing regions and annotation boxes',
          provider: 'layout-detector',
          tier: 'standard',
          outputs: ['layout', 'bbox', 'json'],
          vendorOptions: {
            regions: ['views', 'title_blocks', 'notes', 'dimensions', 'gdt', 'surface_roughness'],
          },
        },
        {
          id: 'numeric_region_gate',
          kind: 'gate',
          label: 'Require candidate numeric annotations before VLM spend',
          needs: ['layout_regions'],
          condition: {
            type: 'json_path_exists',
            stepId: 'layout_regions',
            path: '$.regions[?(@.label=="dimensions" || @.label=="gdt" || @.label=="surface_roughness")]',
          },
          onFail: 'skip_item',
        },
        {
          id: 'normalize_numeric_candidates',
          kind: 'code',
          label: 'Normalize dimensions and tolerances before scoring',
          needs: ['layout_regions', 'numeric_region_gate'],
          runtime: 'javascript',
          code:
            'return inputs.layout_regions.regions.flatMap((r) => (r.text || "").match(/[+-]?\\d+(?:\\.\\d+)?/g) || []);',
        },
        {
          id: 'numeric_vlm_parse',
          kind: 'vlm',
          label: 'Parse quantitative drawing annotations',
          needs: ['normalize_numeric_candidates'],
          model: 'qwen-vl-or-donut-numeric',
          scope: 'region',
          prompt:
            'Extract measures, tolerances, GD&T frames, and surface roughness values from the supplied regions. Return only JSON matching the schema.',
          schema: {
            type: 'object',
            properties: {
              values: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'number' },
                    unit: { type: 'string' },
                    page: { type: 'integer' },
                    bbox: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['label', 'value'],
                },
              },
            },
            required: ['values'],
          },
        },
      ],
      eval: {
        dataset: {
          provider: 'local',
          id: 'engineering-drawing-numeric',
          documentColumn: 'pdf',
          expectedColumn: 'numbers',
          sourceUrl: 'https://arxiv.org/abs/2510.21862',
        },
        metrics: [
          {
            id: 'numeric_value_tolerance',
            kind: 'numeric_tolerance',
            targetStepId: 'numeric_vlm_parse',
            outputPath: '$.values[*].value',
            expectedPath: '$.numbers[*].value',
            tolerance: 0.01,
          },
        ],
        primaryMetricId: 'numeric_value_tolerance',
      },
      metadata: {
        roadmapItem: 'X.0.30a',
      },
    },
  },
  parsebench_chart_numeric_eval: {
    id: 'parsebench_chart_numeric_eval',
    title: 'ParseBench chart/table numeric eval on Hugging Face',
    paperIds: ['2604.08538', '2605.06021'],
    definition: {
      id: 'parsebench-chart-numeric-eval',
      name: 'ParseBench chart numeric eval',
      description:
        'Run OCR/layout first, gate chart/table candidates, use code for numeric normalization, and score VLM extraction against Hugging Face ParseBench cases.',
      steps: [
        {
          id: 'parser_facet',
          kind: 'ocr',
          provider: 'llamaparse',
          tier: 'standard',
          outputs: ['markdown', 'tables', 'figures', 'bbox', 'json'],
        },
        {
          id: 'has_numeric_target',
          kind: 'gate',
          needs: ['parser_facet'],
          condition: {
            type: 'json_path_exists',
            stepId: 'parser_facet',
            path: '$.nodes[?(@.type=="table" || @.type=="chart")]',
          },
          onFail: 'skip_item',
        },
        {
          id: 'coerce_numbers',
          kind: 'code',
          needs: ['parser_facet', 'has_numeric_target'],
          runtime: 'javascript',
          code: 'return normalizeNumbers(inputs.parser_facet);',
        },
        {
          id: 'scoped_vlm_extract',
          kind: 'vlm',
          needs: ['coerce_numbers'],
          model: 'qwen-vl',
          scope: 'figure',
          prompt: 'Extract the requested numeric datapoint with labels and cite the source bbox.',
          schema: {
            type: 'object',
            properties: {
              value: { type: 'number' },
              labels: { type: 'array', items: { type: 'string' } },
              bbox: { type: 'array', items: { type: 'number' } },
            },
            required: ['value', 'labels'],
          },
        },
      ],
      eval: {
        dataset: {
          provider: 'huggingface',
          id: 'llamaindex/ParseBench',
          split: 'chart',
          documentColumn: 'pdf',
          expectedColumn: 'rule',
          sourceUrl: 'https://huggingface.co/datasets/llamaindex/ParseBench',
          license: 'apache-2.0',
        },
        metrics: [
          {
            id: 'chart_numeric_tolerance',
            kind: 'numeric_tolerance',
            targetStepId: 'scoped_vlm_extract',
            outputPath: '$.value',
            expectedPath: '$.rule.value',
            tolerance: 0.01,
          },
        ],
        primaryMetricId: 'chart_numeric_tolerance',
      },
      metadata: {
        roadmapItem: 'X.0.30a',
      },
    },
  },
};

export function listDynamicWorkflowExamples(): DynamicWorkflowExample[] {
  return Object.values(DYNAMIC_WORKFLOW_EXAMPLES);
}

export function getDynamicWorkflowExample(id: string): DynamicWorkflowExample | undefined {
  return DYNAMIC_WORKFLOW_EXAMPLES[id];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = deepMerge(existing, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Returns immutable capabilities for a named workflow preset.
 * Optional overrides are deep-merged on top for per-app tuning.
 */
export function workflowPreset(
  name: WorkflowPresetName,
  overrides?: ProcessingCapabilities,
): ProcessingCapabilities {
  const base = WORKFLOW_PRESETS[name];
  if (!overrides) {
    return deepMerge({}, base as Record<string, unknown>) as ProcessingCapabilities;
  }
  return deepMerge(
    base as Record<string, unknown>,
    overrides as Record<string, unknown>,
  ) as ProcessingCapabilities;
}
