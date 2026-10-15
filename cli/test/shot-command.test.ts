import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRoutes, runShot, type ShotDeps } from "../src/commands/shot";
import type { AuditIssue } from "../src/shot/audit";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import type { ComparePair } from "../src/shot/compare";
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

/** Stand-ins for the browser, the dev server, the capture and the side-by-side renderer. */
function fakes(over: Partial<ShotDeps> & { results?: (o: CaptureOptions) => RouteResult[]; issues?: AuditIssue[] } = {}) {
  const calls = {
    started: [] as { cwd: string; command: string[] }[],
    stopped: 0,
    captured: [] as CaptureOptions[],
    compared: [] as { pairs: ComparePair[]; labels: [string, string]; measure: boolean }[],
  };
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
    serveStatic: () => ({ url: "http://127.0.0.1:1", stop: () => {} }),
    capture: async (o) => {
      calls.captured.push(o);
      const routes =
        results?.(o) ??
        o.routes.map((route) => ({ route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, `${route === "/" ? "index" : route.slice(1)}.mobile.png`)] }));
      for (const shot of routes.flatMap((r) => r.shots)) {
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
      }
      return { routes, issues: issues ?? [] };
    },
    compare: async (o) => {
      calls.compared.push({ pairs: o.pairs, labels: o.labels, measure: o.measure });
      return o.pairs.map((p) => (o.measure ? { ...p, changed: 12.5 } : { ...p }));
    },
    today: () => "2026-10-13",
    ...depOverrides,
  };
  return { deps, calls };
}
const ctx = (flags: Record<string, string | boolean> = {}) => ({ positionals: [], flags });

/** Just enough of a PNG for pngSize. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

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

describe("motif shot: pages that crash, redirect, or couldn't be audited", () => {
  test("a page that throws an error didn't render, even with HTTP 200", async () => {
    const { deps } = fakes({
      results: (o) => [{ route: "/", url: o.baseUrl, status: 200, pageErrors: ["TypeError: items is undefined"], shots: [join(o.outDir, "index.mobile.png")] }],
    });
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000" }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("the page threw an error: TypeError: items is undefined");
    expect((r.data.routes as { pageErrors?: string[] }[])[0]!.pageErrors).toEqual(["TypeError: items is undefined"]);
  });

  test("pages that redirect are audited as the page they land on, once", async () => {
    const root = makeProject({});
    const shot = (name: string) => join(root, "design/shots", name);
    const forgot = (route: string, file: string): AuditIssue => ({
      rule: "color-contrast", selector: "#forgot", label: "Forgot your password?", kind: "link", ratio: 2.5, expected: 4.5,
      route, viewport: "mobile", scheme: "light", shot: shot(file),
    });
    const { deps } = fakes({
      results: (o) => [
        { route: "/dashboard", url: `${o.baseUrl}/dashboard`, status: 200, finalUrl: "http://localhost:3000/login", shots: [shot("dashboard.mobile.png")] },
        { route: "/settings", url: `${o.baseUrl}/settings`, status: 200, finalUrl: "http://localhost:3000/login?next=%2Fsettings", shots: [shot("settings.mobile.png")] },
      ],
      issues: [forgot("/dashboard", "dashboard.mobile.png"), forgot("/settings", "settings.mobile.png")],
    });
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/dashboard,/settings", audit: true }), deps);
    expect((r.data.findings as { location: { screen: string } }[]).map((f) => f.location.screen)).toEqual(["/login"]);
    expect(r.text).toContain("/dashboard → /login");
  });

  test("an audit that couldn't finish isn't reported as clean", async () => {
    const { deps } = fakes({
      results: (o) => [
        { route: "/", url: o.baseUrl, status: 200, auditError: "The browser didn't answer (Runtime.evaluate) within 30 s.", shots: [join(o.outDir, "index.mobile.png")] },
      ],
    });
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", audit: true }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("Audit incomplete");
    expect(r.text).not.toContain("✓ Audit");
    expect((r.data.routes as { auditError?: string }[])[0]!.auditError).toContain("didn't answer");
  });
});

describe("motif shot: never destroys or misreads what it's given", () => {
  test("--save never replaces a folder that isn't a saved set", async () => {
    const root = makeProject({ "src/App.tsx": "export const App = () => null;\n" });
    const r = await runShot(root, ctx({ url: "http://localhost:3000", out: ".", save: "src" }), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("isn't a set of screenshots");
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("App");
  });

  test("a file path given as a page is explained", async () => {
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", routes: "D:/projects/app/settings" }), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("MSYS_NO_PATHCONV=1");
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
  test("undoes Git Bash's rewriting of addresses that start with /", () => {
    const gitBash = { EXEPATH: "C:\\Program Files\\Git\\bin" };
    expect(parseRoutes("C:/Program Files/Git/,/settings", gitBash)).toEqual(["/", "/settings"]);
    expect(parseRoutes("C:/Program Files/Git/settings/profile", gitBash)).toEqual(["/settings/profile"]);
  });
});

describe("motif shot: the mockup while building, before and after a rebuild", () => {
  test("--save keeps this run's screenshots as a named set", async () => {
    const root = makeProject({});
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/,/settings", save: "before" }), fakes().deps);
    expect(r.exitCode).toBe(0);
    expect(readdirSync(join(root, "design/shots/before")).sort()).toEqual([".motif-set", "index.mobile.png", "settings.mobile.png"]);
    expect(r.data.saved).toBe("design/shots/before");
    expect(r.text).toContain("--against before");
    expect((await runShot(root, ctx({ url: "http://localhost:3000", save: "../x" }), fakes().deps)).exitCode).toBe(2);
  });

  test("--against a saved set compares page by page, then --save can replace the set", async () => {
    const root = makeProject({ "design/shots/before/index.mobile.png": "old", "design/shots/before/.motif-set": "" });
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/,/settings", against: "before", save: "before" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.compared[0]).toMatchObject({ labels: ['Before ("before")', "Now"], measure: true });
    expect(calls.compared[0]!.pairs).toEqual([
      { before: join(root, "design/shots/before/index.mobile.png"), after: join(root, "design/shots/index.mobile.png"), out: join(root, "design/shots/compare/before/index.mobile.png") },
    ]);
    expect(r.data.comparisons).toEqual([
      { before: "design/shots/before/index.mobile.png", after: "design/shots/index.mobile.png", image: "design/shots/compare/before/index.mobile.png", changed: 12.5 },
    ]);
    expect(r.data.added).toEqual(["design/shots/settings.mobile.png"]);
    expect(r.text).toContain("1 changed");
    expect(r.text).toContain("12.5% different");
    expect(readFileSync(join(root, "design/shots/before/index.mobile.png"), "utf8")).toBe("png");
  });

  test("--against a mockup puts the page next to it", async () => {
    const root = makeProject({ "design/previews/settings.html": "<p>mockup</p>" });
    writeFileSync(join(root, "design/previews/settings.png"), pngHeader(820, 1728));
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/settings", against: "design/previews/settings.html" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.compared[0]).toMatchObject({ labels: ["Mockup", "The app now"], measure: false });
    expect(calls.compared[0]!.pairs.map((p) => p.after)).toEqual([join(root, "design/shots/settings.mobile.png")]);
    expect(r.text).toContain("Side by side with the mockup design/previews/settings.html");
  });

  test("--against is checked before anything starts", async () => {
    const root = makeProject({ ...NEXT_APP, "design/previews/home.html": "<p>mockup</p>" });
    const cases: [string, string, string][] = [
      ["nothing-here", "/", "Nothing to compare with"],
      ["design/previews/home.html", "/", "motif preview design/previews/home.html --png-only"],
    ];
    for (const [against, routes, message] of cases) {
      const { deps, calls } = fakes();
      const r = await runShot(root, ctx({ against, routes }), deps);
      expect(r.exitCode).toBe(2);
      expect(r.text).toContain(message);
      expect(calls.started).toEqual([]);
    }
    writeFileSync(join(root, "design/previews/home.png"), pngHeader(820, 1728));
    const two = await runShot(root, ctx({ against: "design/previews/home.png", routes: "/,/settings" }), fakes().deps);
    expect(two.exitCode).toBe(2);
    expect(two.text).toContain("one page");
  });
});

describe("motif shot --against a mockup in a subfolder", () => {
  test("finds the PNGs motif preview wrote to design/previews", async () => {
    const root = makeProject({ "design/previews/onboarding/welcome.html": "<p>mockup</p>" });
    writeFileSync(join(root, "design/previews/welcome.png"), pngHeader(820, 1728));
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/welcome", against: "design/previews/onboarding/welcome.html" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.compared[0]!.pairs.map((p) => p.before)).toEqual([join(root, "design/previews/welcome.png")]);
  });
});
