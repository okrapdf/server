import { describe, it, expect } from "vitest";
import {
  parseFlatPageResource,
  parseFullMdResource,
  parsePageImageResource,
  pageImageR2Key,
  pageMdR2Key,
  fullMdR2Key,
} from "../src/page-resource";

describe("parseFlatPageResource", () => {
  it("pg_1.png → image format", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1.png");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: "png",
      format: "image",
    });
  });

  it("pg_1.md → md format", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1.md");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: "md",
      format: "md",
    });
  });

  it("pg_1.markdown → md format", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1.markdown");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: "markdown",
      format: "md",
    });
  });

  it("pg_1.json → json format", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1.json");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: "json",
      format: "json",
    });
  });

  it("pg_1 (no ext) → image default", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: null,
      format: "image",
    });
  });

  it("pg_1.xyz (unknown ext) → image default with null ext", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1.xyz");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: null,
      format: "image",
    });
  });

  it("works with t_/d_ modifier prefixes", () => {
    const r = parseFlatPageResource(
      "/v1/documents/doc-abc/t_redact/d_shimmer/pg_3.md",
    );
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 3,
      ext: "md",
      format: "md",
    });
  });

  it("handles multi-digit page numbers", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_142.png");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 142,
      ext: "png",
      format: "image",
    });
  });

  it("returns null for non-matching paths", () => {
    expect(parseFlatPageResource("/v1/documents/doc-abc/pages/1/image.png")).toBeNull();
    expect(parseFlatPageResource("/v1/documents/doc-abc/full.md")).toBeNull();
    expect(parseFlatPageResource("/other/path")).toBeNull();
  });

  it("case insensitive extension", () => {
    const r = parseFlatPageResource("/v1/documents/doc-abc/pg_1.PNG");
    expect(r).toEqual({
      documentId: "doc-abc",
      pageNum: 1,
      ext: "png",
      format: "image",
    });
  });
});

describe("parseFullMdResource", () => {
  it("parses /v1/documents/:id/full.md", () => {
    const r = parseFullMdResource("/v1/documents/doc-abc/full.md");
    expect(r).toEqual({ documentId: "doc-abc" });
  });

  it("returns null for full.json", () => {
    expect(parseFullMdResource("/v1/documents/doc-abc/full.json")).toBeNull();
  });

  it("returns null for non-matching paths", () => {
    expect(parseFullMdResource("/v1/documents/doc-abc/pg_1.md")).toBeNull();
    expect(parseFullMdResource("/v1/documents/doc-abc")).toBeNull();
  });
});

describe("parsePageImageResource", () => {
  it("pages/1/image.png → 1", () => {
    expect(parsePageImageResource("pages/1/image.png")).toBe(1);
  });

  it("pages/42/image → 42 (extensionless)", () => {
    expect(parsePageImageResource("pages/42/image")).toBe(42);
  });

  it("returns null for non-matching resource tails", () => {
    expect(parsePageImageResource("pages/1/markdown")).toBeNull();
    expect(parsePageImageResource("pg_1.png")).toBeNull();
    expect(parsePageImageResource("")).toBeNull();
  });
});

describe("R2 key helpers", () => {
  it("pageImageR2Key pads to 3 digits", () => {
    expect(pageImageR2Key("doc-x", 1)).toBe("pages/doc-x/page_001.png");
    expect(pageImageR2Key("doc-x", 42)).toBe("pages/doc-x/page_042.png");
    expect(pageImageR2Key("doc-x", 100)).toBe("pages/doc-x/page_100.png");
  });

  it("pageMdR2Key uses flat pg_N format", () => {
    expect(pageMdR2Key("doc-x", 1)).toBe("pages/doc-x/pg_1.md");
    expect(pageMdR2Key("doc-x", 42)).toBe("pages/doc-x/pg_42.md");
  });

  it("fullMdR2Key", () => {
    expect(fullMdR2Key("doc-x")).toBe("pages/doc-x/full.md");
  });
});
