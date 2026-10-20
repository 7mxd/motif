import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRoutes, runShot, type ShotDeps } from "../src/commands/shot";
import { toFindings, type AuditIssue } from "../src/shot/audit";
import type { CaptureOptions, RouteResult } from "../src/shot/capture";
import type { ComparePair } from "../src/shot/compare";
import { devCommand } from "../src/shot/devserver";
import { twoVariantTokens, validTokens } from "./helpers";
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

  test("MOTIF_BROWSER=none is named as the reason, not a missing browser (backlog)", async () => {
    const r = await runShot(makeProject(NEXT_APP), ctx(), fakes({ findBrowser: () => null, browserOff: () => true }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe("MOTIF_BROWSER=none turns the browser off, so Motif can't take screenshots. Unset MOTIF_BROWSER to use Chrome or Edge.");
    expect(r.data.status).toBe("browser_off");
  });

  test("an app it can start, or a running app's address", async () => {
    const none = await runShot(makeProject({}), ctx(), fakes().deps);
    expect(none.exitCode).toBe(2);
    expect(none.text).toContain("--url");
    // A Flutter app is drawn from its code (shot-flutter.test.ts); this one can't be yet: it lacks flutter_test.
    const flutter = await runShot(makeProject({ "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" }), ctx(), { ...fakes().deps, which: () => "/fake/flutter" });
    expect(flutter.exitCode).toBe(2);
    expect(flutter.data.error).toBe("needs-flutter-test");
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
    // Wave B (#11): the note names the pages left out; a web app's order is left as it is.
    expect(calls.captured[0]!.routes[0]).toBe("/p0");
    expect(r.text).toContain("Captured the first 12 of 14 pages. Left out: /p12 and /p13. Choose others with --routes.");
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
    // The default set's name isn't repeated in the label (backlog #37).
    expect(calls.compared[0]).toMatchObject({ labels: ["Before", "Now"], measure: true });
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

  test("a mockup frame of a state this run didn't capture is named, with how to capture it", async () => {
    const root = makeProject({ "design/previews/settings.html": "<p>mockup</p>" });
    writeFileSync(join(root, "design/previews/settings.png"), pngHeader(820, 1728));
    writeFileSync(join(root, "design/previews/settings@saved.png"), pngHeader(820, 1728));
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/settings", against: "design/previews/settings.html" }), fakes().deps);
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain(`The mockup also shows "saved", which this run didn't capture: add --state with its script (design/states/saved.js).`);
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

describe("motif shot: from the backlog", () => {
  const before = () => makeProject({ "design/shots/before/index.mobile.png": "old", "design/shots/before/.motif-set": "" });

  test("--save updates the set with the pages that rendered; a page that didn't keeps its earlier screenshots; a failed comparison keeps the whole set (review of batch B)", async () => {
    const root = makeProject({
      "design/shots/before/index.mobile.png": "old",
      "design/shots/before/settings.mobile.png": "old",
      "design/shots/before/.motif-set": "",
    });
    const half = fakes({
      results: (o) => o.routes.map((route) =>
        route === "/settings"
          ? { route, url: "", status: 500, shots: [join(o.outDir, "settings.mobile.png")] }
          : { route, url: "", status: 200, shots: [join(o.outDir, "index.mobile.png")] }),
    });
    const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/,/settings", save: "before" }), half.deps);
    expect(readFileSync(join(root, "design/shots/before/index.mobile.png"), "utf8")).toBe("png");
    expect(readFileSync(join(root, "design/shots/before/settings.mobile.png"), "utf8")).toBe("old");
    expect(r.data.saved).toBe("design/shots/before");
    expect(r.text).toContain('Pages that didn\'t render kept their earlier screenshots in "before": /settings.');
    const compareFails = fakes({ compare: async () => { throw new Error("the browser closed"); } });
    const r2 = await runShot(root, ctx({ url: "http://localhost:3000", against: "before", save: "before" }), compareFails.deps);
    expect(readFileSync(join(root, "design/shots/before/settings.mobile.png"), "utf8")).toBe("old");
    expect(r2.text).toContain('Kept the earlier "before" set as it was: the comparison with it didn\'t work.');
    expect(r2.exitCode).toBe(1);
    const fresh = makeProject({});
    const first = await runShot(fresh, ctx({ url: "http://localhost:3000", routes: "/,/settings", save: "before" }), half.deps);
    expect(readdirSync(join(fresh, "design/shots/before")).sort()).toEqual([".motif-set", "index.mobile.png"]);
    expect(first.text).toContain('Pages that didn\'t render weren\'t kept in "before": /settings.');
  });

  test("--save with --sizes keeps the set's other sizes (review of batch B)", async () => {
    const root = makeProject({ "design/shots/before/index.mobile.png": "old", "design/shots/before/index.desktop.png": "old", "design/shots/before/.motif-set": "" });
    const { deps } = fakes({ results: (o) => o.routes.map((route) => ({ route, url: "", status: 200, shots: [join(o.outDir, "index.desktop.png")] })) });
    await runShot(root, ctx({ url: "http://localhost:3000", sizes: "desktop", save: "before" }), deps);
    expect(readFileSync(join(root, "design/shots/before/index.mobile.png"), "utf8")).toBe("old");
    expect(readFileSync(join(root, "design/shots/before/index.desktop.png"), "utf8")).toBe("png");
  });

  test("--sizes says which checks or mockup frames the sizes leave out; mobile is a size name (review of batch B)", async () => {
    const audit = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", sizes: "mobile", audit: true }), fakes().deps);
    expect(audit.text).toContain("The reduced-motion check runs at the desktop size, which --sizes left out.");
    const desk = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", sizes: "desktop", audit: true }), fakes().deps);
    expect(desk.text).toContain("The 44 px tap-target check runs on phones and tablets, which --sizes left out.");
  });

  test("a page that never finished loading says so, once (review of batch B)", async () => {
    const { deps } = fakes({ results: (o) => o.routes.map((route) => ({ route, url: "", status: 200, loading: "It hadn't finished loading after 60 s; the screenshots show it as it was.", shots: [join(o.outDir, "index.mobile.png")] })) });
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000" }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("✗ It hadn't finished loading after 60 s; the screenshots show it as it was.");
    expect(r.text).not.toContain("the screenshots show what it looked like");
  });

  test("--json carries cropped pages, the notes, and why a comparison failed", async () => {
    const { deps } = fakes({
      results: (o) => o.routes.map((route) => ({ route, url: "", status: 200, cropped: true, shots: [join(o.outDir, "index.mobile.png")] })),
      compare: async () => { throw new Error("the browser closed"); },
    });
    const r = await runShot(before(), ctx({ url: "http://localhost:3000", against: "before" }), deps);
    expect((r.data.routes as { cropped?: boolean }[])[0]!.cropped).toBe(true);
    expect(r.data.compareError).toBe("the browser closed");
    expect(r.data.notes).toEqual([expect.stringContaining("Couldn't make the side-by-side images: the browser closed")]);
  });

  test("a set with its own name keeps it in the label", async () => {
    const root = makeProject({ "design/shots/v1/index.mobile.png": "old", "design/shots/v1/.motif-set": "" });
    const { deps, calls } = fakes();
    await runShot(root, ctx({ url: "http://localhost:3000", against: "v1" }), deps);
    expect(calls.compared[0]!.labels).toEqual(['Before ("v1")', "Now"]);
  });

  test("--sizes narrows the sizes for a quick run; the default is all five", async () => {
    const { deps, calls } = fakes();
    const r = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", sizes: "390,1440" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.captured[0]!.viewports!.map((v) => v.width)).toEqual([390, 1440]);
    expect(r.text).toContain("(390 and 1440 px wide, light and dark)");
    const named = fakes();
    await runShot(makeProject({}), ctx({ url: "http://localhost:3000", sizes: "phones,tablet" }), named.deps);
    expect(named.calls.captured[0]!.viewports!.map((v) => v.width)).toEqual([360, 390, 430, 768]);
    const all = fakes();
    await runShot(makeProject({}), ctx({ url: "http://localhost:3000" }), all.deps);
    expect(all.calls.captured[0]!.viewports).toBeUndefined();
    const bad = await runShot(makeProject({}), ctx({ url: "http://localhost:3000", sizes: "999" }), fakes().deps);
    expect(bad.exitCode).toBe(2);
    expect(bad.text).toBe('--sizes: "999" isn\'t one of the sizes. Use widths (360, 390, 430, 768, 1440) or names (phones, mobile, tablet, desktop), like --sizes 390,1440.');
  });

  test("a comparison says whether content moved or the page grew", async () => {
    const { deps } = fakes({
      compare: async (o) => [
        { ...o.pairs[0]!, changed: 12.5, taller: 50, from: 100, moved: true },
      ],
    });
    const r = await runShot(before(), ctx({ url: "http://localhost:3000", against: "before" }), deps);
    expect(r.text).toContain("index.mobile.png  12.5% different: 50 px added at 100 px down; what's below moved down unchanged");
    const grown = fakes({ compare: async (o) => [{ ...o.pairs[0]!, changed: 8, taller: 30, from: 600, moved: false }] });
    const r2 = await runShot(before(), ctx({ url: "http://localhost:3000", against: "before" }), grown.deps);
    expect(r2.text).toContain("index.mobile.png  8% different: from 600 px down, 30 px taller");
    expect((r2.data.comparisons as { taller?: number; from?: number; moved?: boolean }[])[0]).toMatchObject({ taller: 30, from: 600, moved: false });
  });
});

describe("motif shot --variant", () => {
  const URL_ = "http://localhost:3000";
  const withVariants = (extra: Record<string, string> = {}) => makeProject({ "design/tokens.json": JSON.stringify(twoVariantTokens()), ...extra });
  const last = (file: string) => file.split(/[\\/]/).pop();
  /** The page's screenshots in the default and in each variant the run asked for. */
  const perVariant = (o: CaptureOptions): RouteResult[] =>
    o.routes.map((route) => ({
      route,
      url: `${o.baseUrl}${route}`,
      status: 200,
      shots: [undefined, ...(o.variants ?? [])].map((v) => join(o.outDir, `${route === "/" ? "index" : route.slice(1)}${v ? `+${v}` : ""}.mobile.png`)),
    }));

  test("one variant: the default is captured too, and the variant's shots carry its name", async () => {
    const f = fakes({ results: perVariant });
    const r = await runShot(withVariants(), ctx({ url: URL_, variant: "men" }), f.deps);
    expect(r.exitCode).toBe(0);
    expect(f.calls.captured[0]!.variants).toEqual(["men"]);
    expect(r.data.shots).toEqual(["design/shots/index.mobile.png", "design/shots/index+men.mobile.png"]);
  });

  test("all: every variant but the default; the default by name: no variant at all", async () => {
    const all = fakes();
    await runShot(withVariants(), ctx({ url: URL_, variant: "all" }), all.deps);
    expect(all.calls.captured[0]!.variants).toEqual(["men"]);
    const dflt = fakes();
    const r = await runShot(withVariants(), ctx({ url: URL_, variant: "women" }), dflt.deps);
    expect(r.exitCode).toBe(0);
    expect(dflt.calls.captured[0]!.variants ?? []).toEqual([]);
  });

  test("an unknown variant lists the ones there are, and starts nothing", async () => {
    const f = fakes();
    const r = await runShot(withVariants(NEXT_APP), ctx({ variant: "nope" }), f.deps);
    expect(r.exitCode).toBe(2);
    expect(r.data).toMatchObject({ error: "no-such-variant", variant: "nope", variants: ["women", "men"] });
    expect(r.text).toContain('This design guide has no variant called "nope". Variants: women (the default), men.');
    expect(f.calls.captured).toEqual([]);
    expect(f.calls.started).toEqual([]);
  });

  test("a guide without variants says so, and so does a project without a guide", async () => {
    for (const files of [{ "design/tokens.json": JSON.stringify(validTokens()) } as Record<string, string>, {}]) {
      const f = fakes();
      const r = await runShot(makeProject({ ...NEXT_APP, ...files }), ctx({ variant: "men" }), f.deps);
      expect(r.exitCode).toBe(2);
      expect(r.data).toMatchObject({ error: "no-such-variant", variants: [] });
      expect(r.text).toContain("This design guide has no variants. Leave out --variant to use its one look.");
      expect(f.calls.captured).toEqual([]);
    }
  });

  test("a variants block motif validate rejects: refused, with or without --variant on an audit", async () => {
    const t = twoVariantTokens();
    t.$extensions["dev.motif"].variants.push({ id: "../../../escaped", label: "X" });
    for (const flags of [{ url: URL_, variant: "all" }, { url: URL_, variant: "men" }, { url: URL_, audit: true }] as Record<string, string | boolean>[]) {
      const f = fakes();
      const r = await runShot(makeProject({ "design/tokens.json": JSON.stringify(t) }), ctx(flags), f.deps);
      expect(r.exitCode).toBe(1);
      expect(r.data).toMatchObject({ error: "invalid-variants" });
      expect(r.text).toBe("Your design guide's variants have problems: fix them first (motif validate shows details).");
      expect(f.calls.captured).toEqual([]);
    }
  });

  test("--audit alone covers every variant; without variants, as before", async () => {
    const f = fakes();
    await runShot(withVariants(), ctx({ url: URL_, audit: true }), f.deps);
    expect(f.calls.captured[0]!.variants).toEqual(["men"]);
    const plain = fakes();
    await runShot(makeProject({ "design/tokens.json": JSON.stringify(validTokens()) }), ctx({ url: URL_, audit: true }), plain.deps);
    expect(plain.calls.captured[0]!.variants).toBeUndefined();
    const none = fakes();
    await runShot(makeProject({}), ctx({ url: URL_, audit: true }), none.deps);
    expect(none.calls.captured[0]!.variants).toBeUndefined();
  });

  test("--audit with --variant covers just that variant (and the default)", async () => {
    const f = fakes();
    await runShot(withVariants(), ctx({ url: URL_, audit: true, variant: "women" }), f.deps);
    expect(f.calls.captured[0]!.variants ?? []).toEqual([]);
  });

  test("a finding in a variant says which; the same problem in both is one finding", () => {
    const issue: AuditIssue = {
      rule: "color-contrast", selector: "p", label: "Hi", kind: "element", ratio: 2, expected: 4.5, fg: "#aaaaaa", bg: "#ffffff",
      route: "/", viewport: "mobile", size: "mobile", scheme: "light", shot: "a.png",
    };
    const found = toFindings([issue, { ...issue, variant: "men", shot: "b.png" }]);
    expect(found).toHaveLength(1);
    expect(found[0]!.location).not.toHaveProperty("variant");
    expect(found[0]!.locations).toEqual([expect.objectContaining({ screen: "/", variant: "men" })]);
    const onlyMen = toFindings([{ ...issue, variant: "men" }]);
    expect(onlyMen[0]!.location).toMatchObject({ variant: "men" });
    expect(onlyMen[0]!.summary).toContain("in the men variant");
    // A problem that isn't about colour is one place whichever variant it was seen in.
    const tap: AuditIssue = { ...issue, rule: "target-size", ratio: undefined, width: 10, height: 10 };
    expect(toFindings([tap, { ...tap, variant: "men" }])[0]!.locations).toBeUndefined();
  });

  test("--against a mockup: each variant with its own mockup PNGs, else the default's, said plainly", async () => {
    const root = withVariants({ "design/previews/settings.html": "<p>mockup</p>" });
    for (const f of ["settings.png", "settings.dark.png", "settings+men.png"]) writeFileSync(join(root, "design/previews", f), pngHeader(820, 1728));
    const f = fakes({
      results: (o) => [{ route: "/settings", url: URL_, status: 200, shots: ["settings", "settings+men"].flatMap((n) => ["", ".dark"].map((d) => join(o.outDir, `${n}.mobile${d}.png`))) }],
    });
    const r = await runShot(root, ctx({ url: URL_, routes: "/settings", variant: "men", against: "design/previews/settings.html" }), f.deps);
    expect(r.exitCode).toBe(0);
    const pairs = f.calls.compared[0]!.pairs.map((p) => [last(p.before), last(p.after)]);
    expect(pairs).toEqual([
      ["settings+men.png", "settings+men.mobile.png"],
      ["settings.dark.png", "settings.mobile.dark.png"],
      ["settings.dark.png", "settings+men.mobile.dark.png"],
      ["settings.png", "settings.mobile.png"],
    ]);
    expect(r.text).toContain("were compared with the mockup's default PNGs, because the mockup has none in that variant");
  });

  test("--against a saved set: a variant the set lacks is compared with the set's default, and says so", async () => {
    const root = withVariants({ "design/shots/before/index.mobile.png": "old", "design/shots/before/.motif-set": "" });
    const f = fakes({ results: perVariant });
    const r = await runShot(root, ctx({ url: URL_, variant: "men", against: "before" }), f.deps);
    expect(f.calls.compared[0]!.pairs.map((p) => [last(p.before), last(p.after)])).toEqual([
      ["index.mobile.png", "index.mobile.png"],
      ["index.mobile.png", "index+men.mobile.png"],
    ]);
    expect(r.text).toContain('The "before" set has no screenshots in the men variant, so those were compared with its default ones.');
  });

  const SAME = "The men variant looks exactly like the default on every screen: the app may not switch variants the way Motif sets them (data-variant on <html>).";

  test("a variant whose screenshots are byte-identical to the default's says the app may not switch the way Motif sets it (backlog)", async () => {
    const same = await runShot(withVariants(), ctx({ url: URL_, variant: "men" }), fakes({ results: perVariant }).deps);
    expect(same.exitCode).toBe(0);
    expect(same.data.notes).toEqual([SAME]);
    expect(same.text).toContain(`• ${SAME}`);
    // The variant's own colours: different bytes, nothing to say.
    const differ = fakes({
      capture: async (o) => {
        const routes = perVariant(o);
        for (const shot of routes.flatMap((r) => r.shots)) {
          mkdirSync(dirname(shot), { recursive: true });
          writeFileSync(shot, shot.includes("+men") ? "men" : "png");
        }
        return { routes, issues: [] };
      },
    });
    const r = await runShot(withVariants(), ctx({ url: URL_, variant: "men" }), differ.deps);
    expect(r.text).not.toContain("looks exactly like the default");
    expect(r.data.notes).toBeUndefined();
  });
});

describe("motif shot --rtl", () => {
  const URL_ = "http://localhost:3000";
  /** The page left to right and, with --rtl, right to left too. */
  const bothWays = (o: CaptureOptions): RouteResult[] =>
    o.routes.map((route) => ({
      route,
      url: `${o.baseUrl}${route}`,
      status: 200,
      shots: ["", ...(o.rtl ? [".rtl"] : [])].map((d) => join(o.outDir, `${route === "/" ? "index" : route.slice(1)}.mobile${d}.png`)),
    }));

  test("captures right to left in Arabic by default, or in the language given", async () => {
    const ar = fakes({ results: bothWays });
    const r = await runShot(makeProject({}), ctx({ url: URL_, rtl: true }), ar.deps);
    expect(r.exitCode).toBe(0);
    expect(ar.calls.captured[0]!.rtl).toBe("ar");
    expect(r.data.shots).toEqual(["design/shots/index.mobile.png", "design/shots/index.mobile.rtl.png"]);
    expect(r.text).toContain("light and dark, right to left in ar)");
    const he = fakes();
    await runShot(makeProject({}), ctx({ url: URL_, rtl: "HE" }), he.deps);
    expect(he.calls.captured[0]!.rtl).toBe("he");
    // Without --rtl, nothing changes.
    const plain = fakes();
    const p = await runShot(makeProject({}), ctx({ url: URL_ }), plain.deps);
    expect(plain.calls.captured[0]).not.toHaveProperty("rtl");
    expect(p.text).not.toContain("right to left");
  });

  test("a value that isn't a language code is a usage error that says what to give", async () => {
    for (const value of ["12", "", "arabic", "a"]) {
      const f = fakes();
      const r = await runShot(makeProject({}), ctx({ url: URL_, rtl: value }), f.deps);
      expect(r.exitCode).toBe(2);
      expect(r.data.error).toBe("usage");
      expect(r.text).toBe("--rtl takes a language code of two or three letters, like --rtl ar or --rtl he (Arabic when none is given).");
      expect(f.calls.captured).toEqual([]);
    }
  });

  test("a page that doesn't turn right to left by itself is turned by Motif, and says so", async () => {
    const f = fakes({ results: (o) => bothWays(o).map((r) => ({ ...r, rtlForced: true })) });
    const r = await runShot(makeProject({}), ctx({ url: URL_, routes: "/,/settings", rtl: "he" }), f.deps);
    expect(r.data.notes).toEqual([
      `/ doesn't switch to right to left by itself for he; Motif set dir="rtl" to show it.`,
      `/settings doesn't switch to right to left by itself for he; Motif set dir="rtl" to show it.`,
    ]);
  });

  test("RTL shots pair by name with a saved set, and are never put next to a mockup", async () => {
    const root = makeProject({ "design/shots/before/index.mobile.rtl.png": "old", "design/shots/before/.motif-set": "", "design/previews/settings.html": "<p>mockup</p>" });
    const set = fakes({ results: bothWays });
    await runShot(root, ctx({ url: URL_, rtl: true, against: "before" }), set.deps);
    expect(set.calls.compared[0]!.pairs.map((p) => [p.before, p.after])).toEqual([
      [join(root, "design/shots/before/index.mobile.rtl.png"), join(root, "design/shots/index.mobile.rtl.png")],
    ]);
    writeFileSync(join(root, "design/previews/settings.png"), pngHeader(820, 1728));
    const mock = fakes({ results: bothWays });
    const r = await runShot(root, ctx({ url: URL_, routes: "/settings", rtl: true, against: "design/previews/settings.html" }), mock.deps);
    expect(r.exitCode).toBe(0);
    expect(mock.calls.compared[0]!.pairs.map((p) => p.after)).toEqual([join(root, "design/shots/settings.mobile.png")]);
    expect(r.text).toContain("• RTL screenshots aren't compared with the mockup, which is left to right.");
  });

  test("an audit finding seen only right to left says where", async () => {
    const root = makeProject({});
    const issues: AuditIssue[] = [
      { rule: "name", selector: "#menu", label: "", kind: "button", route: "/", viewport: "mobile", size: "mobile", scheme: "light", rtl: true, shot: join(root, "design/shots/index.mobile.rtl.png") },
    ];
    const r = await runShot(root, ctx({ url: URL_, audit: true, rtl: true }), fakes({ results: bothWays, issues }).deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("major    / (mobile, right to left) The button has no name a screen reader can say.");
    expect((r.data.findings as { category: string; location: { rtl?: boolean } }[])[0]).toMatchObject({ category: "accessibility", location: { rtl: true } });
  });
});
