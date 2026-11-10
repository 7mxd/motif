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
  depth: ["tonal-gradient.md", "soft-glow.md", "pattern.md"],
  accents: ["bold.md", "dark-tech.md", "editorial.md", "minimal.md", "playful.md", "soft.md", "trust.md", "warm.md"],
};
/** The groups written so far; each later task adds its own. */
const READY = new Set(["charts", "cards", "screens", "motion", "accents", "depth"]);

/**
 * What the narrowed C look allows, piece by piece (docs/specs/2026-11-10-motif-2.0-first-impressions-design.md, change
 * 6): the depth group's soft glow (the pieces link to each other), on first-impression screens. Everything else keeps the ban.
 */
const C_LOOK_ALLOWED: Record<string, string[]> = { "depth/*": ["glow"] };

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
        const allowed = C_LOOK_ALLOWED[`${group}/${f}`] ?? C_LOOK_ALLOWED[`${group}/*`] ?? [];
        const banned = ["glow", "tilt", "glass", "perspective\\("].filter((w) => !allowed.includes(w));
        expect(text.match(new RegExp(banned.join("|"), "i"))).toBeNull();
        expect(text.match(/react bits|animate ui|aceternity/i)).toBeNull();
      });
      if (group === "charts") {
        test(`${rel} gives the chart a text alternative`, () => {
          expect(section(read(`${group}/${f}`), "Accessibility")).toContain("in words");
        });
      }
      if (group === "depth") {
        test(`${rel} is for first-impression screens only, one per screen, from theme roles, and still under reduced motion`, () => {
          const text = read(`${group}/${f}`);
          expect([text.includes("first-impression screens only"), text.includes("one per screen")]).toEqual([true, true]);
          expect(text).not.toMatch(/#[0-9a-f]{3,8}/i);
          for (const stack of LIBRARY_STACKS) expect([stack, stackSection(text, stack).includes(REDUCED[stack]!)]).toEqual([stack, true]);
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

/** Findings from the final review: snippets an agent pastes must build, run, and honour reduced motion. */
describe("pasted snippets build and honour reduced motion (2.0 final review)", () => {
  const sections = (stacks: string[]) =>
    Object.entries(PIECES).flatMap(([group, files]) =>
      files.flatMap((f) => stacks.map((stack) => ({ at: `${group}/${f} ${stack}`, text: stackSection(read(`${group}/${f}`), stack) }))),
    );
  const offending = (stacks: string[], bad: (text: string) => boolean) => sections(stacks).filter((s) => bad(s.text)).map((s) => s.at);

  test("react-web and vue read useReducedMotion wherever Motion draws or staggers (MotionConfig only stops transforms)", () => {
    expect(offending(["react-web", "vue"], (t) => /pathLength: 0|staggerChildren|(?<![-\w])delay: /.test(t) && !t.includes("useReducedMotion"))).toEqual([]);
  });
  test("the react-web adapter doesn't promise MotionConfig makes every default motion instant", () => {
    const text = section(readFileSync(join(SKILL, "adapters/react-web/motion.md"), "utf8").replace(/\r\n/g, "\n"), "Default motion");
    expect([text.includes("these become instant"), text.includes("useReducedMotion")]).toEqual([false, true]);
  });
  test("SwiftUI never chains a modifier onto MotifMotion.animation's optional result", () => {
    expect(offending(["swiftui"], (t) => /reduceMotion: \w+\)\.[a-z]/.test(t))).toEqual([]);
  });
  test("SwiftUI guards iOS 18's Color.mix for the iOS 17 floor", () => {
    expect(offending(["swiftui"], (t) => t.includes(".mix(with:") && !t.includes("#available(iOS 18"))).toEqual([]);
  });
  test("React Native charts measure their dash instead of relying on pathLength", () => {
    expect(offending(["react-native"], (t) => t.includes("pathLength"))).toEqual([]);
  });
  test("web callers don't pass aria-hidden to TrendLine, which hides itself when it has no label", () => {
    expect(offending(["react-web", "vue", "svelte", "angular"], (t) => /<(TrendLine|motif-trend-line)[^>]*aria-hidden/.test(t))).toEqual([]);
  });
  test("Intl formatters fall back when the page has no lang", () => {
    expect(offending([...LIBRARY_STACKS], (t) => /documentElement\.lang[,)]/.test(t))).toEqual([]);
  });
  test("React Native pieces ask before adding react-native-svg, which the adapter doesn't already allow", () => {
    expect(offending(["react-native"], (t) => t.includes("react-native-svg") && !t.includes("no `react-native-svg` needed") && !/ask (the developer )?(first|before)/.test(t))).toEqual([]);
  });
  test("web snippets use Motif's own CSS variables, which exist without Tailwind 4", () => {
    expect(offending([...LIBRARY_STACKS], (t) => t.includes("var(--color-"))).toEqual([]);
  });
});
