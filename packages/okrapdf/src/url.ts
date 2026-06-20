import type { DeliveryTransform, DocUrlOptions, UrlBuilderOptions } from './types';

const DEFAULT_BASE_URL = 'https://api.okrapdf.com';

// ── Delivery transform key ordering (matches @okrapdf/schemas DELIVERY_KEYS) ──

const DELIVERY_KEY_ORDER = [
  'w', 'h', 'dpr', 'q', 'f', 'md', 'c', 'g', 'zm',
  'bl', 'sh', 'br', 'co', 'sa', 'r', 'fl', 'bg', 'anim', 'seg',
] as const;

const VALID_FORMATS = new Set(['auto', 'webp', 'avif', 'jpeg', 'png']);
const VALID_CROPS = new Set(['scale-down', 'contain', 'cover', 'crop', 'pad', 'squeeze']);
const VALID_GRAVITIES = new Set(['auto', 'face', 'left', 'right', 'top', 'bottom', 'center']);
const VALID_FLIPS = new Set(['h', 'v', 'hv']);
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

function validateTransform(t: DeliveryTransform): void {
  if (t.w !== undefined && (!Number.isInteger(t.w) || t.w <= 0)) throw new Error('Invalid delivery transform: w must be a positive integer');
  if (t.h !== undefined && (!Number.isInteger(t.h) || t.h <= 0)) throw new Error('Invalid delivery transform: h must be a positive integer');
  if (t.dpr !== undefined && t.dpr <= 0) throw new Error('Invalid delivery transform: dpr must be positive');
  if (t.q !== undefined && (!Number.isInteger(t.q) || t.q < 1 || t.q > 100)) throw new Error('Invalid delivery transform: q must be 1-100');
  if (t.f !== undefined && !VALID_FORMATS.has(t.f)) throw new Error(`Invalid delivery transform: f must be one of ${[...VALID_FORMATS].join(', ')}`);
  if (t.c !== undefined && !VALID_CROPS.has(t.c)) throw new Error(`Invalid delivery transform: c must be one of ${[...VALID_CROPS].join(', ')}`);
  if (t.g !== undefined && !VALID_GRAVITIES.has(t.g)) throw new Error(`Invalid delivery transform: g must be one of ${[...VALID_GRAVITIES].join(', ')}`);
  if (t.zm !== undefined && (t.zm < 0 || t.zm > 1)) throw new Error('Invalid delivery transform: zm must be 0-1');
  if (t.bl !== undefined && (!Number.isInteger(t.bl) || t.bl < 1 || t.bl > 250)) throw new Error('Invalid delivery transform: bl must be 1-250');
  if (t.sh !== undefined && (t.sh < 0 || t.sh > 10)) throw new Error('Invalid delivery transform: sh must be 0-10');
  if (t.r !== undefined && !VALID_ROTATIONS.has(t.r)) throw new Error('Invalid delivery transform: r must be 0, 90, 180, or 270');
  if (t.fl !== undefined && !VALID_FLIPS.has(t.fl)) throw new Error(`Invalid delivery transform: fl must be one of ${[...VALID_FLIPS].join(', ')}`);
}

/** Serialize delivery transform to a single URL segment: "w_200,h_300,q_80" */
function serializeTransform(t: DeliveryTransform): string {
  const tokens: string[] = [];
  const rec = t as Record<string, unknown>;
  for (const k of DELIVERY_KEY_ORDER) {
    if (rec[k] !== undefined) tokens.push(`${k}_${rec[k]}`);
  }
  return tokens.join(',');
}

// ── CF Image Transformations option mapping ─────────────────────────────────
// Our short-key transform vocabulary (w, h, q, f, dpr, c, r, bl, sh, bg) maps
// onto Cloudflare's long-key URL options. Only the subset that CF supports
// via `/cdn-cgi/image/` is included; unknown keys are dropped. Format `auto`
// is the sensible default when no format is specified — it negotiates AVIF/
// WebP/JPEG from the `Accept` header.

const CF_KEY_MAP: Partial<Record<string, string>> = {
  w: 'width',
  h: 'height',
  q: 'quality',
  f: 'format',
  dpr: 'dpr',
  c: 'fit',
  r: 'rotate',
  bl: 'blur',
  sh: 'sharpen',
  bg: 'background',
};

// CF fit values are `scale-down | contain | cover | crop | pad`. Our `c`
// values are already that set, so pass through verbatim.

function serializeTransformToCfOptions(t?: DeliveryTransform): string {
  const tokens: string[] = [];
  const rec = (t || {}) as Record<string, unknown>;
  for (const [shortKey, longKey] of Object.entries(CF_KEY_MAP)) {
    const v = rec[shortKey];
    if (v !== undefined) tokens.push(`${longKey}=${v}`);
  }
  // If caller didn't specify a format, default to `auto` so CF negotiates
  // AVIF/WebP/JPEG — drops ~60× bytes vs origin PNG for typical thumbs.
  if (rec.f === undefined) tokens.push('format=auto');
  return tokens.join(',');
}

// ── Modifier segment builder (inlined from @okrapdf/schemas/document-url) ──

interface Modifiers {
  variant?: string;
  default?: string;
  output?: string;
  transform?: DeliveryTransform;
}

function buildModifierSegments(mods: Modifiers): string[] {
  const parts: string[] = [];
  if (mods.variant) parts.push(`t_${mods.variant}`);
  if (mods.default) parts.push(`d_${mods.default}`);
  if (mods.output) parts.push(`o_${mods.output}`);
  if (mods.transform) {
    const seg = serializeTransform(mods.transform);
    if (seg) parts.push(seg);
  }
  return parts;
}

// ── Interfaces ──────────────────────────────────────────────────────────────

interface PgPage {
  png: (opts?: {
    placeholder?: string;
    transform?: DeliveryTransform;
    /**
     * CF Images variant name (`public`, `thumb`, `hero`, `og`, custom). Only
     * honored when the builder has `pdfSha + renderer + accountHash` set.
     * Default: `public`.
     */
    variant?: string;
  }) => string;
  md: (opts?: { transform?: DeliveryTransform }) => string;
  json: (opts?: { transform?: DeliveryTransform }) => string;
}

interface PgPageRange {
  md: (opts?: { transform?: DeliveryTransform }) => string;
  json: (opts?: { transform?: DeliveryTransform }) => string;
}

interface PgProxy {
  [index: number]: PgPage;
  range: (start: number, end: number) => PgPageRange;
  list: (...pages: number[]) => PgPageRange;
}

interface DocumentUrl {
  /** Base document URL */
  url: (opts?: UrlBuilderOptions) => string;
  /** Thumbnail image URL (pg_1.png). With CF Images, defaults to `variant: 'thumb'`. */
  thumbnail: { url: (opts?: { transform?: DeliveryTransform; variant?: string }) => string };
  /** Full document markdown */
  full: { md: () => string };
  /** Original PDF download (auth required) */
  download: () => string;
  /** Page access: d.pg[1].png(), d.pg[1].md(), d.pg[1].json() */
  pg: PgProxy;
  /** Entity-level access */
  entities: EntitiesProxy;
  /** Output schema — returns a new DocumentUrl scoped to o_{schema} */
  output: (schema: string) => DocumentUrl;
}

interface EntitiesProxy {
  tables: EntityCollectionProxy;
  figures: EntityCollectionProxy;
}

interface EntityCollectionProxy {
  [index: number]: {
    url: (opts?: { format?: 'json' | 'csv' | 'html' }) => string;
  };
  url: (opts?: UrlBuilderOptions) => string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const FORMAT_TO_EXT: Record<NonNullable<UrlBuilderOptions['format']>, string> = {
  json: 'json',
  csv: 'csv',
  html: 'html',
  markdown: 'md',
  png: 'png',
};

function slugifyFileStem(fileName: string): string {
  const leaf = fileName.split('/').pop() || fileName;
  const noExt = leaf.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const slug = noExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'document';
}

function extensionFor(format: string | undefined, fallback: string): string {
  if (!format) return fallback;
  const lower = format.toLowerCase();
  if (lower === 'markdown') return 'md';
  return FORMAT_TO_EXT[lower as keyof typeof FORMAT_TO_EXT] || lower;
}

/**
 * Build-time URL builder for PDF asset delivery.
 *
 * ```tsx
 * import { doc } from 'okrapdf';
 * const d = doc('doc_7fK3x');
 * <Image src={d.thumbnail.url()} />
 * <a href={d.entities.tables[0].url({ format: 'csv' })}>CSV</a>
 * ```
 */
export function doc(
  documentId: string,
  baseUrlOrOptions: string | DocUrlOptions = DEFAULT_BASE_URL,
  maybeOptions: DocUrlOptions = {},
): DocumentUrl {
  const baseUrl = typeof baseUrlOrOptions === 'string' ? baseUrlOrOptions : DEFAULT_BASE_URL;
  const options = typeof baseUrlOrOptions === 'string' ? maybeOptions : baseUrlOrOptions;

  const base = baseUrl.replace(/\/+$/, '');
  const defaultProvider = options.provider;
  const defaultImage = options.placeholder || options.defaultImage;
  const defaultOutput = options.output;
  const isPublic = options.public === true;
  const useCdnImage = options.cdnImage === true;
  const docPathPrefix = isPublic ? 'v1/documents' : 'document';
  const docBase = `${base}/${docPathPrefix}/${encodeURIComponent(documentId)}`;
  const artifactBase = options.fileName
    ? slugifyFileStem(options.fileName)
    : 'document';

  // ─── Cloudflare Images config (v0.15.x primary path) ────────────────────
  // When `pdfSha + renderer + accountHash` are all supplied, image URLs
  // target `imagedelivery.net/<hash>/okra-{env}-{pdfSha12}-p{N}-r{V}-{renderer}/{variant}`.
  // All-or-nothing: if any of these three are missing, image URLs fall back
  // to the legacy origin path (same shape as before this option set existed).
  const cfImages = (() => {
    if (!options.pdfSha || !options.renderer || !options.accountHash) return null;
    if (!/^[0-9a-fA-F]+$/.test(options.pdfSha) || options.pdfSha.length < 8) {
      throw new Error('pdfSha must be hex (sha256); at least 8 chars required');
    }
    const shaLen = options.pdfShaLength ?? 12;
    if (shaLen !== 12 && shaLen !== 16) {
      throw new Error('pdfShaLength must be 12 or 16');
    }
    if (options.pdfSha.length < shaLen) {
      throw new Error(`pdfSha too short: need ≥${shaLen} hex chars, got ${options.pdfSha.length}`);
    }
    const env = options.env ?? 'prod';
    const renderVersion = options.renderVersion ?? 1;
    if (!/^[a-z0-9]+$/.test(env)) {
      throw new Error(`env must be lowercase alphanumeric, got "${env}"`);
    }
    if (!/^[a-z0-9]+$/.test(options.renderer)) {
      throw new Error(`renderer must be lowercase alphanumeric, got "${options.renderer}"`);
    }
    const imagesBase = (options.imagesBaseUrl ?? 'https://imagedelivery.net').replace(/\/+$/, '');
    const accountHash = options.accountHash.replace(/^\/+|\/+$/g, '');
    const pdfShaPrefix = options.pdfSha.slice(0, shaLen).toLowerCase();
    return { imagesBase, accountHash, env, pdfShaPrefix, renderer: options.renderer, renderVersion };
  })();

  const buildCfImageUrl = (pageNum: number, variant: string, signed?: string): string => {
    if (!cfImages) throw new Error('cfImages not configured');
    if (!/^[a-z0-9_-]+$/i.test(variant)) {
      throw new Error(`variant must be alphanumeric/_/-, got "${variant}"`);
    }
    const id = `okra-${cfImages.env}-${cfImages.pdfShaPrefix}-p${pageNum}-r${cfImages.renderVersion}-${cfImages.renderer}`;
    const qs = signed ? `?${signed}` : '';
    return `${cfImages.imagesBase}/${cfImages.accountHash}/${id}/${variant}${qs}`;
  };

  const formatParams = (opts?: UrlBuilderOptions) => {
    const params = new URLSearchParams();
    if (opts?.format) params.set('format', opts.format);
    if (opts?.include?.length) params.set('include', opts.include.join(','));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  /** Single path for all modifier → URL serialization. */
  const buildUrl = (
    resource: string,
    opts?: {
      placeholder?: string;
      provider?: string;
      output?: string;
      transform?: DeliveryTransform;
      artifact?: { stem: string; ext: string };
      qs?: string;
      /**
       * When set and the builder has `cdnImage: true`, the resulting URL is
       * wrapped with `<base>/cdn-cgi/image/<cf-opts>/<origin-url-path>`.
       * CF returns the transformed image (AVIF/WebP) from the edge cache.
       */
      cdnImage?: boolean;
    },
  ): string => {
    const mods: Modifiers = {};

    const prov = opts?.provider || defaultProvider;
    if (prov) mods.variant = prov;

    const ph = opts?.placeholder || defaultImage;
    if (ph) mods.default = ph;

    const out = opts?.output || defaultOutput;
    if (out) mods.output = out;

    const wantsCdnImage = opts?.cdnImage === true && useCdnImage;
    // When emitting a CF Image Transformation URL, the transform serializes
    // as CF options in the wrapper segment — NOT as an origin path modifier,
    // so we skip adding the transform to `mods` in that branch. Validation
    // still runs unconditionally so callers get client-side bounds-checking
    // regardless of which branch formats the URL.
    if (opts?.transform) {
      validateTransform(opts.transform);
      if (wantsCdnImage && opts.transform.c === 'squeeze') {
        // CF's `fit` accepts scale-down|contain|cover|crop|pad; `squeeze` is
        // our schema's extra value and CF returns 400 on it. Reject client-side.
        throw new Error(
          "CF Image Transformations does not support c: 'squeeze'. Use 'cover' or 'crop' instead.",
        );
      }
      if (!wantsCdnImage) mods.transform = opts.transform;
    }

    const segs = buildModifierSegments(mods);
    const modPath = segs.length > 0 ? `/${segs.join('/')}` : '';
    const resourcePart = resource ? `/${resource}` : '';
    const artifactSuffix = opts?.artifact ? `/${opts.artifact.stem}.${opts.artifact.ext}` : '';
    const qs = opts?.qs || '';
    const originUrl = `${docBase}${modPath}${resourcePart}${artifactSuffix}${qs}`;

    if (wantsCdnImage) {
      const cfOpts = serializeTransformToCfOptions(opts?.transform);
      // CF accepts either an absolute https:// source or a same-zone absolute
      // path. We emit the path form — it's shorter and doesn't duplicate the
      // zone host. originUrl is `${base}/path...`, strip `${base}` to get the
      // path-only form.
      const originPath = originUrl.slice(base.length); // starts with '/'
      return `${base}/cdn-cgi/image/${cfOpts}${originPath}`;
    }

    return originUrl;
  };

  const makeEntityCollection = (type: string): EntityCollectionProxy => {
    return new Proxy({} as EntityCollectionProxy, {
      get(_target, prop) {
        if (prop === 'url') {
          return (opts?: UrlBuilderOptions) =>
            buildUrl(`entities/${type}`, {
              provider: opts?.provider,
              transform: opts?.transform,
              artifact: { stem: artifactBase, ext: extensionFor(opts?.format, 'json') },
              qs: formatParams(opts),
            });
        }
        const index = typeof prop === 'string' ? parseInt(prop, 10) : NaN;
        if (!isNaN(index)) {
          return {
            url: (opts?: { format?: string; provider?: string }) =>
              buildUrl(`entities/${type}/${index}`, {
                provider: opts?.provider,
                artifact: { stem: artifactBase, ext: extensionFor(opts?.format, 'json') },
                qs: opts?.format ? `?format=${opts.format}` : '',
              }),
          };
        }
        return undefined;
      },
    });
  };

  const makePgPage = (pageNum: number): PgPage => ({
    png: (opts?: { placeholder?: string; transform?: DeliveryTransform; variant?: string }) => {
      // CF Images path: if pdfSha/renderer/accountHash configured AND no legacy
      // transform passed, emit imagedelivery.net URL with named variant.
      if (cfImages && !opts?.transform && !opts?.placeholder) {
        return buildCfImageUrl(pageNum, opts?.variant ?? 'public');
      }
      return buildUrl(`pg_${pageNum}.png`, {
        placeholder: opts?.placeholder,
        transform: opts?.transform,
        cdnImage: true,
      });
    },
    md: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${pageNum}.md`, { transform: opts?.transform }),
    json: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${pageNum}.json`, { transform: opts?.transform }),
  });

  const makePgRange = (segment: string): PgPageRange => ({
    md: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${segment}.md`, { transform: opts?.transform }),
    json: (opts?: { transform?: DeliveryTransform }) =>
      buildUrl(`pg_${segment}.json`, { transform: opts?.transform }),
  });

  const pg: PgProxy = new Proxy({} as PgProxy, {
    get(_target, prop) {
      if (prop === 'range') {
        return (start: number, end: number) => makePgRange(`${start}-${end}`);
      }
      if (prop === 'list') {
        return (...pages: number[]) => makePgRange(pages.join(','));
      }
      const pageNum = typeof prop === 'string' ? parseInt(prop, 10) : NaN;
      if (!isNaN(pageNum)) {
        return makePgPage(pageNum);
      }
      return undefined;
    },
  });

  const buildDocumentUrl = (outputOverride?: string): DocumentUrl => ({
    url: (opts?: UrlBuilderOptions) =>
      buildUrl('', {
        provider: opts?.provider,
        output: outputOverride,
        transform: opts?.transform,
        artifact: { stem: artifactBase, ext: extensionFor(opts?.format, 'json') },
        qs: formatParams(opts),
      }),
    thumbnail: {
      url: (opts?: { transform?: DeliveryTransform; variant?: string }) => {
        if (cfImages && !opts?.transform) {
          return buildCfImageUrl(1, opts?.variant ?? 'thumb');
        }
        return buildUrl('pg_1.png', { transform: opts?.transform, cdnImage: true });
      },
    },
    full: {
      md: () => `${docBase}/full.md`,
    },
    download: () => `${docBase}/download`,
    pg,
    entities: {
      tables: makeEntityCollection('tables'),
      figures: makeEntityCollection('figures'),
    },
    output: (schema: string) => {
      // Return a new builder with the output schema baked in.
      // We create a new doc() call with the output option set.
      return doc(documentId, baseUrl, { ...options, output: schema });
    },
  });

  return buildDocumentUrl();
}
