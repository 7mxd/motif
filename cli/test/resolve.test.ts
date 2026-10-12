import { describe, expect, test } from "bun:test";
import { darkValueOf, isAlias, resolveMode, resolveToken, resolveValue } from "../src/contract/resolve";
import { docFrom, validTokens } from "./helpers";

const num = (v: unknown) => ({ $type: "number", $value: v });

describe("isAlias", () => {
  test("recognises {a.b} only", () => {
    expect(isAlias("{a.b}")).toBe(true);
    expect(isAlias("a.b")).toBe(false);
    expect(isAlias("{a}{b}")).toBe(false);
    expect(isAlias(3)).toBe(false);
  });
});

describe("resolveToken", () => {
  test("follows a chain of aliases", () => {
    const doc = docFrom({ a: num(4), b: { $value: "{a}" }, c: { $value: "{b}" } });
    expect(resolveToken(doc, "c")).toEqual({ ok: true, value: 4, type: "number" });
  });

  test("an untyped alias takes its target's type", () => {
    const doc = docFrom(validTokens());
    const r = resolveToken(doc, "color.text-primary");
    expect(r.ok && r.type).toBe("color");
    expect(r.ok && (r.value as any).hex).toBe("#111827");
  });

  test("resolves aliases nested inside composite values", () => {
    const doc = docFrom(validTokens());
    const r = resolveToken(doc, "font.body");
    expect(r.ok && (r.value as any).fontFamily).toEqual(["Inter", "system-ui", "sans-serif"]);
  });

  test("reports a missing target", () => {
    const doc = docFrom({ a: { $type: "number", $value: "{nope}" } });
    const r = resolveToken(doc, "a");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('It points to "{nope}", which doesn\'t exist.');
  });

  test("reports a loop instead of hanging", () => {
    const doc = docFrom({ a: { $type: "number", $value: "{b}" }, b: { $type: "number", $value: "{a}" } });
    const r = resolveToken(doc, "a");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('"a" → "b" → "a" point to each other in a loop.');
  });

  test("reports an unknown path", () => {
    expect(resolveToken(docFrom({}), "x").ok).toBe(false);
  });
});

describe("modes", () => {
  test("darkValueOf returns the raw dark alias", () => {
    const doc = docFrom(validTokens());
    expect(darkValueOf(doc, "color.background")).toBe("{primitive.color.gray.950}");
    expect(darkValueOf(doc, "space.4")).toBeUndefined();
  });

  test("resolveMode returns light and dark values", () => {
    const doc = docFrom(validTokens());
    const light = resolveMode(doc, "color.background", "light");
    const dark = resolveMode(doc, "color.background", "dark");
    expect(light.ok && (light.value as any).hex).toBe("#F9FAFB");
    expect(dark.ok && (dark.value as any).hex).toBe("#030712");
  });

  test("a dark alias to another role uses that role's dark value", () => {
    const t = validTokens();
    t.color["text-secondary"].$extensions["dev.motif"].modes.dark = "{color.text-primary}";
    const r = resolveMode(docFrom(t), "color.text-secondary", "dark");
    expect(r.ok && (r.value as any).hex).toBe("#F9FAFB");
  });

  test("a role without its own dark value follows its alias target's dark value", () => {
    const t = validTokens();
    t.color.extra = { $value: "{color.text-primary}" };
    const r = resolveMode(docFrom(t), "color.extra", "dark");
    expect(r.ok && (r.value as any).hex).toBe("#F9FAFB");
  });

  test("dark falls back to light when no dark value exists", () => {
    const doc = docFrom({ a: num(1) });
    expect(resolveMode(doc, "a", "dark")).toEqual({ ok: true, value: 1, type: "number" });
  });

  test("resolveValue resolves plain values unchanged", () => {
    expect(resolveValue(docFrom({}), { value: 4, unit: "px" })).toEqual({ ok: true, value: { value: 4, unit: "px" }, type: null });
  });
});
