import { describe, expect, it } from "vitest";
import {
  askPdfResponseSchema,
  pdfContextAgentSimulationSchema,
  pdfContextOfflineExampleSchema,
  pdfContextTraceComparisonSchema,
  getPdfContextRequestSchema,
  getPdfSourceFeaturePolicy,
  pdfSourceAllowsContextScope,
  readPdfStructureResponseSchema,
  resolvePdfSourceRequestSchema,
} from "./pdf-source-context.js";

describe("pdf source context contracts", () => {
  it("requires either a URL or SHA when resolving a source", () => {
    expect(resolvePdfSourceRequestSchema.safeParse({}).success).toBe(false);
    expect(
      resolvePdfSourceRequestSchema.safeParse({
        url: "https://example.com/report.pdf",
      }).success,
    ).toBe(true);
    expect(
      resolvePdfSourceRequestSchema.safeParse({
        sha256: "A".repeat(64),
      }).success,
    ).toBe(true);
  });

  it("keeps public unlicensed PDFs bounded to structure, snippets, and answers", () => {
    const policy = getPdfSourceFeaturePolicy("public_unlicensed");

    expect(pdfSourceAllowsContextScope("metadata", policy)).toBe(true);
    expect(pdfSourceAllowsContextScope("structure", policy)).toBe(true);
    expect(pdfSourceAllowsContextScope("bounded_context", policy)).toBe(true);
    expect(pdfSourceAllowsContextScope("answer", policy)).toBe(true);
    expect(pdfSourceAllowsContextScope("source_redirect", policy)).toBe(true);
    expect(pdfSourceAllowsContextScope("full_text", policy)).toBe(false);
    expect(pdfSourceAllowsContextScope("full_markdown", policy)).toBe(false);
  });

  it("allows full text only for permissioned-style scopes", () => {
    expect(
      pdfSourceAllowsContextScope(
        "full_markdown",
        getPdfSourceFeaturePolicy("owner_permissioned"),
      ),
    ).toBe(true);
    expect(
      pdfSourceAllowsContextScope(
        "full_markdown",
        getPdfSourceFeaturePolicy("blocked"),
      ),
    ).toBe(false);
  });

  it("validates a navigable outline with page ranges", () => {
    const result = readPdfStructureResponseSchema.safeParse({
      object: "pdf_structure",
      source_id: "src_demo",
      title: "Demo Report",
      page_count: 12,
      pages_parsed: 4,
      coverage: "partial",
      page_coverage: "partial",
      page_coverage_percent: 33,
      allowance_scope: "public_unlicensed",
      outline: [
        {
          id: "sec_overview",
          title: "Overview",
          level: 1,
          page_start: 1,
          page_end: 3,
          token_estimate: 680,
        },
        {
          id: "sec_metrics",
          title: "Operating Metrics",
          level: 2,
          parent_id: "sec_overview",
          page_start: 2,
          page_end: 3,
          token_estimate: 420,
          content_kinds: ["text", "table"],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects inverted structure page ranges", () => {
    const result = readPdfStructureResponseSchema.safeParse({
      object: "pdf_structure",
      source_id: "src_demo",
      allowance_scope: "public_unlicensed",
      outline: [
        {
          id: "bad",
          title: "Bad Range",
          level: 1,
          page_start: 4,
          page_end: 3,
          token_estimate: 10,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("defaults get_context to bounded context", () => {
    const result = getPdfContextRequestSchema.parse({
      source_id: "src_demo",
      query: "where are the covenants?",
    });

    expect(result.context_scope).toBe("bounded_context");
  });

  it("requires at least one citation for an answer", () => {
    expect(
      askPdfResponseSchema.safeParse({
        object: "pdf_answer",
        source_id: "src_demo",
        question: "What is due?",
        answer: "The borrower must deliver quarterly statements.",
        confidence: 0.8,
        citations: [],
      }).success,
    ).toBe(false);
  });

  it("validates offline query/result examples by tool name", () => {
    const result = pdfContextOfflineExampleSchema.safeParse({
      id: "example_context",
      title: "Find covenants",
      user_query: "Where are the reporting covenants?",
      user_visible_result: "The reporting covenant context is returned with a citation to page 79.",
      tool_name: "get_context",
      request: {
        source_id: "src_demo",
        query: "Where are the reporting covenants?",
      },
      response: {
        object: "pdf_context",
        source_id: "src_demo",
        query: "Where are the reporting covenants?",
        context_scope: "bounded_context",
        context_blocks: [
          {
            block_id: "ctx_demo",
            kind: "snippet",
            section_id: "sec_reporting",
            page: 79,
            text: "Reporting covenant context with a bounded snippet.",
            token_estimate: 12,
            citations: [
              {
                page: 79,
                section_id: "sec_reporting",
                citation_url: "https://example.com/report.pdf#page=79",
                bbox: { x: 0.12, y: 0.2, w: 0.5, h: 0.08 },
                bbox_source: "node",
              },
            ],
          },
        ],
        citations: [
          {
            page: 79,
            citation_url: "https://example.com/report.pdf#page=79",
            bbox: { x: 0.12, y: 0.2, w: 0.5, h: 0.08 },
            bbox_source: "node",
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.tool_name === "get_context") {
      expect(result.data.request.context_scope).toBe("bounded_context");
    }
  });

  it("validates with-vs-without trace comparisons", () => {
    const result = pdfContextTraceComparisonSchema.safeParse({
      id: "trace_demo",
      sample_id: "earnings-demo",
      title: "Extract P/L table",
      task: "Compare broad scanning against reading table inventory first.",
      baseline: {
        strategy: "without_okra",
        summary: "Read the full document, infer the table, then parse.",
        steps: [
          {
            id: "baseline_scan",
            label: "Scan document",
            actor: "agent",
            action: "Read the whole earnings release.",
            output_summary: "Large context with many candidate tables.",
            pages_touched: [1, 2, 3, 4],
            token_estimate: 4_000,
          },
        ],
        token_estimate: 4_000,
        pages_touched: [1, 2, 3, 4],
        result_confidence: 0.7,
      },
      okra: {
        strategy: "with_okra",
        summary: "Read table inventory, then parse the target page.",
        steps: [
          {
            id: "okra_tables",
            label: "Read tables",
            actor: "okra",
            tool_name: "read_structure",
            action: "Return table titles, columns, and pages.",
            output_summary: "P/L table is on page 6.",
            pages_touched: [6],
            token_estimate: 600,
          },
        ],
        token_estimate: 600,
        pages_touched: [6],
        result_confidence: 0.9,
      },
      outcome: {
        target_table_id: "tbl_pl",
        target_page: 6,
        saved_tokens_estimate: 3_400,
        token_reduction_percent: 85,
        pages_avoided: 3,
        result: "The target table is identified before parsing.",
      },
    });

    expect(result.success).toBe(true);
  });

  it("validates mocked downstream agent sessions", () => {
    const result = pdfContextAgentSimulationSchema.safeParse({
      id: "sim_demo",
      sample_id: "earnings-demo",
      title: "Claude targets table extraction",
      agent_user: {
        kind: "claude",
        name: "Claude analyst agent",
        prompt: "Find the P/L table first, then hand it to the parser.",
      },
      objective: "Mock an agent using Okra tool responses before parsing.",
      mocked_tool_exchanges: [
        {
          id: "example_structure",
          title: "Read structure",
          user_query: "Show me the tables.",
          user_visible_result: "The P/L table is on page 6.",
          tool_name: "read_structure",
          request: {
            source_id: "src_demo",
            include_artifacts: true,
          },
          response: {
            object: "pdf_structure",
            source_id: "src_demo",
            allowance_scope: "public_unlicensed",
            outline: [],
            tables: [
              {
                id: "tbl_pl",
                title_hint: "Statements of Operations",
                page: 6,
                columns: ["Q4 2025", "Q4 2024"],
              },
            ],
          },
        },
      ],
      final_handoff: {
        parser_task: "Parse page 6 table tbl_pl.",
        target_table_id: "tbl_pl",
        target_page: 6,
        expected_title: "Statements of Operations",
        expected_columns: ["Q4 2025", "Q4 2024"],
        validation_checks: ["Verify title and columns."],
      },
      expected_delta: {
        baseline_strategy: "Read broad context.",
        okra_strategy: "Read table inventory first.",
        why_faster: "The parser receives a page-level target.",
        token_estimate_without_okra: 4_000,
        token_estimate_with_okra: 600,
      },
    });

    expect(result.success).toBe(true);
  });
});
