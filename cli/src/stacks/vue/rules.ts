import { locator } from "../../text";
import type { SourceFile } from "../../check/files";
import { makeHit, type Hit, type Scale } from "../../check/types";
import { scanColors } from "../../check/rules/colors";
import { fontFix, IMPORTS_MOTION, MOTION_EASE, MOTION_SPRING, MOTION_TIME, offScaleHit, STYLE_KEYS } from "../../check/rules/values";

// The rules for what a .vue file binds. The script view holds each binding's expression at its place, without the
// attribute's name; `spans` says which binding it was (:style, :transition, <Transition :duration>).

const STYLE_KEY = new RegExp(`^(?:${STYLE_KEYS})$`);
/** A style key (camelCase, or kebab-case in quotes) and its value: a bare number, which Vue gives "px", or a "13px" string. */
const STYLE_ENTRY = /(?<![\w$.-])(["']?)([A-Za-z][\w-]*)\1\s*:\s*(?:(-?\d+(?:\.\d+)?)(?=\s*[,}\]\n\r]|\s*$)|(["'])(-?\d*\.?\d+)(px|rem)\4)/g;
const STYLE_FONT = /(?<![\w$.-])(["']?)(?:fontFamily|font-family)\1\s*:\s*(["'`])([^"'`]+)\2/g;
const TRANSITION_TAG = /^transition-?group$|^transition$/i;
const DURATION_NUMBER = /^\s*(\d*\.?\d+)\s*$/;
const DURATION_ENTRY = /(?<![\w$.-])(["']?)(?:enter|leave)\1\s*:\s*(\d*\.?\d+)(?=\s*[,}\n\r]|\s*$)/g;
/** Bindings that carry Motion for Vue's (and @vueuse/motion's) animation settings. */
const MOTION_BINDING = /^:(?:transition|animate|initial|exit|variants|in-view|inView|while-[\w-]+|while[A-Z]\w*)$/;
const MOTION_ELEMENT = /^motion(?:[.-]\w+)?$/i;
const MOTION_LIBRARY = /from\s+["']@vueuse\/motion["']/;

export const STYLE_COLOR_FIX = "Use 'var(--motif-color-<role>)' in the style binding, or a class (bg-<role>) with Tailwind.";
const MOTION_FIX = "Import { duration, easing, spring } from the generated motion.ts and pass spring.<role> to :transition.";
const DURATION_FIX = "Use the duration in milliseconds from motion.ts (duration.base * 1000), or leave :duration out and time the transition in CSS with var(--motif-duration-base).";

const camel = (key: string) => key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
/** The binding as written (:style or v-bind:style) without v-bind. */
const bound = (attr: string) => attr.replace(/^v-bind(?=:)/, "");

/** What the script view's bindings say that the general rules don't: style objects, transition durations, Motion settings. */
export function scanVue(source: SourceFile, scale: Scale | null): Hit[] {
  if (source.lang !== "script" || !source.spans?.length) return [];
  const file = source;
  const at = locator(file.text);
  const hits: Hit[] = [];
  const motionHere = IMPORTS_MOTION.test(file.text) || MOTION_LIBRARY.test(file.text);

  for (const span of file.spans!) {
    const attr = bound(span.attr);
    const text = file.text.slice(span.start, span.end);
    const push = (index: number, hitText: string, fields: Omit<Hit, "file" | "line" | "column" | "text">) =>
      hits.push(makeHit(file, at, span.start + index, { text: hitText, ...fields }));

    if (attr === ":style") {
      for (const m of text.matchAll(STYLE_ENTRY)) {
        const key = camel(m[2]!);
        if (!STYLE_KEY.test(key)) continue;
        const kind = key === "fontSize" ? "font-size" : /Radius$/.test(key) ? "radius" : "space";
        const index = m.index!;
        if (m[3] !== undefined) hits.push(offScaleHit(file, at, span.start + index, m[0], kind, m[3], "px", scale));
        else hits.push(offScaleHit(file, at, span.start + index, m[0], kind, m[5]!, m[6]!, scale));
      }
      for (const m of text.matchAll(STYLE_FONT)) {
        if (/^\s*var\(/.test(m[3]!)) continue;
        push(m.index!, m[0], { rule: "raw-font", kind: "font-family", value: m[3]!, violation: true, message: `Hard-coded font ${m[3]}.`, fix: fontFix(m[3]!, scale) });
      }
      // A colour in a style object: found by the colour rule on this binding alone, with a fix in Vue's words.
      const only = file.text.split("").map((c, i) => (i >= span.start && i < span.end) || c === "\n" || c === "\r" ? c : " ").join("");
      for (const h of scanColors({ ...file, text: only })) hits.push({ ...h, fix: STYLE_COLOR_FIX });
      continue;
    }

    if (attr === ":duration" && TRANSITION_TAG.test(span.tag)) {
      const whole = DURATION_NUMBER.exec(text);
      const found = whole ? [{ index: text.indexOf(whole[1]!), text: whole[1]!, n: whole[1]! }] : [...text.matchAll(DURATION_ENTRY)].map((m) => ({ index: m.index!, text: m[0], n: m[2]! }));
      for (const f of found) {
        const ms = Number.parseFloat(f.n);
        push(f.index, f.text, { rule: "raw-motion", kind: "duration", value: `${ms}ms`, violation: true, message: `Hard-coded transition duration ${f.text}.`, fix: DURATION_FIX });
      }
      continue;
    }

    if (MOTION_BINDING.test(attr) && (attr === ":transition" || MOTION_ELEMENT.test(span.tag) || motionHere)) {
      for (const m of text.matchAll(MOTION_TIME)) {
        const n = Number.parseFloat(m[2]!);
        push(m.index!, m[0], { rule: "raw-motion", kind: "duration", value: `${n > 10 ? n : n * 1000}ms`, violation: true, message: `Hard-coded Motion timing ${m[0]}.`, fix: MOTION_FIX });
      }
      for (const m of text.matchAll(MOTION_EASE)) {
        push(m.index!, m[0], { rule: "raw-motion", kind: "easing", value: m[1]!, violation: true, message: `Hard-coded Motion easing ${m[0]}.`, fix: MOTION_FIX });
      }
      for (const m of text.matchAll(MOTION_SPRING)) {
        push(m.index!, m[0], { rule: "raw-motion", kind: "spring", value: `${m[1]} ${m[2]}`, violation: true, message: `Hard-coded spring setting ${m[0]}.`, fix: MOTION_FIX });
      }
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

// An app that animates should respect "reduce motion". These are the animations Vue apps have, and the signs they do.
const TRANSITION_USE = /<(?:Transition|TransitionGroup|transition|transition-group)(?![\w.-])/;
const MOTION_USE = /<motion\.\w+|<Motion(?![\w-])|(?<![\w-])v-motion(?![\w-])/;
const CSS_ANIMATION = /(?<![\w-])(?:transition|animation)(?:-[a-z-]+)?\s*:/;
const TW_ANIMATION = /(?<![\w-])(?:[\w-]+:)*(?:transition-(?:all|colors|opacity|shadow|transform)|animate-[\w-]+)(?![\w-])/;
const REDUCED_QUERY = /prefers-reduced-motion/;
/** useReducedMotion(), reduced-motion="user" (or bound), reducedMotion: "user": what makes Motion's animations follow the setting. */
const MOTION_RESPECTS = /useReducedMotion|(?<![\w-])reduced-?motion\s*=\s*["']user["']|(?<![\w-]):reduced-?motion\s*=|reducedMotion\s*:\s*["']user["']/i;

/**
 * Whether the app animates and nothing respects the "reduce motion" setting. As on React web, Motion's animations
 * follow it through useReducedMotion or reduced-motion="user"; transitions and CSS animations through a
 * prefers-reduced-motion query in CSS (motif.css has one). One hit each, at the first animation.
 */
export function vueReducedMotionHits(files: SourceFile[], generated: SourceFile[]): Hit[] {
  const everything = [...files, ...generated];
  const hits: Hit[] = [];
  const report = (file: SourceFile, patterns: RegExp[], text: string, message: string, fix: string) => {
    const index = Math.min(...patterns.map((p) => file.text.search(p)).filter((i) => i >= 0));
    hits.push(makeHit(file, locator(file.text), index, { rule: "reduced-motion", text, violation: true, message, fix }));
  };

  const motionView = files.find((f) => (f.lang === "script" && (IMPORTS_MOTION.test(f.text) || MOTION_LIBRARY.test(f.text))) || (f.lang === "markup" && MOTION_USE.test(f.text)));
  if (motionView && !everything.some((f) => f.lang !== "css" && MOTION_RESPECTS.test(f.text))) {
    report(
      motionView,
      motionView.lang === "script" ? [IMPORTS_MOTION, MOTION_LIBRARY] : [MOTION_USE],
      "motion",
      'Animations made with Motion ignore the "reduce motion" setting.',
      'Call useReducedMotion() from motion-v, or wrap your app once in <MotionConfig reduced-motion="user">.',
    );
  }

  const animated = files.find((f) => (f.lang === "css" ? CSS_ANIMATION.test(f.text) : (f.lang === "markup" && TRANSITION_USE.test(f.text)) || TW_ANIMATION.test(f.text)));
  if (animated && !everything.some((f) => f.lang === "css" && REDUCED_QUERY.test(f.text))) {
    report(
      animated,
      animated.lang === "css" ? [CSS_ANIMATION] : [TRANSITION_USE, TW_ANIMATION],
      "animation",
      'Transitions and CSS animations ignore the "reduce motion" setting.',
      "Run motif tokens and import the motif.css it writes (it includes the rule), or add an @media (prefers-reduced-motion: reduce) rule.",
    );
  }
  return hits;
}

/** React web's motion fix names a JSX prop; in a .vue file it is :transition. */
export function vueFix(hit: Hit): string {
  if (hit.rule === "raw-motion" && hit.fix.includes("transition={")) return MOTION_FIX;
  return hit.fix;
}
