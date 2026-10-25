import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { nodeFloor, nodeVersion } from "../src/project/node-floor";
import { readJson } from "../src/project/package";
import { angularDoctor, angularUnsupported } from "../src/stacks/angular/doctor";
import { angularMajor, angularProject, appFolder, isStandalone } from "../src/stacks/angular/project";
import { NO_VERSION, shown } from "../src/stacks/web-doctor";
import { webStack, webStacks } from "../src/stacks/web";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const paths = (files: { path: string }[]) => files.map((f) => f.path);
const angular = () => webStack("angular")!;
const app = (path: string) => ({ path, stack: "angular" as const, source: "detected" as const });
const fakeDeps = (run?: (cmd: string[]) => { code: number; stdout: string }) => ({
  platform: "linux" as const, arch: "x64", home: "/h", findBrowser: () => null, which: () => null, ...(run ? { run } : {}),
});
const node = (stdout: string) => fakeDeps(() => ({ code: 0, stdout }));

/** angular.json as `ng new` writes it (CLI 22), for one application project. */
function angularJson(name: string, opts: { style?: string; ssr?: boolean; main?: "browser" | "main"; builder?: string } = {}): string {
  const style = opts.style ?? "css";
  const build: Record<string, unknown> = {
    [opts.main ?? "browser"]: "src/main.ts",
    tsConfig: "tsconfig.app.json",
    assets: [{ glob: "**/*", input: "public" }],
    styles: [`src/styles.${style === "tailwind" ? "css" : style}`],
    ...(style === "scss" || style === "sass" || style === "less" ? { inlineStyleLanguage: style } : {}),
    ...(opts.ssr ? { server: "src/main.server.ts", outputMode: "server", ssr: { entry: "src/server.ts" } } : {}),
  };
  return JSON.stringify({
    $schema: "./node_modules/@angular/cli/lib/config/schema.json",
    version: 1,
    cli: { packageManager: "npm" },
    newProjectRoot: "projects",
    projects: {
      [name]: {
        projectType: "application",
        schematics: style === "css" || style === "tailwind" ? {} : { "@schematics/angular:component": { style } },
        root: "",
        sourceRoot: "src",
        prefix: "app",
        architect: {
          build: { builder: opts.builder ?? "@angular/build:application", options: build, defaultConfiguration: "production" },
          serve: { builder: "@angular/build:dev-server", configurations: { development: { buildTarget: `${name}:build:development` } }, defaultConfiguration: "development" },
          test: { builder: "@angular/build:unit-test" },
        },
      },
    },
  }, null, 2);
}

const ngPackage = (core: string, extra: Record<string, string> = {}, dev: Record<string, string> = {}) => JSON.stringify({
  name: "ng",
  version: "0.0.0",
  scripts: { ng: "ng", start: "ng serve", build: "ng build", watch: "ng build --watch --configuration development", test: "ng test" },
  private: true,
  dependencies: {
    "@angular/common": core, "@angular/compiler": core, "@angular/core": core, "@angular/forms": core,
    "@angular/platform-browser": core, "@angular/router": core, rxjs: "~7.8.0", tslib: "^2.3.0", ...extra,
  },
  devDependencies: { "@angular/build": core, "@angular/cli": core, "@angular/compiler-cli": core, typescript: "~6.0.2", vitest: "^5.0.0", ...dev },
});

const MAIN = "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nimport { App } from './app/app';\n\nbootstrapApplication(App, appConfig)\n  .catch((err) => console.error(err));\n";
const APP_TS = (style: string) =>
  `import { Component, signal } from '@angular/core';\nimport { RouterOutlet } from '@angular/router';\n\n@Component({\n  imports: [RouterOutlet],\n  selector: 'app-root',\n  styleUrl: './app.${style}',\n  templateUrl: './app.html',\n})\nexport class App {\n  protected readonly title = signal('ng');\n}\n`;

/**
 * `ng new ng --defaults --routing --style=<style>` (CLI 22, and CLI 21 with core ^21.2.0), as scaffolded in a temp folder
 * (no node_modules). --style=tailwind adds .postcssrc.json and @import 'tailwindcss' in src/styles.css.
 */
function cliStarter(opts: { core?: string; installed?: string; style?: "css" | "scss" | "tailwind"; files2016?: boolean; ssr?: boolean } = {}): string {
  const style = opts.style ?? "css";
  const sheet = style === "tailwind" ? "css" : style;
  const base = opts.files2016 ? "app.component" : "app";
  const tailwind: Record<string, string> = style === "tailwind" ? { "@tailwindcss/postcss": "^4.1.12", postcss: "^8.5.3", tailwindcss: "^4.1.12" } : {};
  const ssr: Record<string, string> = opts.ssr ? { "@angular/platform-server": opts.core ?? "^22.2.0", "@angular/ssr": "^22.2.4", express: "^5.1.0" } : {};
  return makeProject({
    "package.json": ngPackage(opts.core ?? "^22.2.0", ssr, tailwind),
    ...(opts.installed ? { "node_modules/@angular/core/package.json": JSON.stringify({ version: opts.installed }) } : {}),
    "angular.json": angularJson("ng", { style, ssr: opts.ssr }),
    "tsconfig.json": "{}", "tsconfig.app.json": "{}", "tsconfig.spec.json": "{}",
    ".editorconfig": "x", ".gitignore": "/dist\n/tmp\n/out-tsc\n/node_modules\n/.angular/cache\n",
    ".vscode/extensions.json": "{}",
    ...(style === "tailwind" ? { ".postcssrc.json": '{ "plugins": { "@tailwindcss/postcss": {} } }' } : {}),
    "public/favicon.ico": "x",
    "src/index.html": "<!doctype html><html><body><app-root></app-root></body></html>",
    "src/main.ts": opts.files2016 ? MAIN.replace("./app/app'", "./app/app.component'").replace(/\bApp\b/g, "AppComponent") : MAIN,
    [`src/styles.${sheet}`]: `/* You can add global styles to this file, and also import other style files */\n${style === "tailwind" ? "\n@import 'tailwindcss';\n" : ""}`,
    [`src/app/${base}.ts`]: APP_TS(sheet),
    [`src/app/${base}.html`]: "<h1>Hello</h1>\n<router-outlet />\n",
    [`src/app/${base}.${sheet}`]: "",
    [`src/app/${base}.spec.ts`]: "x",
    "src/app/app.config.ts": "export const appConfig = { providers: [provideRouter(routes)] };\n",
    "src/app/app.routes.ts": "import { Routes } from '@angular/router';\n\nexport const routes: Routes = [];\n",
    ...(opts.ssr
      ? { "src/main.server.ts": "export default bootstrap;\n", "src/server.ts": "export const reqHandler = 1;\n", "src/app/app.config.server.ts": "x", "src/app/app.routes.server.ts": "x" }
      : {}),
    ".angular/cache/22.2.4/ng/vite/deps/a.js": "x",
    "dist/ng/browser/main.js": "x",
    "out-tsc/app/main.js": "x",
    "coverage/index.html": "x",
    "src/typings.d.ts": "x",
  });
}

describe("the web-stack registry", () => {
  test("Vue, Svelte and Angular are registered; Angular names the files motif check reads", () => {
    expect(webStacks().map((s) => s.id)).toEqual(["vue", "svelte", "angular"]);
    expect(angular().extensions).toEqual([".ts", ".html", ".css", ".scss"]);
    expect(webStack("react-web")).toBeNull();
  });
});

describe("Angular CLI starters (ng new, CLI 21 and 22)", () => {
  test("--style=css (CLI 22): the app, its project in angular.json, standalone, and its folders", () => {
    const dir = cliStarter();
    expect(detectApps(dir).apps.map((a) => [a.path, a.stack])).toEqual([[".", "angular"]]);
    expect(angularMajor(dir)).toBe(22);
    expect(angularProject(dir)).toEqual({
      name: "ng", root: ".", sourceRoot: "src", main: "src/main.ts", styles: ["src/styles.css"],
      build: "@angular/build:application", serve: "@angular/build:dev-server", inlineStyleLanguage: "css",
    });
    expect(isStandalone(dir)).toBe(true);
    expect(appFolder(dir)).toBe("src/app");
    expect(angular().srcDir(dir)).toBe("src");
  });

  test("its sources: TypeScript, templates and styles; not specs, types, config, .angular, dist, out-tsc or coverage", () => {
    // app.config.ts is left out with every *.config.* file, as on the web's other stacks.
    expect(paths(angular().sourceFiles(cliStarter(), app("."), {}))).toEqual([
      "src/app/app.css", "src/app/app.html", "src/app/app.routes.ts", "src/app/app.ts", "src/index.html", "src/main.ts", "src/styles.css",
    ]);
  });

  test("--style=scss (CLI 21): scss styles and the inline style language", () => {
    const dir = cliStarter({ core: "^21.2.0", style: "scss" });
    expect(angularMajor(dir)).toBe(21);
    expect(angularProject(dir)).toMatchObject({ styles: ["src/styles.scss"], inlineStyleLanguage: "scss" });
    expect(paths(angular().sourceFiles(dir, app("."), {}))).toContain("src/app/app.scss");
    expect(paths(angular().sourceFiles(dir, app("."), {}))).toContain("src/styles.scss");
  });

  test("--style=tailwind: the same project, its .postcssrc.json left out", () => {
    const dir = cliStarter({ style: "tailwind" });
    expect(angularProject(dir)).toMatchObject({ styles: ["src/styles.css"], inlineStyleLanguage: "css" });
    expect(paths(angular().sourceFiles(dir, app("."), {}))).not.toContain(".postcssrc.json");
  });

  test("the 2016 file names (app.component.ts) are read alike", () => {
    const dir = cliStarter({ files2016: true });
    expect(isStandalone(dir)).toBe(true);
    expect(paths(angular().sourceFiles(dir, app("."), {}))).toEqual([
      "src/app/app.component.css", "src/app/app.component.html", "src/app/app.component.ts", "src/app/app.routes.ts",
      "src/index.html", "src/main.ts", "src/styles.css",
    ]);
  });

  test("--ssr: still the application project, with the server files as sources", () => {
    const dir = cliStarter({ ssr: true });
    expect(angularProject(dir)).toMatchObject({ name: "ng", main: "src/main.ts", build: "@angular/build:application" });
    expect(paths(angular().sourceFiles(dir, app("."), {}))).toEqual(expect.arrayContaining(["src/main.server.ts", "src/server.ts", "src/app/app.routes.server.ts"]));
  });

  test("the older builder (@angular-devkit/build-angular:browser) names its entry main", () => {
    const dir = makeProject({
      "package.json": ngPackage("^15.2.0"),
      "angular.json": angularJson("old", { main: "main", builder: "@angular-devkit/build-angular:browser" }),
      "src/main.ts": "platformBrowserDynamic().bootstrapModule(AppModule).catch((err) => console.error(err));\n",
    });
    expect(angularProject(dir)).toMatchObject({ main: "src/main.ts", build: "@angular-devkit/build-angular:browser" });
    expect(isStandalone(dir)).toBe(false);
  });

  test("the doctor item for each starter", () => {
    const doctor = (dir: string) => angularDoctor(fakeDeps(), { root: dir, apps: [app(".")] })[0]!;
    expect(doctor(cliStarter({ core: "^21.2.0", installed: "21.2.7" }))).toMatchObject({
      id: "angular:.", status: "ok", label: "Angular (this folder)", detail: "Angular 21.2 with standalone components.",
    });
    expect(doctor(cliStarter({ style: "scss" }))).toMatchObject({ status: "ok", detail: "Angular 22.2 with standalone components." });
  });
});

describe("Angular workspaces", () => {
  test("two application projects and a library: the first application is the app's", () => {
    const dir = makeProject({
      "package.json": ngPackage("^21.2.0"),
      "angular.json": JSON.stringify({
        version: 1,
        newProjectRoot: "projects",
        projects: {
          "ui-kit": { projectType: "library", root: "projects/ui-kit", sourceRoot: "projects/ui-kit/src", architect: { build: { builder: "@angular/build:ng-packagr" } } },
          shop: {
            projectType: "application", root: "projects/shop", sourceRoot: "projects/shop/src",
            architect: {
              build: { builder: "@angular/build:application", options: { browser: "projects/shop/src/main.ts", styles: ["projects/shop/src/styles.scss", { input: "projects/shop/src/theme.css", bundleName: "theme" }], inlineStyleLanguage: "scss" } },
              serve: { builder: "@angular/build:dev-server" },
            },
          },
          admin: { projectType: "application", root: "projects/admin", sourceRoot: "projects/admin/src", architect: { build: { builder: "@angular/build:application", options: { browser: "projects/admin/src/main.ts" } } } },
        },
      }),
      "projects/shop/src/main.ts": MAIN,
      "projects/shop/src/app/app.ts": "x",
      "projects/admin/src/main.ts": MAIN,
      "projects/ui-kit/src/public-api.ts": "x",
    });
    expect(detectApps(dir).apps.map((a) => [a.path, a.stack])).toEqual([[".", "angular"]]);
    expect(angularProject(dir)).toEqual({
      name: "shop", root: "projects/shop", sourceRoot: "projects/shop/src", main: "projects/shop/src/main.ts",
      styles: ["projects/shop/src/styles.scss", "projects/shop/src/theme.css"],
      build: "@angular/build:application", serve: "@angular/build:dev-server", inlineStyleLanguage: "scss",
    });
    expect(appFolder(dir)).toBe("projects/shop/src/app");
    expect(angular().srcDir(dir)).toBe("projects/shop/src");
    expect(isStandalone(dir)).toBe(true);
  });

  test("an Nx-style apps/web (project.json, paths from the workspace root) beside a Svelte app", () => {
    const root = makeProject({
      "package.json": "{}",
      "nx.json": "{}",
      "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { "@angular/core": "^21.2.0" } }),
      "apps/web/project.json": JSON.stringify({
        name: "web", projectType: "application", sourceRoot: "apps/web/src",
        targets: {
          build: { executor: "@angular/build:application", options: { browser: "apps/web/src/main.ts", styles: ["apps/web/src/styles.css"] } },
          serve: { executor: "@angular/build:dev-server" },
        },
      }),
      "apps/web/src/main.ts": MAIN,
      "apps/web/src/app/app.ts": "x",
      "apps/web/src/app/app.html": "x",
      "apps/web/.angular/cache/a.js": "x",
      "apps/web/dist/main.js": "x",
      "apps/site/package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.70.0", svelte: "^5.57.0" } }),
      "apps/site/src/routes/+page.svelte": "x",
    });
    const apps = detectApps(root).apps;
    expect(apps.map((a) => [a.path, a.stack])).toEqual([["apps/site", "svelte"], ["apps/web", "angular"]]);
    const web = join(root, "apps/web");
    expect(angularProject(web)).toEqual({
      name: "web", root: ".", sourceRoot: "src", main: "src/main.ts", styles: ["src/styles.css"],
      build: "@angular/build:application", serve: "@angular/build:dev-server", inlineStyleLanguage: "css",
    });
    expect(appFolder(web)).toBe("src/app");
    expect(paths(angular().sourceFiles(root, apps[1]!, {}))).toEqual(["apps/web/src/app/app.html", "apps/web/src/app/app.ts", "apps/web/src/main.ts"]);
    expect(paths(webStack("svelte")!.sourceFiles(root, apps[0]!, {}))).toEqual(["apps/site/src/routes/+page.svelte"]);
  });

  test("without angular.json or project.json: src, and no project", () => {
    const dir = makeProject({ "package.json": ngPackage("^21.2.0") });
    expect(angularProject(dir)).toBeNull();
    expect(angular().srcDir(dir)).toBe("src");
    expect(appFolder(dir)).toBe("src/app");
    expect(isStandalone(dir)).toBe(false);
    expect(angularProject(makeProject({ "package.json": "{}", "angular.json": "not json" }))).toBeNull();
  });
});

describe("Angular versions", () => {
  test("the installed @angular/core, else the declared range", () => {
    expect(angularMajor(cliStarter({ core: "^21.2.0", installed: "21.2.7" }))).toBe(21);
    expect(angularMajor(cliStarter({ core: "^21.0.0", installed: "22.0.1" }))).toBe(22);
    expect(angularMajor(makeProject({ "package.json": ngPackage("workspace:*") }))).toBeNull();
  });

  test("Angular 14 and older are unsupported; 15 and later, and an unreadable version, are not", () => {
    const at = (core: string) => angularUnsupported(makeProject({ "package.json": ngPackage(core) }));
    expect(at("^14.2.0")).toBe(
      "Angular 14 isn't supported: Motif supports Angular 15 and later. Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.",
    );
    expect(at("~12.1.0")).toStartWith("Angular 12 isn't supported");
    expect(at("^15.0.0")).toBeNull();
    expect(at("latest")).toBeNull();
    expect(angular().unsupported!(makeProject({ "package.json": ngPackage("^14.0.0") }))).not.toBeNull();
  });

  test("the doctor: Angular 14's line, an NgModule app, and a version not found", () => {
    const doctor = (dir: string) => angularDoctor(fakeDeps(), { root: dir, apps: [app(".")] })[0]!;
    expect(doctor(makeProject({ "package.json": ngPackage("^14.2.0") }))).toMatchObject({ status: "optional", detail: expect.stringMatching(/^Angular 14 isn't supported/) });
    const ngModule = makeProject({
      "package.json": ngPackage("^19.2.0"),
      "angular.json": angularJson("legacy"),
      "src/main.ts": "platformBrowserDynamic().bootstrapModule(AppModule);\n",
    });
    expect(doctor(ngModule)).toMatchObject({ status: "ok", detail: "Angular 19.2 (NgModules)." });
    expect(doctor(cliStarter({ core: "workspace:*" })).detail).toBe("Angular (version not found in package.json) with standalone components.");
  });
});

describe("Angular and Node.js", () => {
  const ng22 = () => cliStarter({ core: "^22.2.0", installed: "22.2.3" });
  const doctor = (dir: string, stdout: string | null) =>
    angularDoctor(stdout === null ? fakeDeps() : node(stdout), { root: dir, apps: [app(".")] })[0]!;

  test("Angular 22 on Node 22.14 is told to update", () => {
    expect(doctor(ng22(), "v22.14.0\n")).toMatchObject({
      status: "needed",
      detail: "Angular 22 needs Node.js 22.22.3 or later (or 24.15 or later); this computer has 22.14.0. Install a newer Node.js from nodejs.org.",
    });
    expect(doctor(ng22(), "v23.4.0").status).toBe("needed");
  });

  test("Angular 22 on a Node in its range is fine", () => {
    for (const v of ["v22.22.3", "v24.15.0", "v24.22.1", "v26.0.0"]) expect(doctor(ng22(), v)).toMatchObject({ status: "ok", detail: "Angular 22.2 with standalone components." });
  });

  test("the range is the installed @angular/core's engines.node when it has one", () => {
    const dir = makeProject({
      "package.json": ngPackage("^22.0.0"),
      "node_modules/@angular/core/package.json": JSON.stringify({ version: "22.0.0", engines: { node: "^22.12.0 || >=24.0.0" } }),
    });
    expect(doctor(dir, "v22.14.0").status).toBe("ok");
    expect(doctor(dir, "v22.11.0").detail).toBe("Angular 22 needs Node.js 22.12 or later (or 24 or later); this computer has 22.11.0. Install a newer Node.js from nodejs.org.");
  });

  test("Angular 20 and 21 need ^20.19 || ^22.12 || >=24; a Node that can't be read doesn't block", () => {
    const ng21 = cliStarter({ core: "^21.2.0" });
    expect(doctor(ng21, "v22.14.0").status).toBe("ok");
    expect(doctor(ng21, "v20.18.1")).toMatchObject({
      status: "needed",
      detail: "Angular 21 needs Node.js 20.19 or later (or 22.12 or later); this computer has 20.18.1. Install a newer Node.js from nodejs.org.",
    });
    expect(doctor(ng22(), null).status).toBe("ok");
    expect(doctor(ng22(), "not a version").status).toBe("ok");
  });
});

describe("shared helpers", () => {
  test("nodeFloor reads the engines ranges Angular publishes", () => {
    const ng22 = "^22.22.3 || ^24.15.0 || >=26.0.0";
    expect(["22.22.3", "22.30.0", "24.15.0", "24.22.1", "26.0.0", "27.1.0"].map((v) => nodeFloor(ng22, v))).toEqual([true, true, true, true, true, true]);
    expect(["22.14.0", "22.22.2", "23.11.0", "24.14.9", "25.9.0", "20.19.0"].map((v) => nodeFloor(ng22, v))).toEqual([false, false, false, false, false, false]);
    const ng20 = "^20.19.0 || ^22.12.0 || >=24.0.0";
    expect(["20.19.0", "22.12.0", "22.14.0", "24.0.0", "25.1.0"].every((v) => nodeFloor(ng20, v))).toBe(true);
    expect(["20.18.9", "21.7.0", "22.11.0", "18.20.0"].some((v) => nodeFloor(ng20, v))).toBe(false);
    const ng18 = "^18.19.1 || ^20.11.1 || >=22.0.0";
    expect(["18.19.1", "20.11.1", "22.0.0", "v24.1.0"].every((v) => nodeFloor(ng18, v))).toBe(true);
    expect(["18.19.0", "19.9.0", "20.11.0", "21.0.0"].some((v) => nodeFloor(ng18, v))).toBe(false);
    expect(nodeFloor(">=22.17.0", "22.17.0")).toBe(true);
    expect(nodeFloor(">=22.17.0", "22.16.9")).toBe(false);
  });

  test("nodeFloor: a version or range it can't read doesn't block", () => {
    expect(nodeFloor("^22.22.3", "not a version")).toBe(true);
    expect(nodeFloor("*", "22.14.0")).toBe(true);
  });

  test("nodeVersion: node --version without its v, or null", () => {
    expect(nodeVersion(node("v22.14.0\n"))).toBe("22.14.0");
    expect(nodeVersion(fakeDeps())).toBeNull();
    expect(nodeVersion(fakeDeps(() => ({ code: 1, stdout: "v22.14.0" })))).toBeNull();
    expect(nodeVersion(node("nope"))).toBeNull();
  });

  test("shown and NO_VERSION, as Vue's and Svelte's doctors print them", () => {
    expect(shown({ major: 5, minor: 57 })).toBe(" 5.57");
    expect(shown({ major: 3, minor: null })).toBe(" 3");
    expect(shown(null)).toBe("");
    expect(NO_VERSION).toBe(" (version not found in package.json)");
  });

  test("readJson: an object, or null for text that isn't one", () => {
    const dir = makeProject({ "a.json": '﻿{ "x": 1 }', "b.json": "nope", "c.json": "3" });
    expect(readJson(join(dir, "a.json"))).toEqual({ x: 1 });
    expect(readJson(join(dir, "b.json"))).toBeNull();
    expect(readJson(join(dir, "c.json"))).toBeNull();
    expect(readJson(join(dir, "missing.json"))).toBeNull();
  });
});
