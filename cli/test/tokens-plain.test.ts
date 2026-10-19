import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { CSS_HEADER } from "../src/generate/header";
import { buildTheme } from "../src/generate/theme";
import { motifCss } from "../src/stacks/react-web/generate";
import { docFrom, twoVariantTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const theme = buildTheme(docFrom(validTokens()));
const site = (files: Record<string, string>) => makeProject({ "design/tokens.json": JSON.stringify(validTokens()), ...files });
const run = async (root: string) => {
  const r = await runTokens(root, { positionals: [] });
  return { code: r.exitCode, files: r.data.files as { path: string; status: string }[], notes: r.data.notes as string[] };
};

describe("motif tokens on a plain web site", () => {
  test("writes motif.css in the site folder and the flat values, records the folder, and says how to link it", async () => {
    const root = site({ "public/index.html": "<!doctype html><title>Site</title>" });
    const r = await run(root);
    expect(r.code).toBe(0);
    expect(r.files).toEqual([
      { path: "public/motif.css", status: "created" },
      { path: "design/generated/tokens.flat.json", status: "created" },
      { path: "design/motif.json", status: "created" },
    ]);
    const css = readFileSync(join(root, "public/motif.css"), "utf8");
    expect(css).toBe(motifCss(theme));
    expect(css.startsWith(CSS_HEADER)).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "plain-web", srcDir: "public" }]);
    expect(r.notes.join("\n")).toContain('<link rel="stylesheet" href="motif.css">');
  });

  test("no wiring note once a page links it; a site at the root gets motif.css at the root", async () => {
    const linked = await run(site({ "index.html": '<link rel="stylesheet" href="motif.css">' }));
    expect(linked.files[0]).toEqual({ path: "motif.css", status: "created" });
    expect(linked.notes.join("\n")).not.toContain("Next:");
  });

  test("an @import of motif.css counts as linked, from a page or from the site's stylesheet (deferred review)", async () => {
    const fromPage = await run(site({ "index.html": '<style>@import "motif.css";</style>' }));
    expect(fromPage.notes.join("\n")).not.toContain("Next:");
    const fromCss = await run(site({ "index.html": '<link rel="stylesheet" href="main.css">', "css/main.css": '@import url("../motif.css");' }));
    expect(fromCss.notes.join("\n")).not.toContain("Next:");
  });

  test("a commented-out link, or one in a docs or design folder deeper in the site, doesn't count (deferred review)", async () => {
    const commented = await run(site({ "index.html": '<!-- <link rel="stylesheet" href="motif.css"> -->', "main.css": '/* @import "motif.css"; */' }));
    expect(commented.notes.join("\n")).toContain("Next: link motif.css");
    const docs = await run(site({ "index.html": "<title>Site</title>", "blog/docs/setup.html": '<link rel="stylesheet" href="../../motif.css">', "blog/design/mock.html": '<link rel="stylesheet" href="../../motif.css">' }));
    expect(docs.notes.join("\n")).toContain("Next: link motif.css");
  });

  test("the flat values are written once when another app also needs them", async () => {
    const r = await run(site({
      "apps/site/public/index.html": "",
      "apps/mobile/pubspec.yaml": "name: m\ndependencies:\n  flutter:\n    sdk: flutter\n",
    }));
    expect(r.files.filter((f) => f.path === "design/generated/tokens.flat.json")).toHaveLength(1);
    expect(r.files.map((f) => f.path)).toContain("apps/site/public/motif.css");
  });

  test("a two-variant guide: motif.css has the men variant and the flat tokens list it", async () => {
    const root = makeProject({ "design/tokens.json": JSON.stringify(twoVariantTokens()), "public/index.html": "<title>Site</title>" });
    expect((await run(root)).code).toBe(0);
    expect(readFileSync(join(root, "public/motif.css"), "utf8")).toContain(':root[data-variant="men"]');
    expect(JSON.parse(readFileSync(join(root, "design/generated/tokens.flat.json"), "utf8")).variants.men["color.surface"].dark).toBe("#654321");
  });
});
