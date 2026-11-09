import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_NAMES } from "../src/main";
import { LIBRARY_STACKS, lintSkillMarkdown } from "./skill-lint";

/** Motif 2.0's built-in library (docs/specs/2026-11-08-motif-2.0-character-and-library-design.md, section 6.3). */
const SKILL = join(import.meta.dir, "../../skill");
const LIBRARY = join(SKILL, "library");
const read = (rel: string) => readFileSync(join(LIBRARY, rel), "utf8").replace(/\r\n/g, "\n");

const PIECES: Record<string, string[]> = {
  charts: ["trend-line.md", "progress-ring.md", "segmented-bar.md", "period-bars.md", "stat-change.md"],
  cards: ["key-figure-card.md", "stat-row.md", "todays-focus.md", "item-card.md"],
  screens: ["landing-hero.md", "welcome.md", "empty-state.md", "success-moment.md"],
  motion: ["draw-in.md", "count-up.md", "stagger.md", "press.md", "success.md"],
  accents: ["bold.md", "dark-tech.md", "editorial.md", "minimal.md", "playful.md", "soft.md", "trust.md", "warm.md"],
};
/** The groups written so far; each later task adds its own. */
const READY = new Set(["charts", "cards", "screens", "motion", "accents"]);

/** Each stack's reduced-motion switch, as its adapter's motion.md spells it. */
const REDUCED: Record<string, string> = {
  "react-web": 'reducedMotion="user"', "plain-web": "prefers-reduced-motion", vue: "prefers-reduced-motion",
  svelte: "prefersReducedMotion", angular: "prefers-reduced-motion", flutter: "MotifMotion.duration(context",
  compose: "MotifMotion.reduced()", "react-native": "useReducedMotion", swiftui: "accessibilityReduceMotion",
};

/** The text of a "## Name" section, up to the next "## ". */
function section(text: string, name: string): string {
  const start = text.indexOf(`\n## ${name}\n`);
  if (start === -1) return "";
  const end = text.indexOf("\n## ", start + 4);
  return text.slice(start, end === -1 ? undefined : end);
}
/** The text of a "### stack" section inside "## Stacks". */
function stackSection(text: string, stack: string): string {
  const stacks = section(text, "Stacks");
  const start = stacks.indexOf(`\n### ${stack}\n`);
  if (start === -1) return "";
  const end = stacks.indexOf("\n### ", start + 5);
  return stacks.slice(start, end === -1 ? undefined : end);
}

const lintOpts = { exists: (p: string) => existsSync(join(SKILL, p)), commands: COMMAND_NAMES };

describe("the library's index", () => {
  test("library/README.md lists every piece once and links each to its file", () => {
    const readme = read("README.md");
    for (const [group, files] of Object.entries(PIECES)) {
      if (!READY.has(group)) continue;
      for (const f of files) expect([`${group}/${f}`, readme.split(`](${group}/${f})`).length - 1]).toEqual([`${group}/${f}`, 1]);
    }
    expect(readme).toContain("| Piece | Group | Loudness | Fits | File |");
  });

  test("the index gives each piece the loudness its own file states", () => {
    const readme = read("README.md");
    const wrong: string[] = [];
    for (const [group, files] of Object.entries(PIECES)) {
      if (!READY.has(group)) continue;
      for (const f of files) {
        const row = readme.split("\n").find((l) => l.startsWith("|") && l.includes(`](${group}/${f})`)) ?? "";
        const listed = row.split("|")[3]?.trim();
        const own = section(read(`${group}/${f}`), "Loudness").replace("## Loudness", "").trim().match(/^`?(calm|default|loud)\b/)?.[1];
        if (listed !== own) wrong.push(`${group}/${f}: index ${listed}, piece ${own}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("no other pieces are lying around", () => {
    for (const group of READY) {
      const there = readdirSync(join(LIBRARY, group)).filter((f) => f.endsWith(".md")).sort();
      expect([group, there]).toEqual([group, [...PIECES[group]!].sort()]);
    }
  });
});

for (const [group, files] of Object.entries(PIECES)) {
  describe(`library: ${group}`, () => {
    for (const f of files) {
      const rel = `library/${group}/${f}`;
      if (!READY.has(group)) {
        test.todo(`${rel} has every section, all nine stacks and passes the lint`);
        continue;
      }
      test(`${rel} has every section, all nine stacks and passes the lint`, () => {
        const raw = readFileSync(join(SKILL, rel), "utf8");
        expect(lintSkillMarkdown(rel, raw, lintOpts)).toEqual([]);
        const text = raw.replace(/\r\n/g, "\n");
        expect(section(text, "Loudness").replace("## Loudness", "").trim()).toMatch(/^(calm|default|loud)\b/);
        const states = section(text, "States").toLowerCase();
        expect(["loading", "empty", "error"].filter((s) => !states.includes(s))).toEqual([]);
        for (const stack of LIBRARY_STACKS) expect([stack, stackSection(text, stack).trim().length > 20]).toEqual([stack, true]);
      });
      test(`${rel} stays out of the C look and copies nothing it may not`, () => {
        const text = read(`${group}/${f}`);
        expect(text.match(/glow|tilt|glass|perspective\(/i)).toBeNull();
        expect(text.match(/react bits|animate ui|aceternity/i)).toBeNull();
      });
      if (group === "charts") {
        test(`${rel} gives the chart a text alternative`, () => {
          expect(section(read(`${group}/${f}`), "Accessibility")).toContain("in words");
        });
      }
      if (group === "motion") {
        test(`${rel} turns itself down at calm and off under reduced motion, on every stack (review focus)`, () => {
          const text = read(`${group}/${f}`);
          const motion = section(text, "Motion");
          expect([motion.includes("`calm`"), motion.includes("`none`")]).toEqual([true, true]);
          for (const stack of LIBRARY_STACKS) expect([stack, stackSection(text, stack).includes(REDUCED[stack]!)]).toEqual([stack, true]);
        });
      }
    }
  });
}

describe("the adapters point at the motion recipes", () => {
  for (const stack of LIBRARY_STACKS) {
    test(`${stack}/motion.md's Default motion links the library`, () => {
      const text = readFileSync(join(SKILL, "adapters", stack, "motion.md"), "utf8").replace(/\r\n/g, "\n");
      expect(section(text, "Default motion")).toContain("../../library/motion/");
    });
  }
});
