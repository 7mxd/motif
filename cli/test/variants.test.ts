import { describe, expect, test } from "bun:test";
import { docFrom, validTokens } from "./helpers";
import { resolveMode } from "../src/contract/resolve";
import { checkVariants, readVariants, variantView } from "../src/contract/variants";

const DECL = [{ id: "women", label: "Women", default: true }, { id: "men", label: "Men" }];
const COLOR_MEN = { value: "{primitive.color.white}", dark: "{primitive.color.gray.800}" };

function withVariants(decl: unknown, surface?: unknown) {
  const t = validTokens();
  t.$extensions = { ...(t.$extensions ?? {}), "dev.motif": { ...(t.$extensions?.["dev.motif"] ?? {}), variants: decl } };
  if (surface !== undefined) {
    const ext = t.color.surface.$extensions["dev.motif"];
    t.color.surface.$extensions["dev.motif"] = { ...ext, variants: surface };
  }
  return docFrom(t);
}
const codes = (doc: ReturnType<typeof docFrom>) => checkVariants(doc).map((f) => f.code);

describe("readVariants", () => {
  test("a guide with no variants block has none", () => {
    expect(readVariants(docFrom(validTokens()))).toEqual({ variants: [], defaultId: null, findings: [] });
  });
  test("lists the default first", () => {
    const r = readVariants(withVariants([DECL[1], DECL[0]], { men: COLOR_MEN }));
    expect(r.defaultId).toBe("women");
    expect(r.variants.map((v) => v.id)).toEqual(["women", "men"]);
  });
  test("reads declared variants", () => {
    const r = readVariants(withVariants(DECL, { men: COLOR_MEN }));
    expect(r.defaultId).toBe("women");
    expect(r.variants.map((v) => v.id)).toEqual(["women", "men"]);
    expect(r.findings).toEqual([]);
  });
});

describe("variantView", () => {
  test("swaps a role's values, and roles aliased to it follow", () => {
    const t = validTokens();
    t.color["surface-raised"].$value = "{color.surface}";
    delete t.color["surface-raised"].$extensions;
    t.color.surface.$extensions["dev.motif"].variants = { men: { value: "#123456", dark: "#654321" } };
    t.$extensions = { "dev.motif": { variants: DECL } };
    const doc = docFrom(t);
    const view = variantView(doc, "men");
    for (const p of ["color.surface", "color.surface-raised"]) {
      expect(resolveMode(view, p, "light")).toMatchObject({ ok: true, value: "#123456" });
      expect(resolveMode(view, p, "dark")).toMatchObject({ ok: true, value: "#654321" });
    }
    expect(resolveMode(doc, "color.surface", "light")).not.toMatchObject({ value: "#123456" });
  });
  test("the default variant is the document itself", () => {
    const doc = withVariants(DECL, { men: COLOR_MEN });
    expect(variantView(doc, "women")).toBe(doc);
  });
});

describe("checkVariants", () => {
  test("bad-variant-id", () => {
    expect(codes(withVariants([{ id: "Men", label: "Men" }, DECL[0]]))).toContain("bad-variant-id");
  });
  test("no-default-variant", () => {
    expect(codes(withVariants([{ id: "women", label: "W" }, DECL[1]]))).toContain("no-default-variant");
  });
  test("several-default-variants", () => {
    expect(codes(withVariants([DECL[0], { ...DECL[1], default: true }]))).toContain("several-default-variants");
  });
  test("unknown-variant", () => {
    expect(codes(withVariants(DECL, { kids: COLOR_MEN, men: COLOR_MEN }))).toContain("unknown-variant");
  });
  test("empty-variant is a warning", () => {
    const f = checkVariants(withVariants(DECL)).find((x) => x.code === "empty-variant");
    expect(f?.severity).toBe("warning");
  });
  test("variant-missing-dark", () => {
    expect(codes(withVariants(DECL, { men: { value: COLOR_MEN.value } }))).toContain("variant-missing-dark");
  });
  test("bad-value names the variant", () => {
    const f = checkVariants(withVariants(DECL, { men: { value: { colorSpace: "nope" }, dark: COLOR_MEN.dark } })).find((x) => x.code === "bad-value");
    expect(f?.message).toContain("(men)");
  });
  test("a valid block has no findings", () => {
    expect(checkVariants(withVariants(DECL, { men: COLOR_MEN }))).toEqual([]);
  });
});

describe("ids that can't be used", () => {
  const INJECT = 'men"] , body{display:none} :root[x="';
  test("readVariants lists only well-formed ids, so none reaches a selector or a file name", () => {
    const r = readVariants(withVariants([DECL[0], { id: INJECT, label: "X" }, { id: "../../../escaped", label: "Y" }, DECL[1]], { men: COLOR_MEN }));
    expect(r.variants.map((v) => v.id)).toEqual(["women", "men"]);
    expect(r.findings.filter((f) => f.code === "bad-variant-id")).toHaveLength(2);
  });
  test("a badly formed default is no default", () => {
    expect(readVariants(withVariants([{ id: "../x", label: "X", default: true }, DECL[1]])).defaultId).toBeNull();
  });
  test("a variant with no id, or an id that isn't text, is reported in words and never listed", () => {
    const r = readVariants(withVariants([DECL[0], { label: "Kids" }, { id: 7, label: "Seven" }, DECL[1]], { men: COLOR_MEN }));
    expect(r.variants.map((v) => v.id)).toEqual(["women", "men"]);
    const msgs = r.findings.filter((f) => f.code === "bad-variant-id").map((f) => f.message);
    expect(msgs).toHaveLength(2);
    expect(msgs.join("\n")).not.toContain("undefined");
    expect(msgs[0]).toContain("has no id");
  });
  test("two variants with the same id: an error, and the id is listed once", () => {
    const r = readVariants(withVariants([DECL[0], DECL[1], { id: "men", label: "Men again" }], { men: COLOR_MEN }));
    expect(r.variants.map((v) => v.id)).toEqual(["women", "men"]);
    const f = r.findings.find((x) => x.code === "duplicate-variant-id");
    expect(f).toMatchObject({ severity: "error", message: 'Two variants have the id "men". Each variant needs its own.' });
  });
});

describe("role entries", () => {
  test("values for the default variant are an error", () => {
    const f = checkVariants(withVariants(DECL, { women: COLOR_MEN, men: COLOR_MEN })).find((x) => x.code === "default-variant-values");
    expect(f).toMatchObject({
      severity: "error",
      path: "color.surface",
      message: '"color.surface" gives the default variant "women" its own values; the default\'s values are its $value and modes.dark.',
    });
  });
  test("a dark value on a role that isn't a colour is a warning: it's ignored", () => {
    const t = validTokens();
    t.$extensions = { ...(t.$extensions ?? {}), "dev.motif": { ...(t.$extensions?.["dev.motif"] ?? {}), variants: DECL } };
    t.radius.md.$extensions = { "dev.motif": { variants: { men: { value: { value: 12, unit: "px" }, dark: { value: 4, unit: "px" } } } } };
    const f = checkVariants(docFrom(t)).find((x) => x.code === "variant-dark-ignored");
    expect(f).toMatchObject({ severity: "warning", path: "radius.md", message: '"radius.md" (men) has a dark value, but only colours have one. It\'s ignored.' });
  });
});
