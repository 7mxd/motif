import { afterAll, describe, expect, test } from "bun:test";
import { CSS_HEADER, TS_HEADER } from "../src/generate/header";
import { buildThemeSet } from "../src/generate/theme";
import { motifCss, motionTs, tailwindCss } from "../src/stacks/react-web/generate";
import { angularWiring, generateAngular } from "../src/stacks/angular/generate";
import { angularSrcDir } from "../src/stacks/angular/project";
import type { AppInfo } from "../src/detect/stacks";
import { docFrom, partnerTokens, withCompanion } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";
import { join } from "node:path";

afterAll(cleanupTempDirs);

const NG = { "@angular/core": "^21.2.0", "@angular/common": "^21.2.0", "@angular/router": "^21.2.0", motion: "^14.6.0" };
const TW = { "@tailwindcss/postcss": "^4.1.12", postcss: "^8.5.3", tailwindcss: "^4.1.12" };
const pkg = (deps: Record<string, string> = NG, dev: Record<string, string> = {}) => JSON.stringify({ name: "ng", dependencies: deps, devDependencies: { "@angular/cli": "^21.2.0", ...dev } });

/** angular.json with one application project (as `ng new` writes it), its root, sourceRoot and global styles. */
const angularJson = (opts: { root?: string; sourceRoot?: string; styles?: unknown[] } = {}) =>
  JSON.stringify({
    version: 1,
    projects: {
      ng: {
        projectType: "application",
        root: opts.root ?? "",
        sourceRoot: opts.sourceRoot ?? "src",
        architect: { build: { builder: "@angular/build:application", options: { browser: "src/main.ts", styles: opts.styles ?? ["src/styles.css"] } } },
      },
    },
  });

/** What `ng new` (CLI 21, the 2025 file names) writes, with Tailwind unless asked. */
const ngNew = (extra: Record<string, string> = {}, tailwind = true) =>
  makeProject({
    "package.json": pkg(NG, tailwind ? TW : {}),
    "angular.json": angularJson(),
    ...(tailwind ? { ".postcssrc.json": '{ "plugins": { "@tailwindcss/postcss": {} } }\n' } : {}),
    "src/main.ts": "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nimport { App } from './app/app';\n\nbootstrapApplication(App, appConfig);\n",
    "src/index.html": "<!doctype html>\n<html lang=\"en\"><head><base href=\"/\"></head><body><app-root></app-root></body></html>\n",
    "src/styles.css": tailwind ? "/* You can add global styles to this file, and also import other style files */\n\n@import 'tailwindcss';\n" : "/* You can add global styles to this file, and also import other style files */\n",
    "src/app/app.ts": "import { Component } from '@angular/core';\n\n@Component({ selector: 'app-root', templateUrl: './app.html', styleUrl: './app.css' })\nexport class App {}\n",
    "src/app/app.html": "<router-outlet />\n",
    "src/app/app.css": "",
    "src/app/app.routes.ts": "import { Routes } from '@angular/router';\n\nexport const routes: Routes = [];\n",
    ...extra,
  });

const gen = (root: string, over: Partial<AppInfo> = {}, tailwind: "v4" | "v3" | "none" = "v4", tokens: any = partnerTokens()) => {
  const app: AppInfo = { path: ".", stack: "angular", source: "detected", ...over };
  const srcDir = app.srcDir ?? angularSrcDir(join(root, app.path));
  return generateAngular(buildThemeSet(docFrom(tokens)), { root, app, srcDir, tailwind });
};
const paths = (r: { files: { path: string }[] }) => r.files.map((f) => f.path);

describe("generateAngular", () => {
  test("ng new's app gets React web's CSS, Tailwind theme and motion.ts, beside src/styles.css and in src/app", () => {
    const root = ngNew();
    const tokens = withCompanion(partnerTokens());
    const set = buildThemeSet(docFrom(tokens));
    const r = gen(root, {}, "v4", tokens);
    expect(paths(r)).toEqual(["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/app/design/motion.ts"]);
    expect(r.files[0]!.content).toBe(motifCss(set.base, set.variants));
    expect(r.files[0]!.content).toContain("partner");
    expect(r.files[0]!.content.startsWith(CSS_HEADER)).toBe(true);
    expect(r.files[1]!.content).toBe(tailwindCss(set.base));
    // Motion's animate() takes seconds, as React web's motion.ts says.
    expect(r.files[2]!.content).toBe(motionTs(set.base));
    expect(r.files[2]!.content.startsWith(TS_HEADER)).toBe(true);
    expect(r.notes).toEqual([]);
  });

  test("the 2016 file names (app.component.ts) use the same folders", () => {
    const root = ngNew({ "src/app/app.component.ts": "export class AppComponent {}\n", "src/app/app.component.html": "", "src/app/app.component.css": "" }, false);
    expect(paths(gen(root, {}, "none"))).toEqual(["src/styles/motif.css", "src/app/design/motion.ts"]);
  });

  test("a sourceRoot other than src (a workspace's projects/web/src) is where the theme goes", () => {
    const root = ngNew({ "angular.json": angularJson({ root: "projects/web", sourceRoot: "projects/web/src", styles: ["projects/web/src/styles.css"] }) }, false);
    expect(paths(gen(root, {}, "none"))).toEqual(["projects/web/src/styles/motif.css", "projects/web/src/app/design/motion.ts"]);
  });

  test("a sourceRoot at the app's own folder: styles/ and app/design/, never the project's design/", () => {
    const root = ngNew({ "angular.json": angularJson({ sourceRoot: "", styles: ["styles.css"] }) }, false);
    expect(paths(gen(root, {}, "none"))).toEqual(["styles/motif.css", "app/design/motion.ts"]);
  });

  test("themeDir wins for every file, and an app in a folder prefixes every path", () => {
    const root = makeProject({ "package.json": pkg(), "angular.json": angularJson(), "web/package.json": pkg(), "web/angular.json": angularJson() });
    expect(paths(gen(root, { themeDir: "src/theme" }))).toEqual(["src/theme/motif.css", "src/theme/motif.tailwind.css", "src/theme/motion.ts"]);
    expect(paths(gen(root, { path: "web" }))).toEqual(["web/src/styles/motif.css", "web/src/styles/motif.tailwind.css", "web/src/app/design/motion.ts"]);
  });

  test("Tailwind 3 gets React web's note and no Tailwind file", () => {
    const root = ngNew({ "package.json": pkg(NG, { tailwindcss: "^3.4.0" }) }, false);
    const r = gen(root, {}, "v3");
    expect(paths(r)).toEqual(["src/styles/motif.css", "src/app/design/motion.ts"]);
    expect(r.notes).toEqual(["Your app: Tailwind v3 found, so Motif wrote CSS variables only. Use them as bg-[var(--motif-color-action-primary)], or upgrade to Tailwind v4 for Motif's Tailwind theme."]);
  });

  test("without the motion package: how to add it, in the app's package manager", () => {
    const { motion: _, ...noMotion } = NG;
    const root = ngNew({ "package.json": pkg(noMotion) }, false);
    expect(gen(root, {}, "none").notes).toEqual([
      "src/app/design/motion.ts is for Motion's animate(): npm install motion. animate.enter and animate.leave can use the CSS variables in motif.css instead.",
    ]);
    const pnpm = ngNew({ "package.json": pkg(noMotion), "pnpm-lock.yaml": "" }, false);
    expect(gen(pnpm, {}, "none").notes[0]).toContain(": pnpm add motion.");
  });
});

describe("the one-step wiring note", () => {
  const wire = (root: string, files: string[], app: Partial<AppInfo> = {}) =>
    angularWiring(root, { path: ".", stack: "angular", source: "detected", ...app }, files.map((path) => ({ path, content: "" })), angularSrcDir);

  test("CSS: an @import at the top of the styles file angular.json names", () => {
    expect(wire(ngNew({}, false), ["src/styles/motif.css", "src/app/design/motion.ts"])).toBe('Next: add @import "./styles/motif.css"; at the top of src/styles.css.');
    const global = ngNew({ "angular.json": angularJson({ styles: ["src/global.css"] }), "src/global.css": "" }, false);
    expect(wire(global, ["src/styles/motif.css"])).toBe('Next: add @import "./styles/motif.css"; at the top of src/global.css.');
  });

  test("Sass: @use, with a semicolon in .scss and none in .sass; Less: @import", () => {
    const scss = ngNew({ "angular.json": angularJson({ styles: ["src/styles.scss"] }), "src/styles.scss": "" }, false);
    expect(wire(scss, ["src/styles/motif.css"])).toBe('Next: add @use "./styles/motif.css"; at the top of src/styles.scss.');
    const sass = ngNew({ "angular.json": angularJson({ styles: ["src/styles.sass"] }), "src/styles.sass": "" }, false);
    expect(wire(sass, ["src/styles/motif.css"])).toBe('Next: add @use "./styles/motif.css" at the top of src/styles.sass.');
    const less = ngNew({ "angular.json": angularJson({ styles: ["src/styles.less"] }), "src/styles.less": "" }, false);
    expect(wire(less, ["src/styles/motif.css"])).toBe('Next: add @import "./styles/motif.css"; at the top of src/styles.less.');
  });

  test("Tailwind 4: the Tailwind file, right after @import \"tailwindcss\"", () => {
    expect(wire(ngNew(), ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/app/design/motion.ts"])).toBe(
      'Next: add @import "./styles/motif.tailwind.css"; to src/styles.css, right after @import "tailwindcss". Importing it before Tailwind undoes the theme.',
    );
  });

  test("an entry outside the app (Angular Material's prebuilt theme first, an object entry) isn't the app's styles file", () => {
    const material = ngNew({ "angular.json": angularJson({ styles: ["@angular/material/prebuilt-themes/azure-blue.css", { input: "src/styles.scss", bundleName: "app" }] }), "src/styles.scss": "" }, false);
    expect(wire(material, ["src/styles/motif.css"])).toBe('Next: add @use "./styles/motif.css"; at the top of src/styles.scss.');
  });

  test("no global styles: add the file to angular.json's styles", () => {
    const none = ngNew({ "angular.json": angularJson({ styles: [] }) }, false);
    expect(wire(none, ["src/styles/motif.css"])).toBe('Next: add "src/styles/motif.css" to the build\'s styles in angular.json ("styles": ["src/styles/motif.css"]).');
    const mono = makeProject({ "web/package.json": pkg(), "web/angular.json": angularJson({ styles: [] }) });
    expect(wire(mono, ["web/src/styles/motif.css"], { path: "web" })).toBe('Next: add "src/styles/motif.css" to the build\'s styles in web/angular.json ("styles": ["src/styles/motif.css"]).');
  });

  test("the path is relative to the styles file: a workspace project, an app in a folder, a themeDir", () => {
    const ws = ngNew({ "angular.json": angularJson({ root: "projects/web", sourceRoot: "projects/web/src", styles: ["projects/web/src/styles.css"] }) }, false);
    expect(wire(ws, ["projects/web/src/styles/motif.css"])).toBe('Next: add @import "./styles/motif.css"; at the top of projects/web/src/styles.css.');
    const mono = makeProject({ "web/package.json": pkg(), "web/angular.json": angularJson(), "web/src/styles.css": "" });
    expect(wire(mono, ["web/src/styles/motif.css"], { path: "web" })).toBe('Next: add @import "./styles/motif.css"; at the top of web/src/styles.css.');
    expect(wire(ngNew({}, false), ["src/theme/motif.css"], { themeDir: "src/theme" })).toBe('Next: add @import "./theme/motif.css"; at the top of src/styles.css.');
    expect(wire(mono, ["shared/theme/motif.css"], { path: "web", themeDir: "shared/theme" })).toBe('Next: add @import "../../shared/theme/motif.css"; at the top of web/src/styles.css.');
  });

  test("no note once the app loads it: from its styles, a component, or angular.json's styles", () => {
    expect(wire(ngNew({ "src/styles.css": "@import 'tailwindcss';\n@import './styles/motif.tailwind.css';\n" }), ["src/styles/motif.css", "src/styles/motif.tailwind.css"])).toBeNull();
    expect(wire(ngNew({ "src/styles.scss": '@use "./styles/motif.css";\n', "angular.json": angularJson({ styles: ["src/styles.scss"] }) }, false), ["src/styles/motif.css"])).toBeNull();
    expect(wire(ngNew({ "angular.json": angularJson({ styles: ["src/styles/motif.css", "src/styles.css"] }) }, false), ["src/styles/motif.css"])).toBeNull();
    const outside = ngNew({ "angular.json": angularJson({ styles: ["global.css"] }), "global.css": '@import "./src/styles/motif.css";\n' }, false);
    expect(wire(outside, ["src/styles/motif.css"])).toBeNull();
  });

  test("an import of an earlier Motif's design/generated/motif.css doesn't count", () => {
    const root = ngNew({ "src/styles.css": "@import '../design/generated/motif.css';\n" }, false);
    expect(wire(root, ["src/styles/motif.css"])).toBe('Next: add @import "./styles/motif.css"; at the top of src/styles.css.');
  });
});
