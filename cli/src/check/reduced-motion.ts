import { locator } from "../text";
import type { SourceFile } from "./files";
import { makeHit, type Hit } from "./types";

// What the web stacks' "reduce motion" checks share: the signs of an animation in CSS and Tailwind classes, the
// media query that respects the setting, and how a hit is made at the first animation.

/** A transition or animation property in CSS. */
export const CSS_ANIMATION = /(?<![\w-])(?:transition|animation)(?:-[a-z-]+)?\s*:/;
/** Tailwind's transition and animate-* classes, with any variants before them. */
export const TW_ANIMATION = /(?<![\w-])(?:[\w-]+:)*(?:transition-(?:all|colors|opacity|shadow|transform)|animate-[\w-]+)(?![\w-])/;
/** The media query that lets CSS follow the setting. */
export const REDUCED_QUERY = /prefers-reduced-motion/;

/** Adds to hits a reduced-motion hit in a file, at the first place any of the patterns matches. */
export function reducedMotionReporter(hits: Hit[]) {
  return (file: SourceFile, patterns: RegExp[], text: string, message: string, fix: string) => {
    const index = Math.min(...patterns.map((p) => file.text.search(p)).filter((i) => i >= 0));
    hits.push(makeHit(file, locator(file.text), index, { rule: "reduced-motion", text, violation: true, message, fix }));
  };
}
