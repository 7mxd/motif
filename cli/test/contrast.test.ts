import { describe, expect, test } from "bun:test";
import { checkContrast, readPairs } from "../src/contract/contrast";
import { BRAND_PAIRS, STANDARD_PAIRS, pairsExtension } from "../src/contract/defaults";
import { checkRoles } from "../src/contract/roles";
import { docFrom, hexColor, validTokens } from "./helpers";

describe("checkContrast", () => {
  test("the valid fixture passes all 13 pairs in both modes", () => {
    const { findings, checked } = checkContrast(docFrom(validTokens()));
    expect(findings).toEqual([]);
    expect(checked).toBe(26);
  });

  test("flags hard-to-read text in dark mode only", () => {
    const t = validTokens();
    t.color["text-secondary"].$extensions["dev.motif"].modes.dark = "{primitive.color.gray.600}";
    const { findings } = checkContrast(docFrom(t));
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.code === "low-contrast" && f.message.startsWith("In dark mode"))).toBe(true);
    expect(findings[0]!.message).toBe('In dark mode, "text-secondary" on "background" is hard to read: 2.66:1, needs at least 4.5:1.');
    expect(findings[0]!.path).toBe("color.text-secondary");
  });

  test("a dark value that aliases another role is checked with that role's dark value", () => {
    const t = validTokens();
    t.color["text-secondary"].$extensions["dev.motif"].modes.dark = "{color.text-primary}";
    expect(checkContrast(docFrom(t)).findings).toEqual([]);
  });

  test("uses the 3:1 minimum for UI pairs", () => {
    const t = validTokens();
    t.color.focus.$value = "{primitive.color.gray.300}";
    const { findings } = checkContrast(docFrom(t));
    expect(findings.map((f) => f.message)).toEqual([
      'In light mode, "focus" on "background" is hard to read: 1.41:1, needs at least 3:1.',
    ]);
  });
});

describe("readPairs", () => {
  test("reports when no pairs are listed", () => {
    const t = validTokens();
    delete t.$extensions["dev.motif"].pairs;
    expect(readPairs(docFrom(t)).findings.map((f) => f.code)).toEqual(["no-pairs"]);
  });

  test("reports pairs that name missing roles or unknown kinds", () => {
    const t = validTokens();
    t.$extensions["dev.motif"].pairs = [
      { fg: "color.nope", bg: "color.background", kind: "text" },
      { fg: "color.text-primary", bg: "color.background", kind: "huge" },
    ];
    const { pairs, findings } = readPairs(docFrom(t));
    expect(pairs).toEqual([]);
    expect(findings.filter((f) => f.code === "bad-pair")).toHaveLength(2);
  });
});

describe("readPairs: every text colour must be checked", () => {
  test("an empty pair list is reported for each text colour, not passed", () => {
    const t = validTokens();
    t.$extensions["dev.motif"].pairs = [];
    const findings = readPairs(docFrom(t)).findings;
    expect(findings.map((f) => f.code)).toEqual(Array(8).fill("missing-pair"));
    expect(findings[0]!.message).toBe('"text-primary" isn\'t in any readability pair, so Motif can\'t check it. Add a pair for each background it sits on.');
  });

  test("removing the pairs for one colour is reported", () => {
    const t = validTokens();
    t.$extensions["dev.motif"].pairs = t.$extensions["dev.motif"].pairs.filter((p: any) => p.fg !== "color.text-secondary");
    expect(readPairs(docFrom(t)).findings.map((f) => f.path)).toEqual(["color.text-secondary"]);
  });

  test("a built-in object name is not a valid pair kind", () => {
    const t = validTokens();
    t.$extensions["dev.motif"].pairs[0].kind = "toString";
    expect(readPairs(docFrom(t)).findings.map((f) => f.code)).toEqual(["bad-pair"]);
  });
});

describe("the optional brand colours' readability pairs", () => {
  const withBrand = (onBrand = "#FFFFFF") => {
    const t = validTokens();
    const role = (name: string, light: string, dark: string) =>
      (t.color[name] = { $value: hexColor(light), $extensions: { "dev.motif": { modes: { dark: hexColor(dark) } } } });
    role("brand", "#0B3550", "#4C7899");
    role("on-brand", onBrand, "#FFFFFF");
    role("brand-soft", "#E2EDF3", "#1C2B37");
    t.$extensions["dev.motif"].pairs = pairsExtension([...STANDARD_PAIRS, ...BRAND_PAIRS]);
    return t;
  };

  test("are a list of their own: on-brand on brand, text-primary on brand-soft, brand on brand-soft", () => {
    expect(BRAND_PAIRS).toEqual([["on-brand", "brand", "text"], ["text-primary", "brand-soft", "text"], ["brand", "brand-soft", "ui"]]);
  });

  test("the standard pairs don't name them, so a theme without the roles isn't given pairs it can't have", () => {
    expect(pairsExtension().map((p) => `${p.fg} ${p.bg}`).join(" ")).not.toContain("brand");
    const t = validTokens();
    t.$extensions["dev.motif"].pairs = pairsExtension();
    expect(checkRoles(docFrom(t))).toEqual([]);
    expect(checkContrast(docFrom(t)).findings).toEqual([]);
  });

  test("a theme with the roles and their pairs passes, and a hard-to-read on-brand is reported", () => {
    expect(checkRoles(docFrom(withBrand()))).toEqual([]);
    expect(checkContrast(docFrom(withBrand())).findings).toEqual([]);
    const f = checkContrast(docFrom(withBrand("#1A4560"))).findings;
    expect(f.map((x) => [x.code, x.path])).toEqual([["low-contrast", "color.on-brand"]]);
  });
});
