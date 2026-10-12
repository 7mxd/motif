import { describe, expect, test } from "bun:test";
import { generateFallback, flatTokens } from "../src/generate/fallback";
import { isMotifGenerated } from "../src/generate/header";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const theme = buildTheme(docFrom(validTokens()));

describe("fallback output", () => {
  test("flat tokens list every role with CSS-ready values", () => {
    const flat = flatTokens(theme);
    expect(flat["color.background"]).toEqual({ light: "#F9FAFB", dark: "#030712" });
    expect(flat["space.4"]).toBe("16px");
    expect(flat["radius.md"]).toBe("8px");
    expect(flat["font.body"]).toEqual({ family: "Inter, system-ui, sans-serif", size: "16px", weight: 400, lineHeight: 1.5 });
    expect(flat["duration.fast"]).toBe("120ms");
    expect(flat["easing.standard"]).toBe("cubic-bezier(0.2, 0, 0, 1)");
    expect(flat["spring.snappy"]).toEqual({ duration: 0.25, bounce: 0 });
  });

  test("writes motif.css and tokens.flat.json under design/generated, both marked as Motif's", () => {
    const files = generateFallback(theme);
    expect(files.map((f) => f.path)).toEqual(["design/generated/motif.css", "design/generated/tokens.flat.json"]);
    for (const f of files) expect(isMotifGenerated(f.path, f.content)).toBe(true);
  });
});
