import { locator } from "../../text";
import type { SourceFile } from "../files";
import { inRanges, maskComments, rangesOf } from "../mask";
import { makeHit, type Hit, type RuleId, type Scale, type ValueKind } from "../types";
import { CSS_DECLARATION } from "./colors";

export const IMPORTS_MOTION = /from\s+["'](?:motion|motion\/react|motion\/react-client|framer-motion)["']/;

// A property, or a custom property whose name may hold digits (--surface-2).

const SPACE_PROP = /^(?:(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap|inset(?:-(?:inline|block)(?:-(?:start|end))?)?|top|right|bottom|left)$/i;
const RADIUS_PROP = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/i;
const MOTION_PROP = /^(?:transition|animation)(?:-(?:duration|delay|timing-function))?$/i;
const LENGTH = /(?<![\w.-])(-?\d*\.?\d+)(px|rem)\b/g;
const TIME = /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g;
const EASING = /\b(?:ease(?:-in-out|-in|-out)?(?![\w-])|cubic-bezier\([^)]*\))/g;
const PRIMITIVE = /--motif-primitive-[\w-]+|\bprimitive\.(?:color|font|space|radius|shadow)\b/g;

const STYLE_LENGTH = /\b((?:margin|padding)(?:Top|Right|Bottom|Left|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?|gap|rowGap|columnGap|top|right|bottom|left|inset|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|fontSize)\s*:\s*(?:(-?\d+(?:\.\d+)?)(?=\s*[,}\n\r])|(["'])(-?\d*\.?\d+)(px|rem)\3)/g;
const STYLE_FONT = /\bfontFamily\s*:\s*(["'`])([^"'`]+)\1/g;
const MOTION_TIME = /\b(duration|delay|visualDuration)\s*:\s*(\d*\.?\d+)/g;
const MOTION_SPRING = /\b(stiffness|damping|mass|bounce)\s*:\s*(\d*\.?\d+)/g;
const MOTION_EASE = /\bease\s*:\s*(\[[^\]]*\]|["'][\w-]+["'])/g;
const STYLE_BLOCK = /\b(?:style|sx)=\{\{[\s\S]*?\}\}/g;
const MOTION_BLOCK = /\btransition\s*(?:=\s*\{\{|:\s*\{)[\s\S]*?\}|\banimate\([^)]*\)/g;
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;

const sizeMessages: Record<"space" | "radius" | "font-size", (px: number, steps: number[]) => [string, string]> = {
  space: (px, steps) => [`Spacing ${px}px isn't on your spacing scale.`, `Use var(--motif-space-<step>); your steps are ${steps.join(", ")}px.`],
  radius: (px) => [`Corner size ${px}px isn't one of your radius roles.`, "Use var(--motif-radius-<role>) or a rounded-<role> class."],
  "font-size": (px) => [`Text size ${px}px isn't one of your text roles.`, "Use var(--motif-font-<role>-size) or a text-<role> class."],
};

export function scanValues(source: SourceFile, scale: Scale | null): Hit[] {
  const file = { ...source, text: maskComments(source.text, source.lang) };
  const at = locator(file.text);
  const hits: Hit[] = [];
  const push = (index: number, text: string, rule: RuleId, kind: ValueKind | undefined, value: string | undefined, violation: boolean, message: string, fix: string) =>
    hits.push(makeHit(file, at, index, { rule, ...(kind ? { kind } : {}), ...(value !== undefined ? { value } : {}), text, violation, message, fix }));

  const size = (index: number, text: string, kind: "space" | "radius" | "font-size", rawNumber: string, unit: string) => {
    const px = Math.abs(Number.parseFloat(rawNumber) * (unit === "rem" ? 16 : 1));
    const set = kind === "space" ? scale?.spacePx : kind === "radius" ? scale?.radiusPx : scale?.fontSizePx;
    const onScale = px === 0 || (set?.has(px) ?? false);
    const [message, fix] = sizeMessages[kind](px, [...(scale?.spacePx ?? [])].sort((a, b) => a - b));
    push(index, text, "off-scale", kind, `${px}px`, scale ? !onScale : false, message, fix);
  };
  const motionFix = `Use the generated ${scale?.motionImport ?? "design/motion"}.ts: import { duration, easing, spring } from it (path relative to this file), e.g. transition={spring.smooth}.`;

  if (file.lang === "css") {
    const fontFaces = rangesOf(file.text, FONT_FACE);
    for (const m of file.text.matchAll(CSS_DECLARATION)) {
      const prop = m[1]!.toLowerCase();
      const value = m[2]!;
      const start = m.index! + m[0].length - value.length;
      const fontMessage = (family: string): [string, string] => [`Hard-coded font ${family}.`, "Use var(--motif-font-body-family) or a font role class such as font-body."];
      if (prop.startsWith("--")) {
        // Not checked, but a font family declared in a variable (Tailwind's --font-sans, say) is seen by extract.
        const family = value.trim();
        if (/^--font-(?!weight|size)/.test(prop) && !prop.startsWith("--motif-") && !/^var\(/.test(family)) {
          push(start, family, "raw-font", "font-family", family, false, ...fontMessage(family));
        }
        continue;
      }
      const kind = SPACE_PROP.test(prop) ? "space" : RADIUS_PROP.test(prop) ? "radius" : prop === "font-size" ? "font-size" : null;
      if (kind) {
        for (const l of value.matchAll(LENGTH)) size(start + l.index!, l[0], kind, l[1]!, l[2]!);
      } else if (prop === "font-family") {
        const family = value.trim();
        if (!/^(?:var\(|inherit|initial|unset)/.test(family)) {
          // @font-face declares the family; it can't use a variable, so it's seen but allowed.
          push(start, family, "raw-font", "font-family", family, !inRanges(start, fontFaces), ...fontMessage(family));
        }
      } else if (MOTION_PROP.test(prop)) {
        for (const t of value.matchAll(TIME)) {
          const ms = Number.parseFloat(t[1]!) * (t[2] === "s" ? 1000 : 1);
          if (ms > 0) push(start + t.index!, t[0], "raw-motion", "duration", `${ms}ms`, true, `Hard-coded animation timing ${t[0]}.`, "Use var(--motif-duration-fast), var(--motif-duration-base) or var(--motif-duration-slow).");
        }
        for (const e of value.matchAll(EASING)) {
          push(start + e.index!, e[0], "raw-motion", "easing", e[0], true, `Hard-coded easing ${e[0]}.`, "Use var(--motif-easing-standard), var(--motif-easing-enter) or var(--motif-easing-exit).");
        }
      }
    }
  } else {
    // Sizes and fonts only inside JSX style objects; other objects ({ top: 120 } for scrollTo, chart margins) aren't styles.
    for (const [start, end] of rangesOf(file.text, STYLE_BLOCK)) {
      const block = file.text.slice(start, end);
      for (const m of block.matchAll(STYLE_LENGTH)) {
        const key = m[1]!;
        const kind = key === "fontSize" ? "font-size" : /Radius$/.test(key) ? "radius" : "space";
        if (m[2] !== undefined) size(start + m.index!, m[0], kind, m[2], "px");
        else size(start + m.index!, m[0], kind, m[4]!, m[5]!);
      }
      for (const m of block.matchAll(STYLE_FONT)) {
        push(start + m.index!, m[0], "raw-font", "font-family", m[2]!, true, `Hard-coded font ${m[2]}.`, "Use var(--motif-font-body-family) or a font role class such as font-body.");
      }
    }
    // Motion timings only inside transition settings and animate() calls; a toast's { duration: 4000 } isn't motion.
    if (IMPORTS_MOTION.test(file.text)) {
      for (const [start, end] of rangesOf(file.text, MOTION_BLOCK)) {
        const block = file.text.slice(start, end);
        for (const m of block.matchAll(MOTION_TIME)) {
          const n = Number.parseFloat(m[2]!);
          push(start + m.index!, m[0], "raw-motion", "duration", `${n > 10 ? n : n * 1000}ms`, true, `Hard-coded Motion timing ${m[0]}.`, motionFix);
        }
        for (const m of block.matchAll(MOTION_EASE)) {
          push(start + m.index!, m[0], "raw-motion", "easing", m[1]!, true, `Hard-coded Motion easing ${m[0]}.`, motionFix);
        }
        for (const m of block.matchAll(MOTION_SPRING)) {
          push(start + m.index!, m[0], "raw-motion", "spring", `${m[1]} ${m[2]}`, true, `Hard-coded spring setting ${m[0]}.`, motionFix);
        }
      }
    }
  }

  for (const m of file.text.matchAll(PRIMITIVE)) {
    push(m.index!, m[0], "primitive-use", undefined, undefined, true, `Uses a primitive value (${m[0]}) directly.`, "Use a role instead; primitives are building blocks for the design guide, not for code.");
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column);
}
