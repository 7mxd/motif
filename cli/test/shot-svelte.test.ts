import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import { devCommand, type DevCommand } from "../src/shot/devserver";
import { twoVariantTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const CHROME = { name: "Chrome" as const, path: "/fake/chrome" };
const PAGE = "<h1>Hi</h1>\n";
const pkg = (deps: Record<string, string>, scripts: Record<string, string> = { dev: "vite dev" }) => JSON.stringify({ scripts, devDependencies: deps });
const KIT_APP: Record<string, string> = {
  "package.json": pkg({ svelte: "^5.57.2", "@sveltejs/kit": "^2.70.3", vite: "^8.3.5" }),
  "package-lock.json": "{}",
  "node_modules/.keep": "",
  "src/routes/+page.svelte": PAGE,
  "src/routes/about/+page.svelte": PAGE,
  "src/routes/blog/[slug]/+page.svelte": PAGE,
};
const VITE_APP: Record<string, string> = {
  "package.json": pkg({ svelte: "^5.57.2", vite: "^8.3.5" }),
  "package-lock.json": "{}",
  "node_modules/.keep": "",
  "src/main.ts": "",
  "src/App.svelte": PAGE,
};
const SPA_APP: Record<string, string> = {
  ...VITE_APP,
  "src/App.svelte": `<script>
  import Router from 'svelte-spa-router'
  const routes = { '/': Home, '/about': About }
</script>
<Router {routes} />
`,
};
const SVELTE4_APP: Record<string, string> = {
  "package.json": pkg({ svelte: "^4.2.19", "@sveltejs/kit": "^2.5.0", vite: "^5.4.0" }),
  "package-lock.json": "{}",
  "node_modules/.keep": "",
  "src/routes/+page.svelte": PAGE,
  "src/routes/about/+page.svelte": PAGE,
};

const WHICH = (cmd: string) => `/usr/bin/${cmd}`;
const shotName = (route: string, variant?: string) => `${route === "/" ? "index" : route.slice(1)}${variant ? `+${variant}` : ""}.mobile.png`;

function fakes(over: Partial<ShotDeps> & { results?: (o: CaptureOptions) => RouteResult[] } = {}) {
  const calls = { started: [] as { cwd: string; command: string[]; timeoutMs?: number; env?: Record<string, string>; buildingStatus?: number }[], stopped: 0, captured: [] as CaptureOptions[] };
  const { results, ...rest } = over;
  const deps: ShotDeps = {
    findBrowser: () => CHROME,
    devCommand: (dir) => devCommand(dir, { platform: "linux", which: WHICH }),
    startDevServer: async (o) => {
      calls.started.push({ cwd: o.cwd, command: o.command, timeoutMs: o.timeoutMs, env: o.env, buildingStatus: o.buildingStatus });
      return { url: "http://localhost:5173", pid: 1, stop: async () => void calls.stopped++ };
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
    today: () => "2026-10-24",
    ...rest,
  };
  return { deps, calls };
}
const ctx = (flags: Record<string, string | boolean> = {}) => ({ positionals: [], flags });

describe("motif shot: a Svelte app", () => {
  test("a SvelteKit app starts through its dev script with the web's usual start limit, and its pages are drawn at the web's sizes", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(KIT_APP), ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toHaveLength(1);
    expect(calls.started[0]!.command).toEqual(["/usr/bin/npm", "run", "dev"]);
    expect(calls.started[0]!.timeoutMs).toBeUndefined();
    expect(calls.started[0]!.env).toBeUndefined();
    expect(calls.started[0]!.buildingStatus).toBeUndefined();
    expect(calls.captured[0]!.routes).toEqual(["/", "/about"]);
    expect(r.text).toContain("/blog/[slug]");
    // No sizes passed: the capture's own web sizes, the desktop included.
    expect(calls.captured[0]!.viewports).toBeUndefined();
    expect(calls.stopped).toBe(1);
  });

  test("a Vite app (npm create vite) takes the same path, with its / page", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(VITE_APP), ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started[0]!.command).toEqual(["/usr/bin/npm", "run", "dev"]);
    expect(calls.captured[0]!.routes).toEqual(["/"]);
  });

  test("a hash route (svelte-spa-router) reaches the capture unchanged", async () => {
    const { deps, calls } = fakes();
    await runShot(makeProject(SPA_APP), ctx(), deps);
    expect(calls.captured[0]!.routes).toEqual(["/", "/#/about"]);
  });

  test("--routes replaces the discovered ones", async () => {
    const { deps, calls } = fakes();
    await runShot(makeProject(KIT_APP), ctx({ routes: "/about" }), deps);
    expect(calls.captured[0]!.routes).toEqual(["/about"]);
  });

  test("the command follows the lockfile's package manager", async () => {
    for (const [lock, display] of [["pnpm-lock.yaml", "pnpm run dev"], ["yarn.lock", "yarn run dev"], ["bun.lock", "bun run dev"], ["package-lock.json", "npm run dev"]] as const) {
      const files: Record<string, string> = { ...KIT_APP, [lock]: "" };
      if (lock !== "package-lock.json") delete files["package-lock.json"];
      const seen: DevCommand[] = [];
      const { deps } = fakes({
        devCommand: (dir) => {
          const how = devCommand(dir, { platform: "linux", which: WHICH }) as DevCommand;
          seen.push(how);
          return how;
        },
      });
      await runShot(makeProject(files), ctx(), deps);
      expect(seen[0]!.display).toBe(display);
    }
  });

  test("on Windows the command runs through cmd.exe", async () => {
    const { deps, calls } = fakes({ devCommand: (dir) => devCommand(dir, { platform: "win32", which: WHICH, vars: {} }) });
    await runShot(makeProject(KIT_APP), ctx(), deps);
    expect(calls.started[0]!.command).toEqual(["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", "npm run dev"]);
  });

  test("a Svelte 4 app takes the same path", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(SVELTE4_APP), ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toHaveLength(1);
    expect(calls.captured[0]!.routes).toEqual(["/", "/about"]);
  });

  test("dependencies not installed: the install line, and nothing is started", async () => {
    const files: Record<string, string> = { ...KIT_APP };
    delete files["node_modules/.keep"];
    const { deps, calls } = fakes();
    const r = await runShot(makeProject(files), ctx(), deps);
    expect(r.exitCode).not.toBe(0);
    expect(r.text).toContain(`This app's dependencies aren't installed yet. Run "npm install" in its folder, then try again.`);
    expect(calls.started).toHaveLength(0);
  });

  test("an app with no dev script is refused, with the --url way out", async () => {
    const files = { ...KIT_APP, "package.json": pkg({ svelte: "^5.57.2", "@sveltejs/kit": "^2.70.3" }, { build: "vite build" }) };
    const r = await runShot(makeProject(files), ctx(), fakes().deps);
    expect(r.exitCode).not.toBe(0);
    expect(r.text).toContain('no "dev" script');
    expect(r.text).toContain("--url");
  });

  test("a server that won't start is reported with its command; --url draws an app that is already running", async () => {
    const down = fakes({
      startDevServer: async () => {
        throw new Error("The dev server didn't say where it's running within 120 s.");
      },
    });
    const r = await runShot(makeProject(KIT_APP), ctx(), down.deps);
    expect(r.exitCode).not.toBe(0);
    expect(r.text).toContain(`Couldn't start the app with "npm run dev"`);
    const up = fakes();
    const given = await runShot(makeProject(KIT_APP), ctx({ url: "http://localhost:5173" }), up.deps);
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
          ...(route === "/" ? { pageErrors: ["TypeError: items is undefined"] } : {}),
          shots: [join(o.outDir, shotName(route))],
        })),
    });
    const r = await runShot(makeProject(KIT_APP), ctx(), deps);
    const routes = r.data.routes as { route: string; status: number; pageErrors?: string[] }[];
    expect(routes.map((x) => x.route)).toEqual(["/", "/about"]);
    expect(routes[1]!.status).toBe(500);
    expect(routes[0]!.pageErrors).toEqual(["TypeError: items is undefined"]);
    expect(r.text).toContain("/about");
    expect(r.text).toContain("500");
  });

  test("a variant that looks the same as the default is explained in Svelte's words", async () => {
    const { deps } = fakes({
      results: (o) =>
        o.routes.map((route) => ({
          route,
          url: o.baseUrl + route,
          status: 200,
          shots: [undefined, ...(o.variants ?? [])].map((v) => join(o.outDir, shotName(route, v))),
        })),
    });
    const root = makeProject({ ...KIT_APP, "design/tokens.json": JSON.stringify(twoVariantTokens()) });
    const r = await runShot(root, ctx({ variant: "men" }), deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("the app may not switch variants the way Motif sets them (motif.css, which follows data-variant on <html>).");
  });

  test("the audit says how to stop a loop in Svelte's terms, and keeps the web's words for the rest", async () => {
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
    const r = await runShot(makeProject(KIT_APP), ctx({ routes: "/", audit: true }), deps);
    expect(r.exitCode).toBe(1);
    const fixes = Object.fromEntries((r.data.findings as { category: string; fix: string }[]).map((f) => [f.category, f.fix]));
    expect(fixes["reduced-motion"]).toBe(
      "Check prefersReducedMotion.current from svelte/motion before animating, and keep CSS animations inside @media (prefers-reduced-motion: no-preference).",
    );
    expect(fixes.accessibility).toBe("Give it a visible label or an accessible name (aria-label, or alt for an image).");
  });
});
