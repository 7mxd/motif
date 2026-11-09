import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS } from "../src/presets/spec";

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
    mustMention: ["gradient", "card grid", "shadow", "centred", "emoji", "icon", "copy", "lorem", "glass", "fade", "dark mode", "instead", "default look"],
  });
});
describe("knowledge: motion and accessibility", () => {
  covers("motion.md", {
    minLines: 120,
    mustMention: [
      "duration.fast", "duration.base", "duration.slow", "easing.enter", "easing.exit",
      "spring.snappy", "spring.smooth", "spring.bouncy", "transform", "opacity", "stagger",
      "shared element", "prefers-reduced-motion", "press", "skeleton", "60",
    ],
  });
  covers("accessibility.md", {
    minLines: 120,
    mustMention: [
      "WCAG 2.2", "4.5:1", "3:1", "24×24", "44×44", "focus", "keyboard", "200%",
      "label", "alt", "aria-live", "start", "right-to-left", "colour alone", "motion",
    ],
  });
});
describe("UX patterns: getting in and getting around", () => {
  covers("ux-patterns/onboarding.md", { minLines: 40, mustMention: ["skip", "permission", "progress", "first", "resume"] });
  covers("ux-patterns/sign-in.md", { minLines: 40, mustMention: ["forgot", "show", "autocomplete", "passkey", "loading", "paste"] });
  covers("ux-patterns/home-dashboard.md", { minLines: 40, mustMention: ["empty", "skeleton", "next action", "retry", "summary"] });
  covers("ux-patterns/lists-feeds.md", { minLines: 40, mustMention: ["undo", "pagination", "skeleton", "row", "scroll position", "swipe"] });
  covers("ux-patterns/detail-pages.md", { minLines: 40, mustMention: ["primary action", "sticky", "not found", "back", "breadcrumb"] });
  covers("ux-patterns/forms.md", { minLines: 40, mustMention: ["label", "inline", "blur", "keyboard", "unsaved", "error summary", "autofill"] });
});
describe("UX patterns: finding, deciding and staying informed", () => {
  covers("ux-patterns/search-filters.md", { minLines: 40, mustMention: ["no results", "recent", "chips", "debounce", "clear", "URL"] });
  covers("ux-patterns/settings.md", { minLines: 40, mustMention: ["switch", "destructive", "confirm", "group", "optimistic"] });
  covers("ux-patterns/checkout.md", { minLines: 40, mustMention: ["total", "guest", "declined", "wallet", "twice", "order summary", "mock"] });
  covers("ux-patterns/notifications.md", { minLines: 40, mustMention: ["toast", "badge", "unread", "caught up", "push", "preferences"] });
  covers("ux-patterns/profile.md", { minLines: 40, mustMention: ["initials", "edit", "avatar", "private", "own"] });
  covers("ux-patterns/empty-loading-error.md", { minLines: 40, mustMention: ["first use", "no results", "retry", "skeleton", "300 ms", "offline", "plain words"] });
});

test("the knowledge base has every pattern the spec lists, and nothing else", () => {
  expect(readdirSync(join(KNOWLEDGE, "ux-patterns")).sort()).toEqual([
    "checkout.md", "detail-pages.md", "empty-loading-error.md", "forms.md", "home-dashboard.md", "lists-feeds.md",
    "notifications.md", "onboarding.md", "profile.md", "search-filters.md", "settings.md", "sign-in.md",
  ]);
});

describe("knowledge: fixes from the 1D-1 review", () => {
  test("toasts stay at least 5 s everywhere, and exits use a shorter duration role", () => {
    const motion = read("motion.md");
    expect(motion).not.toContain("4–6 s");
    expect(motion).not.toContain("three quarters");
    expect(motion).toContain("at least 5 s");
    expect(motion).toContain("next shorter duration role");
  });
  test("accessibility doesn't promise that text follows the reader's text-size setting", () => {
    expect(read("accessibility.md")).not.toContain("scale with the viewer's text size");
  });
});

describe("knowledge: type pairings (preset refresh)", () => {
  covers("type-pairings.md", {
    minLines: 60,
    mustMention: ["Inter", "Space Grotesk", "Fraunces", "Playfair Display", "purple", "cream", "neon", "Arabic", "tabular", "lining", "Fontsource", "second"],
  });

  test("it lists every starting style's own pairing, Arabic companion included", () => {
    const text = read("type-pairings.md");
    for (const p of PRESETS) for (const family of [p.fonts.body[0]!, p.fonts.display[0]!, p.fonts.body[1]!]) expect(text).toContain(family);
  });

  test("init's directions and review point to it", () => {
    const skill = (rel: string) => readFileSync(join(KNOWLEDGE, "..", rel), "utf8");
    expect(skill("modes/init.md")).toContain("../knowledge/type-pairings.md");
    expect(skill("modes/review.md")).toContain("../knowledge/type-pairings.md");
    expect(skill("SKILL.md")).toContain("knowledge/type-pairings.md");
  });
});

describe("type pairings: the final review's small items", () => {
  const skill = (rel: string) => readFileSync(join(KNOWLEDGE, "..", rel), "utf8").replace(/\r\n/g, "\n");

  test("init, the pairings guide and visual craft give one rule for the Arabic companion", () => {
    for (const rel of ["modes/init.md", "knowledge/type-pairings.md", "knowledge/visual-craft.md"]) {
      expect([rel, skill(rel).includes("may show Arabic")]).toEqual([rel, true]);
    }
  });

  test("each pairing row names plain families, and no row repeats its text font as its Arabic companion", () => {
    const rows = read("type-pairings.md").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Text") && !l.startsWith("|---"));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const row of rows) {
      const [text, headings, arabic] = row.split("|").slice(1, 4).map((c) => c.trim());
      expect([row, /[()]/.test(`${text}${headings}`), arabic === text]).toEqual([row, false, false]);
    }
  });

  test("the plain web guide names a real Fontsource file for an Arabic companion", () => {
    expect(skill("adapters/plain-web/tokens.md")).toContain("readex-pro-arabic-wght-normal.woff2");
  });
});

describe("knowledge: 2.0 character (no screen is plain)", () => {
  const lower = (rel: string) => read(rel).toLowerCase();
  test("character.md drops the plain rule for business tools and sets option B as the floor (review focus)", () => {
    const text = read("character.md");
    expect(text).not.toContain("keep their working screens plain");
    const missing = ["how loud, not whether", "one deep `brand` card", "trend line", "progress ring", "segmented"].filter((s) => !text.includes(s));
    expect(missing).toEqual([]);
  });
  test("character.md has the fullness rule and the empty-area check", () => {
    const text = lower("character.md");
    const missing = ["empty band", "what's happening", "what should i do next", "never invented charts"].filter((s) => !text.includes(s));
    expect(missing).toEqual([]);
  });
  test("visual-craft.md: a real desktop layout and a short top navigation", () => {
    const text = lower("visual-craft.md");
    const missing = ["real desktop layout", "never a centred phone column", "few destinations"].filter((s) => !text.includes(s));
    expect(missing).toEqual([]);
  });
  test("anti-patterns.md names the C look as the limit", () => {
    const text = lower("anti-patterns.md");
    const missing = ["the c look", "glowing", "tilted", "one subtle gradient", "decoration that carries no information", "crowded top menu"].filter((s) => !text.includes(s));
    expect(missing).toEqual([]);
  });
});

describe("knowledge: 2.0 motion by default", () => {
  test("motion.md sets the default motion and its level from the brief", () => {
    const text = read("motion.md");
    const missing = [
      "## Default motion and level", "`lively`", "`default`", "`calm`", "`none`",
      "draw-in", "count-up", "stagger", "press", "success", "Feed Lily",
    ].filter((s) => !text.includes(s));
    expect(missing).toEqual([]);
  });
});

describe("knowledge: 2.0 reference notes in the UX pattern guides (instead of Refero)", () => {
  const anatomy = (rel: string) => {
    const text = read(rel);
    const start = text.indexOf("## Anatomy");
    return text.slice(start, text.indexOf("\n## ", start + 3));
  };
  for (const f of ["onboarding", "home-dashboard", "lists-feeds", "detail-pages"]) {
    test(`ux-patterns/${f}.md has "What strong apps show" inside its Anatomy`, () => {
      expect(anatomy(`ux-patterns/${f}.md`)).toContain("**What strong apps show:**");
    });
  }
  test("the home note asks for the key figures and a breakdown", () => {
    const note = anatomy("ux-patterns/home-dashboard.md");
    expect([note.includes("key figure"), note.includes("breakdown")]).toEqual([true, true]);
  });
  test("feature mode points at the notes", () => {
    const feature = readFileSync(join(KNOWLEDGE, "../modes/feature.md"), "utf8");
    const step = feature.split("\n").find((l) => l.startsWith("Read the matching UX pattern guides"))!;
    expect(step).toContain("What strong apps show");
  });
});
