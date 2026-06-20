import { describe, expect, it } from "vitest";
import {
  BUILTIN_PARSER_PROMPTS,
  GEMINI_3_FLASH_MODEL,
  isParserProfileExecutable,
  listExecutableParserProfiles,
  promptRegistryKey,
  resolveParserModel,
  resolveParserProfile,
  resolveParserProfileByModelPrompt,
  resolveParserPrompt,
} from "./parser-profile.js";

describe("parser profile registry", () => {
  it("resolves legacy gemini-vision alias to a versioned prompt", () => {
    const profile = resolveParserProfile("gemini-vision");

    expect(profile).toMatchObject({
      id: "gemini-3-flash-minimal",
      model: GEMINI_3_FLASH_MODEL,
      prompt_id: "layout-bbox-gemini-multipage",
      prompt_version: 1,
      confidence_kind: "vlm_self_reported",
    });
    expect(resolveParserPrompt(profile!.prompt_id, profile!.prompt_version)).toMatchObject({
      id: "layout-bbox-gemini-multipage",
      version: 1,
      bbox_order: "y_min_x_min_y_max_x_max",
    });
  });

  it("keeps both Gemini bbox prompting techniques model-scoped", () => {
    expect(Object.keys(BUILTIN_PARSER_PROMPTS)).toEqual(expect.arrayContaining([
      "layout-divbbox@1",
      "layout-bbox-parsebench@1",
    ]));

    const defaultPrompt = BUILTIN_PARSER_PROMPTS["layout-divbbox@1"];
    const parsebenchPrompt = BUILTIN_PARSER_PROMPTS["layout-bbox-parsebench@1"];

    expect(defaultPrompt.model).toBe(GEMINI_3_FLASH_MODEL);
    expect(parsebenchPrompt.model).toBe(GEMINI_3_FLASH_MODEL);
    expect(defaultPrompt.bbox_order).toBe("x1_y1_x2_y2");
    expect(parsebenchPrompt.bbox_order).toBe("y_min_x_min_y_max_x_max");
  });

  it("resolves a model and prompt pair to the alternate Gemini profile", () => {
    const profile = resolveParserProfileByModelPrompt(
      GEMINI_3_FLASH_MODEL,
      promptRegistryKey("layout-bbox-parsebench", 1),
    );

    expect(profile?.id).toBe("gemini-3-flash-parsebench");
    expect(profile?.prompt_id).toBe("layout-bbox-parsebench");
  });

  it("stamps the default profile with the prompt the worker executes (#431 review)", () => {
    const profile = resolveParserProfile("gemini-vision");
    expect(profile?.prompt_id).toBe("layout-bbox-gemini-multipage");
    const prompt = BUILTIN_PARSER_PROMPTS["layout-bbox-gemini-multipage@1"];
    expect(prompt.system_prompt_ref).toBe("SYSTEM_PROMPT_LAYOUT_GEMINI_MULTIPAGE");
    expect(prompt.bbox_order).toBe("y_min_x_min_y_max_x_max");
  });

  it("resolves natural model spellings through aliases (#431 review)", () => {
    expect(resolveParserModel("gemini-3-flash")).toBe(GEMINI_3_FLASH_MODEL);
    const profile = resolveParserProfileByModelPrompt("gemini-3-flash", "layout-bbox-gemini-multipage");
    expect(profile?.id).toBe("gemini-3-flash-minimal");
    const viaKey = resolveParserProfileByModelPrompt("gemini-3-flash", "layout-bbox-gemini-multipage@1");
    expect(viaKey?.id).toBe("gemini-3-flash-minimal");
  });

  it("marks unhonored prompt selections non-executable instead of stamping fiction", () => {
    const parsebench = resolveParserProfile("gemini-3-flash-parsebench");
    expect(isParserProfileExecutable(parsebench)).toBe(false);
    expect(listExecutableParserProfiles().map((profile) => profile.id)).not.toContain("gemini-3-flash-parsebench");
    expect(isParserProfileExecutable(resolveParserProfile("gemini-vision"))).toBe(true);
  });
});
