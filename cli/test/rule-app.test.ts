import { afterAll, describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { generatedEditedHits, reducedMotionHits } from "../src/check/rules/app";
import { plainFix } from "../src/check/run";
import { CSS_HEADER } from "../src/generate/header";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const file = (path: string, text: string): SourceFile => ({ path, abs: path, text, lang: path.endsWith(".css") ? "css" : "script" });
const MOTION = 'import { motion } from "motion/react";\nexport const A = () => <motion.div animate={{ x: 10 }} />;';

describe("reduced-motion", () => {
  test("Motion without MotionConfig reducedMotion=user", () => {
    const hits = reducedMotionHits([file("src/A.tsx", MOTION)], []);
    expect(hits.map((h) => [h.rule, h.file, h.line, h.violation])).toEqual([["reduced-motion", "src/A.tsx", 1, true]]);
  });
  test("MotionConfig anywhere in the app satisfies it", () => {
    const root = file("src/main.tsx", '<MotionConfig reducedMotion="user"><App /></MotionConfig>');
    expect(reducedMotionHits([file("src/A.tsx", MOTION), root], [])).toEqual([]);
  });
  test("CSS animation without a reduced-motion query", () => {
    const hits = reducedMotionHits([file("src/a.css", ".a {\n  transition: opacity var(--motif-duration-fast);\n}")], []);
    expect(hits.map((h) => [h.file, h.line])).toEqual([["src/a.css", 2]]);
  });
  test("Motif's generated stylesheet provides the query", () => {
    const generated = file("src/styles/motif.css", `${CSS_HEADER}\n\n@media (prefers-reduced-motion: reduce) {}`);
    expect(reducedMotionHits([file("src/a.css", ".a { transition: opacity 1ms; }")], [generated])).toEqual([]);
  });
  test("Tailwind animation classes count; Motion's transition prop alone does not", () => {
    expect(reducedMotionHits([file("src/B.tsx", '<a className="transition-colors" />')], []).map((h) => h.file)).toEqual(["src/B.tsx"]);
    expect(reducedMotionHits([file("src/C.tsx", "const transition = { duration: 0.2 };")], [])).toEqual([]);
  });
});

describe("generated-edited", () => {
  const expected = [{ path: "src/styles/motif.css", content: `${CSS_HEADER}\n\n:root {}\n` }];
  test("matching or missing files are fine", () => {
    expect(generatedEditedHits(makeProject({ "src/styles/motif.css": `${CSS_HEADER}\r\n\r\n:root {}\r\n` }), expected)).toEqual([]);
    expect(generatedEditedHits(makeProject({}), expected)).toEqual([]);
  });
  test("an edited generated file is a warning", () => {
    const hits = generatedEditedHits(makeProject({ "src/styles/motif.css": `${CSS_HEADER}\n\n:root { --x: 1; }\n` }), expected);
    expect(hits.map((h) => [h.rule, h.file, h.violation])).toEqual([["generated-edited", "src/styles/motif.css", false]]);
  });
  test("a file Motif didn't write is not its business here", () => {
    expect(generatedEditedHits(makeProject({ "src/styles/motif.css": ".mine {}" }), expected)).toEqual([]);
  });
});

describe("reduced-motion on a plain web site (backlog)", () => {
  test("the fix speaks of linking motif.css, not importing a stylesheet", () => {
    const [hit] = reducedMotionHits([{ path: "public/styles.css", abs: "", lang: "css", text: "@keyframes spin { to { rotate: 1turn } } .s { animation: spin 1s infinite }" }], []);
    expect(plainFix(hit!)).toContain('<link rel="stylesheet" href="motif.css">');
  });
});
