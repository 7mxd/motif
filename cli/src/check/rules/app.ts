import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMotifGenerated, sameContent, type GeneratedFile } from "../../generate/header";
import { locator } from "../../text";
import type { SourceFile } from "../files";
import { makeHit, type Hit } from "../types";
import { IMPORTS_MOTION } from "./values";

const MOTION_CONFIG = /reducedMotion\s*=\s*\{?\s*["']user["']|reducedMotion\s*:\s*["']user["']/;
const CSS_ANIMATION = /(?<![\w-])(?:transition|animation)(?:-[a-z-]+)?\s*:/;
const TW_ANIMATION = /(?<![\w-])(?:[\w-]+:)*(?:transition-(?:all|colors|opacity|shadow|transform)|animate-[\w-]+)(?![\w-])/;
const REDUCED_QUERY = /prefers-reduced-motion/;

export function reducedMotionHits(files: SourceFile[], generated: SourceFile[]): Hit[] {
  const everything = [...files, ...generated];
  const hits: Hit[] = [];

  const motionFile = files.find((f) => f.lang !== "css" && IMPORTS_MOTION.test(f.text));
  if (motionFile && !everything.some((f) => MOTION_CONFIG.test(f.text))) {
    const index = motionFile.text.search(IMPORTS_MOTION);
    hits.push(makeHit(motionFile, locator(motionFile.text), index, {
      rule: "reduced-motion",
      text: "motion",
      violation: true,
      message: 'Animations made with Motion ignore the "reduce motion" setting.',
      fix: 'Wrap your app once in <MotionConfig reducedMotion="user"> (from motion/react).',
    }));
  }

  const animated = files.find((f) => (f.lang === "css" ? CSS_ANIMATION : TW_ANIMATION).test(f.text));
  if (animated && !everything.some((f) => f.lang === "css" && REDUCED_QUERY.test(f.text))) {
    const index = animated.text.search(animated.lang === "css" ? CSS_ANIMATION : TW_ANIMATION);
    hits.push(makeHit(animated, locator(animated.text), index, {
      rule: "reduced-motion",
      text: "animation",
      violation: true,
      message: 'CSS animations ignore the "reduce motion" setting.',
      fix: "Run motif tokens and import its stylesheet (it includes the rule), or add an @media (prefers-reduced-motion: reduce) rule.",
    }));
  }
  return hits;
}

export function generatedEditedHits(root: string, expected: GeneratedFile[]): Hit[] {
  const hits: Hit[] = [];
  for (const f of expected) {
    const abs = join(root, f.path);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    if (!isMotifGenerated(f.path, text) || sameContent(text, f.content)) continue;
    hits.push({
      rule: "generated-edited",
      file: f.path,
      line: 1,
      column: 1,
      text: "",
      violation: false,
      message: "This generated file doesn't match your design guide: it was edited by hand or is out of date.",
      fix: "Change design/tokens.json instead, then run motif tokens.",
    });
  }
  return hits;
}
