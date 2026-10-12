import { describe, expect, test } from "bun:test";
import { checkContrast, readPairs } from "../src/contract/contrast";
import { docFrom, validTokens } from "./helpers";

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
    expect(findings.map((f) => f.code)).toEqual(["bad-pair", "bad-pair"]);
  });
});
