/**
 * Page resource URL parsing and R2 key helpers.
 *
 * Single source of truth for the pg_N flat URL contract.
 * Extracted from index.ts to prevent drift between URL normalizer,
 * route handler, and DO export paths.
 */

import { z } from "zod";

export const PageExtension = z.enum([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "md",
  "markdown",
  "json",
]);
export type PageExtension = z.infer<typeof PageExtension>;

export const IMAGE_EXTENSIONS = new Set<PageExtension>([
  "png",
  "jpg",
  "jpeg",
  "webp",
]);
export const MD_EXTENSIONS = new Set<PageExtension>(["md", "markdown"]);

export type PageResourceFormat = "image" | "md" | "json";

export interface FlatPageResource {
  documentId: string;
  pageNum: number;
  ext: PageExtension | null;
  format: PageResourceFormat;
}

export interface FullMdResource {
  documentId: string;
}

/**
 * Parse a flat pg_N resource from a *pre-normalization* pathname.
 *
 * Matches:
 *   /v1/documents/:id/pg_1.png
 *   /v1/documents/:id/t_redact/d_shimmer/pg_1.md
 *   /v1/documents/:id/pg_1          (no ext → image default)
 */
export function parseFlatPageResource(
  originalPathname: string,
): FlatPageResource | null {
  const m = originalPathname.match(
    /^\/v1\/documents\/([^/]+)\/(?:(?:t_[^/]+|d_[^/]+|o_[^/]+|pg_[^/]+|(?:[a-z]+_[^/]+))\/)*pg_(\d+)(?:\.(\w+))?$/,
  );
  if (!m) return null;

  const ext = m[3]
    ? PageExtension.safeParse(m[3].toLowerCase())
    : null;
  const parsedExt = ext?.success ? ext.data : null;

  return {
    documentId: m[1],
    pageNum: parseInt(m[2], 10),
    ext: parsedExt,
    format:
      parsedExt === null
        ? "image"
        : IMAGE_EXTENSIONS.has(parsedExt)
          ? "image"
          : MD_EXTENSIONS.has(parsedExt)
            ? "md"
            : "json",
  };
}

/**
 * Parse /v1/documents/:id/full.md from pre-normalization pathname.
 */
export function parseFullMdResource(
  originalPathname: string,
): FullMdResource | null {
  const m = originalPathname.match(
    /^\/v1\/documents\/([^/]+)\/full\.md$/,
  );
  return m ? { documentId: m[1] } : null;
}

/**
 * Extract page number from a `pages/N/image(.png)?` resource tail.
 * Works on the `resource` field from `parseDocumentUrl()` or a raw subpath.
 */
export function parsePageImageResource(
  resource: string,
): number | null {
  const m = resource.match(/^pages\/(\d+)\/image(?:\.png)?$/);
  return m ? parseInt(m[1], 10) : null;
}

/** R2 key for a page image. */
export function pageImageR2Key(
  documentId: string,
  pageNum: number,
): string {
  return `pages/${documentId}/page_${String(pageNum).padStart(3, "0")}.png`;
}

/** R2 key for per-page markdown. */
export function pageMdR2Key(
  documentId: string,
  pageNum: number,
): string {
  return `pages/${documentId}/pg_${pageNum}.md`;
}

/** R2 key for full-document markdown. */
export function fullMdR2Key(documentId: string): string {
  return `pages/${documentId}/full.md`;
}
