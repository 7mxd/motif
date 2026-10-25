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

const doctorDeps = () => ({ platform: "linux" as const, arch: "x64", home: tempDir("motif-home-"), findBrowser: () => null, which: () => null });
const NG_MAIN = "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nimport { App } from './app/app';\n\nbootstrapApplication(App, appConfig);\n";
const motifJson = (apps: { path: string; stack: string }[]) => JSON.stringify({ motifContract: 1, apps, ignore: [] });

/** An Nx integrated workspace: one package.json at the root, nx.json, and apps/web with a project.json and no package.json of its own. */
function nxWorkspace(extra: Record<string, string> = {}): string {
  return makeProject({
    "package.json": JSON.stringify({ name: "ws", dependencies: { "@angular/core": "^21.2.0" } }),
    "nx.json": "{}",
    "apps/web/project.json": JSON.stringify({
      name: "web", projectType: "application", sourceRoot: "apps/web/src",
      targets: {
        build: { executor: "@angular/build:application", options: { browser: "apps/web/src/main.ts", styles: ["apps/web/src/styles.css"] } },
        serve: { executor: "@angular/build:dev-server" },
      },
    }),
    "apps/web/src/main.ts": NG_MAIN,
    "apps/web/src/styles.css": "body { margin: 0; }\n",
    "apps/web/src/app/app.ts": "export class App {}\n",
    "libs/ui/project.json": JSON.stringify({ name: "ui", projectType: "library", sourceRoot: "libs/ui/src" }),
    "design/tokens.json": TOKENS,
    ...extra,
  });
}

describe("an Nx workspace with no package.json per app", () => {
  const NX_NOTE = 'This is an Nx workspace, and Motif reads one app at a time: name each Angular app in design/motif.json\'s "apps", as { "path": "apps/web", "stack": "angular" }.';

  test("doctor doesn't claim full support at the workspace root: it says to name each app", async () => {
    const { runDoctor } = await import("../src/commands/doctor");
    const r = await runDoctor(nxWorkspace(), doctorDeps());
    const items = (r.data as any).items as any[];
    expect(items.find((i) => i.id === "app:.")).toBeUndefined();
    expect(items.find((i) => i.id === "angular:.")).toMatchObject({ status: "needed", detail: NX_NOTE });
  });

  test("tokens writes nothing at the workspace root, and says the same", async () => {
    const root = nxWorkspace();
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(r.data.files).toEqual([]);
    expect(notes(r)).toContain(NX_NOTE);
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(existsSync(join(root, "design/motif.json"))).toBe(false);
  });

  test("named in design/motif.json, the app is read from its project.json: doctor and tokens", async () => {
    const root = nxWorkspace({ "design/motif.json": motifJson([{ path: "apps/web", stack: "angular" }]) });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toMatchObject({ "apps/web/src/styles/motif.css": "created", "apps/web/src/app/design/motion.ts": "created" });
    expect(notes(r)).toContain('Next: add @import "./styles/motif.css"; at the top of apps/web/src/styles.css.');
    const { runDoctor } = await import("../src/commands/doctor");
    const items = ((await runDoctor(root, doctorDeps())).data as any).items as any[];
    expect(items.find((i) => i.id === "app:apps/web")).toMatchObject({ status: "ok", detail: "Full support for Angular." });
    expect(items.find((i) => i.id === "angular:apps/web")).toMatchObject({ status: "ok", detail: "Angular 21.2 with standalone components." });
  });
});

describe("an angular.json with several application projects", () => {
  const project = (name: string, root: string, type = "application") => ({
    projectType: type, root, sourceRoot: `${root}/src`,
    architect: { build: { builder: "@angular/build:application", options: { browser: `${root}/src/main.ts`, styles: [`${root}/src/styles.css`] } } },
  });
  const workspace = (extra: Record<string, string> = {}) =>
    makeProject({
      "package.json": JSON.stringify({ name: "ws", dependencies: { "@angular/core": "^21.2.0" } }),
      "angular.json": JSON.stringify({ version: 1, projects: { "ui-kit": project("ui-kit", "projects/ui-kit", "library"), shop: project("shop", "projects/shop"), admin: project("admin", "projects/admin") } }),
      "projects/shop/src/main.ts": NG_MAIN,
      "projects/shop/src/styles.css": "body { margin: 0; }\n",
      "projects/admin/src/main.ts": NG_MAIN,
      "projects/admin/src/styles.css": "body { margin: 0; }\n",
      "design/tokens.json": TOKENS,
      ...extra,
    });
  const CHOICE = 'angular.json has 2 application projects, and Motif reads the first, shop. To read admin instead or as well, name it in design/motif.json\'s "apps" by its folder: { "path": "projects/admin", "stack": "angular" }.';

  test("doctor and tokens say which project they read and how to name another", async () => {
    const root = workspace();
    const { runDoctor } = await import("../src/commands/doctor");
    const items = ((await runDoctor(root, doctorDeps())).data as any).items as any[];
    expect(items.find((i) => i.id === "angular:.")).toMatchObject({ status: "ok", detail: `Angular 21.2 with standalone components. ${CHOICE}` });
    const r = await runTokens(root, ctx);
    expect(statuses(r)).toMatchObject({ "projects/shop/src/styles/motif.css": "created" });
    expect(notes(r)).toContain(CHOICE);
  });

  test("one application project: no such line", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "ws", dependencies: { "@angular/core": "^21.2.0" } }),
      "angular.json": JSON.stringify({ version: 1, projects: { shop: project("shop", "projects/shop") } }),
      "projects/shop/src/main.ts": NG_MAIN,
      "design/tokens.json": TOKENS,
    });
    expect(notes(await runTokens(root, ctx)).filter((n) => n.includes("application projects"))).toEqual([]);
  });

  test("named by its folder in design/motif.json, another project is read from the angular.json above it", async () => {
    const root = workspace({ "design/motif.json": motifJson([{ path: "projects/admin", stack: "angular" }]) });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toMatchObject({ "projects/admin/src/styles/motif.css": "created", "projects/admin/src/app/design/motion.ts": "created" });
    expect(notes(r)).toContain('Next: add @import "./styles/motif.css"; at the top of projects/admin/src/styles.css.');
    const { runDoctor } = await import("../src/commands/doctor");
    const items = ((await runDoctor(root, doctorDeps())).data as any).items as any[];
    expect(items.find((i) => i.id === "angular:projects/admin")).toMatchObject({ status: "ok", detail: "Angular 21.2 with standalone components." });
  });
});
