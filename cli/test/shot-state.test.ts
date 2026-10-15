import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readStates, runShot, type ShotDeps } from "../src/commands/shot";
import { toFindings, type AuditIssue } from "../src/shot/audit";
import { stateExpression, type CaptureOptions } from "../src/shot/capture";
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
  test("are kept apart from the same element on the plain page, and say which state", () => {
    const issue = (state?: string): AuditIssue => ({
      rule: "color-contrast", selector: ".cup", label: "Tea", kind: "element", ratio: 1.7, expected: 4.5, fg: "#999", bg: "#aaa",
      route: "/", viewport: "mobile", scheme: "light", shot: "design/shots/index.mobile.png", ...(state ? { state } : {}),
    });
    const findings = toFindings([issue(), issue("editor")]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.location.state)).toEqual([undefined, "editor"]);
  });
});
