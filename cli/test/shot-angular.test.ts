import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import { devCommand } from "../src/shot/devserver";
import { ANGULAR } from "../src/stacks/angular";
import { twoVariantTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const CHROME = { name: "Chrome" as const, path: "/fake/chrome" };
const PORT = 4321;
const ANGULAR_JSON = (build = "@angular/build:application", serve = "@angular/build:dev-server") => JSON.stringify({
  version: 1,
  projects: {
    app: {
      projectType: "application",
      root: "",
      sourceRoot: "src",
      architect: { build: { builder: build, options: { browser: "src/main.ts", styles: ["src/styles.css"] } }, serve: { builder: serve } },
    },
  },
});
/** package.json as `ng new` writes it (CLI 21 and 22: "start": "ng serve"), with the given Angular version and scripts. */
const pkg = (version = "^21.2.0", scripts: Record<string, string> = { ng: "ng", start: "ng serve", build: "ng build" }) =>
  JSON.stringify({ scripts, dependencies: { "@angular/core": version, "@angular/router": version }, devDependencies: { "@angular/cli": version } });
const MAIN = "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nimport { App } from './app/app';\n\nbootstrapApplication(App, appConfig);\n";
const CONFIG = "import { ApplicationConfig } from '@angular/core';\nimport { provideRouter } from '@angular/router';\nimport { routes } from './app.routes';\n\nexport const appConfig: ApplicationConfig = { providers: [provideRouter(routes)] };\n";
const ROUTES = "import { Routes } from '@angular/router';\nimport { Home } from './home';\n\nexport const routes: Routes = [\n  { path: '', component: Home },\n  { path: 'about', loadComponent: () => import('./about').then(m => m.About) },\n  { path: 'tools/:id', component: Home },\n  { path: '**', redirectTo: '' },\n];\n";
const COMPONENT = (name: string) => `import { Component } from '@angular/core';\n\n@Component({ selector: 'app-x', template: '<p>x</p>' })\nexport class ${name} {}\n`;

/** An app as `ng new` lays it out (CLI 21; CLI 22's is the same where shot looks), with its dependencies installed. */
const app = (over: Record<string, string> = {}): Record<string, string> => ({
  "package.json": pkg(),
  "package-lock.json": "{}",
  "node_modules/.keep": "",
  "angular.json": ANGULAR_JSON(),
  "src/main.ts": MAIN,
  "src/app/app.ts": COMPONENT("App"),
  "src/app/app.config.ts": CONFIG,
  "src/app/app.routes.ts": ROUTES,
  ...over,
});

const WHICH = (cmd: string) => `/usr/bin/${cmd}`;
const shotName = (route: string, variant?: string) => `${route === "/" ? "index" : route.slice(1)}${variant ? `+${variant}` : ""}.mobile.png`;

type Started = { cwd: string; command: string[]; timeoutMs?: number; env?: Record<string, string>; buildingStatus?: number };
function fakes(over: Partial<ShotDeps> & { results?: (o: CaptureOptions) => RouteResult[]; platform?: NodeJS.Platform } = {}) {
  const calls = { started: [] as Started[], stopped: 0, captured: [] as CaptureOptions[], displays: [] as string[] };
  const { results, platform, ...rest } = over;
  const deps: ShotDeps = {
    findBrowser: () => CHROME,
    // What shot passes (the stack's devScript) goes through; the port is pinned so the command can be compared.
    devCommand: (dir, opts) => {
      const how = devCommand(dir, { platform: platform ?? "linux", which: WHICH, vars: {}, port: PORT, ...opts });
      if ("display" in how) calls.displays.push(how.display);
      return how;
    },
    startDevServer: async (o) => {
      calls.started.push({ cwd: o.cwd, command: o.command, timeoutMs: o.timeoutMs, env: o.env, buildingStatus: o.buildingStatus });
      return { url: `http://localhost:${PORT}/`, pid: 1, stop: async () => void calls.stopped++ };
    },
    serveStatic: () => ({ url: "http://127.0.0.1:1", stop: () => {} }),
    capture: async (o) => {
      calls.captured.push(o);
      const routes =
        results?.(o) ?? o.routes.map((route) => ({ route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, shotName(route))] }));
      for (const shot of routes.flatMap((r) => r.shots)) {
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
      }
      return { routes, issues: [] };
    },
    compare: async (o) => o.pairs.map((p) => ({ ...p })),
    today: () => "2026-10-25",
    ...rest,
  };
  return { deps, calls };
}
const ctx = (flags: Record<string, string | boolean> = {}) => ({ positionals: [], flags });
const NO_ANALYTICS = { NG_CLI_ANALYTICS: "false" };

describe("motif shot: an Angular app", () => {
  test("starts through its start script (ng serve) on a free port, with no analytics prompt, and draws its pages at the web's sizes", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(app()), ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toHaveLength(1);
    expect(calls.started[0]!.command).toEqual(["/usr/bin/npm", "run", "start", "--", "--port", String(PORT)]);
    expect(calls.started[0]!.env).toEqual(NO_ANALYTICS);
    expect(calls.started[0]!.timeoutMs).toBe(ANGULAR.startTimeoutMs!("."));
    expect(calls.started[0]!.buildingStatus).toBeUndefined();
    expect(calls.captured[0]!.baseUrl).toBe(`http://localhost:${PORT}/`);
    expect(calls.captured[0]!.routes).toEqual(["/", "/about"]);
    expect(r.text).toContain("/tools/:id");
    expect(calls.captured[0]!.viewports).toBeUndefined();
    expect(calls.stopped).toBe(1);
  });

  test("4200 may be busy: Motif always passes the port it chose", async () => {
    const { deps, calls } = fakes();
    await runShot(makeProject(app()), ctx(), deps);
    const command = calls.started[0]!.command;
    expect(command.slice(-2)).toEqual(["--port", String(PORT)]);
    expect(command).not.toContain("4200");
  });

  test("a CLI 22 app, an SSR app (ng new --ssr) and an Angular 14 app take the same path", async () => {
    const apps = [
      app({ "package.json": pkg("^22.2.0") }),
      app({ "package.json": pkg("^21.2.0", { ng: "ng", start: "ng serve", build: "ng build", "serve:ssr:app": "node dist/app/server/server.mjs" }), "src/server.ts": "" }),
      app({ "package.json": pkg("^14.2.0"), "angular.json": ANGULAR_JSON("@angular-devkit/build-angular:browser", "@angular-devkit/build-angular:dev-server") }),
    ];
    for (const root of apps) {
      const { deps, calls } = fakes();
      const r = await runShot(makeProject(root), ctx(), deps);
      expect(r.exitCode).toBe(0);
      expect(calls.displays).toEqual([`npm run start -- --port ${PORT}`]);
      expect(calls.started[0]!.env).toEqual(NO_ANALYTICS);
      expect(calls.captured[0]!.routes).toEqual(["/", "/about"]);
    }
  });

  test("the command follows the lockfile's package manager, each passing the port so ng serve gets it", async () => {
    const cases = [
      ["pnpm-lock.yaml", `pnpm run start --port ${PORT}`],
      ["yarn.lock", `yarn run start --port ${PORT}`],
      ["bun.lock", `bun run start --port ${PORT}`],
      ["package-lock.json", `npm run start -- --port ${PORT}`],
    ] as const;
    for (const [lock, display] of cases) {
      const files: Record<string, string> = { ...app(), [lock]: "" };
      if (lock !== "package-lock.json") delete files["package-lock.json"];
      const { deps, calls } = fakes();
      await runShot(makeProject(files), ctx(), deps);
      expect(calls.displays).toEqual([display]);
    }
  });

  test("on Windows the command runs through cmd.exe", async () => {
    const { deps, calls } = fakes({ platform: "win32" });
    await runShot(makeProject(app()), ctx(), deps);
    expect(calls.started[0]!.command).toEqual(["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", `npm run start -- --port ${PORT}`]);
  });

  test("a start script with flags of its own keeps them, and the port Motif chose comes last", async () => {
    const { deps, calls } = fakes();
    await runShot(makeProject(app({ "package.json": pkg("^21.2.0", { start: "ng serve --configuration development" }) })), ctx(), deps);
    expect(calls.displays).toEqual([`npm run start -- --port ${PORT}`]);
  });

  test("a start script that isn't ng serve: the dev script runs instead, given the port only when it runs ng serve", async () => {
    const other = { start: "node server.js" };
    const ngDev = fakes();
    await runShot(makeProject(app({ "package.json": pkg("^21.2.0", { ...other, dev: "ng serve" }) })), ctx(), ngDev.deps);
    expect(ngDev.calls.displays).toEqual([`npm run dev -- --port ${PORT}`]);
    const viteDev = fakes();
    await runShot(makeProject(app({ "package.json": pkg("^21.2.0", { ...other, dev: "vite" }) })), ctx(), viteDev.deps);
    expect(viteDev.calls.displays).toEqual(["npm run dev"]);
    expect(viteDev.calls.started[0]!.env).toEqual(NO_ANALYTICS);
  });

  test("no script that runs ng serve and no dev script: refused, saying what to add or how to go on", async () => {
    for (const scripts of [{ start: "node server.js" }, { build: "ng build" }] as Record<string, string>[]) {
      const { deps, calls } = fakes();
      const r = await runShot(makeProject(app({ "package.json": pkg("^21.2.0", scripts) })), ctx(), deps);
      expect(r.exitCode).not.toBe(0);
      expect(r.data.error).toBe("cant-start");
      expect(r.text).toContain(
        'This app has no "start" script that runs ng serve, and no "dev" script. Add "start": "ng serve" to the scripts in its package.json, or start it yourself and pass its address with --url.',
      );
      expect(calls.started).toHaveLength(0);
    }
  });

  test("dependencies not installed: the install line, and nothing is started", async () => {
    const files = app();
    delete files["node_modules/.keep"];
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(files), ctx(), deps);
    expect(r.exitCode).not.toBe(0);
    expect(r.text).toContain(`This app's dependencies aren't installed yet. Run "npm install" in its folder, then try again.`);
    expect(calls.started).toHaveLength(0);
  });

  test("a server that won't start is reported with its command; --url draws an app that is already running", async () => {
    const down = fakes({
      startDevServer: async () => {
        throw new Error("The dev server stopped (exit code 1) before it was ready.\nIt said:\n  Port 4321 is already in use.");
      },
    });
    const r = await runShot(makeProject(app()), ctx(), down.deps);
    expect(r.exitCode).not.toBe(0);
    expect(r.text).toContain(`Couldn't start the app with "npm run start -- --port ${PORT}"`);
    const up = fakes();
    const given = await runShot(makeProject(app()), ctx({ url: "http://localhost:4200" }), up.deps);
    expect(given.exitCode).toBe(0);
    expect(up.calls.started).toHaveLength(0);
  });

  test("a page that answers an error or throws is reported for its route, and the others are kept", async () => {
    const { deps } = fakes({
      results: (o) =>
        o.routes.map((route) => ({
          route,
          url: `${o.baseUrl}${route}`,
          status: route === "/about" ? 500 : 200,
          ...(route === "/" ? { pageErrors: ["NG0201: No provider found for `HttpClient`."] } : {}),
          shots: [join(o.outDir, shotName(route))],
        })),
    });
    const r = await runShot(makeProject(app()), ctx(), deps);
    const routes = r.data.routes as { route: string; status: number; pageErrors?: string[] }[];
    expect(routes.map((x) => x.route)).toEqual(["/", "/about"]);
    expect(routes[1]!.status).toBe(500);
    expect(routes[0]!.pageErrors).toEqual(["NG0201: No provider found for `HttpClient`."]);
    expect(r.text).toContain("500");
  });

  test("a variant that looks the same as the default is explained in Angular's words", async () => {
    const { deps } = fakes({
      results: (o) =>
        o.routes.map((route) => ({
          route,
          url: o.baseUrl + route,
          status: 200,
          shots: [undefined, ...(o.variants ?? [])].map((v) => join(o.outDir, shotName(route, v))),
        })),
    });
    const root = makeProject({ ...app(), "design/tokens.json": JSON.stringify(twoVariantTokens()) });
    const r = await runShot(root, ctx({ variant: "men" }), deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("the app may not switch variants the way Motif sets them (motif.css, which follows data-variant on <html>).");
  });

  test("the audit says how to stop a loop in Angular's terms, and keeps the web's words for the rest", async () => {
    const { deps } = fakes();
    const capture = deps.capture;
    deps.capture = async (o) => {
      const done = await capture(o);
      const shot = done.routes[0]!.shots[0]!;
      const at = { route: "/", viewport: "desktop" as const, scheme: "light" as const, shot };
      return {
        ...done,
        issues: [
          { rule: "motion" as const, selector: "main > div", label: "", kind: "element" as const, ...at },
          { rule: "name" as const, selector: "main > button", label: "", kind: "button" as const, ...at },
        ],
      };
    };
    const r = await runShot(makeProject(app()), ctx({ routes: "/", audit: true }), deps);
    expect(r.exitCode).toBe(1);
    const fixes = Object.fromEntries((r.data.findings as { category: string; fix: string }[]).map((f) => [f.category, f.fix]));
    expect(fixes["reduced-motion"]).toBe(
      "Check matchMedia('(prefers-reduced-motion: reduce)') before animating with Motion, and keep CSS animations inside @media (prefers-reduced-motion: no-preference).",
    );
    expect(fixes.accessibility).toBe("Give it a visible label or an accessible name (aria-label, or alt for an image).");
  });
});

describe("the Angular stack's dev script", () => {
  const dir = (scripts: Record<string, string>) => makeProject({ "package.json": JSON.stringify({ scripts }) });
  test("start when it runs ng serve (or ng s, or through npx), else dev, else the refusal", () => {
    expect(ANGULAR.devScript!(dir({ start: "ng serve" }), 5000)).toEqual({ script: "start", args: ["--port", "5000"] });
    expect(ANGULAR.devScript!(dir({ start: "ng s -o" }), 5000)).toEqual({ script: "start", args: ["--port", "5000"] });
    expect(ANGULAR.devScript!(dir({ start: "npx ng serve --ssl" }), 5000)).toEqual({ script: "start", args: ["--port", "5000"] });
    expect(ANGULAR.devScript!(dir({ start: "ng build", dev: "ng serve" }), 5000)).toEqual({ script: "dev", args: ["--port", "5000"] });
    expect(ANGULAR.devScript!(dir({ start: "ng build", dev: "nx serve app" }), 5000)).toEqual({ script: "dev", args: [] });
    expect(ANGULAR.devScript!(dir({ start: "ng build" }), 5000)).toHaveProperty("error");
    expect(ANGULAR.devScript!(makeProject({}), 5000)).toHaveProperty("error");
  });
  test("ng serve is told not to ask about analytics", () => {
    expect(ANGULAR.devEnv!(".")).toEqual(NO_ANALYTICS);
  });
});
