import { posix } from "node:path";
import { locator } from "../../text";
import type { SourceFile } from "../../check/files";
import { keepRanges, maskComments } from "../../check/mask";
import { makeHit, type Hit, type Scale } from "../../check/types";
import { scanColors } from "../../check/rules/colors";
import { fontFix, IMPORTS_MOTION, LENGTH, MOTION_TIME, offScaleHit, RADIUS_PROP, SPACE_PROP } from "../../check/rules/values";
import { libSpecifier } from "./project";
import type { WebFixContext } from "../web";

// The rules for what a .svelte file binds and animates. The script view holds each {…} value at its place, without the
// attribute's name; `spans` says which attribute it was (style:padding={…}, transition:fly={{ … }}).

const SVELTE_MOTION_IMPORT = "$lib/design/motion";
export const STYLE_COLOR_FIX = "Use 'var(--motif-color-<role>)' in style: or style=\"…\", or a class (bg-<role>) with Tailwind.";
export const MOTION_FIX = `Import { duration, easing, spring } from ${SVELTE_MOTION_IMPORT} and pass them: transition:fly={{ duration: duration.base, easing: easing.standard }}.`;
const CSS_MOTION_FIX = "Use var(--motif-duration-<role>) and var(--motif-easing-<role>) from motif.css: this app is before Svelte 5, so Motif writes no motion.ts.";

const ANIMATION_ATTR = /^(?:transition|in|out|animate):/;
const STYLE_ATTR = /^style:([\w-]+)(?:\|important)?$/;
const SPRING_OPTION = /\b(stiffness|damping)\s*:\s*(\d*\.?\d+)/g;
const FONT_STRING = /(["'`])([^"'`]+)\1/;

/** What an `import … from "svelte/easing"` or `"svelte/motion"` brings in, as local name → name in the module ("*" for a namespace). */
function importsFrom(text: string, module: "easing" | "motion"): Map<string, string> {
  const names = new Map<string, string>();
  const pattern = new RegExp(`import\\s+(?:type\\s+)?([^;"']*?)\\s*from\\s*["']svelte/${module}["']`, "g");
  for (const m of text.matchAll(pattern)) {
    const clause = m[1]!;
    const star = /\*\s*as\s+([\w$]+)/.exec(clause);
    if (star) names.set(star[1]!, "*");
    for (const part of (/\{([^}]*)\}/.exec(clause)?.[1] ?? "").split(",")) {
      const named = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);
      if (named) names.set(named[2] ?? named[1]!, named[1]!);
    }
  }
  return names;
}

/** The index of the ")" that closes the "(" at `open`, skipping strings; the end of the text if it never closes. */
function closeParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return text.length;
}

const escape = (name: string) => name.replace(/\$/g, "\\$");

/**
 * What the script view says that the general rules don't: transition parameters, Spring and Tween settings, easings
 * imported from svelte/easing, and style:prop={…} values. Motion's animate() is the web's own rule.
 */
export function scanSvelte(source: SourceFile, scale: Scale | null): Hit[] {
  if (source.lang !== "script") return [];
  const text = maskComments(source.text, "script");
  const file = { ...source, text };
  const at = locator(text);
  const hits: Hit[] = [];
  const motion = (index: number, hitText: string, kind: "duration" | "easing" | "spring", value: string, message: string) =>
    hits.push(makeHit(file, at, index, { rule: "raw-motion", kind, value, text: hitText, violation: true, message, fix: MOTION_FIX }));

  for (const span of source.spans ?? []) {
    const body = text.slice(span.start, span.end);
    if (ANIMATION_ATTR.test(span.attr)) {
      // Milliseconds: Svelte's transitions and animations take them as numbers.
      for (const m of body.matchAll(MOTION_TIME)) motion(span.start + m.index!, m[0], "duration", `${Number.parseFloat(m[2]!)}ms`, `Hard-coded transition timing ${m[0]}.`);
      continue;
    }
    const prop = STYLE_ATTR.exec(span.attr)?.[1]?.toLowerCase();
    if (!prop) continue;
    // style:prop={…}: the value is an expression; a length with a unit in it is judged like the CSS property's.
    const kind = SPACE_PROP.test(prop) ? "space" : RADIUS_PROP.test(prop) ? "radius" : prop === "font-size" ? "font-size" : null;
    if (kind) {
      for (const m of body.matchAll(LENGTH)) hits.push(offScaleHit(file, at, span.start + m.index!, m[0], kind, m[1]!, m[2]!, scale));
    } else if (prop === "font-family") {
      const family = FONT_STRING.exec(body);
      if (family && !/^\s*(?:var\(|inherit|initial|unset)/.test(family[2]!)) {
        hits.push(makeHit(file, at, span.start + family.index + 1, { rule: "raw-font", kind: "font-family", value: family[2]!, text: family[2]!, violation: true, message: `Hard-coded font ${family[2]}.`, fix: fontFix(family[2]!, scale) }));
      }
    }
  }

  // A colour in style:color={…} or style="color: {…}": the colour rule on those values alone (one buffer), with a fix in Svelte's words.
  const styled = (source.spans ?? []).filter((s) => s.attr === "style" || STYLE_ATTR.test(s.attr)).map((s): [number, number] => [s.start, s.end]);
  if (styled.length > 0) for (const h of scanColors({ ...file, text: keepRanges(text, styled) })) hits.push({ ...h, fix: STYLE_COLOR_FIX });

  // easing: cubicOut, with cubicOut imported from svelte/easing (or easing: easings.cubicOut).
  for (const [local, name] of importsFrom(text, "easing")) {
    const value = name === "*" ? `${escape(local)}\\.[\\w$]+` : escape(local);
    for (const m of text.matchAll(new RegExp(`\\beasing\\s*:\\s*${value}(?![\\w$])`, "g"))) {
      motion(m.index!, m[0], "easing", name === "*" ? m[0].replace(/^.*\./, "") : name, `Hard-coded easing ${m[0]}.`);
    }
  }

  // new Spring(0, { stiffness: 0.15, damping: 0.8 }) and new Tween(0, { duration: 400 }), and their older forms spring() and tweened().
  for (const [local, name] of importsFrom(text, "motion")) {
    const spring = name === "Spring" || name === "spring";
    if (!spring && name !== "Tween" && name !== "tweened") continue;
    const call = new RegExp(`(?<![\\w$.])${name[0] === name[0]!.toUpperCase() ? "new\\s+" : ""}${escape(local)}\\s*\\(`, "g");
    for (const c of text.matchAll(call)) {
      const open = c.index! + c[0].length - 1;
      const args = text.slice(open, closeParen(text, open));
      if (spring) {
        for (const m of args.matchAll(SPRING_OPTION)) motion(open + m.index!, m[0], "spring", `${m[1]} ${m[2]}`, `Hard-coded spring setting ${m[0]}.`);
      } else {
        for (const m of args.matchAll(MOTION_TIME)) motion(open + m.index!, m[0], "duration", `${Number.parseFloat(m[2]!)}ms`, `Hard-coded Tween timing ${m[0]}.`);
      }
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

// An app that animates should respect "reduce motion". These are the animations Svelte apps have, and the signs they do.
/** transition:fly, in:fade, out:slide, animate:flip on an element's tag (the markup view blanks every {…} value, so a > inside one can't end the tag). */
const DIRECTIVE = /<[\w:.-]+(?=[\s/>])[^<>]*?\s(?:transition|in|out|animate):[A-Za-z_]/;
const MOTION_CLASSES = /import\s+(?:type\s+)?[^;"']*\b(?:Spring|Tween|spring|tweened)\b[^;"']*from\s*["']svelte\/motion["']/;
const CSS_ANIMATION = /(?<![\w-])(?:transition|animation)(?:-[a-z-]+)?\s*:/;
const TW_ANIMATION = /(?<![\w-])(?:[\w-]+:)*(?:transition-(?:all|colors|opacity|shadow|transform)|animate-[\w-]+)(?![\w-])/;
const REDUCED_QUERY = /prefers-reduced-motion/;
/** prefersReducedMotion from svelte/motion (Svelte 5.7), or a matchMedia query of the setting: what lets script-driven animations follow it. */
const SCRIPT_RESPECTS = /prefersReducedMotion|prefers-reduced-motion/;

/**
 * Whether the app animates and nothing respects the "reduce motion" setting. Transitions and animations that Svelte
 * runs, Spring, Tween and Motion's animate() follow it only when the script checks it (prefersReducedMotion from
 * svelte/motion); CSS animations and transitions through a prefers-reduced-motion query in CSS (motif.css has one). One
 * hit each, at the first animation.
 */
export function svelteReducedMotionHits(files: SourceFile[], generated: SourceFile[]): Hit[] {
  const everything = [...files, ...generated];
  const hits: Hit[] = [];
  const report = (file: SourceFile, patterns: RegExp[], text: string, message: string, fix: string) => {
    const index = Math.min(...patterns.map((p) => file.text.search(p)).filter((i) => i >= 0));
    hits.push(makeHit(file, locator(file.text), index, { rule: "reduced-motion", text, violation: true, message, fix }));
  };

  const scripted = files.find((f) => (f.lang === "script" && (IMPORTS_MOTION.test(maskComments(f.text, f.lang)) || MOTION_CLASSES.test(maskComments(f.text, f.lang)))) || (f.lang === "markup" && DIRECTIVE.test(maskComments(f.text, f.lang))));
  if (scripted && !everything.some((f) => f.lang === "script" && SCRIPT_RESPECTS.test(maskComments(f.text, f.lang)))) {
    report(
      scripted,
      scripted.lang === "script" ? [IMPORTS_MOTION, MOTION_CLASSES] : [DIRECTIVE],
      "motion",
      'Transitions, springs and tweens ignore the "reduce motion" setting.',
      "Check prefersReducedMotion from svelte/motion (Svelte 5.7 or later), and skip or shorten them: transition:fly={{ duration: prefersReducedMotion.current ? 0 : duration.base }}.",
    );
  }

  const animated = files.find((f) => (f.lang === "css" ? CSS_ANIMATION.test(f.text) : f.lang === "markup" && TW_ANIMATION.test(f.text)));
  if (animated && !everything.some((f) => f.lang === "css" && REDUCED_QUERY.test(f.text))) {
    report(
      animated,
      animated.lang === "css" ? [CSS_ANIMATION] : [TW_ANIMATION],
      "animation",
      'CSS animations and transitions ignore the "reduce motion" setting.',
      "Run motif tokens and import the motif.css it writes (it includes the rule), or add an @media (prefers-reduced-motion: reduce) rule.",
    );
  }
  return hits;
}

/** The import path of motion.ts from a file: $lib/… (#lib/… in SvelteKit 3) when it is in src/lib, else relative to the file. */
function motionSpecifier(hit: Hit, ctx: WebFixContext & { motionImport: string }): string {
  const lib = libSpecifier(ctx.appDir, ctx.motionImport);
  if (lib !== null) return lib;
  const inApp = ctx.appPath === "." ? hit.file : hit.file.slice(ctx.appPath.length + 1);
  const relative = posix.relative(posix.dirname(inApp), ctx.motionImport);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/** React web's motion fix names a JSX prop and a path relative to the file; in a .svelte file it is a directive, and $lib in SvelteKit. */
export function svelteFix(hit: Hit, ctx?: WebFixContext): string {
  if (hit.rule !== "raw-motion") return hit.fix;
  if (!ctx) return isJsMotion(hit) ? MOTION_FIX : hit.fix; // without the app's details: the SvelteKit wording
  const { motionImport } = ctx;
  if (!motionImport) return isJsMotion(hit) ? CSS_MOTION_FIX : hit.fix;
  const spec = motionSpecifier(hit, { ...ctx, motionImport });
  if (isJsMotion(hit)) return MOTION_FIX.replace(SVELTE_MOTION_IMPORT, spec);
  return hit.fix.replace(`"${motionImport}"`, `"${spec}"`);
}

const isJsMotion = (hit: Hit) => hit.fix === MOTION_FIX || hit.fix.includes("transition={");
