import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readStates, runShot, type ShotDeps } from "../src/commands/shot";
import { toFindings, type AuditIssue } from "../src/shot/audit";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, stateExpression, type CaptureOptions } from "../src/shot/capture";
import { startStaticServer } from "../src/shot/static-server";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

describe("state scripts", () => {
  test("are read from files, repeated or as a comma list, and named by their file", () => {
    const root = makeProject({ "design/states/editor.js": "open();", "design/states/Result.js": "save();" });
    expect(readStates(root, ["design/states/editor.js", "design/states/Result.js"])).toEqual([
      { name: "editor", script: "open();" },
      { name: "result", script: "save();" },
    ]);
    expect(readStates(root, "design/states/editor.js,design/states/Result.js")).toHaveLength(2);
    expect(readStates(root, undefined)).toEqual([]);
  });

  test("a missing file, a name that can't name a screenshot, or two with one name are refused, plainly", () => {
    const root = makeProject({ "a/editor.js": "", "b/editor.js": "", "design/states/my state.js": "" });
    expect(readStates(root, ["design/states/nope.js"])).toEqual({ error: expect.stringContaining("doesn't exist") });
    expect(readStates(root, ["design/states/my state.js"])).toEqual({ error: expect.stringContaining("letters, digits and dashes") });
    expect(readStates(root, ["a/editor.js", "b/editor.js"])).toEqual({ error: expect.stringContaining('"editor"') });
  });

  test("run in the page as an async function, stopped after 15 seconds by default", () => {
    const e = stateExpression("document.querySelector('#open').click();");
    expect(e).toContain("document.querySelector('#open').click();");
    expect(e).toContain("15000");
    expect(e).toContain("async");
    expect(stateExpression("x", 50)).toContain("50");
  });

  test("motif shot passes them to the capture, and refuses a bad one before starting anything", async () => {
    const root = makeProject({ "public/index.html": "", "design/states/editor.js": "open();" });
    const captured: CaptureOptions[] = [];
    const deps: ShotDeps = {
      findBrowser: () => ({ name: "Chrome", path: "/fake/chrome" }),
      devCommand: () => ({ error: "unused" }),
      startDevServer: async () => {
        throw new Error("unused");
      },
      serveStatic: () => ({ url: "http://127.0.0.1:5555", stop: () => {} }),
      capture: async (o) => {
        captured.push(o);
        const shot = join(o.outDir, "index@editor.mobile.png");
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
        return { routes: [{ route: "/", url: o.baseUrl, status: 200, shots: [shot] }], issues: [] };
      },
      compare: async () => [],
      today: () => "2026-10-15",
    };
    const ok = await runShot(root, { positionals: [], flags: { state: ["design/states/editor.js"] } }, deps);
    expect(ok.exitCode).toBe(0);
    expect(captured[0]!.states).toEqual([{ name: "editor", script: "open();" }]);
    expect(ok.data.states).toEqual(["editor"]);
    const bad = await runShot(root, { positionals: [], flags: { state: ["design/states/nope.js"] } }, deps);
    expect(bad.exitCode).toBe(2);
    expect(captured).toHaveLength(1);
  });
});

describe("audit findings in a state", () => {
  test("are one finding with the same element on the plain page, and still say which state (third eval run)", () => {
    const issue = (state?: string): AuditIssue => ({
      rule: "color-contrast", selector: ".cup", label: "Tea", kind: "element", ratio: 1.7, expected: 4.5, fg: "#999", bg: "#aaa",
      route: "/", viewport: "mobile", scheme: "light", shot: "design/shots/index.mobile.png", ...(state ? { state } : {}),
    });
    // One text failing on the page and in a state is one problem: the report lists the state as another place.
    const findings = toFindings([issue(), issue("editor")]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.location.state).toBeUndefined();
    expect(findings[0]!.locations!.map((l) => l.state)).toEqual(["editor"]);
  });
});

describe("state scripts in a real browser (final review)", () => {
  const browser = findBrowser();
  test.skipIf(!browser)("a dialog is closed and reported, and a script that never stops doesn't lose the page's other screenshots", async () => {
    const root = makeProject({
      "index.html": '<!doctype html><button id="del" onclick="if (confirm(\'Delete this card?\')) document.body.dataset.deleted = 1">Delete</button>',
    });
    const site = startStaticServer(root);
    try {
      const outDir = join(root, "shots");
      const r = await captureScreens({
        browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir, settleMs: 50, stateTimeoutMs: 1000,
        states: [
          { name: "dialog", script: 'document.getElementById("del").click();' },
          { name: "loop", script: "while (true) {}" },
        ],
      });
      const home = r.routes[0]!;
      expect(home.error).toBeUndefined();
      expect(home.shots).toHaveLength(30);
      const errors = (home.pageErrors ?? []).join("\n");
      expect(errors).toContain('State "dialog": The page opened a dialog ("Delete this card?")');
      expect(errors).toContain('State "loop"');
      expect(errors).not.toContain("stuck in a loop");
    } finally {
      site.stop();
    }
  }, 120_000);
});

describe("each screenshot starts as a first visit (xBloom re-check)", () => {
  const browser = findBrowser();
  test.skipIf(!browser)("nothing a page or a state stores reaches the next screenshot", async () => {
    // The xBloom page remembers the theme button's choice: a state that pressed it turned the next "light" screenshot dark.
    const root = makeProject({
      "index.html": `<!doctype html><p>Hello</p><script>
        if (localStorage.getItem("visits") || localStorage.getItem("seen") || sessionStorage.getItem("seen") || document.cookie.includes("seen="))
          throw new Error("Remembered from an earlier screenshot");
        localStorage.setItem("visits", "1");
      </script>`,
    });
    const site = startStaticServer(root);
    try {
      const r = await captureScreens({
        browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir: join(root, "shots"), settleMs: 50,
        states: [{ name: "remember", script: 'localStorage.setItem("seen", "1"); sessionStorage.setItem("seen", "1"); document.cookie = "seen=1; path=/";' }],
      });
      const home = r.routes[0]!;
      expect(home.error).toBeUndefined();
      expect(home.shots).toHaveLength(20);
      expect(home.pageErrors ?? []).toEqual([]);
    } finally {
      site.stop();
    }
  }, 120_000);
});
