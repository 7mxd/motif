import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { clusterColors, parseColor, type Sample } from "../src/extract/cluster";
import { readTailwindDefaults } from "../src/extract/tailwind-theme";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const THEME_CSS = `@theme default {
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --color-white: #fff;
  --spacing: 0.25rem;
  --radius-md: 0.375rem;
  --text-sm: 0.875rem;
  --text-sm--line-height: calc(1.25 / 0.875);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
`;

describe("readTailwindDefaults", () => {
  test("reads colours, spacing, radius, text sizes and easings", () => {
    const root = makeProject({ "node_modules/tailwindcss/theme.css": THEME_CSS });
    const d = readTailwindDefaults([root])!;
    expect(d.colors.get("blue-500")).toBe("oklch(62.3% 0.214 259.815)");
    expect(d.colors.get("white")).toBe("#fff");
    expect(d.spacingPx).toBe(4);
    expect(d.radiusPx.get("md")).toBe(6);
    expect(d.textPx.get("sm")).toBe(14);
    expect(d.textPx.has("sm--line-height")).toBe(false);
    expect(d.easings.get("in-out")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });
  test("falls back to the next folder (hoisted installs), or null", () => {
    const root = makeProject({ "node_modules/tailwindcss/theme.css": THEME_CSS, "apps/web/package.json": "{}" });
    expect(readTailwindDefaults([join(root, "apps/web"), root])).not.toBeNull();
    expect(readTailwindDefaults([makeProject({})])).toBeNull();
  });
});

const sample = (value: string, count: number, context = "text"): Sample => ({ value, count, contexts: { [context]: count }, examples: [] });

describe("clusterColors", () => {
  test("near-identical colours group together, most used first", () => {
    const { clusters, unparsed } = clusterColors([
      sample("#787878", 2), sample("#777777", 5), sample("#3b82f6", 3, "background"), sample("not-a-colour", 1),
    ]);
    expect(clusters.map((c) => [c.id, c.hex, c.count])).toEqual([["found-1", "#777777", 7], ["found-2", "#3B82F6", 3]]);
    expect(clusters[0]!.contexts).toEqual({ text: 7 });
    expect(clusters[0]!.members.map((m) => m.value)).toEqual(["#777777", "#787878"]);
    expect(clusters[1]!.c).toBeGreaterThan(0.08);
    expect(unparsed.map((u) => u.value)).toEqual(["not-a-colour"]);
  });
  test("understands Tailwind's underscores and OKLCH percentages", () => {
    expect(parseColor("rgb(0_0_0_/_0.5)")).toBeDefined();
    expect(parseColor("oklch(62.3% 0.214 259.815)")).toBeDefined();
  });
});
