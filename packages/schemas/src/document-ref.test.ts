import { describe, it, expect } from "vitest";
import { docLocationSchema, citationSchema, citedResponseSchema } from "./document-ref.js";

describe("docLocationSchema", () => {
  it("accepts minimal ref (documentId + page)", () => {
    const result = docLocationSchema.safeParse({ documentId: "doc_abc", page: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts full ref with all optional fields", () => {
    const result = docLocationSchema.safeParse({
      documentId: "doc_abc",
      page: 54,
      bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
      nodeId: "node_doc-abc_p54_b0",
      type: "table",
      snippet: "Total Revenue: $123M",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing documentId", () => {
    const result = docLocationSchema.safeParse({ page: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects empty documentId", () => {
    const result = docLocationSchema.safeParse({ documentId: "", page: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects page <= 0", () => {
    expect(docLocationSchema.safeParse({ documentId: "d", page: 0 }).success).toBe(false);
    expect(docLocationSchema.safeParse({ documentId: "d", page: -1 }).success).toBe(false);
  });

  it("rejects non-integer page", () => {
    const result = docLocationSchema.safeParse({ documentId: "d", page: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects bbox out of 0-1 range", () => {
    const result = docLocationSchema.safeParse({
      documentId: "d",
      page: 1,
      bbox: { x: 0, y: 0, w: 1.5, h: 0.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe("citationSchema", () => {
  it("accepts valid citation", () => {
    const result = citationSchema.safeParse({
      sourceIndex: 1,
      ref: { documentId: "doc_abc", page: 3 },
      label: "Page 3, Revenue Table",
    });
    expect(result.success).toBe(true);
  });

  it("rejects sourceIndex <= 0", () => {
    const result = citationSchema.safeParse({
      sourceIndex: 0,
      ref: { documentId: "doc_abc", page: 1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("citedResponseSchema", () => {
  it("accepts valid cited response", () => {
    const result = citedResponseSchema.safeParse({
      text: "Revenue was $123M [source:1].",
      citations: [
        {
          sourceIndex: 1,
          ref: { documentId: "doc_abc", page: 54, type: "table" },
          label: "Page 54, Income Statement",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with empty citations", () => {
    const result = citedResponseSchema.safeParse({
      text: "No citations here.",
      citations: [],
    });
    expect(result.success).toBe(true);
  });
});
