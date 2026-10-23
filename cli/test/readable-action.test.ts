import { describe, expect, test } from "bun:test";
import { converter, parse } from "culori";
import { contrastRatio } from "../src/contract/color";
import { srgbColor } from "../src/contract/defaults";
import { readableAction, type ModePair } from "../src/generate/readable-action";
import { buildThemeSet } from "../src/generate/theme";
import { docFrom, hexColor, partnerTokens, validTokens } from "./helpers";

const ratio = (fg: string, bg: string) => contrastRatio(srgbColor(fg), srgbColor(bg));
const toOklch = converter("oklch");
const oklch = (hex: string) => toOklch(parse(hex)!)!;
/** The distance between two hues in degrees, the short way round. */
const hueGap = (a: string, b: string) => {
  const d = Math.abs((oklch(a).h ?? 0) - (oklch(b).h ?? 0)) % 360;
  return Math.min(d, 360 - d);
};
const setFor = (tokens: any) => buildThemeSet(docFrom(tokens));
/** A role's light value as a plain colour, its dark value kept. */
const setLight = (tokens: any, role: string, hex: string) => {
  tokens.color[role].$value = hexColor(hex);
};
/** A role's dark value as a plain colour. */
const setDark = (tokens: any, role: string, hex: string) => {
  tokens.color[role].$extensions["dev.motif"].modes.dark = hexColor(hex);
};

/** HiSalon's light colours: mint on a near-white page and white cards. Dark stays the fixture's indigo on near-black. */
function hisalon(): any {
  const t = validTokens();
  setLight(t, "action-primary", "#7EEBC1");
  setLight(t, "background", "#F7F9F8");
  setLight(t, "surface", "#FFFFFF");
  return t;
}

const pairs = (r: { base: ModePair; variants: Record<string, ModePair> }) => [r.base, ...Object.values(r.variants)].flatMap((p) => [p.light, p.dark]);

describe("readableAction", () => {
  test("HiSalon's mint gets a darker green, same hue, that reads on the page and on white", () => {
    const r = readableAction(setFor(hisalon()))!;
    expect(r).not.toBeNull();
    const text = r.base.light.text;
    expect(text).toMatch(/^#[0-9A-F]{6}$/);
    expect(text).not.toBe("#7EEBC1");
    expect(oklch(text).l).toBeLessThan(oklch("#7EEBC1").l);
    expect(hueGap(text, "#7EEBC1")).toBeLessThanOrEqual(2);
    expect(ratio(text, "#F7F9F8")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(text, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // Dark mode's indigo already reads on near-black: it stays.
    expect(r.base.dark.text).toBe("#818CF8");
    expect(r.variants).toEqual({});
  });

  test("a guide whose action colour reads everywhere gets null", () => {
    expect(readableAction(setFor(validTokens()))).toBeNull();
    expect(readableAction(setFor(partnerTokens()))).toBeNull();
  });

  test("an action colour that reads in light mode but not in dark: only dark changes, lighter", () => {
    const t = validTokens();
    setDark(t, "action-primary", "#1E3A8A"); // a deep blue on #030712 and #111827
    const r = readableAction(setFor(t))!;
    expect(r).not.toBeNull();
    expect(r.base.light.text).toBe("#4338CA");
    const text = r.base.dark.text;
    expect(oklch(text).l).toBeGreaterThan(oklch("#1E3A8A").l);
    expect(hueGap(text, "#1E3A8A")).toBeLessThanOrEqual(2);
    expect(ratio(text, "#030712")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(text, "#111827")).toBeGreaterThanOrEqual(4.5);
  });

  test("with variants, only the variant whose action colour is light changes", () => {
    const t = partnerTokens();
    t.color["action-primary"].$extensions["dev.motif"].variants = { partner: { value: hexColor("#7EEBC1") } };
    const r = readableAction(setFor(t))!;
    expect(r).not.toBeNull();
    expect(r.base.light.text).toBe("#4338CA");
    expect(r.base.dark.text).toBe("#818CF8");
    expect(Object.keys(r.variants)).toEqual(["partner"]);
    const partner = r.variants.partner!;
    expect(partner.light.text).not.toBe("#7EEBC1");
    expect(hueGap(partner.light.text, "#7EEBC1")).toBeLessThanOrEqual(2);
    // The partner surface is #FFF7ED in light mode.
    expect(ratio(partner.light.text, "#F9FAFB")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(partner.light.text, "#FFF7ED")).toBeGreaterThanOrEqual(4.5);
    // Its dark value is the base's, which reads.
    expect(partner.dark.text).toBe("#818CF8");
  });

  test("without surface, the action colour needs to read on the background only", () => {
    const t = hisalon();
    delete t.color.surface;
    t.$extensions["dev.motif"].pairs = t.$extensions["dev.motif"].pairs.filter((p: any) => p.bg !== "color.surface");
    const r = readableAction(setFor(t))!;
    expect(r).not.toBeNull();
    expect(ratio(r.base.light.text, "#F7F9F8")).toBeGreaterThanOrEqual(4.5);
    // The page is a shade darker than white, so on it alone the walk stops no later than with a white surface.
    const withSurface = readableAction(setFor(hisalon()))!.base.light.text;
    expect(oklch(r.base.light.text).l).toBeGreaterThanOrEqual(oklch(withSurface).l - 1e-9);
  });

  test("without action-primary or background there is nothing to do", () => {
    const noAction = hisalon();
    delete noAction.color["action-primary"];
    delete noAction.color["on-action-primary"];
    noAction.$extensions["dev.motif"].pairs = noAction.$extensions["dev.motif"].pairs.filter((p: any) => p.bg !== "color.action-primary");
    expect(readableAction(setFor(noAction))).toBeNull();
    const noBackground = hisalon();
    delete noBackground.color.background;
    noBackground.$extensions["dev.motif"].pairs = noBackground.$extensions["dev.motif"].pairs.filter((p: any) => p.bg !== "color.background");
    expect(readableAction(setFor(noBackground))).toBeNull();
  });

  test("when no lightness reads on both the background and the surface, it's text-primary", () => {
    const t = hisalon();
    setLight(t, "surface", "#000000"); // nothing darkened reads on black
    const r = readableAction(setFor(t))!;
    expect(r.base.light.text).toBe("#111827");
  });

  test("onText reads on text at 4.5:1, in every mode and variant", () => {
    const variant = partnerTokens();
    variant.color["action-primary"].$extensions["dev.motif"].variants = { partner: { value: hexColor("#7EEBC1"), dark: hexColor("#1E3A8A") } };
    const dark = validTokens();
    setDark(dark, "action-primary", "#1E3A8A");
    for (const tokens of [hisalon(), variant, dark]) {
      const r = readableAction(setFor(tokens))!;
      for (const p of pairs(r)) {
        expect(p.onText).toMatch(/^#[0-9A-F]{6}$/);
        expect(ratio(p.onText, p.text)).toBeGreaterThanOrEqual(4.5);
      }
    }
    // HiSalon's light text is a dark green: the guide's own on-action-primary (white) reads on it.
    expect(readableAction(setFor(hisalon()))!.base.light.onText).toBe("#FFFFFF");
  });
});
