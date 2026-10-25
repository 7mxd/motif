import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { locator, stripBom } from "../../text";
import type { SourceFile } from "../../check/files";
import { keepRanges, maskComments } from "../../check/mask";
import { CSS_ANIMATION, reducedMotionReporter, REDUCED_QUERY, TW_ANIMATION } from "../../check/reduced-motion";
import { scanColors } from "../../check/rules/colors";
import { EASING, fontFix, IMPORTS_MOTION, LENGTH, offScaleHit, RADIUS_PROP, SPACE_PROP, TIME } from "../../check/rules/values";
import { makeHit, type Hit, type Scale } from "../../check/types";
import type { WebFixContext } from "../web";
import { angularProject } from "./project";

// The rules for what an Angular template binds and what a component animates. The script view holds each bound value at
// its place, without the attribute's name; `spans` says which attribute it was ([style.padding.px]="13", [ngStyle]="{…}").

export const ANGULAR_COLOR_FIX = "Use 'var(--motif-color-<role>)' in the component's styles or [style.color], or a class (bg-<role>) with Tailwind.";
export const LEGACY_FIX = "@angular/animations is deprecated: use animate.enter with a class timed by var(--motif-duration-*) and var(--motif-easing-*).";

/** [style.padding.px]="13": one property with a unit, whose value Angular gives the unit (a number, or a numeric string). */
const STYLE_UNIT = /^\[style\.([\w-]+)\.(px|rem|em|%)\]$/i;
/** [style.padding]="on ? '13px' : '8px'": a value that is no literal (a literal one is in the CSS view). */
const STYLE_PROP = /^\[style\.([\w-]+)\]$/i;
/** [style]="{…}" and [ngStyle]="{…}": an object of properties. */
const STYLE_OBJECT = /^\[(?:style|ngStyle)\]$/;
/** Every binding that sets styles, and style="…"'s {{…}} parts: where a colour is a style's. */
const STYLED = /^(?:style|\[(?:style|ngStyle)(?:\.[\w%-]+)*\])$/i;
/** A whole value that is a number, or a numeric string ('13'): what Angular gives the unit. */
const WHOLE_NUMBER = /^(["']?)(-?\d*\.?\d+)\1$/;
/**
 * An entry of a style object: a key (camelCase, or kebab-case in quotes, with a unit as in 'gap.px') and its value, a
 * number (when the key has a unit) or a "13px" string. Groups: quote, key, unit, number, string's quote, its number, its unit.
 */
const STYLE_ENTRY = /(?<![\w$.-])(["']?)([A-Za-z][\w-]*)(?:\.(px|rem|em|%))?\1\s*:\s*(?:(-?\d*\.?\d+)(?=\s*[,}\]\n\r]|\s*$)|(["'])(-?\d*\.?\d+)(px|rem)\5)/g;
const STYLE_FONT = /(?<![\w$.-])(["']?)(?:fontFamily|font-family)\1\s*:\s*(["'`])([^"'`]+)\2/g;
const FONT_STRING = /(["'`])([^"'`]+)\1/;
/** The kind of size a CSS property (padding-top) or a style key (paddingTop) sets, or null for none Motif judges. */
function sizeKind(prop: string): "space" | "radius" | "font-size" | null {
  const kebab = prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).toLowerCase();
  return kebab === "font-size" ? "font-size" : RADIUS_PROP.test(kebab) ? "radius" : SPACE_PROP.test(kebab) ? "space" : null;
}

/** The legacy animation package's import. */
const IMPORTS_LEGACY = /from\s*["']@angular\/animations["']/;

/** What an `import { … } from "@angular/animations"` brings in, as local name → name in the package. */
function legacyImports(text: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@angular\/animations["']/g)) {
    for (const part of m[1]!.split(",")) {
      const named = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);
      if (named) names.set(named[2] ?? named[1]!, named[1]!);
    }
  }
  return names;
}

const QUOTES = new Set(['"', "'", "`"]);

/** The index of the ")" that closes the "(" at `open`, skipping strings; the end of the text if it never closes. */
function closeParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (QUOTES.has(c)) i = stringEnd(text, i) - 1;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return text.length;
}

/** After the string literal that opens at `at`. */
function stringEnd(text: string, at: number): number {
  const quote = text[at];
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i + 1;
  }
  return text.length;
}

/** The contents of the string literals between `start` and `end`, as ranges. */
function stringsIn(text: string, start: number, end: number): [number, number][] {
  const found: [number, number][] = [];
  for (let i = start; i < end; i++) {
    if (!QUOTES.has(text[i]!)) continue;
    const e = Math.min(stringEnd(text, i), end);
    found.push([i + 1, e - 1]);
    i = e - 1;
  }
  return found;
}

/** The first place at the top level of an expression (outside brackets and strings) where `test` gives a token's length: [where, length], or [-1, 0]. */
function topLevel(text: string, start: number, end: number, test: (i: number) => number): [number, number] {
  let depth = 0;
  for (let i = start; i < end; i++) {
    const c = text[i]!;
    if (QUOTES.has(c)) i = Math.min(stringEnd(text, i), end) - 1;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0) {
      const length = test(i);
      if (length > 0) return [i, length];
    }
  }
  return [-1, 0];
}

/** A ternary's "?" at `i`: not ?? or ?. */
const isQuestion = (text: string, i: number) => text[i] === "?" && text[i + 1] !== "?" && text[i + 1] !== "." && text[i - 1] !== "?";

/**
 * The numbers an expression's value can be, each a whole value: the expression itself, or a branch of a ternary
 * (on ? 13 : 16), of ?? or of ||, in parentheses or not; never an operand of arithmetic (index * 13, pos.y + 2).
 * As [index, number text].
 */
function wholeNumbers(text: string, start: number, end: number): [number, string][] {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  if (start >= end) return [];
  if (text[start] === "(" && closeParen(text, start) === end - 1) return wholeNumbers(text, start + 1, end - 1);
  // cond ? a : b: the branches (the condition is never the value).
  const [q] = topLevel(text, start, end, (i) => (isQuestion(text, i) ? 1 : 0));
  if (q !== -1) {
    let nested = 0;
    const [colon] = topLevel(text, q + 1, end, (i) => {
      if (isQuestion(text, i)) nested++;
      else if (text[i] === ":" && nested-- === 0) return 1;
      return 0;
    });
    return colon === -1 ? [] : [...wholeNumbers(text, q + 1, colon), ...wholeNumbers(text, colon + 1, end)];
  }
  // a ?? b, a || b: either side may be the value.
  const [or, length] = topLevel(text, start, end, (i) => (text.startsWith("??", i) || text.startsWith("||", i) ? 2 : 0));
  if (or !== -1) return [...wholeNumbers(text, start, or), ...wholeNumbers(text, or + length, end)];
  const m = WHOLE_NUMBER.exec(text.slice(start, end));
  return m ? [[start + m[1]!.length, m[2]!]] : [];
}

const escape = (name: string) => name.replace(/\$/g, "\\$");

/**
 * What the script view says that the web's rules don't: [style.prop.unit] numbers, [style.prop] values that are no
 * literal, [ngStyle] and [style] objects, and @angular/animations' timings. Motion's animate() is the web's own rule.
 */
export function scanAngular(source: SourceFile, scale: Scale | null): Hit[] {
  // A component's template and styles (in their own files, or inline): colours with a fix in Angular's words. The web's
  // colour rule finds the same hits after these, and only these are kept.
  if (source.lang !== "script") return source.component ? scanColors(source).map((h) => ({ ...h, fix: ANGULAR_COLOR_FIX })) : [];
  const text = maskComments(source.text, "script");
  const file = { ...source, text };
  const at = locator(text);
  const hits: Hit[] = [];
  const size = (index: number, hitText: string, kind: "space" | "radius" | "font-size", n: string, unit: string) => hits.push(offScaleHit(file, at, index, hitText, kind, n, unit, scale));
  const font = (index: number, family: string) =>
    hits.push(makeHit(file, at, index, { rule: "raw-font", kind: "font-family", value: family, text: family, violation: true, message: `Hard-coded font ${family}.`, fix: fontFix(family, scale) }));

  for (const span of source.spans ?? []) {
    const body = text.slice(span.start, span.end);
    const unit = STYLE_UNIT.exec(span.attr);
    if (unit) {
      // The unit is the binding's: a number that is the whole value, or a whole branch of it (on ? 13 : 16), is a length
      // in it; an operand (index * 13, pos.y + 2) isn't.
      const kind = sizeKind(unit[1]!);
      const u = unit[2]!.toLowerCase();
      if (kind && (u === "px" || u === "rem")) for (const [a, n] of wholeNumbers(text, span.start, span.end)) size(a, n, kind, n, u);
      continue;
    }
    const prop = STYLE_PROP.exec(span.attr)?.[1];
    if (prop) {
      const kind = sizeKind(prop);
      if (kind) for (const m of body.matchAll(LENGTH)) size(span.start + m.index!, m[0], kind, m[1]!, m[2]!);
      else if (prop.toLowerCase() === "font-family") {
        const family = FONT_STRING.exec(body);
        if (family && !/^\s*(?:var\(|inherit|initial|unset)/.test(family[2]!)) font(span.start + family.index + 1, family[2]!);
      }
      continue;
    }
    if (!STYLE_OBJECT.test(span.attr)) continue;
    for (const m of body.matchAll(STYLE_ENTRY)) {
      const kind = sizeKind(m[2]!);
      if (!kind) continue;
      const end = span.start + m.index! + m[0].length;
      if (m[4] !== undefined) {
        // A bare number has a length only through its key's unit.
        if (m[3] === "px" || m[3] === "rem") size(end - m[4].length, m[4], kind, m[4], m[3]);
      } else {
        const value = m[6]! + m[7]!;
        size(end - 1 - value.length, value, kind, m[6]!, m[7]!);
      }
    }
    for (const m of body.matchAll(STYLE_FONT)) {
      if (!/^\s*var\(/.test(m[3]!)) font(span.start + m.index! + m[0].length - 1 - m[3]!.length, m[3]!);
    }
  }

  // A colour in a style binding: the colour rule on those values alone (one buffer), with a fix in Angular's words.
  const styled = (source.spans ?? []).filter((s) => STYLED.test(s.attr)).map((s): [number, number] => [s.start, s.end]);
  if (styled.length > 0) for (const h of scanColors({ ...file, text: keepRanges(text, styled) })) hits.push({ ...h, fix: ANGULAR_COLOR_FIX });

  if (IMPORTS_LEGACY.test(text)) hits.push(...legacyHits(file, at));
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}

/**
 * @angular/animations' timings: animate('300ms 100ms ease-out', …) and animate(300), and the timings in strings of
 * transition(…) blocks (a params object's '300ms'), each once. Only the package's own animate and transition, by the
 * names the file imports them as.
 */
function legacyHits(file: SourceFile, at: (i: number) => { line: number; column: number }): Hit[] {
  const { text } = file;
  const hits: Hit[] = [];
  const seen = new Set<number>();
  const push = (index: number, hitText: string, kind: "duration" | "easing", value: string) => {
    if (seen.has(index)) return;
    seen.add(index);
    hits.push(makeHit(file, at, index, { rule: "raw-motion", kind, value, text: hitText, violation: true, message: `Hard-coded @angular/animations ${kind === "easing" ? "easing" : "timing"} ${hitText}.`, fix: LEGACY_FIX }));
  };
  const times = (a: number, b: number) => {
    for (const t of text.slice(a, b).matchAll(TIME)) {
      const ms = Number.parseFloat(t[1]!) * (t[2] === "s" ? 1000 : 1);
      if (ms > 0) push(a + t.index!, t[0], "duration", `${ms}ms`);
    }
  };
  const calls = (name: string) => [...text.matchAll(new RegExp(`(?<![\\w$.])${escape(name)}\\s*\\(`, "g"))].map((c) => {
    const open = c.index! + c[0].length - 1;
    return [open + 1, closeParen(text, open)] as const;
  });
  for (const [local, name] of legacyImports(text)) {
    if (name === "animate") {
      for (const [start] of calls(local)) {
        let i = start;
        while (/\s/.test(text[i] ?? "")) i++;
        if (QUOTES.has(text[i]!)) {
          // The timing string: duration, delay and easing.
          const end = stringEnd(text, i) - 1;
          times(i + 1, end);
          for (const e of text.slice(i + 1, end).matchAll(EASING)) push(i + 1 + e.index!, e[0], "easing", e[0]);
        } else {
          const n = /^\d*\.?\d+(?![\w.])/.exec(text.slice(i));
          if (n && Number.parseFloat(n[0]) > 0) push(i, n[0], "duration", `${Number.parseFloat(n[0])}ms`);
        }
      }
    } else if (name === "transition") {
      for (const [start, end] of calls(local)) for (const [a, b] of stringsIn(text, start, end)) times(a, b);
    }
  }
  return hits;
}

// An app that animates should respect "reduce motion". These are the animations Angular apps have, and the signs they do.
/** animate.enter and animate.leave, plain, bound or as events: CSS animations Angular runs on the element. */
const ANIMATE_ATTR = /(?<![\w.-])[[(]?animate\.(?:enter|leave)(?![\w-])/;
/** A matchMedia query of the setting, what script-driven animations follow it through. */
const SCRIPT_RESPECTS = /prefers-reduced-motion/;
/** The legacy package's animations turned off. */
const NOOP_ANIMATIONS = /provideNoopAnimations\s*\(|provideAnimationsAsync\s*\(\s*["']noop["']/;

/** app.config.ts files (app.config.server.ts too): where an app's providers are. */
const APP_CONFIG = /^app\.config(?:\.[\w-]+)*\.ts$/;

/**
 * The app's app.config*.ts, beside main.ts or in the app/ folder beside it (where ng new puts them), comments blanked:
 * the files check's ignores (*.config.*) leave out, read only for the noop animations.
 */
function appConfigTexts(appDir: string, srcDir: string): string[] {
  const main = angularProject(appDir)?.main ?? posix.join(srcDir, "main.ts");
  const near = dirname(join(appDir, main));
  const texts: string[] = [];
  for (const dir of [...new Set([near, join(near, "app"), join(appDir, srcDir, "app")])]) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => APP_CONFIG.test(n)).sort()) {
      try {
        texts.push(maskComments(stripBom(readFileSync(join(dir, name), "utf8")), "script"));
      } catch {
        // Unreadable: no sign from it.
      }
    }
  }
  return texts;
}

/**
 * Whether the app animates and nothing respects the "reduce motion" setting. Motion's animate() and @angular/animations
 * follow it only when the script checks it (a matchMedia query; the legacy package's noop animations turn it all off);
 * animate.enter, animate.leave and CSS animations through a prefers-reduced-motion query in CSS (motif.css has one). One
 * hit each, at the first animation.
 */
export function angularReducedMotionHits(files: SourceFile[], generated: SourceFile[], ctx?: { appDir: string; srcDir: string }): Hit[] {
  const everything = [...files, ...generated];
  const hits: Hit[] = [];
  const report = reducedMotionReporter(hits);
  const scripts = everything.filter((f) => f.lang === "script").map((f) => maskComments(f.text, f.lang));
  if (ctx) scripts.push(...appConfigTexts(ctx.appDir, ctx.srcDir));
  const media = scripts.some((t) => SCRIPT_RESPECTS.test(t));
  const noop = scripts.some((t) => NOOP_ANIMATIONS.test(t));

  const unrespected = [...(media ? [] : [IMPORTS_MOTION]), ...(media || noop ? [] : [IMPORTS_LEGACY])];
  const scripted = unrespected.length > 0 ? files.find((f) => f.lang === "script" && unrespected.some((p) => p.test(maskComments(f.text, f.lang)))) : undefined;
  if (scripted) {
    report(
      scripted,
      unrespected,
      "motion",
      'Animations in script (Motion, @angular/animations) ignore the "reduce motion" setting.',
      "Check window.matchMedia('(prefers-reduced-motion: reduce)').matches before animating, and skip or shorten the animation when it is true (with @angular/animations, provideNoopAnimations() or provideAnimationsAsync('noop') in app.config.ts's providers turns them off).",
    );
  }

  const animated = files.find((f) => (f.lang === "css" ? CSS_ANIMATION.test(f.text) : f.lang === "markup" && (TW_ANIMATION.test(f.text) || ANIMATE_ATTR.test(f.text))));
  if (animated && !everything.some((f) => f.lang === "css" && REDUCED_QUERY.test(f.text))) {
    report(
      animated,
      animated.lang === "css" ? [CSS_ANIMATION] : [TW_ANIMATION, ANIMATE_ATTR],
      "animation",
      'animate.enter, animate.leave and CSS animations ignore the "reduce motion" setting.',
      "Run motif tokens and import the motif.css it writes in your global styles (styles.css; it includes the rule), or add an @media (prefers-reduced-motion: reduce) rule.",
    );
  }
  return hits;
}

/** The import path of motion.ts from a file, relative to it. */
function motionSpecifier(hit: Hit, ctx: WebFixContext & { motionImport: string }): string {
  const inApp = ctx.appPath === "." ? hit.file : hit.file.slice(ctx.appPath.length + 1);
  const relative = posix.relative(posix.dirname(inApp), ctx.motionImport);
  return relative.startsWith("./") || relative.startsWith("../") ? relative : `./${relative}`;
}

/**
 * The fixes in Angular's terms: Motion's names motion.ts relative to the file and how animate() takes it (React web's
 * names a JSX prop); Tailwind's motion.ts path relative to the file. A colour in a component has its fix from scanAngular.
 */
export function angularFix(hit: Hit, ctx?: WebFixContext): string {
  if (hit.rule !== "raw-motion") return hit.fix;
  const spec = ctx?.motionImport ? motionSpecifier(hit, { ...ctx, motionImport: ctx.motionImport }) : null;
  if (hit.fixKind === "motion") {
    return `Import { duration, easing, spring } from ${spec ? `'${spec}'` : "the generated motion.ts"} and pass them to animate(): animate(el, keyframes, { duration: duration.base, ease: easing.standard }), or spring.<role> for a spring.`;
  }
  return spec ? hit.fix.replace(`"${ctx!.motionImport}"`, `"${spec}"`) : hit.fix;
}
