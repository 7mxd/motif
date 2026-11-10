import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Motif's guidance must stay general: no line may be aimed at the eval's test apps (the release rule against writing
// skill text for the test). docs/specs/2026-11-10-motif-2.0-first-impressions-design.md, change 7.
const SKILL = join(import.meta.dir, "../../skill");
const BRIEFS = ["stride", "ledgerly", "bloom", "sahm", "nabta", "rihla", "darb", "nuzha", "sanad", "masar"];
const PHRASES = ["Thursday Tempo", "18 days late"];

function markdown(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdown(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

describe("skill text (first impressions)", () => {
  test("names no test brief and none of their app-specific phrases", () => {
    const hits: string[] = [];
    for (const file of markdown(SKILL)) {
      // Code blocks are code (Swift's stride(from:to:by:)); the rule is about what the guidance says.
      const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
      for (const name of BRIEFS) if (new RegExp(`\\b${name}\\b`, "i").test(text)) hits.push(`${relative(SKILL, file)}: ${name}`);
      for (const phrase of PHRASES) if (text.toLowerCase().includes(phrase.toLowerCase())) hits.push(`${relative(SKILL, file)}: ${phrase}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("character.md reads as recipes, not a list of bans (first impressions, change 7)", () => {
  const text = readFileSync(join(SKILL, "knowledge/character.md"), "utf8").replace(/\r\n/g, "\n");
  test("fewer lines say never than the 39 it had, and none in the first-impression recipes", () => {
    expect(text.split("\n").filter((l) => /never/i.test(l)).length).toBeLessThan(39);
    const start = text.indexOf("\n## First-impression recipes\n");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("\n## ", start + 5);
    expect(text.slice(start, end === -1 ? undefined : end)).not.toMatch(/never/i);
  });
  test("ends with the squint test and the clutter limit", () => {
    expect(text).toContain("**Squint test.**");
    expect(text).toContain("**Clutter limit.**");
  });
});
