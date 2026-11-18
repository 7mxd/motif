import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Motif's guidance must stay general: no line may be aimed at the eval's test apps (the release rule against writing
// skill text for the test). docs/specs/2026-11-10-motif-2.0-first-impressions-design.md, change 7.
const SKILL = join(import.meta.dir, "../../skill");
const BRIEFS = ["stride", "ledgerly", "bloom", "sahm", "nabta", "rihla", "darb", "nuzha", "sanad", "masar"];
const PHRASES = ["Thursday Tempo", "18 days late", "Log watering", "Not coming", "Chase payment", "Upcoming runs", "The week's plan", "Needs water today", "Seat reserved", "Report an issue"];

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

  // The briefs' Content says what each screen shows. A label there that the skill text also gives as an example ("Mark
  // as watered") would hand Motif's side the brief's own words, so the test apps' labels stay their own. Everyday
  // labels every app has are not examples of anything.
  const EVERYDAY = ["sign in", "forgot password?", "get started", "welcome back", "due today", "this week", "free to join"];
  test("no brief's Content uses a label the skill text quotes as an example, beyond everyday ones", () => {
    const skill = markdown(SKILL).map((f) => readFileSync(f, "utf8").replace(/```[\s\S]*?```/g, "").toLowerCase()).join("\n");
    const clean = (s: string) => s.trim().replace(/[.,:;]+$/, "");
    const quoted = new Set([...skill.matchAll(/"([^"\n]{3,80})"/g)].flatMap((m) => [m[1]!, ...m[1]!.split(" · ")]).map(clean));
    const hits: string[] = [];
    const dir = join(import.meta.dir, "../../tests/fixtures/briefs");
    for (const name of BRIEFS) {
      const text = readFileSync(join(dir, `${name}.md`), "utf8").replace(/\r\n/g, "\n");
      const start = text.indexOf("\n## Content");
      expect(start).toBeGreaterThan(-1);
      const end = text.indexOf("\n## ", start + 5);
      for (const line of text.slice(start, end === -1 ? undefined : end).split("\n")) {
        // A "### Label (screen)" heading, or a "- Key: value" / "- value" line, without its Arabic in parentheses.
        const m = line.match(/^\s*(?:-\s+(?:[A-Za-z ]+:\s+)?|###\s+)(.+?)\s*(?:\(.*)?$/);
        const label = m ? clean(m[1]!).toLowerCase() : "";
        if (label.split(/\s+/).length >= 2 && quoted.has(label) && !EVERYDAY.includes(label)) hits.push(`${name}: ${label}`);
      }
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
