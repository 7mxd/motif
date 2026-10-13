import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { CSS_HEADER } from "../src/generate/header";
import { previewCss } from "../src/generate/preview-css";
import { buildTheme } from "../src/generate/theme";
import { docFrom, FIXTURES, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");

describe("previewCss", () => {
  test("is the theme's CSS plus spring values for the kit", () => {
    const css = previewCss(buildTheme(docFrom(validTokens())));
    expect(css.startsWith(CSS_HEADER)).toBe(true);
    expect(css).toContain("--motif-color-background: #F9FAFB;");
    expect(css).toContain("--motif-spring-smooth-duration: 0.4;");
    expect(css).toContain("--motif-spring-smooth-bounce: 0.1;");
  });
});

describe("motif tokens --stack preview", () => {
  const ctx = (stack: string) => ({ positionals: [], flags: { stack } });
  test("writes design/previews/motif.css and nothing else", async () => {
    const root = makeProject({ "package.json": JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { vite: "^6" } }), "src/main.tsx": "", "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx("preview"));
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(root, "design/previews/motif.css"), "utf8")).toContain("--motif-spring-snappy-duration");
    expect(existsSync(join(root, "src/styles"))).toBe(false);
  });
  test("an unknown --stack is a usage error", async () => {
    const r = await runTokens(makeProject({ "design/tokens.json": TOKENS }), ctx("flutter"));
    expect(r.exitCode).toBe(2);
  });
});
