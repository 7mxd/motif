import { describe, expect, test } from "bun:test";
import { checkRoles } from "../src/contract/roles";
import { docFrom, validTokens } from "./helpers";

const run = (mutate: (t: any) => void) => {
  const t = validTokens();
  mutate(t);
  return checkRoles(docFrom(t));
};

describe("checkRoles", () => {
  test("the valid fixture has no findings", () => {
    expect(checkRoles(docFrom(validTokens()))).toEqual([]);
  });

  test("reports a missing required role in plain words", () => {
    const f = run((t) => delete t.color.focus);
    expect(f.map((x) => [x.code, x.path])).toEqual([["missing-role", "color.focus"]]);
    expect(f[0]!.message).toBe('Your theme values are missing "color.focus". Every Motif design guide needs it.');
  });

  test("reports a role with the wrong type", () => {
    const f = run((t) => (t.space["4"] = { $type: "number", $value: 16 }));
    expect(f.map((x) => x.code)).toEqual(["wrong-type"]);
  });

  test("font.mono is optional: a theme is complete without it, and with it, it must be a typography value (backlog)", () => {
    expect(run((t) => delete t.font.mono)).toEqual([]);
    const f = run((t) => (t.font.mono = { $type: "dimension", $value: { value: 14, unit: "px" } }));
    expect(f.map((x) => [x.code, x.path])).toEqual([["wrong-type", "font.mono"]]);
  });

  test("requires a dark value for every colour role", () => {
    const f = run((t) => delete t.color.border.$extensions);
    expect(f.map((x) => [x.code, x.path])).toEqual([["missing-dark", "color.border"]]);
  });

  test("rejects durations over 2 seconds", () => {
    const f = run((t) => (t.duration.slow.$value = { value: 5000, unit: "ms" }));
    expect(f.map((x) => [x.code, x.path])).toEqual([["motion-range", "duration.slow"]]);
  });

  test("rejects spring bounce outside -1..1", () => {
    const f = run((t) => (t.spring.bouncy.bounce.$value = 1));
    expect(f.map((x) => [x.code, x.path])).toEqual([["motion-range", "spring.bouncy.bounce"]]);
  });

  test("rejects spring durations outside 0.05–2 s", () => {
    const f = run((t) => (t.spring.snappy.duration.$value = { value: 0.01, unit: "s" }));
    expect(f.map((x) => [x.code, x.path])).toEqual([["motion-range", "spring.snappy.duration"]]);
  });

  test("requires all three springs", () => {
    const f = run((t) => delete t.spring.smooth);
    expect(f.map((x) => x.path)).toEqual(["spring.smooth.duration", "spring.smooth.bounce"]);
  });

  test("requires the format version", () => {
    const f = run((t) => delete t.$extensions["dev.motif"].motifContract);
    expect(f.map((x) => x.code)).toEqual(["missing-version"]);
  });

  test("refuses a newer format with an update message", () => {
    const f = run((t) => (t.$extensions["dev.motif"].motifContract = 2));
    expect(f.map((x) => x.code)).toEqual(["newer-format"]);
    expect(f[0]!.message).toBe("These theme values were made by a newer version of Motif (format 2). Update Motif to use them.");
  });
});
