import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compile } from "tailwindcss";
import { buildTheme } from "../src/generate/theme";
import { motifCss, tailwindCss } from "../src/stacks/react-web/generate";
import { docFrom, validTokens } from "./helpers";

// Compiles Motif's generated theme with the real Tailwind v4 compiler and returns the utilities it emits.
const TAILWIND = dirname(createRequire(import.meta.url).resolve("tailwindcss/index.css"));
const GEN = "/motif-generated";

async function utilities(tokens: unknown, candidates: string[], order: "after" | "before" = "after"): Promise<string> {
  const theme = buildTheme(docFrom(tokens));
  const generated: Record<string, string> = { "motif.tailwind.css": tailwindCss(theme), "motif.css": motifCss(theme) };
  const input = order === "after"
    ? '@import "tailwindcss";\n@import "./motif.tailwind.css";\n'
    : '@import "./motif.tailwind.css";\n@import "tailwindcss";\n';
  const loadStylesheet = async (id: string, base: string) => {
    if (base === GEN && id.startsWith("./")) return { path: `${GEN}/${id.slice(2)}`, base: GEN, content: generated[id.slice(2)]! };
    const path = id === "tailwindcss" ? join(TAILWIND, "index.css") : id.startsWith("./") ? join(base, id) : join(TAILWIND, id.replace(/^tailwindcss\//, ""));
    return { path, base: dirname(path), content: readFileSync(path, "utf8") };
  };
  const compiler = await compile(input, { base: GEN, loadStylesheet });
  const css = compiler.build(candidates);
  return css.slice(css.indexOf("@layer utilities"));
}

describe("generated Tailwind v4 theme, compiled by Tailwind", () => {
  test("role classes exist and point at Motif variables", async () => {
    const css = await utilities(validTokens(), ["bg-action-primary", "text-body", "font-body", "rounded-md", "shadow-md", "ease-standard"]);
    for (const cls of ["bg-action-primary", "text-body", "font-body", "rounded-md", "shadow-md", "ease-standard"]) expect(css).toContain(`.${cls} {`);
    expect(css).toContain("var(--motif-color-action-primary)");
  });

  test("Tailwind's default palette, sizes and corners are gone", async () => {
    const css = await utilities(validTokens(), ["bg-red-500", "text-sm", "rounded-xl", "shadow-xl"]);
    for (const cls of ["bg-red-500", "text-sm", "rounded-xl", "shadow-xl"]) expect(css).not.toContain(`.${cls} {`);
  });

  test("each spacing role is its own step, even when the scale isn't a multiple of space.1", async () => {
    const t = validTokens();
    t.space["5"].$value = { value: 24, unit: "px" };
    const css = await utilities(t, ["p-5", "p-4"]);
    expect(css).toMatch(/\.p-5 \{\s*padding: var\(--motif-space-5\);/);
    expect(css).toMatch(/\.p-4 \{\s*padding: var\(--motif-space-4\);/);
  });

  test("plain rounded and shadow still render", async () => {
    const css = await utilities(validTokens(), ["rounded", "shadow"]);
    expect(css).toContain(".rounded {");
    expect(css).toContain("--motif-radius-sm");
    expect(css).toContain(".shadow {");
    expect(css).toContain("--motif-shadow-sm");
  });

  test("transition classes use the guide's duration and easing", async () => {
    const css = await utilities(validTokens(), ["transition"]);
    expect(css).toContain("var(--motif-duration-base)");
    expect(css).toContain("var(--motif-easing-standard)");
  });
});
