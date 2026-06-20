import { z } from "zod";

export const parserConfidenceKindSchema = z.enum([
  "vlm_self_reported",
  "ocr_char",
  "textlayer_exact",
  "heuristic",
  "unknown",
]);

export const parserPromptBboxOrderSchema = z.enum([
  "x1_y1_x2_y2",
  "y_min_x_min_y_max_x_max",
  "none",
  "vendor_native",
]);

export const parserPromptSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  version: z.union([z.string(), z.number()]),
  technique: z.string().min(1),
  bbox_order: parserPromptBboxOrderSchema,
  system_prompt_ref: z.string().min(1).optional(),
  user_prompt_ref: z.string().min(1).optional(),
  system_prompt: z.string().optional(),
  user_prompt: z.string().optional(),
});

/**
 * Parser profiles make the old "engine" label explicit as model x prompt x
 * params. The confidence_kind tag addresses #408: OCR char confidence and VLM
 * self-reported confidence must not be compared as the same signal.
 */
export const parserProfileSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  prompt_id: z.string().min(1),
  prompt_version: z.union([z.string(), z.number()]),
  params: z.record(z.unknown()).optional(),
  confidence_kind: parserConfidenceKindSchema,
  cost_hints: z.object({
    per_page_usd: z.number().nonnegative().optional(),
    currency: z.string().min(1).optional(),
  }).optional(),
  // `false` = the profile is registered (contract/registry knowledge) but no
  // execution path honors its prompt yet. Selecting it must fail
  // not_implemented rather than run a different prompt and stamp this one —
  // stamped event properties must describe what executed (PR #431 review).
  executable: z.boolean().optional(),
});

export type ParserConfidenceKind = z.infer<typeof parserConfidenceKindSchema>;
export type ParserPrompt = z.infer<typeof parserPromptSchema>;
export type ParserProfile = z.infer<typeof parserProfileSchema>;

export const GEMINI_3_FLASH_MODEL = "gemini-3-flash-preview";

export const BUILTIN_PARSER_PROMPTS = {
  "layout-divbbox@1": {
    id: "layout-divbbox",
    model: GEMINI_3_FLASH_MODEL,
    version: 1,
    technique: "div_wrapped_markdown_bbox",
    bbox_order: "x1_y1_x2_y2",
    system_prompt_ref: "SYSTEM_PROMPT_LAYOUT",
    user_prompt_ref: "USER_PROMPT_LAYOUT",
  },
  "layout-bbox-parsebench@1": {
    id: "layout-bbox-parsebench",
    model: GEMINI_3_FLASH_MODEL,
    version: 1,
    technique: "parsebench_gemini_native_bbox",
    bbox_order: "y_min_x_min_y_max_x_max",
    system_prompt_ref: "SYSTEM_PROMPT_LAYOUT_GEMINI",
    user_prompt_ref: "USER_PROMPT_LAYOUT_GEMINI",
  },
  // The prompt the gemini worker ACTUALLY executes today
  // (gemini-vision-parser-agent/src/gemini.ts hardcodes the multipage GEMINI
  // pair). The default profile must point here so stamps match execution.
  "layout-bbox-gemini-multipage@1": {
    id: "layout-bbox-gemini-multipage",
    model: GEMINI_3_FLASH_MODEL,
    version: 1,
    technique: "parsebench_gemini_native_bbox_multipage",
    bbox_order: "y_min_x_min_y_max_x_max",
    system_prompt_ref: "SYSTEM_PROMPT_LAYOUT_GEMINI_MULTIPAGE",
    user_prompt_ref: "USER_PROMPT_LAYOUT_GEMINI_MULTIPAGE",
  },
} as const satisfies Record<string, ParserPrompt>;

export const BUILTIN_PARSER_PROFILES = {
  "gemini-3-flash-minimal": {
    id: "gemini-3-flash-minimal",
    model: GEMINI_3_FLASH_MODEL,
    // Matches the prompt the worker executes (multipage GEMINI pair) — see
    // BUILTIN_PARSER_PROMPTS["layout-bbox-gemini-multipage@1"].
    prompt_id: "layout-bbox-gemini-multipage",
    prompt_version: 1,
    params: {
      vendor: "gemini-vision",
      variant: "gemini-3-flash-minimal",
    },
    confidence_kind: "vlm_self_reported",
    cost_hints: { per_page_usd: 0.003, currency: "USD" },
  },
  "gemini-3-flash-parsebench": {
    id: "gemini-3-flash-parsebench",
    model: GEMINI_3_FLASH_MODEL,
    prompt_id: "layout-bbox-parsebench",
    prompt_version: 1,
    params: {
      vendor: "gemini-vision",
      variant: "gemini-3-flash-minimal",
    },
    confidence_kind: "vlm_self_reported",
    cost_hints: { per_page_usd: 0.003, currency: "USD" },
    // The worker does not yet accept a prompt selector; selecting this profile
    // must fail not_implemented rather than execute the default prompt and
    // stamp this one.
    executable: false,
  },
  textlayer: {
    id: "textlayer",
    model: "pdf-textlayer",
    prompt_id: "textlayer-native",
    prompt_version: 1,
    params: { vendor: "textlayer" },
    confidence_kind: "textlayer_exact",
    cost_hints: { per_page_usd: 0, currency: "USD" },
  },
  llamaparse: {
    id: "llamaparse",
    model: "llamaparse",
    prompt_id: "llamaparse-default",
    prompt_version: 1,
    params: { vendor: "llamaparse" },
    confidence_kind: "unknown",
  },
  mineru: {
    id: "mineru",
    model: "mineru",
    prompt_id: "mineru-default",
    prompt_version: 1,
    params: { vendor: "mineru" },
    confidence_kind: "heuristic",
  },
  reducto: {
    id: "reducto",
    model: "reducto",
    prompt_id: "reducto-default",
    prompt_version: 1,
    params: { vendor: "reducto" },
    confidence_kind: "unknown",
  },
  docling: {
    id: "docling",
    model: "docling",
    prompt_id: "docling-default",
    prompt_version: 1,
    params: { vendor: "docling" },
    confidence_kind: "heuristic",
  },
  unstructured: {
    id: "unstructured",
    model: "unstructured",
    prompt_id: "unstructured-default",
    prompt_version: 1,
    params: { vendor: "unstructured" },
    confidence_kind: "unknown",
  },
  google_document_ai: {
    id: "google_document_ai",
    model: "google-document-ai",
    prompt_id: "google-document-ai-default",
    prompt_version: 1,
    params: { vendor: "docai-gcs" },
    confidence_kind: "ocr_char",
  },
  azure_document_intelligence: {
    id: "azure_document_intelligence",
    model: "azure-document-intelligence",
    prompt_id: "azure-document-intelligence-default",
    prompt_version: 1,
    params: { vendor: "azure-di" },
    confidence_kind: "ocr_char",
  },
  aws_textract: {
    id: "aws_textract",
    model: "aws-textract",
    prompt_id: "aws-textract-default",
    prompt_version: 1,
    params: { vendor: "aws_textract" },
    confidence_kind: "ocr_char",
  },
  mistral_ocr: {
    id: "mistral_ocr",
    model: "mistral-ocr",
    prompt_id: "mistral-ocr-default",
    prompt_version: 1,
    params: { vendor: "mistral_ocr" },
    confidence_kind: "ocr_char",
  },
  custom: {
    id: "custom",
    model: "custom",
    prompt_id: "custom",
    prompt_version: 1,
    params: { vendor: "custom" },
    confidence_kind: "unknown",
  },
} as const satisfies Record<string, ParserProfile>;

export const PARSER_PROFILE_ALIASES = {
  auto: "gemini-3-flash-minimal",
  okrapdf: "gemini-3-flash-minimal",
  gemini: "gemini-3-flash-minimal",
  "gemini-vision": "gemini-3-flash-minimal",
  "gemini-3-flash": "gemini-3-flash-minimal",
  "gemini-3-flash-preview": "gemini-3-flash-minimal",
  "gemini-3-flash-minimal": "gemini-3-flash-minimal",
  "layout-divbbox": "gemini-3-flash-minimal",
  "layout-divbbox@1": "gemini-3-flash-minimal",
  "layout-bbox-parsebench": "gemini-3-flash-parsebench",
  "layout-bbox-parsebench@1": "gemini-3-flash-parsebench",
  "gemini-3-flash-parsebench": "gemini-3-flash-parsebench",
  textlayer: "textlayer",
  llamaparse: "llamaparse",
  llama_parse: "llamaparse",
  mineru: "mineru",
  reducto: "reducto",
  docling: "docling",
  unstructured: "unstructured",
  unstructuredio: "unstructured",
  google_document_ai: "google_document_ai",
  "google-document-ai": "google_document_ai",
  docai: "google_document_ai",
  "docai-gcs": "google_document_ai",
  azure_document_intelligence: "azure_document_intelligence",
  "azure-document-intelligence": "azure_document_intelligence",
  "azure-di": "azure_document_intelligence",
  aws_textract: "aws_textract",
  "aws-textract": "aws_textract",
  mistral_ocr: "mistral_ocr",
  "mistral-ocr": "mistral_ocr",
  custom: "custom",
  "parse-proxy": "custom",
} as const satisfies Record<string, keyof typeof BUILTIN_PARSER_PROFILES>;

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

/** Natural model spellings → canonical model ids (PR #431 review finding 2:
 * `--model gemini-3-flash` must resolve, not error). */
export const PARSER_MODEL_ALIASES = {
  "gemini-3-flash": GEMINI_3_FLASH_MODEL,
  "gemini-flash": GEMINI_3_FLASH_MODEL,
  gemini: GEMINI_3_FLASH_MODEL,
  "gemini-vision": GEMINI_3_FLASH_MODEL,
  textlayer: "pdf-textlayer",
  "pdf-textlayer": "pdf-textlayer",
} as const satisfies Record<string, string>;

export function resolveParserModel(model: string): string {
  const normalized = normalizeId(model);
  return PARSER_MODEL_ALIASES[normalized as keyof typeof PARSER_MODEL_ALIASES] ?? normalized;
}

export function isParserProfileExecutable(profile: ParserProfile | null | undefined): boolean {
  return !!profile && profile.executable !== false;
}

export function listExecutableParserProfiles(): ParserProfile[] {
  return Object.values(BUILTIN_PARSER_PROFILES).filter((profile) => isParserProfileExecutable(profile));
}

export function promptRegistryKey(promptId: string, version: string | number): string {
  return `${promptId}@${String(version)}`;
}

export function resolveParserPrompt(
  promptIdOrKey: string,
  version?: string | number,
): ParserPrompt | undefined {
  const key = version === undefined
    ? normalizeId(promptIdOrKey)
    : promptRegistryKey(normalizeId(promptIdOrKey), version);
  const byKey = BUILTIN_PARSER_PROMPTS[key as keyof typeof BUILTIN_PARSER_PROMPTS];
  if (byKey) return byKey;
  return Object.values(BUILTIN_PARSER_PROMPTS).find((prompt) =>
    normalizeId(prompt.id) === key ||
    promptRegistryKey(normalizeId(prompt.id), prompt.version) === key
  );
}

export function resolveParserProfileId(idOrAlias: string): string | undefined {
  const normalized = normalizeId(idOrAlias);
  if (normalized in BUILTIN_PARSER_PROFILES) return BUILTIN_PARSER_PROFILES[normalized as keyof typeof BUILTIN_PARSER_PROFILES].id;
  return PARSER_PROFILE_ALIASES[normalized as keyof typeof PARSER_PROFILE_ALIASES];
}

export function resolveParserProfile(idOrAlias: string): ParserProfile | undefined {
  const id = resolveParserProfileId(idOrAlias);
  return id ? BUILTIN_PARSER_PROFILES[id as keyof typeof BUILTIN_PARSER_PROFILES] : undefined;
}

export function resolveParserProfileByModelPrompt(
  model: string,
  promptIdOrKey: string,
  promptVersion?: string | number,
): ParserProfile | undefined {
  const normalizedModel = resolveParserModel(model);
  const bare = normalizeId(promptIdOrKey);
  // Accept both "prompt-id" and "prompt-id@version" spellings.
  const atIndex = bare.lastIndexOf("@");
  const normalizedPrompt = atIndex > 0 ? bare.slice(0, atIndex) : bare;
  const versionFromKey = atIndex > 0 ? bare.slice(atIndex + 1) : undefined;
  const wantedVersion = promptVersion !== undefined ? String(promptVersion) : versionFromKey;
  const matches = Object.values(BUILTIN_PARSER_PROFILES).filter((profile) =>
    resolveParserModel(profile.model) === normalizedModel &&
    normalizeId(profile.prompt_id) === normalizedPrompt &&
    (wantedVersion === undefined || String(profile.prompt_version) === wantedVersion)
  );
  // Prefer an executable profile when both an executable and a declared-only
  // profile share the same (model, prompt) pair.
  return matches.find((profile) => isParserProfileExecutable(profile)) ?? matches[0];
}
