/**
 * okraPDF Document URL Grammar
 *
 * Base URLs:
 *   api.okrapdf.com  — API (auth, mutations, DO endpoints)
 *   res.okrapdf.com  — Media delivery (page images, exports — immutable, CDN-cached)
 *
 * Pattern:
 *   /v1/documents/:documentId/<modifiers>/<resource>
 *
 * Modifiers are optional path segments between the document ID and the resource.
 * Order does not matter. All are optional. Each identified by prefix.
 *
 * ┌──────────┬────────────────┬──────────────────────────────────────────┬────────────┐
 * │ Prefix   │ Name           │ Example                                  │ Max count  │
 * ├──────────┼────────────────┼──────────────────────────────────────────┼────────────┤
 * │ t_       │ Source variant  │ t_redact                                 │ 1          │
 * │ d_       │ Default/fallback│ d_auto, d_shimmer, d_color:ff5733       │ 1          │
 * │ o_       │ Output schema   │ o_invoice                                │ 1          │
 * │ pg_      │ Page selector   │ pg_1, pg_1,3,5, pg_1-5                  │ 1          │
 * │ w_,h_,...│ Delivery xform  │ w_200,h_300,f_avif,q_80,bl_20           │ 1 segment  │
 * └──────────┴────────────────┴──────────────────────────────────────────┴────────────┘
 *
 * Delivery transform keys (powered by CF Image Resizing):
 *
 *   Sizing:    w_ = width (px)       h_ = height (px)      dpr_ = device pixel ratio
 *   Quality:   q_ = quality (1-100)  f_ = format           md_ = metadata
 *   Fit/crop:  c_ = fit mode         g_ = gravity          zm_ = face zoom (0-1)
 *   Effects:   bl_ = blur (1-250)    sh_ = sharpen (0-10)
 *   Color:     br_ = brightness      co_ = contrast        sa_ = saturation
 *   Transform: r_ = rotate (0/90/180/270)  fl_ = flip (h/v/hv)
 *   Other:     bg_ = background hex  anim_ = animation     seg_ = AI segment
 *
 * Disambiguation rule:
 *   Each segment is identified by its FIRST prefix token. Commas are a
 *   multi-value separator within any segment — the prefix is the discriminator.
 */

import { z } from "zod";

// ── Delivery transform keys ─────────────────────────────────────────────────
// All keys that can appear inside a delivery transform segment.
// Maps 1:1 to Cloudflare Image Resizing `cf.image` options.

export const DELIVERY_KEYS = [
  // sizing
  "w", "h", "dpr",
  // quality & format
  "q", "f", "md",
  // fit & crop
  "c", "g", "zm",
  // effects
  "bl", "sh",
  // color
  "br", "co", "sa",
  // transform
  "r", "fl",
  // other
  "bg", "anim", "seg",
] as const;

export type DeliveryKey = (typeof DELIVERY_KEYS)[number];

const DELIVERY_KEY_SET = new Set<string>(DELIVERY_KEYS);

// Keys whose URL values are parsed as integers
const INT_KEYS: ReadonlySet<string> = new Set(["w", "h", "q", "bl", "r"]);
// Keys whose URL values are parsed as floats
const FLOAT_KEYS: ReadonlySet<string> = new Set(["sh", "br", "co", "sa", "dpr", "zm"]);
// Keys whose URL values are parsed as booleans
const BOOL_KEYS: ReadonlySet<string> = new Set(["anim"]);

// ── Enum values ──────────────────────────────────────────────────────────────

export const FormatValues = ["auto", "webp", "avif", "jpeg", "png"] as const;
export const CropValues = [
  "scale-down", "contain", "cover", "crop", "pad", "squeeze",
] as const;
export const GravityValues = [
  "auto", "face", "left", "right", "top", "bottom", "center",
] as const;
export const FlipValues = ["h", "v", "hv"] as const;
export const MetadataValues = ["copyright", "keep", "none"] as const;
export const RotateValues = [0, 90, 180, 270] as const;

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const DeliveryTransformSchema = z.object({
  // sizing
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  dpr: z.number().positive().optional(),
  // quality & format
  q: z.number().int().min(1).max(100).optional(),
  f: z.enum(FormatValues).optional(),
  md: z.enum(MetadataValues).optional(),
  // fit & crop
  c: z.enum(CropValues).optional(),
  g: z.enum(GravityValues).optional(),
  zm: z.number().min(0).max(1).optional(),
  // effects
  bl: z.number().int().min(1).max(250).optional(),
  sh: z.number().min(0).max(10).optional(),
  // color adjustments (1.0 = no change)
  br: z.number().min(0).optional(),
  co: z.number().min(0).optional(),
  sa: z.number().min(0).optional(),
  // spatial transforms
  r: z.number().int().refine((v) => RotateValues.includes(v as any), {
    message: "Rotate must be 0, 90, 180, or 270",
  }).optional(),
  fl: z.enum(FlipValues).optional(),
  // other
  bg: z.string().optional(),
  anim: z.boolean().optional(),
  seg: z.literal("foreground").optional(),
});

export type DeliveryTransform = z.infer<typeof DeliveryTransformSchema>;

export type DeliveryTransformInput = Partial<DeliveryTransform> & {
  width?: number;
  height?: number;
  quality?: number;
  format?: (typeof FormatValues)[number];
  fit?: (typeof CropValues)[number];
  gravity?: (typeof GravityValues)[number];
  rotate?: (typeof RotateValues)[number];
  background?: string;
};

/**
 * Fluent builder for delivery transform parameters.
 *
 * Callers use stable words such as `width`, `format`, and `fit`; the builder
 * owns the URL-reserved tokens (`w_`, `f_`, `c_`) and canonical ordering.
 */
export class TransformationBuilder {
  private readonly values: DeliveryTransformInput;

  constructor(initial: DeliveryTransformInput = {}) {
    this.values = { ...initial };
  }

  width(value: number): this {
    this.values.width = value;
    return this;
  }

  height(value: number): this {
    this.values.height = value;
    return this;
  }

  quality(value: number): this {
    this.values.quality = value;
    return this;
  }

  format(value: DeliveryTransformInput["format"]): this {
    this.values.format = value;
    return this;
  }

  fit(value: DeliveryTransformInput["fit"]): this {
    this.values.fit = value;
    return this;
  }

  gravity(value: DeliveryTransformInput["gravity"]): this {
    this.values.gravity = value;
    return this;
  }

  rotate(value: DeliveryTransformInput["rotate"]): this {
    this.values.rotate = value;
    return this;
  }

  background(value: string): this {
    this.values.background = value;
    return this;
  }

  with(key: DeliveryKey, value: DeliveryTransform[DeliveryKey]): this {
    this.values[key] = value as never;
    return this;
  }

  build(): DeliveryTransform {
    return normalizeDeliveryTransform(this.values);
  }

  segment(): string {
    return buildDeliveryTransformSegment(this.values);
  }

  cf(): Record<string, unknown> {
    return toCfImageOptions(this.build());
  }
}

export const Transformation = {
  Builder: TransformationBuilder,
  builder: (initial?: DeliveryTransformInput) => new TransformationBuilder(initial),
} as const;

export function createTransformationBuilder(initial?: DeliveryTransformInput): TransformationBuilder {
  return new TransformationBuilder(initial);
}

export function normalizeDeliveryTransform(input: DeliveryTransformInput): DeliveryTransform {
  const mapped: Record<string, unknown> = {};
  for (const key of DELIVERY_KEY_ORDER) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) mapped[key] = value;
  }
  if (input.width !== undefined) mapped.w = input.width;
  if (input.height !== undefined) mapped.h = input.height;
  if (input.quality !== undefined) mapped.q = input.quality;
  if (input.format !== undefined) mapped.f = input.format;
  if (input.fit !== undefined) mapped.c = input.fit;
  if (input.gravity !== undefined) mapped.g = input.gravity;
  if (input.rotate !== undefined) mapped.r = input.rotate;
  if (input.background !== undefined) mapped.bg = input.background;
  return DeliveryTransformSchema.parse(mapped);
}

export function buildDeliveryTransformSegment(input: DeliveryTransformInput): string {
  return buildModifierSegments({ transform: normalizeDeliveryTransform(input) })[0] ?? "";
}

export const DocumentUrlModifiersSchema = z.object({
  variant: z.string().optional(),     // t_redact → "redact"
  default: z.string().optional(),     // d_auto → "auto"
  output: z.string().optional(),      // o_invoice → "invoice"
  pages: z.string().optional(),       // pg_1,3,5 → "1,3,5"
  transform: DeliveryTransformSchema.optional(),
});

export type DocumentUrlModifiers = z.infer<typeof DocumentUrlModifiersSchema>;

export const ParsedDocumentUrlSchema = z.object({
  documentId: z.string().min(1),
  modifiers: DocumentUrlModifiersSchema,
  /** Resource path after modifiers, e.g. "pages/5/image.png", "entities/tables", "" */
  resource: z.string(),
});

export type ParsedDocumentUrl = z.infer<typeof ParsedDocumentUrlSchema>;

// ── Shared regex building blocks ────────────────────────────────────────────
// Auto-generated from DELIVERY_KEYS — single source of truth.

const DELIVERY_KEY_PATTERN = DELIVERY_KEYS.join("|");

/** Regex fragment matching one modifier segment (no slashes, no anchoring). */
export const MOD_SEGMENT =
  `(?:t_[^/]+|d_[^/]+|o_[^/]+|pg_[^/]+|(?:(?:${DELIVERY_KEY_PATTERN})_[^/]+(?:,(?:${DELIVERY_KEY_PATTERN})_[^/]+)*))`;

/** Regex fragment matching zero or more modifier segments, each followed by `/`. */
export const MOD_PREFIX = `(?:${MOD_SEGMENT}\\/)*`;

// ── Modifier prefix → field mapping ─────────────────────────────────────────

type SingleModifier = "variant" | "default" | "output" | "pages";

const PREFIX_MAP: Record<string, SingleModifier> = {
  t: "variant",
  d: "default",
  o: "output",
  pg: "pages",
};

// ── Internal helpers ────────────────────────────────────────────────────────

function isModifierSegment(segment: string): boolean {
  const idx = segment.indexOf("_");
  if (idx === -1) return false;
  const prefix = segment.slice(0, idx);
  return prefix in PREFIX_MAP || DELIVERY_KEY_SET.has(prefix);
}

function isDeliverySegment(segment: string): boolean {
  const idx = segment.indexOf("_");
  if (idx === -1) return false;
  return DELIVERY_KEY_SET.has(segment.slice(0, idx));
}

function tokenizeDeliverySegment(segment: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  for (const token of segment.split(",")) {
    const idx = token.indexOf("_");
    if (idx === -1) continue;
    const k = token.slice(0, idx);
    const v = token.slice(idx + 1);
    if (INT_KEYS.has(k)) parsed[k] = parseInt(v, 10);
    else if (FLOAT_KEYS.has(k)) parsed[k] = parseFloat(v);
    else if (BOOL_KEYS.has(k)) parsed[k] = v === "true" || v === "1";
    else parsed[k] = v;
  }
  return parsed;
}

export function parseDeliveryTransformSegment(segment: string): DeliveryTransform | null {
  if (!isDeliverySegment(segment)) return null;
  const validation = DeliveryTransformSchema.safeParse(tokenizeDeliverySegment(segment));
  return validation.success ? validation.data : null;
}

// ── Canonical key ordering for serialization ─────────────────────────────────

const DELIVERY_KEY_ORDER: readonly DeliveryKey[] = DELIVERY_KEYS;

// ── CF Image Resizing option mapping ─────────────────────────────────────────
// Maps our URL grammar keys → Cloudflare `cf.image` property names.

export const CF_IMAGE_KEY_MAP: Record<DeliveryKey, string> = {
  w: "width",
  h: "height",
  dpr: "dpr",
  q: "quality",
  f: "format",
  md: "metadata",
  c: "fit",
  g: "gravity",
  zm: "zoom",
  bl: "blur",
  sh: "sharpen",
  br: "brightness",
  co: "contrast",
  sa: "saturation",
  r: "rotate",
  fl: "flip",
  bg: "background",
  anim: "anim",
  seg: "segment",
};

/**
 * Convert a parsed DeliveryTransform into a `cf.image` options object.
 * Ready to pass directly to `fetch(url, { cf: { image: result } })`.
 */
export function toCfImageOptions(transform: DeliveryTransform): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  for (const k of DELIVERY_KEY_ORDER) {
    const v = (transform as Record<string, unknown>)[k];
    if (v === undefined) continue;
    const cfKey = CF_IMAGE_KEY_MAP[k];
    // bg_ values are hex without #, CF expects CSS color
    if (k === "bg" && typeof v === "string" && /^[0-9a-f]{3,8}$/i.test(v)) {
      opts[cfKey] = `#${v}`;
    } else {
      opts[cfKey] = v;
    }
  }
  return opts;
}

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a document URL path into structured, Zod-validated components.
 *
 * Accepts any resource tail:
 *   /v1/documents/:id/t_redact/w_200,h_300/pages/5/image.png
 *   /v1/documents/:id/bl_20,sa_0/pages/1/image.png
 *   /v1/documents/:id/o_invoice/pages/1/markdown
 *   /v1/documents/:id/entities/tables
 *
 * Throws ZodError on invalid modifier values.
 */
export function parseDocumentUrl(pathname: string): ParsedDocumentUrl {
  const segments = pathname.replace(/^\//, "").split("/");

  if (segments[0] !== "v1" || segments[1] !== "documents") {
    throw new Error("URL must start with /v1/documents/");
  }

  const documentId = segments[2];
  if (!documentId) throw new Error("Missing document ID");

  // Walk segments after documentId: modifiers first, then resource tail.
  // A segment is a modifier if it starts with a known prefix (t_, d_, o_, pg_, w_, h_, ...).
  // The first non-modifier segment starts the resource tail.
  let resourceStart = 3;
  const modifierSegments: string[] = [];

  for (let i = 3; i < segments.length; i++) {
    if (isModifierSegment(segments[i])) {
      modifierSegments.push(segments[i]);
      resourceStart = i + 1;
    } else {
      break;
    }
  }

  const resource = segments.slice(resourceStart).join("/");

  // Parse modifiers
  const modifiers: Record<string, unknown> = {};
  const seen = new Set<string>();

  for (const seg of modifierSegments) {
    if (isDeliverySegment(seg)) {
      if (seen.has("transform")) {
        throw new Error("Duplicate delivery transform segment");
      }
      seen.add("transform");
      modifiers.transform = tokenizeDeliverySegment(seg);
    } else {
      const idx = seg.indexOf("_");
      const prefix = seg.slice(0, idx);
      const value = seg.slice(idx + 1);
      const field = PREFIX_MAP[prefix];
      if (!field) throw new Error(`Unknown modifier prefix: ${prefix}`);
      if (seen.has(field)) throw new Error(`Duplicate modifier: ${field}`);
      seen.add(field);
      modifiers[field] = value;
    }
  }

  return ParsedDocumentUrlSchema.parse({
    documentId,
    modifiers,
    resource,
  });
}

// ── Serializer ──────────────────────────────────────────────────────────────

const FIELD_TO_PREFIX: Record<SingleModifier, string> = {
  variant: "t",
  default: "d",
  output: "o",
  pages: "pg",
};

/**
 * Build the modifier portion of a document URL.
 * Returns segments like ["t_redact", "w_200,h_300,bl_20", "d_auto"].
 */
export function buildModifierSegments(modifiers: DocumentUrlModifiers): string[] {
  const parts: string[] = [];

  for (const [field, prefix] of Object.entries(FIELD_TO_PREFIX)) {
    const value = modifiers[field as SingleModifier];
    if (value !== undefined) parts.push(`${prefix}_${value}`);
  }

  if (modifiers.transform) {
    const tokens: string[] = [];
    const t = modifiers.transform as Record<string, unknown>;
    for (const k of DELIVERY_KEY_ORDER) {
      if (t[k] !== undefined) tokens.push(`${k}_${t[k]}`);
    }
    if (tokens.length > 0) parts.push(tokens.join(","));
  }

  return parts;
}

/**
 * Build a full document URL path.
 */
export function buildDocumentUrl(parsed: ParsedDocumentUrl): string {
  const mods = buildModifierSegments(parsed.modifiers);
  const modPath = mods.length > 0 ? `/${mods.join("/")}` : "";
  const resourcePath = parsed.resource ? `/${parsed.resource}` : "";
  return `/v1/documents/${parsed.documentId}${modPath}${resourcePath}`;
}
