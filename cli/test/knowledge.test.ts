import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KNOWLEDGE = join(import.meta.dir, "../../skill/knowledge");
const read = (rel: string) => readFileSync(join(KNOWLEDGE, rel), "utf8").replace(/\r\n/g, "\n");

/** A knowledge file has a title, real sections, enough substance, and the points the skill relies on. */
function covers(rel: string, opts: { minLines: number; mustMention: (string | RegExp)[] }) {
  test(`${rel} covers what the skill relies on`, () => {
    expect(existsSync(join(KNOWLEDGE, rel))).toBe(true);
    const text = read(rel);
    expect(text.startsWith("# ")).toBe(true);
    expect([...text.matchAll(/^## /gm)].length).toBeGreaterThanOrEqual(4);
    expect(text.split("\n").length).toBeGreaterThanOrEqual(opts.minLines);
    const lower = text.toLowerCase();
    const missing = opts.mustMention.filter((m) => (typeof m === "string" ? !lower.includes(m.toLowerCase()) : !m.test(text)));
    expect(missing).toEqual([]);
  });
}

describe("knowledge: visual craft and anti-patterns", () => {
  covers("visual-craft.md", {
    minLines: 100,
    mustMention: ["hierarchy", "squint", "proximity", "space.4", "line length", "action-primary", "dark mode", "shadow", "radius", "start-align", "icon", "checklist"],
  });
  covers("anti-patterns.md", {
    minLines: 100,
    mustMention: ["gradient", "card grid", "shadow", "centred", "emoji", "icon", "copy", "lorem", "glass", "fade", "dark mode", "instead"],
  });
});
