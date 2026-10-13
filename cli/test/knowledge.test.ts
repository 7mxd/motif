import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
