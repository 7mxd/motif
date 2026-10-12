import { describe, expect, test } from "bun:test";
import { buildTheme } from "../src/generate/theme";
import { docFrom, validTokens } from "./helpers";

const theme = buildTheme(docFrom(validTokens()));

describe("buildTheme", () => {
  test("colours carry light and dark values, roles only", () => {
    expect(theme.colors).toHaveLength(20);
    const bg = theme.colors.find((c) => c.name === "background")!;
    expect(bg.light.hex).toBe("#F9FAFB");
    expect(bg.dark.hex).toBe("#030712");
    expect(theme.colors.some((c) => c.name.startsWith("gray"))).toBe(false);
  });

  test("sizes, shadows, fonts and motion", () => {
    expect(theme.space.find((s) => s.name === "4")).toEqual({ name: "4", px: 16, css: "16px" });
    expect(theme.radius.find((s) => s.name === "full")!.px).toBe(9999);
    expect(theme.shadows.find((s) => s.name === "md")!.css).toBe("0px 4px 12px 0px rgb(0 0 0 / 0.1)");
    expect(theme.fonts.find((f) => f.name === "body")).toEqual({
      name: "body", family: "Inter, system-ui, sans-serif", sizeCss: "16px", sizePx: 16, weight: 400, lineHeight: 1.5,
    });
    expect(theme.durations.find((d) => d.name === "fast")!.ms).toBe(120);
    expect(theme.easings.find((e) => e.name === "standard")!.points).toEqual([0.2, 0, 0, 1]);
    expect(theme.springs).toEqual([
      { name: "snappy", duration: 0.25, bounce: 0 },
      { name: "smooth", duration: 0.4, bounce: 0.1 },
      { name: "bouncy", duration: 0.5, bounce: 0.3 },
    ]);
  });

  test("custom roles are included like required ones", () => {
    const t = validTokens();
    t.color["brand-glow"] = { $value: "{primitive.color.indigo.400}", $extensions: { "dev.motif": { modes: { dark: "{primitive.color.indigo.700}" } } } };
    t.space["18"] = { $value: { value: 72, unit: "px" } };
    const custom = buildTheme(docFrom(t));
    expect(custom.colors.find((c) => c.name === "brand-glow")!.dark.hex).toBe("#4338CA");
    expect(custom.space.find((s) => s.name === "18")!.px).toBe(72);
  });

  test("broken tokens are skipped, not fatal", () => {
    const t = validTokens();
    t.color.surface.$value = "{primitive.color.nope}";
    expect(buildTheme(docFrom(t)).colors.some((c) => c.name === "surface")).toBe(false);
  });
});
