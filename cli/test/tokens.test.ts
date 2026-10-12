import { describe, expect, test } from "bun:test";
import { validateTokens } from "../src/contract/tokens";
import { docFrom, validTokens } from "./helpers";

const codes = (obj: unknown) => validateTokens(docFrom(obj)).map((f) => f.code);

describe("validateTokens", () => {
  test("the valid fixture has no findings", () => {
    expect(validateTokens(docFrom(validTokens()))).toEqual([]);
  });

  test("reports a token with no type", () => {
    expect(codes({ a: { $value: 1 } })).toEqual(["missing-type"]);
  });

  test("reports an unknown type name", () => {
    expect(codes({ a: { $type: "colour", $value: 1 } })).toEqual(["unknown-type"]);
  });

  test("reports a broken alias with the token's line", () => {
    const t = validTokens();
    t.color["text-primary"].$value = "{primitive.color.gray.999}";
    const findings = validateTokens(docFrom(t));
    expect(findings.map((f) => f.code)).toEqual(["broken-alias"]);
    expect(findings[0]!.path).toBe("color.text-primary");
    expect(findings[0]!.line).toBeGreaterThan(1);
    expect(findings[0]!.message).toBe('"color.text-primary": It points to "{primitive.color.gray.999}", which doesn\'t exist.');
  });

  test("reports a bad value in plain words", () => {
    const t = validTokens();
    t.space["4"].$value = { value: 16, unit: "pt" };
    const findings = validateTokens(docFrom(t));
    expect(findings.map((f) => f.code)).toEqual(["bad-value"]);
    expect(findings[0]!.message).toBe('"space.4" has a problem: size unit must be "px" or "rem".');
  });

  test("checks dark values too", () => {
    const t = validTokens();
    t.color.surface.$extensions["dev.motif"].modes.dark = "{primitive.color.nope}";
    const findings = validateTokens(docFrom(t));
    expect(findings.map((f) => f.code)).toEqual(["broken-alias"]);
    expect(findings[0]!.message).toStartWith('"color.surface" (dark):');
  });
});
