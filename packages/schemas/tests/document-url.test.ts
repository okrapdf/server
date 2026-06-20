import { describe, it, expect } from "vitest";
import {
  parseDocumentUrl,
  buildDocumentUrl,
  buildDeliveryTransformSegment,
  buildModifierSegments,
  createTransformationBuilder,
  parseDeliveryTransformSegment,
  Transformation,
  toCfImageOptions,
  type ParsedDocumentUrl,
} from "../src/document-url";

// ── Parsing ─────────────────────────────────────────────────────────────────

describe("parseDocumentUrl", () => {
  // ── Resource types ──────────────────────────────────────────────────

  it("parses page image URL", () => {
    const r = parseDocumentUrl("/v1/documents/ocr-abc123/pages/1/image.png");
    expect(r.documentId).toBe("ocr-abc123");
    expect(r.resource).toBe("pages/1/image.png");
    expect(r.modifiers).toEqual({});
  });

  it("parses page markdown URL", () => {
    const r = parseDocumentUrl("/v1/documents/abc/pages/3/markdown");
    expect(r.resource).toBe("pages/3/markdown");
  });

  it("parses entities URL", () => {
    const r = parseDocumentUrl("/v1/documents/abc/entities/tables");
    expect(r.resource).toBe("entities/tables");
  });

  it("parses single entity URL", () => {
    const r = parseDocumentUrl("/v1/documents/abc/entities/tables/0");
    expect(r.resource).toBe("entities/tables/0");
  });

  it("parses thumbnail URL", () => {
    const r = parseDocumentUrl("/v1/documents/abc/thumbnail");
    expect(r.resource).toBe("thumbnail");
  });

  it("parses document root (no resource)", () => {
    const r = parseDocumentUrl("/v1/documents/abc");
    expect(r.resource).toBe("");
  });

  // ── Single modifiers ──────────────────────────────────────────────────

  it("parses t_ (variant)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/t_redact/pages/1/image.png");
    expect(r.modifiers.variant).toBe("redact");
    expect(r.resource).toBe("pages/1/image.png");
  });

  it("parses d_ (default)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/d_auto/pages/1/image.png");
    expect(r.modifiers.default).toBe("auto");
  });

  it("parses d_color:hex", () => {
    const r = parseDocumentUrl("/v1/documents/abc/d_color:ff5733/pages/1/image.png");
    expect(r.modifiers.default).toBe("color:ff5733");
  });

  it("parses o_ (output schema)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/o_invoice/pages/1/markdown");
    expect(r.modifiers.output).toBe("invoice");
    expect(r.resource).toBe("pages/1/markdown");
  });

  it("parses pg_ (page selector)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/pg_1,3,5/pages/1/image.png");
    expect(r.modifiers.pages).toBe("1,3,5");
  });

  it("parses pg_ with range", () => {
    const r = parseDocumentUrl("/v1/documents/abc/pg_1-5/pages/1/image.png");
    expect(r.modifiers.pages).toBe("1-5");
  });

  // ── Delivery transforms (original sizing keys) ─────────────────────────

  it("parses w_ only", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_200/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 200 });
  });

  it("parses h_ only", () => {
    const r = parseDocumentUrl("/v1/documents/abc/h_300/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ h: 300 });
  });

  it("parses w_ + h_ + f_ combo", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_200,h_300,f_avif/pages/5/image.png");
    expect(r.modifiers.transform).toEqual({ w: 200, h: 300, f: "avif" });
  });

  it("parses sizing + quality + format + fit", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_800,h_600,q_80,f_webp,c_cover/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({
      w: 800, h: 600, q: 80, f: "webp", c: "cover",
    });
  });

  // ── CF Image Resizing keys ──────────────────────────────────────────────

  it("parses bl_ (blur)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/bl_50/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ bl: 50 });
  });

  it("parses sh_ (sharpen) float", () => {
    const r = parseDocumentUrl("/v1/documents/abc/sh_1.5/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ sh: 1.5 });
  });

  it("parses r_ (rotate)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/r_90/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ r: 90 });
  });

  it("parses br_,co_,sa_ (color adjustments)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/br_1.5,co_0.8,sa_0/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ br: 1.5, co: 0.8, sa: 0 });
  });

  it("parses g_ (gravity)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_400,h_400,c_cover,g_face/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 400, h: 400, c: "cover", g: "face" });
  });

  it("parses dpr_ (device pixel ratio)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_200,dpr_2/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 200, dpr: 2 });
  });

  it("parses fl_ (flip)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/fl_hv/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ fl: "hv" });
  });

  it("parses bg_ (background)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_200,c_pad,bg_ff5733/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 200, c: "pad", bg: "ff5733" });
  });

  it("parses md_ (metadata)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_200,md_none/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 200, md: "none" });
  });

  it("parses anim_ (animation)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_200,anim_false/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 200, anim: false });
  });

  it("parses seg_ (AI segment)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/seg_foreground/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ seg: "foreground" });
  });

  it("parses zm_ (face zoom)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/w_400,c_cover,g_face,zm_0.7/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ w: 400, c: "cover", g: "face", zm: 0.7 });
  });

  it("parses format-only transform (no w/h required)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/f_avif,q_80/pages/1/image.png");
    expect(r.modifiers.transform).toEqual({ f: "avif", q: 80 });
  });

  it("kitchen sink: all CF keys", () => {
    const r = parseDocumentUrl(
      "/v1/documents/abc/w_800,h_600,dpr_2,q_80,f_webp,md_none,c_cover,g_auto,zm_0.5,bl_10,sh_2,br_1.1,co_1.2,sa_0.8,r_90,fl_h,bg_000000,anim_true,seg_foreground/pages/1/image.png"
    );
    expect(r.modifiers.transform).toEqual({
      w: 800, h: 600, dpr: 2, q: 80, f: "webp", md: "none",
      c: "cover", g: "auto", zm: 0.5, bl: 10, sh: 2,
      br: 1.1, co: 1.2, sa: 0.8, r: 90, fl: "h",
      bg: "000000", anim: true, seg: "foreground",
    });
  });

  // ── Composed modifiers (any order) ────────────────────────────────────

  it("composes t_ + delivery + d_ on image", () => {
    const r = parseDocumentUrl(
      "/v1/documents/abc/t_redact/w_200,h_300,f_avif/d_auto/pages/5/image.png"
    );
    expect(r.modifiers.variant).toBe("redact");
    expect(r.modifiers.default).toBe("auto");
    expect(r.modifiers.transform).toEqual({ w: 200, h: 300, f: "avif" });
    expect(r.resource).toBe("pages/5/image.png");
  });

  it("composes in reverse order (d_ + delivery + t_)", () => {
    const r = parseDocumentUrl(
      "/v1/documents/abc/d_shimmer/w_400/t_redact/pages/1/image.png"
    );
    expect(r.modifiers.variant).toBe("redact");
    expect(r.modifiers.default).toBe("shimmer");
    expect(r.modifiers.transform).toEqual({ w: 400 });
  });

  it("composes o_ + pg_ on markdown", () => {
    const r = parseDocumentUrl(
      "/v1/documents/abc/o_invoice/pg_1,3/pages/5/markdown"
    );
    expect(r.modifiers.output).toBe("invoice");
    expect(r.modifiers.pages).toBe("1,3");
    expect(r.resource).toBe("pages/5/markdown");
  });

  it("modifiers on entities resource", () => {
    const r = parseDocumentUrl(
      "/v1/documents/abc/o_invoice/entities/tables"
    );
    expect(r.modifiers.output).toBe("invoice");
    expect(r.resource).toBe("entities/tables");
  });

  it("modifiers on document root", () => {
    const r = parseDocumentUrl("/v1/documents/abc/t_redact");
    expect(r.modifiers.variant).toBe("redact");
    expect(r.resource).toBe("");
  });

  it("all modifiers at once", () => {
    const r = parseDocumentUrl(
      "/v1/documents/doc-xyz/t_redact/o_invoice/pg_1-5/w_400,h_300,f_auto,q_75,c_contain/d_auto/pages/2/image.png"
    );
    expect(r.documentId).toBe("doc-xyz");
    expect(r.resource).toBe("pages/2/image.png");
    expect(r.modifiers.variant).toBe("redact");
    expect(r.modifiers.output).toBe("invoice");
    expect(r.modifiers.pages).toBe("1-5");
    expect(r.modifiers.default).toBe("auto");
    expect(r.modifiers.transform).toEqual({
      w: 400, h: 300, f: "auto", q: 75, c: "contain",
    });
  });

  // ── Validation errors ─────────────────────────────────────────────────

  it("rejects duplicate modifier (two t_ segments)", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/t_redact/t_clean/pages/1/image.png")
    ).toThrow("Duplicate modifier");
  });

  it("rejects duplicate delivery transform segments", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/w_200/h_300/pages/1/image.png")
    ).toThrow("Duplicate delivery transform");
  });

  it("rejects missing document ID", () => {
    expect(() => parseDocumentUrl("/v1/documents//pages/1/image.png")).toThrow();
  });

  it("treats unknown prefix as resource (not modifier)", () => {
    const r = parseDocumentUrl("/v1/documents/abc/x_unknown/pages/1/image.png");
    expect(r.modifiers).toEqual({});
    expect(r.resource).toBe("x_unknown/pages/1/image.png");
  });

  it("rejects invalid format value", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/w_200,f_bmp/pages/1/image.png")
    ).toThrow();
  });

  it("rejects invalid crop value", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/w_200,c_magic/pages/1/image.png")
    ).toThrow();
  });

  it("rejects quality out of range", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/w_200,q_0/pages/1/image.png")
    ).toThrow();
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/w_200,q_101/pages/1/image.png")
    ).toThrow();
  });

  it("rejects blur out of range", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/bl_0/pages/1/image.png")
    ).toThrow();
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/bl_251/pages/1/image.png")
    ).toThrow();
  });

  it("rejects invalid rotate value", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/r_45/pages/1/image.png")
    ).toThrow();
  });

  it("rejects invalid gravity value", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/w_200,g_diagonal/pages/1/image.png")
    ).toThrow();
  });

  it("rejects invalid flip value", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/fl_diagonal/pages/1/image.png")
    ).toThrow();
  });

  it("rejects zoom out of range", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/zm_1.5/pages/1/image.png")
    ).toThrow();
  });

  it("rejects invalid segment value", () => {
    expect(() =>
      parseDocumentUrl("/v1/documents/abc/seg_background/pages/1/image.png")
    ).toThrow();
  });
});

// ── Serialization ───────────────────────────────────────────────────────────

describe("buildModifierSegments", () => {
  it("returns empty array for no modifiers", () => {
    expect(buildModifierSegments({})).toEqual([]);
  });

  it("builds single modifier", () => {
    expect(buildModifierSegments({ variant: "redact" })).toEqual(["t_redact"]);
  });

  it("builds delivery transform", () => {
    const segs = buildModifierSegments({ transform: { w: 200, h: 300 } });
    expect(segs).toEqual(["w_200,h_300"]);
  });

  it("builds new CF keys", () => {
    const segs = buildModifierSegments({ transform: { bl: 50, sa: 0, fl: "h" } });
    expect(segs).toEqual(["bl_50,sa_0,fl_h"]);
  });

  it("builds all modifiers", () => {
    const segs = buildModifierSegments({
      variant: "redact",
      default: "auto",
      output: "invoice",
      pages: "1,3",
      transform: { w: 400, f: "avif" },
    });
    expect(segs).toContain("t_redact");
    expect(segs).toContain("d_auto");
    expect(segs).toContain("o_invoice");
    expect(segs).toContain("pg_1,3");
    expect(segs).toContainEqual("w_400,f_avif");
  });
});

describe("buildDocumentUrl", () => {
  it("builds bare image URL", () => {
    expect(
      buildDocumentUrl({ documentId: "abc", resource: "pages/1/image.png", modifiers: {} })
    ).toBe("/v1/documents/abc/pages/1/image.png");
  });

  it("builds markdown URL with modifiers", () => {
    const url = buildDocumentUrl({
      documentId: "ocr-xyz",
      resource: "pages/5/markdown",
      modifiers: { variant: "redact", output: "invoice" },
    });
    expect(url).toBe("/v1/documents/ocr-xyz/t_redact/o_invoice/pages/5/markdown");
  });

  it("builds document root with modifiers", () => {
    const url = buildDocumentUrl({
      documentId: "abc",
      resource: "",
      modifiers: { variant: "redact" },
    });
    expect(url).toBe("/v1/documents/abc/t_redact");
  });

  it("builds entities URL", () => {
    const url = buildDocumentUrl({
      documentId: "abc",
      resource: "entities/tables",
      modifiers: { output: "invoice" },
    });
    expect(url).toBe("/v1/documents/abc/o_invoice/entities/tables");
  });
});

// ── TransformationBuilder ────────────────────────────────────────────────────

describe("TransformationBuilder", () => {
  it("builds canonical transform segments from friendly names", () => {
    const segment = createTransformationBuilder()
      .width(320)
      .height(480)
      .quality(80)
      .format("webp")
      .fit("scale-down")
      .segment();

    expect(segment).toBe("w_320,h_480,q_80,f_webp,c_scale-down");
    expect(parseDeliveryTransformSegment(segment)).toEqual({
      w: 320,
      h: 480,
      q: 80,
      f: "webp",
      c: "scale-down",
    });
  });

  it("supports one-call parameter building", () => {
    expect(buildDeliveryTransformSegment({
      width: 640,
      height: 840,
      quality: 82,
      format: "avif",
      fit: "contain",
    })).toBe("w_640,h_840,q_82,f_avif,c_contain");
  });

  it("exposes the class under Transformation.Builder", () => {
    const builder = new Transformation.Builder({ width: 200, format: "png" });
    expect(builder.segment()).toBe("w_200,f_png");
  });
});

// ── toCfImageOptions ─────────────────────────────────────────────────────────

describe("toCfImageOptions", () => {
  it("maps basic sizing keys", () => {
    expect(toCfImageOptions({ w: 200, h: 300 })).toEqual({
      width: 200, height: 300,
    });
  });

  it("maps all keys to CF names", () => {
    const opts = toCfImageOptions({
      w: 800, h: 600, dpr: 2, q: 80, f: "webp", md: "none",
      c: "cover", g: "auto", zm: 0.5, bl: 10, sh: 2,
      br: 1.1, co: 1.2, sa: 0.8, r: 90, fl: "h",
      bg: "000000", anim: true, seg: "foreground",
    });
    expect(opts).toEqual({
      width: 800, height: 600, dpr: 2, quality: 80, format: "webp",
      metadata: "none", fit: "cover", gravity: "auto", zoom: 0.5,
      blur: 10, sharpen: 2, brightness: 1.1, contrast: 1.2,
      saturation: 0.8, rotate: 90, flip: "h", background: "#000000",
      anim: true, segment: "foreground",
    });
  });

  it("prepends # to hex background colors", () => {
    expect(toCfImageOptions({ bg: "ff5733" })).toEqual({ background: "#ff5733" });
    expect(toCfImageOptions({ bg: "fff" })).toEqual({ background: "#fff" });
  });

  it("passes non-hex background as-is", () => {
    expect(toCfImageOptions({ bg: "rgb(255,0,0)" })).toEqual({ background: "rgb(255,0,0)" });
  });

  it("omits undefined keys", () => {
    const opts = toCfImageOptions({ w: 200 });
    expect(Object.keys(opts)).toEqual(["width"]);
  });
});

// ── Roundtrip ───────────────────────────────────────────────────────────────

describe("roundtrip", () => {
  const cases: ParsedDocumentUrl[] = [
    { documentId: "abc", resource: "pages/1/image.png", modifiers: {} },
    { documentId: "ocr-123", resource: "pages/42/markdown", modifiers: { variant: "redact" } },
    { documentId: "doc-x", resource: "thumbnail", modifiers: { default: "shimmer" } },
    { documentId: "abc", resource: "entities/tables", modifiers: { output: "invoice", pages: "1-5" } },
    { documentId: "abc", resource: "", modifiers: { variant: "redact" } },
    {
      documentId: "abc",
      resource: "pages/7/image.png",
      modifiers: {
        variant: "redact",
        default: "auto",
        output: "invoice",
        pages: "1,3",
        transform: { w: 800, h: 600, q: 80, f: "webp", c: "cover" },
      },
    },
    {
      documentId: "abc",
      resource: "pages/1/image.png",
      modifiers: {
        transform: { bl: 50, sh: 1.5, sa: 0, r: 180, fl: "hv" },
      },
    },
  ];

  for (const input of cases) {
    it(`roundtrips: ${input.resource || "(root)"} ${JSON.stringify(input.modifiers)}`, () => {
      const url = buildDocumentUrl(input);
      const parsed = parseDocumentUrl(url);
      expect(parsed).toEqual(input);
    });
  }
});
