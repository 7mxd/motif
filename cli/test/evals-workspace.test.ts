import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import { runCmd, type Run } from "../../tests/evals/tools";
import { changes, findApp, patch, prepareWorkspace } from "../../tests/evals/workspace";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const npmCalls: string[][] = [];
// Real git; npm is stubbed, so CI never installs packages.
const run: Run = async (cmd, cwd, t, env) => {
  if (cmd[0] === "npm") {
    npmCalls.push(cmd);
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  }
  return runCmd(cmd, cwd, t, env);
};
const byId = (id: string) => CASES.find((c) => c.id === id)!;
const sorted = <T extends { path: string }>(xs: T[]) => [...xs].sort((a, b) => a.path.localeCompare(b.path));

describe("a case's folder", () => {
  test("B and C: a fresh copy of the app, its packages installed, its starting state recorded beside it", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-ws-"), "b-settings"), run);
    expect(existsSync(join(ws.app, "DESIGN.md"))).toBe(true);
    expect(npmCalls.at(-1)).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(ws.app, ".git"))).toBe(false);
    expect(await changes(ws, run)).toEqual([]);
  });

  test("lists what the session added, changed and deleted, ignoring installed packages and build output", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-ws-"), "b"), run);
    mkdirSync(join(ws.app, "src/app/search"), { recursive: true });
    writeFileSync(join(ws.app, "src/app/search/page.tsx"), "export default function Search() { return null; }\n");
    writeFileSync(join(ws.app, "src/app/page.tsx"), "export default function Home() { return null; }\n");
    rmSync(join(ws.app, "src/components/Badge.tsx"));
    mkdirSync(join(ws.app, "node_modules/x"), { recursive: true });
    writeFileSync(join(ws.app, "node_modules/x/index.js"), "");
    mkdirSync(join(ws.app, ".next"), { recursive: true });
    writeFileSync(join(ws.app, ".next/trace"), "");
    expect(sorted(await changes(ws, run))).toEqual(sorted([
      { status: "added", path: "src/app/search/page.tsx" },
      { status: "modified", path: "src/app/page.tsx" },
      { status: "deleted", path: "src/components/Badge.tsx" },
    ]));
    expect(await patch(ws, run, ["src/app/search/page.tsx"])).toContain("+export default function Search()");
  });

  test("a git repository the session makes inside the app doesn't change the record", async () => {
    const ws = await prepareWorkspace(byId("b-search"), join(tempDir("motif-ws-"), "g"), run);
    await runCmd(["git", "init", "-q"], ws.app, 60_000);
    await runCmd(["git", "add", "-A"], ws.app, 60_000);
    writeFileSync(join(ws.app, "src/app/new.ts"), "export {};\n");
    expect(await changes(ws, run)).toEqual([{ status: "added", path: "src/app/new.ts" }]);
  });

  test("a plain site: a fresh copy with its state scripts, nothing installed, its starting state recorded", async () => {
    const before = npmCalls.length;
    const ws = await prepareWorkspace(byId("b-plain"), join(tempDir("motif-ws-"), "b-plain"), run);
    expect(existsSync(join(ws.app, "index.html"))).toBe(true);
    expect(existsSync(join(ws.app, "design/states/sent.js"))).toBe(true);
    expect(npmCalls.length).toBe(before);
    expect(ws.baseline).toMatch(/^[0-9a-f]{40}$/);
    const seeded = await prepareWorkspace(byId("c-plain"), join(tempDir("motif-ws-"), "c-plain"), run);
    expect(existsSync(join(seeded.app, "design/states"))).toBe(false);
  });

  test("D: an empty folder holding the brief, nothing recorded", async () => {
    const ws = await prepareWorkspace(byId("d-stride"), join(tempDir("motif-ws-"), "d"), run);
    expect(readdirSync(ws.app)).toEqual(["brief.md"]);
    expect(ws.baseline).toBeUndefined();
    expect(await changes(ws, run)).toEqual([]);
  });

  test("a failed install stops the case with npm's own words", async () => {
    const failing: Run = async (cmd, cwd, t) => (cmd[0] === "npm" ? { code: 1, stdout: "", stderr: "npm ERR! network unreachable", timedOut: false } : runCmd(cmd, cwd, t));
    await expect(prepareWorkspace(byId("b-search"), join(tempDir("motif-ws-"), "s"), failing)).rejects.toThrow("network unreachable");
  });

  test("preparing again starts from scratch", async () => {
    const dir = join(tempDir("motif-ws-"), "again");
    const first = await prepareWorkspace(byId("d-bloom"), dir, run);
    writeFileSync(join(first.app, "leftover.txt"), "x");
    const second = await prepareWorkspace(byId("d-bloom"), dir, run);
    expect(readdirSync(second.app)).toEqual(["brief.md"]);
  });
});

describe("test D's new app", () => {
  test("is the folder with a design guide: this one, or the one inside it", () => {
    const dir = tempDir("motif-find-");
    expect(findApp(dir)).toBeNull();
    mkdirSync(join(dir, "stride"));
    writeFileSync(join(dir, "stride", "DESIGN.md"), "");
    expect(findApp(dir)).toBe(join(dir, "stride"));
    writeFileSync(join(dir, "DESIGN.md"), "");
    expect(findApp(dir)).toBe(dir);
  });
});
