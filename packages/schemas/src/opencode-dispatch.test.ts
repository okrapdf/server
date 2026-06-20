import { describe, it, expect } from "vitest";
import {
  openCodeWireMessageSchema,
  openCodeMessageListResponseSchema,
  parseOpenCodeMessages,
  type OpenCodeWireMessage,
  type OpenCodeParsedMessage,
  openCodePromptRequestSchema,
  RENDERABLE_PART_TYPES,
} from "./opencode-dispatch.js";

// ---------------------------------------------------------------------------
// Golden fixtures — identical payloads used for Swift conformance tests.
// If you change these, update the Swift test fixtures too.
// ---------------------------------------------------------------------------

/** Minimal happy-path: user prompt + assistant reply */
const FIXTURE_BASIC: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_001",
      role: "user",
      time: { created: 1711900800000 },
    },
    parts: [{ type: "text", text: "hello from phone" }],
  },
  {
    info: {
      id: "msg_002",
      role: "assistant",
      time: { created: 1711900801000 },
    },
    parts: [{ type: "text", text: "Hello! How can I help?" }],
  },
];

const EXPECTED_BASIC: OpenCodeParsedMessage[] = [
  {
    id: "msg_001",
    role: "user",
    content: "hello from phone",
    createdAt: 1711900800000,
  },
  {
    id: "msg_002",
    role: "assistant",
    content: "Hello! How can I help?",
    createdAt: 1711900801000,
  },
];

/** Reasoning parts should be concatenated with text parts */
const FIXTURE_REASONING: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_010",
      role: "assistant",
      time: { created: 1711900900000 },
    },
    parts: [
      { type: "reasoning", text: "The user is greeting me" },
      { type: "text", text: "Hello! How can I help?" },
    ],
  },
];

const EXPECTED_REASONING: OpenCodeParsedMessage[] = [
  {
    id: "msg_010",
    role: "assistant",
    content: "The user is greeting me\nHello! How can I help?",
    createdAt: 1711900900000,
  },
];

/** Non-renderable part types (tool_call, tool_result, etc.) should be dropped */
const FIXTURE_TOOL_PARTS: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_020",
      role: "assistant",
      time: { created: 1711901000000 },
    },
    parts: [
      { type: "tool_call", text: '{"name":"ls","args":{}}' },
      { type: "text", text: "Here are your files." },
      { type: "tool_result", text: "file1.txt\nfile2.txt" },
    ],
  },
];

const EXPECTED_TOOL_PARTS: OpenCodeParsedMessage[] = [
  {
    id: "msg_020",
    role: "assistant",
    content: "Here are your files.",
    createdAt: 1711901000000,
  },
];

/** Messages with only non-renderable parts should be dropped entirely */
const FIXTURE_TOOL_ONLY: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_030",
      role: "assistant",
      time: { created: 1711901100000 },
    },
    parts: [{ type: "tool_call", text: '{"name":"read_file"}' }],
  },
];

/** Empty parts array should drop the message */
const FIXTURE_EMPTY_PARTS: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_040",
      role: "assistant",
      time: { created: 1711901200000 },
    },
    parts: [],
  },
];

/** Missing parts field should drop the message */
const FIXTURE_NO_PARTS: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_050",
      role: "assistant",
      time: { created: 1711901300000 },
    },
  },
];

/** Whitespace-only text should be treated as empty */
const FIXTURE_WHITESPACE: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_060",
      role: "assistant",
      time: { created: 1711901400000 },
    },
    parts: [{ type: "text", text: "   \n  \t  " }],
  },
];

/** Missing time should default createdAt to 0 */
const FIXTURE_NO_TIME: OpenCodeWireMessage[] = [
  {
    info: { id: "msg_070", role: "user" },
    parts: [{ type: "text", text: "no timestamp" }],
  },
];

const EXPECTED_NO_TIME: OpenCodeParsedMessage[] = [
  {
    id: "msg_070",
    role: "user",
    content: "no timestamp",
    createdAt: 0,
  },
];

/** Sort order: by createdAt, then by id for ties */
const FIXTURE_SORT: OpenCodeWireMessage[] = [
  {
    info: {
      id: "msg_b",
      role: "assistant",
      time: { created: 1000 },
    },
    parts: [{ type: "text", text: "second" }],
  },
  {
    info: {
      id: "msg_a",
      role: "user",
      time: { created: 1000 },
    },
    parts: [{ type: "text", text: "first (same ts, lower id)" }],
  },
  {
    info: {
      id: "msg_c",
      role: "user",
      time: { created: 500 },
    },
    parts: [{ type: "text", text: "earliest" }],
  },
];

const EXPECTED_SORT: OpenCodeParsedMessage[] = [
  { id: "msg_c", role: "user", content: "earliest", createdAt: 500 },
  {
    id: "msg_a",
    role: "user",
    content: "first (same ts, lower id)",
    createdAt: 1000,
  },
  { id: "msg_b", role: "assistant", content: "second", createdAt: 1000 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("opencode-dispatch", () => {
  describe("wire schema validation", () => {
    it("accepts a basic message array", () => {
      const result = openCodeMessageListResponseSchema.safeParse(FIXTURE_BASIC);
      expect(result.success).toBe(true);
    });

    it("accepts message with missing parts", () => {
      const result = openCodeWireMessageSchema.safeParse(FIXTURE_NO_PARTS[0]);
      expect(result.success).toBe(true);
    });

    it("accepts message with missing time", () => {
      const result = openCodeWireMessageSchema.safeParse(FIXTURE_NO_TIME[0]);
      expect(result.success).toBe(true);
    });
  });

  describe("parseOpenCodeMessages", () => {
    it("parses basic user + assistant exchange", () => {
      expect(parseOpenCodeMessages(FIXTURE_BASIC)).toEqual(EXPECTED_BASIC);
    });

    it("concatenates reasoning + text parts with newline", () => {
      expect(parseOpenCodeMessages(FIXTURE_REASONING)).toEqual(
        EXPECTED_REASONING
      );
    });

    it("drops non-renderable part types (tool_call, tool_result)", () => {
      expect(parseOpenCodeMessages(FIXTURE_TOOL_PARTS)).toEqual(
        EXPECTED_TOOL_PARTS
      );
    });

    it("drops messages with only non-renderable parts", () => {
      expect(parseOpenCodeMessages(FIXTURE_TOOL_ONLY)).toEqual([]);
    });

    it("drops messages with empty parts array", () => {
      expect(parseOpenCodeMessages(FIXTURE_EMPTY_PARTS)).toEqual([]);
    });

    it("drops messages with missing parts field", () => {
      expect(parseOpenCodeMessages(FIXTURE_NO_PARTS)).toEqual([]);
    });

    it("drops messages with whitespace-only text", () => {
      expect(parseOpenCodeMessages(FIXTURE_WHITESPACE)).toEqual([]);
    });

    it("defaults createdAt to 0 when time is missing", () => {
      expect(parseOpenCodeMessages(FIXTURE_NO_TIME)).toEqual(EXPECTED_NO_TIME);
    });

    it("sorts by createdAt ASC, then id ASC for ties", () => {
      expect(parseOpenCodeMessages(FIXTURE_SORT)).toEqual(EXPECTED_SORT);
    });

    it("returns empty array for empty input", () => {
      expect(parseOpenCodeMessages([])).toEqual([]);
    });
  });

  describe("openCodePromptRequest", () => {
    it("accepts optional system and text parts", () => {
      const result = openCodePromptRequestSchema.safeParse({
        system: "You are a concise agent.",
        parts: [{ type: "text", text: "hello" }],
        model: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
        variant: "high",
      });
      expect(result.success).toBe(true);
    });

    it("rejects payloads without parts", () => {
      const result = openCodePromptRequestSchema.safeParse({
        system: "sys",
        model: { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("RENDERABLE_PART_TYPES", () => {
    it("includes text and reasoning only", () => {
      expect([...RENDERABLE_PART_TYPES]).toEqual(["text", "reasoning"]);
    });
  });
});
