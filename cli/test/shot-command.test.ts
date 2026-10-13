import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoutes, runShot, type ShotDeps } from "../src/commands/shot";
import type { AuditIssue } from "../src/shot/audit";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import { devCommand } from "../src/shot/devserver";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const CHROME = { name: "Chrome" as const, path: "/fake/chrome" };
const NEXT_PKG = JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "^15", react: "^19", "react-dom": "^19" } });
const NEXT_APP = {
  "package.json": NEXT_PKG,
  "package-lock.json": "{}",
  "node_modules/.keep": "",
  "app/page.tsx": "",
  "app/settings/page.tsx": "",
  "app/posts/[id]/page.tsx": "",
};

/** Stand-ins for the browser, the dev server and the capture. */
function fakes(over: Partial<ShotDeps> & { results?: (o: CaptureOptions) => RouteResult[]; issues?: AuditIssue[] } = {}) {
  const calls = { started: [] as { cwd: string; command: string[] }[], stopped: 0, captured: [] as CaptureOptions[] };
  const { results, issues, ...depOverrides } = over;
  const deps: ShotDeps = {
    findBrowser: () => CHROME,
    devCommand: () => ({ command: ["npm", "run", "dev"], display: "npm run dev", packageManager: "npm" }),
    startDevServer: async (o) => {
      calls.started.push({ cwd: o.cwd, command: o.command });
      return {
        url: "http://localhost:3000",
        pid: 1,
        stop: async () => {
          calls.stopped++;
        },
      };
    },
    capture: async (o) => {
      calls.captured.push(o);
      const routes =
        results?.(o) ??
        o.routes.map((route) => ({ route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, `${route === "/" ? "index" : route.slice(1)}.mobile.png`)] }));
      return { routes, issues: issues ?? [] };
    },
    today: () => "2026-10-13",
    ...depOverrides,
  };
  return { deps, calls };
}
const ctx = (flags: Record<string, string | boolean> = {}) => ({ positionals: [], flags });

describe("motif shot: what it needs", () => {
  test("a browser", async () => {
    const r = await runShot(makeProject(NEXT_APP), ctx(), fakes({ findBrowser: () => null }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.status).toBe("needs_browser");
    expect(r.text).toContain("motif browser install");
  });

  test("an app it can start, or a running app's address", async () => {
    const none = await runShot(makeProject({}), ctx(), fakes().deps);
    expect(none.exitCode).toBe(2);
    expect(none.text).toContain("--url");
    const flutter = await runShot(makeProject({ "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" }), ctx(), fakes().deps);
    expect(flutter.exitCode).toBe(2);
    expect(flutter.text).toContain("Flutter");
    const two = await runShot(makeProject({ "web/package.json": NEXT_PKG, "admin/package.json": NEXT_PKG }), ctx(), fakes().deps);
    expect(two.exitCode).toBe(2);
    expect(two.text).toContain("--app");
    expect((await runShot(makeProject(NEXT_APP), ctx({ url: "localhost:3000" }), fakes().deps)).exitCode).toBe(2);
  });

  test("explains why the app can't be started", async () => {
    const root = makeProject({ ...NEXT_APP, "package.json": JSON.stringify({ dependencies: { next: "^15", react: "^19" } }) });
    const r = await runShot(root, ctx(), { ...fakes().deps, devCommand });
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain('no "dev" script');
  });

  test("a dev server that fails to start", async () => {
    const { deps } = fakes({
      startDevServer: async () => {
        throw new Error("The dev server stopped (exit code 1) before it was ready.");
      },
    });
    const r = await runShot(makeProject(NEXT_APP), ctx(), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain('Couldn\'t start the app with "npm run dev"');
  });
});

describe("motif shot", () => {
  test("starts the app, captures its pages, stops it, and keeps screenshots out of git", async () => {
    const root = makeProject(NEXT_APP);
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx(), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toEqual([{ cwd: root, command: ["npm", "run", "dev"] }]);
    expect(calls.stopped).toBe(1);
    expect(calls.captured[0]).toMatchObject({
      browserPath: "/fake/chrome",
      baseUrl: "http://localhost:3000",
      routes: ["/", "/settings"],
      outDir: join(root, "design", "shots"),
      audit: false,
    });
    expect(readFileSync(join(root, "design/shots/.gitignore"), "utf8")).toContain("*");
    expect(r.data.shots).toEqual(["design/shots/index.mobile.png", "design/shots/settings.mobile.png"]);
    expect(r.data.skipped).toEqual(["/posts/[id]"]);
    expect(r.text).toContain("/posts/[id]");
  });

  test("--url uses a running app; --routes picks the pages; --out skips the .gitignore", async () => {
    const root = makeProject({});
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx({ url: "http://localhost:5173", routes: "/, settings ,/about", out: "shots" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.started).toEqual([]);
    expect(calls.captured[0]).toMatchObject({ baseUrl: "http://localhost:5173", routes: ["/", "/settings", "/about"], outDir: join(root, "shots") });
    expect(existsSync(join(root, "shots/.gitignore"))).toBe(false);
  });

  test("at most 12 pages per run, and a note says so", async () => {
    const many = Array.from({ length: 14 }, (_, i) => `/p${i}`).join(",");
    const { deps, calls } = fakes();
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", routes: many }), deps);
    expect(calls.captured[0]!.routes).toHaveLength(12);
    expect(r.text).toContain("first 12 of 14");
  });

  test("pages that didn't render make it exit 1, each with its reason", async () => {
    const { deps } = fakes({
      results: (o) => [
        { route: "/", url: o.baseUrl, status: 500, shots: [join(o.outDir, "index.mobile.png")] },
        { route: "/gone", url: o.baseUrl, status: 0, error: "Couldn't reach it: connection refused", shots: [] },
      ],
    });
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", routes: "/,/gone" }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("HTTP 500");
    expect(r.text).toContain("Couldn't reach it");
  });

  test("--audit writes the review file and lists the findings, worst first", async () => {
    const root = makeProject({});
    const issues: AuditIssue[] = [
      { rule: "target-mobile", selector: "#go", label: "Go", kind: "button", width: 32, height: 32, route: "/", viewport: "mobile", scheme: "light", shot: join(root, "design/shots/index.mobile.png") },
      { rule: "color-contrast", selector: "#faint", label: "Faint", kind: "element", ratio: 2.5, expected: 4.5, route: "/", viewport: "mobile", scheme: "dark", shot: join(root, "design/shots/index.mobile.dark.png") },
    ];
    const r = await runShot(root, ctx({ url: "http://localhost:3000", audit: true }), fakes({ issues }).deps);
    expect(r.exitCode).toBe(1);
    const review = JSON.parse(readFileSync(join(root, "design/shots/audit.json"), "utf8"));
    expect(review).toMatchObject({ motifReview: 1, scope: "screens: /", date: "2026-10-13" });
    expect(review.findings.map((f: { id: string; severity: string; category: string; shot: string }) => [f.id, f.severity, f.category, f.shot])).toEqual([
      ["F-001", "critical", "contrast", "design/shots/index.mobile.dark.png"],
      ["F-002", "minor", "target-size", "design/shots/index.mobile.png"],
    ]);
    expect(r.text).toContain("1 critical, 1 minor");
    expect(r.data.audit).toBe("design/shots/audit.json");
  });

  test("a clean audit exits 0", async () => {
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", audit: true }), fakes().deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("no contrast, tap-target or reduced-motion problems");
  });

  test("the dev server is stopped even when capturing fails", async () => {
    const { deps, calls } = fakes({
      capture: async () => {
        throw new Error("The browser at /fake/chrome didn't start within 20 s.");
      },
    });
    const r = await runShot(makeProject(NEXT_APP), ctx(), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("/fake/chrome");
    expect(calls.stopped).toBe(1);
  });
});

describe("parseRoutes", () => {
  test("adds the leading slash and drops repeats and blanks", () => {
    expect(parseRoutes("/, settings ,/about,,/settings")).toEqual(["/", "/settings", "/about"]);
  });
});
