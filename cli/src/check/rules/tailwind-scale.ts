import { locator } from "../../text";
import type { SourceFile } from "../files";
import { maskComments } from "../mask";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../types";
import { CLASS_PREFIX, classSegments } from "./tailwind";
import { fontFix } from "./values";

/** Tailwind v4's default --spacing (0.25rem), used to read spacing classes in apps without Motif's theme yet. */
export const TAILWIND_SPACING_PX = 4;

const SPACING = new RegExp(`${CLASS_PREFIX}(p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end)-(\\d+(?:\\.\\d+)?|px)(?![\\w.-])`, "g");
const RADIUS = new RegExp(`${CLASS_PREFIX}rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?-(xs|sm|md|lg|xl|2xl|3xl|4xl|none|full)(?![\\w-])`, "g");
const TEXT_SIZE = new RegExp(`${CLASS_PREFIX}text-(xs|sm|base|lg|xl|[2-9]xl)(?![\\w-])`, "g");
const SHADOW = new RegExp(`${CLASS_PREFIX}shadow-(2xs|xs|sm|md|lg|xl|2xl|inner)(?![\\w-])`, "g");
const TIMING = new RegExp(`${CLASS_PREFIX}(duration|delay)-(\\d+)(?![\\w-])`, "g");
const EASE = new RegExp(`${CLASS_PREFIX}ease-(linear|in|out|in-out)(?![\\w-])`, "g");
const FONT = new RegExp(`${CLASS_PREFIX}font-(sans|serif|mono)(?![\\w-])`, "g");

const list = (prefix: string, keys: Set<string> | undefined) => [...(keys ?? [])].map((k) => `${prefix}${k}`).join(", ");
/** Something that keeps moving (a spinner, a pulsing dot): linear easing and its own duration are what it needs. */
const CONTINUOUS = /(?<![\w-])animate-(?:spin|ping|pulse|bounce)(?![\w-])/;

/** The class list a match sits in: the quoted string around it on its line, or the whole segment (@apply). */
function classListAt(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const lineEnd = text.indexOf("\n", index) === -1 ? text.length : text.indexOf("\n", index);
  const q = /(["'`])[^"'`]*$/.exec(text.slice(lineStart, index));
  if (!q) return text.slice(lineStart, lineEnd);
  const close = text.indexOf(q[1]!, index);
  return text.slice(lineStart + q.index + 1, close === -1 || close > lineEnd ? lineEnd : close);
}

export function scanTailwindScale(source: SourceFile, scale: Scale | null): Hit[] {
  // The text sizes to offer: the mono role is for code, not for prose.
  const proseKeys = scale ? new Set([...scale.textKeys].filter((k) => k !== "mono")) : undefined;
  const file = { ...source, text: maskComments(source.text, source.lang) };
  const at = locator(file.text);
  const hits: Hit[] = [];
  const push = (index: number, cls: string, rule: RuleId, kind: ValueKind, value: string, violation: boolean, message: string, fix: string) =>
    hits.push(makeHit(file, at, index, { rule, kind, value, text: cls, violation, message, fix }));
  const offScale = (keys: Set<string> | undefined, key: string) => (scale ? !keys!.has(key) : false);
  const motionImport = scale?.motionImport ?? "design/motion";

  for (const seg of classSegments(file)) {
    const base = seg.offset;
    for (const m of seg.text.matchAll(SPACING)) {
      const key = m[2]!;
      const px = key === "px" ? 1 : Number(key) * TAILWIND_SPACING_PX;
      const violation = scale ? key === "px" || !scale.spaceKeys.has(key) : false;
      push(base + m.index!, m[0], "off-scale", "space", `${px}px`, violation, `Spacing ${m[0]} isn't on your spacing scale.`, `Use a step from your scale: ${list("", scale?.spaceKeys)} (e.g. p-4).`);
    }
    for (const m of seg.text.matchAll(RADIUS)) {
      push(base + m.index!, m[0], "off-scale", "radius", m[1]!, offScale(scale?.radiusKeys, m[1]!), `Corner size ${m[0]} isn't one of your radius roles.`, `Use ${list("rounded-", scale?.radiusKeys)}.`);
    }
    for (const m of seg.text.matchAll(TEXT_SIZE)) {
      push(base + m.index!, m[0], "off-scale", "font-size", m[1]!, offScale(scale?.textKeys, m[1]!), `Text size ${m[0]} isn't one of your text roles.`, `Use ${list("text-", proseKeys)}.`);
    }
    for (const m of seg.text.matchAll(SHADOW)) {
      push(base + m.index!, m[0], "off-scale", "shadow", m[1]!, offScale(scale?.shadowKeys, m[1]!), `Shadow ${m[0]} isn't one of your shadow roles.`, `Use ${list("shadow-", scale?.shadowKeys)}.`);
    }
    for (const m of seg.text.matchAll(TIMING)) {
      const continuous = CONTINUOUS.test(classListAt(seg.text, m.index!));
      push(base + m.index!, m[0], "raw-motion", "duration", `${m[2]}ms`, !continuous, `Hard-coded animation timing ${m[0]}.`, `Use duration-(--motif-duration-base) (or fast/slow), or import { duration } from "${motionImport}".`);
    }
    for (const m of seg.text.matchAll(EASE)) {
      const continuous = m[1] === "linear" && CONTINUOUS.test(classListAt(seg.text, m.index!));
      push(base + m.index!, m[0], "raw-motion", "easing", m[1]!, !continuous && (scale ? !scale.easeKeys.has(m[1]!) : true), `Default easing ${m[0]}.`, `Use ${list("ease-", scale?.easeKeys) || "ease-standard"}.`);
    }
    for (const m of seg.text.matchAll(FONT)) {
      push(base + m.index!, m[0], "raw-font", "font-family", m[1]!, scale ? !scale.textKeys.has(m[1]!) : true, `Default font ${m[0]}.`, m[1] === "mono" ? fontFix("monospace", scale) : "Use a font role class such as font-body.");
    }
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}
