import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildTheme } from "../src/generate/theme";
import { CSS_HEADER, isMotifGenerated, JSON_COMMENT, sameContent, TS_HEADER } from "../src/generate/header";
import { chooseSrcDir, detectTailwind, generateReactWeb, motifCss, motionTs, tailwindCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const theme = buildTheme(docFrom(validTokens()));

describe("motifCss", () => {
  const css = motifCss(theme);
  test("starts with the header and a blank line", () => {
    expect(css.startsWith(CSS_HEADER + "\n\n")).toBe(true);
  });
  test("light values on :root, dark values in both dark blocks", () => {
    expect(css).toContain("  --motif-color-background: #F9FAFB;");
    expect(css.split("--motif-color-background: #030712;")).toHaveLength(3);
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {');
    expect(css).toContain('[data-theme="dark"] {');
  });
  test("every kind of role becomes a variable", () => {
    expect(css).toContain("--motif-space-4: 16px;");
    expect(css).toContain("--motif-radius-md: 8px;");
    expect(css).toContain("--motif-shadow-sm: 0px 1px 2px 0px rgb(0 0 0 / 0.08);");
    expect(css).toContain("--motif-font-body-family: Inter, system-ui, sans-serif;");
    expect(css).toContain("--motif-font-body-line-height: 1.5;");
    expect(css).toContain("--motif-duration-fast: 120ms;");
    expect(css).toContain("--motif-easing-standard: cubic-bezier(0.2, 0, 0, 1);");
  });
  test("includes the global reduced-motion rule", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition-duration: 0.01ms !important;");
  });
  test("custom roles get variables too", () => {
    const t = validTokens();
    t.color["brand-glow"] = { $value: "{primitive.color.indigo.400}", $extensions: { "dev.motif": { modes: { dark: "{primitive.color.indigo.700}" } } } };
    expect(motifCss(buildTheme(docFrom(t)))).toContain("--motif-color-brand-glow: #818CF8;");
  });
});

describe("tailwindCss", () => {
  const css = tailwindCss(theme);
  test("imports motif.css and resets Tailwind's defaults", () => {
    expect(css).toContain('@import "./motif.css";');
    expect(css).toContain("@theme inline {");
    for (const ns of ["color", "radius", "shadow", "text", "font", "ease"]) expect(css).toContain(`  --${ns}-*: initial;`);
  });
  test("maps utilities to roles", () => {
    expect(css).toContain("--color-action-primary: var(--motif-color-action-primary);");
    expect(css).toContain("--spacing: var(--motif-space-1);");
    expect(css).toContain("--radius-md: var(--motif-radius-md);");
    expect(css).toContain("--shadow-lg: var(--motif-shadow-lg);");
    expect(css).toContain("--font-body: var(--motif-font-body-family);");
    expect(css).toContain("--text-body: var(--motif-font-body-size);");
    expect(css).toContain("--text-body--line-height: var(--motif-font-body-line-height);");
    expect(css).toContain("--text-body--font-weight: var(--motif-font-body-weight);");
    expect(css).toContain("--default-font-family: var(--motif-font-body-family);");
    expect(css).toContain("--ease-standard: var(--motif-easing-standard);");
  });
});

describe("motionTs", () => {
  test("exports seconds, tuples and springs that Motion accepts", async () => {
    const file = join(tempDir("motif-motion-"), "motion.ts");
    writeFileSync(file, motionTs(theme));
    const m = await import(pathToFileURL(file).href);
    expect(m.duration).toEqual({ instant: 0, fast: 0.12, base: 0.2, slow: 0.32 });
    expect(m.easing.standard).toEqual([0.2, 0, 0, 1]);
    expect(m.spring.bouncy).toEqual({ type: "spring", visualDuration: 0.5, bounce: 0.3 });
  });
  test("starts with the TS header", () => {
    expect(motionTs(theme).startsWith(TS_HEADER + "\n\n")).toBe(true);
  });
});

describe("headers", () => {
  test("recognises Motif's own files only", () => {
    expect(isMotifGenerated("a.css", CSS_HEADER + "\n\nx")).toBe(true);
    expect(isMotifGenerated("a.ts", "﻿" + TS_HEADER + "\r\n")).toBe(true);
    expect(isMotifGenerated("a.css", "/* my styles */")).toBe(false);
    expect(isMotifGenerated("a.json", JSON.stringify({ $comment: JSON_COMMENT }))).toBe(true);
    expect(isMotifGenerated("a.json", "{ nope")).toBe(false);
  });
  test("sameContent ignores line endings", () => {
    expect(sameContent("a\r\nb\r\n", "a\nb\n")).toBe(true);
    expect(sameContent("a\nb", "a\nc")).toBe(false);
  });
});

describe("project detection", () => {
  test.each([
    [{ dependencies: { tailwindcss: "^4.1.0" } }, "v4"],
    [{ devDependencies: { "@tailwindcss/vite": "^4.1.0" } }, "v4"],
    [{ devDependencies: { tailwindcss: "^3.4.0" } }, "v3"],
    [{ dependencies: { react: "^19" } }, "none"],
  ])("detectTailwind(%j) → %s", (pkg, expected) => {
    expect(detectTailwind(makeProject({ "package.json": JSON.stringify(pkg) }))).toBe(expected as any);
  });
  test("a broken package.json means no Tailwind", () => {
    expect(detectTailwind(makeProject({ "package.json": "{ nope" }))).toBe("none");
  });
  test("chooseSrcDir prefers src, then app, then src", () => {
    expect(chooseSrcDir(makeProject({ "src/main.tsx": "", "app/page.tsx": "" }))).toBe("src");
    expect(chooseSrcDir(makeProject({ "app/page.tsx": "" }))).toBe("app");
    expect(chooseSrcDir(makeProject({}))).toBe("src");
  });
  test("generateReactWeb writes the Tailwind file only for Tailwind v4", () => {
    expect(generateReactWeb(theme, { srcDir: "src", tailwind: "v4" }).map((f) => f.path)).toEqual([
      "src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts",
    ]);
    expect(generateReactWeb(theme, { srcDir: "app", tailwind: "none" }).map((f) => f.path)).toEqual([
      "app/styles/motif.css", "app/design/motion.ts",
    ]);
  });
});
