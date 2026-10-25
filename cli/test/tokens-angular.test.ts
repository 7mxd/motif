import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { buildThemeSet } from "../src/generate/theme";
import { motifCss, motionTs, tailwindCss } from "../src/stacks/react-web/generate";
import { docFrom, FIXTURES, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";
import { writeFileSync, mkdirSync } from "node:fs";

afterAll(cleanupTempDirs);

const TOKENS = JSON.stringify(validTokens());
const ctx = { positionals: [] };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => r.data.notes as string[];
const CSS_NOTE = 'Next: add @import "./styles/motif.css"; at the top of src/styles.css.';
const TAILWIND_NOTE = 'Next: add @import "./styles/motif.tailwind.css"; to src/styles.css, right after @import "tailwindcss". Importing it before Tailwind undoes the theme.';

/** Every file under dir, hashed. */
function hashAll(dir: string, rel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(dir, rel))) {
    const p = rel ? `${rel}/${e}` : e;
    if (statSync(join(dir, p)).isDirectory()) Object.assign(out, hashAll(dir, p));
    else out[p] = createHash("sha256").update(readFileSync(join(dir, p))).digest("hex");
  }
  return out;
}

/** src/styles.css as `ng new --style=tailwind` writes it (the fixture's own also imports the theme and its fonts, for motif shot). */
const NG_STYLES = "/* You can add global styles to this file, and also import other style files */\n\n@import 'tailwindcss';\n";

/** A copy of the angular-min fixture (`ng new --style=tailwind`, Angular 21.2) with a guide, ng new's styles.css, and any files changed. */
function ngApp(extra: Record<string, string> = {}): string {
  const dir = tempDir("motif-ng-");
  cpSync(join(FIXTURES, "angular-min"), dir, { recursive: true, filter: (src) => !["node_modules", ".angular", "dist"].includes(basename(src)) });
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design/tokens.json"), TOKENS);
  for (const [rel, content] of Object.entries({ "src/styles.css": NG_STYLES, ...extra })) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const fixturePkg = () => JSON.parse(readFileSync(join(FIXTURES, "angular-min/package.json"), "utf8"));
const withoutTailwind = () => {
  const pkg = fixturePkg();
  for (const d of ["@tailwindcss/postcss", "postcss", "tailwindcss"]) delete pkg.devDependencies[d];
  return { "package.json": JSON.stringify(pkg), "src/styles.css": "/* You can add global styles to this file, and also import other style files */\n" };
};

describe("motif tokens for an Angular app", () => {
  test("writes React web's CSS, Tailwind theme and motion.ts beside ng new's files, changes none of them, and says how to wire them", async () => {
    const root = ngApp();
    const before = hashAll(root);
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({
      "src/styles/motif.css": "created",
      "src/styles/motif.tailwind.css": "created",
      "src/app/design/motion.ts": "created",
      "design/motif.json": "created",
    });
    const set = buildThemeSet(docFrom(validTokens()));
    expect(readFileSync(join(root, "src/styles/motif.css"), "utf8")).toBe(motifCss(set.base, set.variants));
    expect(readFileSync(join(root, "src/styles/motif.tailwind.css"), "utf8")).toBe(tailwindCss(set.base));
    expect(readFileSync(join(root, "src/app/design/motion.ts"), "utf8")).toBe(motionTs(set.base));
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "angular", srcDir: "src" }]);
    expect(notes(r)).toContain(TAILWIND_NOTE);
    expect(notes(r)).not.toContain(CSS_NOTE);
    expect(notes(r).some((n) => n.includes("npm install motion"))).toBe(false);
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    const after = hashAll(root);
    for (const [file, hash] of Object.entries(before)) expect([file, after[file]]).toEqual([file, hash]);
  });

  test("without Tailwind: the styles.css note, and no Tailwind file", async () => {
    const r = await runTokens(ngApp(withoutTailwind()), ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/styles/motif.css", "src/app/design/motion.ts", "design/motif.json"]);
    expect(notes(r)).toContain(CSS_NOTE);
  });

  test("an app with src/styles.scss: @use", async () => {
    const angular = JSON.parse(readFileSync(join(FIXTURES, "angular-min/angular.json"), "utf8"));
    angular.projects["angular-min"].architect.build.options.styles = ["src/styles.scss"];
    const root = ngApp({ ...withoutTailwind(), "angular.json": JSON.stringify(angular, null, 2), "src/styles.scss": "" });
    expect(notes(await runTokens(root, ctx))).toContain('Next: add @use "./styles/motif.css"; at the top of src/styles.scss.');
  });

  test("no note once the app imports the theme; a second run is up to date", async () => {
    const root = ngApp({ "src/styles.css": "@import 'tailwindcss';\n@import './styles/motif.tailwind.css';\n" });
    const first = await runTokens(root, ctx);
    expect(notes(first).some((n) => n.startsWith("Next:"))).toBe(false);
    const second = await runTokens(root, ctx);
    expect(second.text).toContain("Theme code is up to date.");
    expect(Object.values(statuses(second)).every((s) => s === "unchanged")).toBe(true);
  });

  test("a motif.css that isn't Motif's is protected, and its Tailwind file and the note are skipped", async () => {
    const root = ngApp({ "src/styles/motif.css": ".mine { color: red }\n" });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(statuses(r)["src/styles/motif.css"]).toBe("protected");
    expect(statuses(r)["src/styles/motif.tailwind.css"]).toBe("skipped");
    expect(notes(r).some((n) => n.startsWith("Next:"))).toBe(false);
    expect(readFileSync(join(root, "src/styles/motif.css"), "utf8")).toBe(".mine { color: red }\n");
  });

  test("a motion.ts that isn't Motif's is protected, and the theme's note is still given", async () => {
    const root = ngApp({ "src/app/design/motion.ts": "export const mine = 1;\n" });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["src/app/design/motion.ts"]).toBe("protected");
    expect(statuses(r)["src/styles/motif.tailwind.css"]).toBe("created");
    expect(notes(r)).toContain(TAILWIND_NOTE);
    expect(readFileSync(join(root, "src/app/design/motion.ts"), "utf8")).toBe("export const mine = 1;\n");
  });

  test("Tailwind 3 gets the CSS only, with the note", async () => {
    const pkg = fixturePkg();
    pkg.devDependencies = { tailwindcss: "^3.4.0", postcss: "^8.5.3" };
    const root = ngApp({ "package.json": JSON.stringify(pkg), "src/styles.css": "@tailwind base;\n" });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).not.toContain("src/styles/motif.tailwind.css");
    expect(notes(r).join("\n")).toContain("Tailwind v3 found");
    expect(notes(r)).toContain(CSS_NOTE);
  });

  test("themeDir from motif.json wins", async () => {
    const root = ngApp({ ...withoutTailwind(), "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: ".", stack: "angular", themeDir: "src/theme" }], ignore: [] }) });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).toEqual(["src/theme/motif.css", "src/theme/motion.ts", "design/motif.json"]);
    expect(notes(r)).toContain('Next: add @import "./theme/motif.css"; at the top of src/styles.css.');
  });

  test("a workspace whose application is projects/web (sourceRoot projects/web/src)", async () => {
    const angular = JSON.parse(readFileSync(join(FIXTURES, "angular-min/angular.json"), "utf8"));
    const project = angular.projects["angular-min"];
    project.root = "projects/web";
    project.sourceRoot = "projects/web/src";
    project.architect.build.options = { browser: "projects/web/src/main.ts", tsConfig: "projects/web/tsconfig.app.json", styles: ["projects/web/src/styles.css"] };
    const root = makeProject({ "package.json": JSON.stringify(fixturePkg()), "angular.json": JSON.stringify(angular), "projects/web/src/styles.css": "@import 'tailwindcss';\n", "design/tokens.json": TOKENS });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r))).toEqual(["projects/web/src/styles/motif.css", "projects/web/src/styles/motif.tailwind.css", "projects/web/src/app/design/motion.ts", "design/motif.json"]);
    expect(notes(r)).toContain('Next: add @import "./styles/motif.tailwind.css"; to projects/web/src/styles.css, right after @import "tailwindcss". Importing it before Tailwind undoes the theme.');
  });
});
