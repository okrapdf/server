import { describe, expect, it } from 'vitest';
import {
  buildDynamicWorkflowDefinition,
  createDynamicWorkflowBuildStepsGuide,
  dynamicWorkflowToAgentWorkflowSource,
  dynamicWorkflowToCapabilities,
  getDynamicWorkflowExample,
  validateDynamicWorkflow,
  workflowPreset,
  WORKFLOW_PRESETS,
} from './workflows.js';

describe('workflow presets', () => {
  it('exposes llamaparse OCR preset', () => {
    expect(WORKFLOW_PRESETS.llamaparse_ocr).toMatchObject({
      phases: {
        ocr: { vendor: 'llamaparse', enabled: true },
      },
    });
  });

  it('exposes parse-proxy/docling presets for HTTP OCR providers', () => {
    expect(WORKFLOW_PRESETS.parse_proxy_ocr).toMatchObject({
      phases: {
        ocr: { vendor: 'parse-proxy', enabled: true },
      },
    });
    expect(WORKFLOW_PRESETS.docling_ocr).toMatchObject({
      phases: {
        ocr: { vendor: 'parse-proxy', enabled: true },
      },
    });
  });

  it('deep-merges overrides over preset', () => {
    const merged = workflowPreset('llamaparse_ocr', {
      phases: { ocr: { tier: 'premium' } },
      search: true,
    });

    expect(merged).toMatchObject({
      search: true,
      phases: {
        ocr: {
          vendor: 'llamaparse',
          enabled: true,
          tier: 'premium',
        },
      },
    });
  });

  it('exposes research-backed OCR/gate/code/VLM workflow examples', () => {
    const example = getDynamicWorkflowExample('parsebench_chart_numeric_eval');
    expect(example?.paperIds).toContain('2604.08538');
    expect(example?.definition.eval?.dataset).toMatchObject({
      provider: 'huggingface',
      id: 'llamaindex/ParseBench',
    });

    const validation = validateDynamicWorkflow(example!.definition);
    expect(validation).toMatchObject({
      ok: true,
      stepKinds: {
        ocr: 1,
        gate: 1,
        code: 1,
        vlm: 1,
      },
    });
  });

  it('compiles dynamic workflow definitions back to coarse capabilities', () => {
    const example = getDynamicWorkflowExample('engineering_drawing_numeric_eval')!;
    const capabilities = dynamicWorkflowToCapabilities(example.definition);

    expect(capabilities).toMatchObject({
      vlm_qwen: true,
      structural_check: true,
      sandbox_verify: true,
      search: true,
      phases: {
        ocr: {
          vendor: 'layout-detector',
          enabled: true,
          tier: 'standard',
        },
      },
      eval: {
        metric_ids: ['numeric_value_tolerance'],
        primary_metric_id: 'numeric_value_tolerance',
      },
    });
  });

  it('compiles dynamic workflow definitions into hosted agent-workflow source', () => {
    const example = getDynamicWorkflowExample('parsebench_chart_numeric_eval')!;
    const source = dynamicWorkflowToAgentWorkflowSource(example.definition);

    expect(source).toContain('workflow.args()');
    expect(source).toContain('agent(');
    expect(source).toContain('label: "parser_facet"');
    expect(source).toContain('label: "has_numeric_target"');
    expect(source).toContain('label: "coerce_numbers"');
    expect(source).toContain('label: "scoped_vlm_extract"');
    expect(source).toContain('label: "eval_score"');
  });

  it('describes the step primitives agents can use to build workflows', () => {
    const guide = createDynamicWorkflowBuildStepsGuide();

    expect(guide.object).toBe('dynamic_workflow_steps_guide');
    expect(guide.execution_model.unit).toBe('versioned_workflow_definition');
    expect(guide.primitives.map((primitive) => primitive.kind)).toEqual(['ocr', 'gate', 'code', 'vlm']);
    expect(guide.usage).toContain('okra workflows build workflow.json --json');
  });

  it('returns a stable build artifact for valid dynamic workflows', () => {
    const example = getDynamicWorkflowExample('parsebench_chart_numeric_eval')!;
    const build = buildDynamicWorkflowDefinition(example.definition, {
      sourcePath: './workflow.json',
    });

    expect(build).toMatchObject({
      object: 'dynamic_workflow_build',
      workflow_id: 'parsebench-chart-numeric-eval',
      source_path: './workflow.json',
      validation: { ok: true },
    });
    expect(build.step_graph.map((step) => `${step.id}:${step.kind}`)).toEqual([
      'parser_facet:ocr',
      'has_numeric_target:gate',
      'coerce_numbers:code',
      'scoped_vlm_extract:vlm',
    ]);
    expect(build.agent_workflow_source).toContain('label: "scoped_vlm_extract"');
    expect(build.capabilities).toMatchObject({
      vlm_qwen: true,
      structural_check: true,
      sandbox_verify: true,
    });
  });

  it('rejects dynamic workflow dependencies that skip prior steps', () => {
    const validation = validateDynamicWorkflow({
      id: 'bad',
      name: 'Bad workflow',
      steps: [
        {
          id: 'vlm_first',
          kind: 'vlm',
          needs: ['missing_ocr'],
          model: 'qwen-vl',
          prompt: 'Extract values.',
        },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('missing_ocr');
  });

  it('reports a clean error for a non-array `steps` instead of throwing (steps.reduce crash)', () => {
    // A malformed file with `steps: "wrong"` used to reach countStepKinds and
    // throw "steps.reduce is not a function" → the CLI surfaced error:"error",
    // code:1. validate must always return a structured result.
    const run = () =>
      validateDynamicWorkflow({ id: 'x', name: 'X', steps: 'wrong' as never });
    expect(run).not.toThrow();
    const validation = run();
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('workflow.steps must include at least one step');
    expect(validation.stepKinds).toEqual({ ocr: 0, gate: 0, code: 0, vlm: 0 });
  });
});
