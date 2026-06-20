import { describe, expect, it } from "vitest";
import {
  apiCitationSchema,
  citationCreateRequestSchema,
} from "./citation.js";

describe("citationCreateRequestSchema", () => {
  it("accepts a document-scoped locator with default pixel bbox semantics", () => {
    const parsed = citationCreateRequestSchema.parse({
      claim: "Apple FY2025 total revenue was $416.2B",
      locator: {
        type: "table",
        page: 32,
        value: "$416,161",
        match: "contains",
        bbox: {
          unit: "px",
          x: 120,
          y: 440,
          width: 180,
          height: 32,
          page_width: 1600,
          page_height: 2200,
        },
      },
    });

    expect(parsed.min_grade).toBe("high");
    expect(parsed.locator.bbox?.unit).toBe("px");
  });
});

describe("apiCitationSchema", () => {
  it("represents bbox, page-only, text-anchor, and external provider citation styles", () => {
    const base = {
      object: "citation" as const,
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      document_id: "doc_abc",
      claim: "Revenue was $416.2B",
      url: "https://link.okrapdf.com/c/aaaaaaaaaaaaaaaaaaaaaaaa",
      href: "https://link.okrapdf.com/c/aaaaaaaaaaaaaaaaaaaaaaaa",
      evidence: [],
    };

    expect(
      apiCitationSchema.safeParse({
        ...base,
        location: {
          type: "page_region",
          page: 32,
          bbox: { unit: "px", x: 10, y: 20, width: 30, height: 40 },
          normalized_bbox: { unit: "normalized", x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        },
      }).success,
    ).toBe(true);

    expect(apiCitationSchema.safeParse({ ...base, location: { type: "page", page: 32 } }).success).toBe(true);
    expect(
      apiCitationSchema.safeParse({
        ...base,
        location: { type: "text_anchor", page: 32, quote: "$416,161", match: "contains" },
      }).success,
    ).toBe(true);
    expect(
      apiCitationSchema.safeParse({
        ...base,
        location: { type: "external", provider: "provider-x", raw: { citation_id: "raw-1" } },
      }).success,
    ).toBe(true);
  });
});
