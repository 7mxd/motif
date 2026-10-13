# Motif 1C-2 — Screenshots and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `motif shot` screenshots the real app (starting its dev server when needed) at phone and desktop widths in light and dark; `motif shot --audit` reports rendered contrast, tap-target sizes and motion that ignores reduced motion, in the review JSON format; and `--save` / `--against` put screenshots side by side with the approved mockup (while a feature is being built) or with an earlier run (after a rebuild), saying how much changed.

**Developer request (2026-10-13), added as Task 7:** "It shows how the feature will look before or throughout the process of building it. Once a feature or an app is re-built, it compares the feature before and after." Spec support: §7.4 feature step 6 ("compared side by side with the approved mockup") and §7.5 review step 5 ("show before/after screenshots").

**Architecture:** `shot/devserver.ts` starts the app with its own package manager's `dev` script, reads the local address it prints, waits until it answers, and stops the whole process tree afterwards. `shot/capture.ts` drives the CDP client from 1C-1 through every route × viewport × colour scheme, saving full-page PNGs into `design/shots/`; with `--audit` it also runs a vendored copy of axe-core plus Motif's own in-page checks and `shot/audit.ts` turns the results into §7.6 findings. A small exit-hook module (`cleanup.ts`) makes sure no browser or dev server outlives Motif, even after Ctrl+C.

**Tech Stack:** Bun 1.4 (`node:child_process`, `fetch`, text imports), TypeScript 7, the CDP client from 1C-1, axe-core 4.14.0 (vendored, MPL-2.0).

**Spec:** `docs/specs/2026-10-12-motif-core-design.md` — implements §10.2 `motif shot`, §11.1 part 0 (route discovery) and part 5 (screenshot driver), §11.5's `shot --audit` paragraph, §7.6 (review JSON), §12 ("No browser found", "Stack toolchain missing"), §13.1 (integration test of `shot` on a fixture app with a CI browser), and closes the 1C-1 ruling that Ctrl+C mid-render could leave Chrome running.

**Builds on:** Plans 1A, 1B and 1C-1 (current `main`). Read `cli/src/browser/cdp.ts`, `cli/src/preview/render.ts`, `cli/src/commands/preview.ts`, `cli/src/detect/stacks.ts`, `cli/src/project/apps.ts` and `cli/src/main.ts` before starting.

**Verified while planning** (scratch spike against this machine's Chrome): axe-core 4.14.0 `color-contrast` returns `contrastRatio`, `fgColor`, `bgColor`, `expectedContrastRatio`; its `target-size` rule applies WCAG 2.5.8's spacing exception (an isolated 16 px button passes, two adjacent ones fail), ignores inline links in sentences and disabled controls; `axe.utils.getSelector` only works during `axe.run`, so Motif uses its own selector helper. Under emulated reduced motion, `document.getAnimations()` plus a 300 ms computed-style sample catches an unguarded CSS spinner and a `requestAnimationFrame` mover while ignoring an animation guarded by `prefers-reduced-motion: no-preference`. `process.kill(pid, 0)` detects live processes on Windows; Bun's `fetch("http://localhost:…")` reaches servers bound to `127.0.0.1` and `::1`; `cmd.exe /d /s /c "<pm> run dev"` runs `.cmd` shims and passes exit codes through.

## Global Constraints

- Exit codes `0` / `1` / `2`; `--json` prints one object; plain language for people.
- `shot` uses the browser `findBrowser` returns and never downloads one: no browser → exit 2 with `status: "needs_browser"` and the `motif browser install` hint (same wording as `preview`).
- Viewports: **mobile** 390×844 at device scale 2 with mobile emulation; **desktop** 1440×900 at scale 1. Each in light, then dark. Reduced motion is emulated while capturing so entrance animations don't land mid-flight.
- Screenshots: full page up to 8000 CSS px tall, saved as `design/shots/<slug>.<mobile|desktop>[.dark].png` (slug of `/` is `index`). `design/shots/` gets its own `.gitignore` (`*`) the first time, so screenshots are never committed (spec §6 tree: "git-ignored").
- Dev server: `<package manager> run dev` in the app folder (package manager from the nearest lockfile: `bun.lock`/`bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm). Ready = it printed a local address and that address answers HTTP, within 120 s. It is stopped (whole process tree) when `shot` ends, on errors, and on Ctrl+C. `--url` skips starting anything.
- Routes: `--routes` (comma-separated) or React web discovery (Next.js App Router, Pages Router, React Router absolute paths), else `/`; routes with parameters are skipped and named; at most 12 routes per run.
- Audit (spec §11.5): rendered text contrast via axe-core `color-contrast` (ratio below 3:1 → critical, otherwise major); targets failing axe `target-size` (24×24 CSS px with WCAG's spacing exception) → critical; targets below 44×44 at the mobile width → minor; motion still running after the page settles under emulated `prefers-reduced-motion: reduce` → major. All findings have `source: "exact"`, `status: "open"`.
- Audit output follows §7.6: `{ motifReview: 1, scope, date, findings: [...] }`, written to `design/shots/audit.json`; finding ids `F-001`…, ordered critical → major → minor.
- Nothing is uploaded. axe-core is vendored unmodified with its licence files under `cli/vendor/axe-core/` and embedded in the binary.
- Comparisons (Task 7): `--save <name>` keeps this run's PNGs as a named set in `design/shots/<name>/` (letters, digits, dashes; replaces that set); `--against <name>` pairs this run's PNGs with that set by file name; `--against <mockup.png|mockup.html>` pairs one page's PNGs with the mockup's PNGs from `motif preview` (phone frames ↔ mobile, wider frames ↔ desktop, `.dark` ↔ dark). Side-by-side images go to `design/shots/compare/<name|mockup>/`. Before/after pairs say how much of the page changed: both images scaled to 300 px wide, a pixel counts as changed when its R+G+B differ by more than 48 in total, extra height counts as changed, below 0.1 % is "no visible change". `--against` is checked before anything starts; comparing never changes the exit code.

## Review Focus

1. **A dev server that exits early or never says where it's running** (dependencies missing, a crashing config, a port prompt) → exit 2 with its last output lines, within the timeout, with nothing left running. Pinned in Task 2.
2. **Ctrl+C or a crash in the middle of a run** → the dev server and the browser stop too. Pinned in Task 1 (exit hooks, browser) and Task 2 (dev server).
3. **Routes that 404, 500, redirect, can't be reached, or never finish loading** → each is reported on its own line, the other routes are still captured, and the exit code is 1. Pinned in Task 4.
4. **Audit false positives**: hidden or disabled controls, links inside sentences, isolated small targets with enough space, motion guarded by `prefers-reduced-motion`, entrance animations that already finished → not reported. Pinned in Task 5.
5. **Monorepos and Windows quirks**: lockfile and `node_modules` in a parent folder, npm/pnpm/yarn `.cmd` shims, project paths with spaces → the dev server still starts. Pinned in Task 2.

---

## File Structure

```
cli/
├── vendor/axe-core/axe.min.js · LICENSE · LICENSE-3RD-PARTY.txt     axe-core 4.14.0, unmodified (MPL-2.0)
├── src/
│   ├── cleanup.ts                   onExit(): stop child processes on exit and Ctrl+C
│   ├── main.ts                      MODIFY: --url, --routes, --audit; register shot; help
│   ├── browser/cdp.ts               MODIFY: Browser.pid; a browser never outlives Motif
│   ├── shot/devserver.ts            devCommand, findLocalUrl, startDevServer, killTree
│   ├── shot/capture.ts              routes × viewports × schemes → PNGs (+ audit hook)
│   ├── shot/audit.ts                in-page audit script, findings, review JSON
│   ├── shot/axe.ts                  embedded axe-core source
│   ├── shot/compare.ts              side-by-side images: mockup vs app, before vs after (Task 7)
│   ├── stacks/react-web/routes.ts   route discovery
│   └── commands/shot.ts             motif shot
└── test/cleanup.test.ts · devserver.test.ts · routes.test.ts · capture.test.ts · audit.test.ts · compare.test.ts · shot-command.test.ts · shot-e2e.test.ts
```

---

### Task 1: Nothing outlives Motif

**Files:**
- Create: `cli/src/cleanup.ts`
- Modify: `cli/src/browser/cdp.ts`
- Test: `cli/test/cleanup.test.ts`

**Interfaces:**
- Consumes: `launchBrowser`, `Browser` (1C-1); `findBrowser` (1A); `tempDir`, `cleanupTempDirs` (test helpers).
- Produces:
  - From `src/cleanup.ts`: `onExit(fn: () => void): () => void` — runs `fn` synchronously when the process exits, including after Ctrl+C (exit code 130), SIGTERM (143) and, outside Windows, SIGHUP (129); the returned function cancels it
  - `Browser.pid: number` (the browser's process id); a browser that wasn't closed is killed when Motif exits

Node and Bun don't run `exit` handlers when a signal ends the process, so the first `onExit` call also installs signal handlers that turn Ctrl+C into a normal `process.exit`.

- [ ] **Step 1: Write the failing test**

`cli/test/cleanup.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBrowser } from "../src/detect/browser";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const SRC = join(import.meta.dir, "../src").replace(/\\/g, "/");
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A script in a fresh temp folder (paths in it are JSON-quoted, so Windows backslashes survive). */
function script(body: (dir: string) => string): { file: string; dir: string } {
  const dir = tempDir("motif-exit-");
  const file = join(dir, "run.ts");
  writeFileSync(file, body(dir));
  return { file, dir };
}

describe("onExit", () => {
  test("hooks run when the process exits; cancelled hooks don't", () => {
    const { file, dir } = script((d) => `
import { writeFileSync } from "node:fs";
import { onExit } from "${SRC}/cleanup";
onExit(() => writeFileSync(${JSON.stringify(join(d, "ran"))}, "1"));
const cancel = onExit(() => writeFileSync(${JSON.stringify(join(d, "cancelled"))}, "1"));
cancel();
process.exit(3);
`);
    const r = Bun.spawnSync([process.execPath, file]);
    expect(r.exitCode).toBe(3);
    expect(existsSync(join(dir, "ran"))).toBe(true);
    expect(existsSync(join(dir, "cancelled"))).toBe(false);
  });

  test.skipIf(process.platform === "win32")("Ctrl+C runs the hooks and exits with 130", async () => {
    const { file, dir } = script((d) => `
import { writeFileSync } from "node:fs";
import { onExit } from "${SRC}/cleanup";
onExit(() => writeFileSync(${JSON.stringify(join(d, "ran"))}, "1"));
console.log("ready");
setInterval(() => {}, 1000);
`);
    const proc = Bun.spawn([process.execPath, file], { stdout: "pipe" });
    await proc.stdout.getReader().read(); // "ready"
    proc.kill("SIGINT");
    expect(await proc.exited).toBe(130);
    expect(existsSync(join(dir, "ran"))).toBe(true);
  });
});

describe.skipIf(!findBrowser())("browsers don't outlive Motif (needs Chrome, Edge or Chromium)", () => {
  test("a browser that wasn't closed is stopped when Motif exits", async () => {
    const { file, dir } = script(() => `
import { launchBrowser } from "${SRC}/browser/cdp";
import { findBrowser } from "${SRC}/detect/browser";
const b = await launchBrowser(findBrowser()!.path);
console.log(JSON.stringify({ pid: b.pid }));
process.exit(0);
`);
    // The browser's temporary profile lands in this test's temp folder, which cleanupTempDirs removes.
    const r = Bun.spawnSync([process.execPath, file], { env: { ...process.env, TEMP: dir, TMP: dir, TMPDIR: dir } });
    const { pid } = JSON.parse(r.stdout.toString()) as { pid: number };
    expect(pid).toBeGreaterThan(0);
    const deadline = Date.now() + 5000;
    while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
    expect(alive(pid)).toBe(false);
  }, 30_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/cleanup.test.ts`
Expected: FAIL — `../src/cleanup` can't be found (the child scripts exit with an error), and `b.pid` is undefined.

- [ ] **Step 3: Implement the exit hooks**

`cli/src/cleanup.ts`:
```ts
/** Work to undo when Motif exits: child processes (a browser, a dev server) must not outlive it. */
const hooks = new Set<() => void>();
let installed = false;

function runHooks(): void {
  for (const fn of [...hooks]) {
    try {
      fn();
    } catch {
      // Best effort: keep running the other hooks.
    }
  }
  hooks.clear();
}

/**
 * Runs fn synchronously when the process exits, including after Ctrl+C or a termination signal.
 * Returns a function that cancels it; call that once the work has been cleaned up normally.
 */
export function onExit(fn: () => void): () => void {
  if (!installed) {
    installed = true;
    process.on("exit", runHooks);
    // A signal ends the process without "exit" handlers unless something turns it into process.exit.
    process.on("SIGINT", () => process.exit(130));
    process.on("SIGTERM", () => process.exit(143));
    if (process.platform !== "win32") process.on("SIGHUP", () => process.exit(129));
  }
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}
```

- [ ] **Step 4: Browsers stop with Motif**

In `cli/src/browser/cdp.ts`:
- add `import { onExit } from "../cleanup";`
- in `interface Browser`, add as the first member: `/** The browser's process id. */ readonly pid: number;`
- right after the line `const { proc, wsUrl, profile } = started;` add:
  ```ts
  // If Motif exits (or is stopped with Ctrl+C) before close(), the browser goes with it.
  const cancelExitHook = onExit(() => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
  });
  ```
- in the `catch (e)` block after the WebSocket connect, add `cancelExitHook();` as its first line
- in the returned object, add `pid: proc.pid!,` before `async newPage()`
- at the end of `close()`, after `await removeProfile(profile);`, add `cancelExitHook();`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/cleanup.test.ts test/cdp.test.ts test/render.test.ts && bun run typecheck`
Expected: PASS (on Windows the Ctrl+C test is skipped: Windows can't send Ctrl+C to another process from a script).

- [ ] **Step 6: Commit**

```bash
git add cli/src/cleanup.ts cli/src/browser/cdp.ts cli/test/cleanup.test.ts
git commit -m "feat(cli): stop browsers and other child processes when Motif exits or is interrupted"
```

---

### Task 2: Starting and stopping the app's dev server

**Files:**
- Create: `cli/src/shot/devserver.ts`
- Test: `cli/test/devserver.test.ts`

**Interfaces:**
- Consumes: `onExit` (Task 1); `makeProject`, `tempDir`, `cleanupTempDirs` (test helpers).
- Produces:
  - `type PackageManager = "bun" | "pnpm" | "yarn" | "npm"`
  - `interface DevCommand { command: string[]; display: string; packageManager: PackageManager }`
  - `interface DevServer { url: string; pid: number; stop(): Promise<void> }`
  - `devCommand(appDir: string, env?: { platform?: NodeJS.Platform; which?: (cmd: string) => string | null }): DevCommand | { error: string }`
  - `findLocalUrl(output: string): string | null`
  - `killTree(pid: number, force?: boolean): void`
  - `startDevServer(opts: { cwd: string; command: string[]; timeoutMs?: number }): Promise<DevServer>` — rejects with a plain message (including the server's last output lines) when the server stops early, can't be run, or isn't ready in time (default 120 s); in every failure case the process tree is stopped first

Package managers start the real server as a child (`npm run dev` → `vite`), so stopping means stopping the tree: `taskkill /T /F` on Windows; on macOS and Linux the server starts in its own process group and the group is signalled.

- [ ] **Step 1: Write the failing test**

`cli/test/devserver.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devCommand, findLocalUrl, startDevServer } from "../src/shot/devserver";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5000;
  while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
  return !alive(pid);
}

describe("findLocalUrl", () => {
  test("reads the address Vite and Next.js print, colours and all", () => {
    expect(findLocalUrl("\x1b[32m  ➜  \x1b[39m\x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n  ➜  Network: use --host to expose")).toBe("http://localhost:5173/");
    expect(findLocalUrl("   ▲ Next.js 15.5.0\n   - Local:        http://localhost:3000\n   - Network:      http://192.168.1.4:3000\n")).toBe("http://localhost:3000");
  });
  test("only local addresses count, and 0.0.0.0 becomes reachable", () => {
    expect(findLocalUrl("Network: http://192.168.1.4:8080/\nListening on http://0.0.0.0:8080")).toBe("http://127.0.0.1:8080");
    expect(findLocalUrl("ready - started server on [::]:3000, url: http://[::1]:3000.")).toBe("http://[::1]:3000");
    expect(findLocalUrl("compiling...")).toBeNull();
  });
});

const has = (cmds: string[]) => (cmd: string) => (cmds.includes(cmd) ? `/usr/bin/${cmd}` : null);
const app = (files: Record<string, string>) =>
  makeProject({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }), "node_modules/.keep": "", ...files });

describe("devCommand", () => {
  test("uses the package manager the lockfile names", () => {
    const pm = (files: Record<string, string>) => {
      const r = devCommand(app(files), { platform: "linux", which: has(["bun", "pnpm", "yarn", "npm", "node"]) });
      return "error" in r ? r.error : r.display;
    };
    expect(pm({ "bun.lock": "" })).toBe("bun run dev");
    expect(pm({ "pnpm-lock.yaml": "" })).toBe("pnpm run dev");
    expect(pm({ "yarn.lock": "" })).toBe("yarn run dev");
    expect(pm({ "package-lock.json": "{}" })).toBe("npm run dev");
    expect(pm({})).toBe("npm run dev");
  });

  test("runs the package manager directly, or through cmd.exe for Windows .cmd shims", () => {
    const which = has(["bun", "npm", "node"]);
    expect(devCommand(app({ "bun.lock": "" }), { platform: "linux", which })).toMatchObject({ command: ["/usr/bin/bun", "run", "dev"] });
    expect(devCommand(app({}), { platform: "linux", which })).toMatchObject({ command: ["/usr/bin/npm", "run", "dev"] });
    expect(devCommand(app({}), { platform: "win32", which })).toMatchObject({ command: ["cmd.exe", "/d", "/s", "/c", "npm run dev"] });
    expect(devCommand(app({ "bun.lock": "" }), { platform: "win32", which })).toMatchObject({ command: ["/usr/bin/bun", "run", "dev"] });
  });

  test("in a monorepo, the lockfile and dependencies can live in the workspace root", () => {
    const root = makeProject({
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "",
      "node_modules/.keep": "",
      "apps/web/package.json": JSON.stringify({ scripts: { dev: "next dev" } }),
    });
    expect(devCommand(join(root, "apps/web"), { platform: "linux", which: has(["pnpm", "node"]) })).toMatchObject({ display: "pnpm run dev" });
  });

  test("explains what's missing", () => {
    const error = (dir: string, cmds = ["npm", "node", "pnpm"]) => {
      const r = devCommand(dir, { platform: "linux", which: has(cmds) });
      return "error" in r ? r.error : "";
    };
    expect(error(makeProject({ "package.json": JSON.stringify({ scripts: { build: "vite build" } }) }))).toContain('no "dev" script');
    expect(error(makeProject({}))).toContain("package.json");
    expect(error(makeProject({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }), "pnpm-lock.yaml": "" }))).toContain('Run "pnpm install"');
    expect(error(app({ "yarn.lock": "" }))).toContain("uses yarn, which isn't installed");
    expect(error(app({}), ["npm"])).toContain("Node.js isn't installed");
  });
});

const SERVER = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<h1>Hi</h1>", { headers: { "content-type": "text/html" } }) });
console.log("\\x1b[32m  ➜  Local:\\x1b[0m   http://localhost:" + s.port + "/");
`;
const CRASH = `console.error("Error: Cannot find module 'vite'"); process.exit(1);`;
const SILENT = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
console.log("starting...");
setInterval(() => {}, 1000);
`;

/** Runs a script through a shell, as package managers do, so the server is a grandchild of the process Motif starts. */
function viaShell(dir: string, script: string): string[] {
  if (process.platform === "win32") {
    writeFileSync(join(dir, "dev.cmd"), `@"${process.execPath}" ${script}\r\n`);
    return ["cmd.exe", "/d", "/s", "/c", "dev.cmd"];
  }
  return ["sh", "-c", `"${process.execPath}" ${script} & wait`];
}
const pidIn = (dir: string) => Number(readFileSync(join(dir, "server.pid"), "utf8"));

describe("startDevServer", () => {
  test("waits for the address, then stops the whole process tree", async () => {
    const dir = tempDir("motif dev "); // a space in the path, on purpose
    writeFileSync(join(dir, "server.ts"), SERVER);
    const server = await startDevServer({ cwd: dir, command: viaShell(dir, "server.ts"), timeoutMs: 20_000 });
    expect(server.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(await (await fetch(server.url)).text()).toContain("Hi");
    const pid = pidIn(dir);
    await server.stop();
    expect(await gone(pid)).toBe(true);
    await expect(fetch(server.url)).rejects.toThrow();
  }, 30_000);

  test("a server that stops early is a plain error with its last output", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "crash.ts"), CRASH);
    const message = await startDevServer({ cwd: dir, command: viaShell(dir, "crash.ts"), timeoutMs: 20_000 }).then(
      () => "started",
      (e: Error) => e.message,
    );
    expect(message).toContain("stopped");
    expect(message).toContain("Cannot find module 'vite'");
  }, 30_000);

  test("a server that never says where it's running times out and is stopped", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "silent.ts"), SILENT);
    await expect(startDevServer({ cwd: dir, command: viaShell(dir, "silent.ts"), timeoutMs: 2000 })).rejects.toThrow("didn't say where it's running within 2 s");
    expect(await gone(pidIn(dir))).toBe(true);
  }, 30_000);

  test("a server left running is stopped when Motif exits", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "server.ts"), SERVER);
    const SRC = join(import.meta.dir, "../src").replace(/\\/g, "/");
    writeFileSync(join(dir, "run.ts"), `
import { startDevServer } from "${SRC}/shot/devserver";
await startDevServer({ cwd: ${JSON.stringify(dir)}, command: ${JSON.stringify(viaShell(dir, "server.ts"))} });
process.exit(0);
`);
    expect(Bun.spawnSync([process.execPath, join(dir, "run.ts")]).exitCode).toBe(0);
    expect(await gone(pidIn(dir))).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/devserver.test.ts`
Expected: FAIL — `../src/shot/devserver` not found.

- [ ] **Step 3: Implement**

`cli/src/shot/devserver.ts`:
```ts
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { onExit } from "../cleanup";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export interface DevCommand {
  command: string[];
  /** How a person would type it, e.g. "pnpm run dev". */
  display: string;
  packageManager: PackageManager;
}

export interface DevServer {
  url: string;
  pid: number;
  stop(): Promise<void>;
}

const LOCKFILES: [string, PackageManager][] = [
  ["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"],
];
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

/** The app folder, or in a monorepo the workspace root above it, where the lockfile and node_modules live. */
function installRoot(appDir: string): string {
  let dir = appDir;
  for (let i = 0; i < 5; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    if (existsSync(join(dir, "pnpm-workspace.yaml")) || readJson(join(dir, "package.json"))?.workspaces) return dir;
  }
  return appDir;
}

const lockfileIn = (dir: string) => LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1];

/** How to start this app's dev server, or a plain explanation of why Motif can't. */
export function devCommand(
  appDir: string,
  env: { platform?: NodeJS.Platform; which?: (cmd: string) => string | null } = {},
): DevCommand | { error: string } {
  const platform = env.platform ?? process.platform;
  const which = env.which ?? ((cmd: string) => Bun.which(cmd));
  const pkg = readJson(join(appDir, "package.json"));
  if (!pkg) return { error: "This app has no readable package.json, so Motif can't start it. Start it yourself and pass its address with --url." };
  if (typeof pkg.scripts?.dev !== "string") {
    return { error: 'This app has no "dev" script in package.json. Start it yourself and pass its address with --url.' };
  }
  const root = installRoot(appDir);
  const pm = lockfileIn(appDir) ?? lockfileIn(root) ?? "npm";
  const exe = which(pm);
  if (!exe) {
    return { error: `This app uses ${pm}, which isn't installed (or isn't on PATH). Install it, or start the app yourself and pass its address with --url.` };
  }
  if (pm !== "bun" && !which("node")) {
    return { error: "Node.js isn't installed, and this app needs it to run. Install Node.js, or start the app yourself and pass its address with --url." };
  }
  if (!existsSync(join(appDir, "node_modules")) && !existsSync(join(root, "node_modules"))) {
    return { error: `This app's dependencies aren't installed yet. Run "${pm} install" in its folder, then try again.` };
  }
  const display = `${pm} run dev`;
  // npm, pnpm and yarn are .cmd scripts on Windows, and only cmd.exe can run those.
  const command = platform === "win32" && pm !== "bun" ? ["cmd.exe", "/d", "/s", "/c", display] : [exe, "run", "dev"];
  return { command, display, packageManager: pm };
}

/** The first local address a dev server printed (Vite, Next.js and most others print one), or null. */
export function findLocalUrl(output: string): string | null {
  const m = output.replace(ANSI, "").match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|0\.0\.0\.0)(?::\d+)?(?:\/[^\s'"`<>]*)?/);
  if (!m) return null;
  return m[0].replace(/[.,;)]+$/, "").replace("//0.0.0.0", "//127.0.0.1").replace("//[::]", "//[::1]");
}

/** Stops a process and everything it started. */
export function killTree(pid: number, force = false): void {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-pid, force ? "SIGKILL" : "SIGTERM"); // the server runs in its own process group
    }
  } catch {
    // Already gone.
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

export async function startDevServer(opts: { cwd: string; command: string[]; timeoutMs?: number }): Promise<DevServer> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const proc = spawn(opts.command[0]!, opts.command.slice(1), {
    cwd: opts.cwd,
    // BROWSER=none: dev servers that open a browser tab on start shouldn't.
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32", // its own process group, so the whole tree can be stopped
    windowsHide: true,
  });
  let output = "";
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-20_000);
  };
  proc.stdout!.on("data", collect);
  proc.stderr!.on("data", collect);
  const failure: { error?: Error } = {};
  proc.once("error", (e) => {
    failure.error = e;
  });
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  const closed = new Promise<void>((resolve) => proc.once("close", () => resolve()));
  const cancelExitHook = onExit(() => {
    if (proc.pid) killTree(proc.pid, true);
  });
  const running = () => proc.exitCode === null && proc.signalCode === null;
  const tail = () => {
    const lines = output.replace(ANSI, "").split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean).slice(-8);
    return lines.length > 0 ? `\nLast output:\n  ${lines.join("\n  ")}` : "";
  };
  const stop = async () => {
    if (proc.pid && running()) {
      killTree(proc.pid);
      const done = await Promise.race([exited.then(() => true), Bun.sleep(3000).then(() => false)]);
      if (!done) killTree(proc.pid, true);
    }
    cancelExitHook();
  };

  const deadline = Date.now() + timeoutMs;
  let url: string | null = null;
  try {
    while (Date.now() < deadline) {
      if (failure.error) throw new Error(`Couldn't run "${opts.command.join(" ")}": ${failure.error.message}`);
      if (!running()) {
        await Promise.race([closed, Bun.sleep(500)]); // let the last output arrive
        throw new Error(`The dev server stopped (exit code ${proc.exitCode ?? proc.signalCode}) before it was ready.${tail()}`);
      }
      url ??= findLocalUrl(output);
      if (url && (await answers(url))) return { url, pid: proc.pid!, stop };
      await Bun.sleep(250);
    }
    throw new Error(`The dev server didn't ${url ? `answer at ${url}` : "say where it's running"} within ${Math.round(timeoutMs / 1000)} s.${tail()}`);
  } catch (e) {
    await stop();
    throw e;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cli && bun test test/devserver.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/shot/devserver.ts cli/test/devserver.test.ts
git commit -m "feat(shot): start the app's dev server with its package manager, and stop the whole tree"
```

---

### Task 3: Finding the app's pages (React web)

**Files:**
- Create: `cli/src/stacks/react-web/routes.ts`
- Test: `cli/test/routes.test.ts`

**Interfaces:**
- Consumes: `makeProject`, `cleanupTempDirs` (test helpers).
- Produces: `interface RouteDiscovery { routes: string[]; skipped: string[] }`; `discoverRoutes(appDir: string): RouteDiscovery` — `routes` always starts with `/`, then the rest sorted; `skipped` lists routes that need parameters (`/posts/[id]`, `/users/:id`), sorted

Rules:
- **Next.js** (the app depends on `next`): App Router pages under `app/` or `src/app/` (`page.tsx|ts|jsx|js|mdx`); route groups `(name)` don't add a segment; private folders `_name`, parallel routes `@slot` and intercepting routes `(.)name` are ignored. Pages Router files under `pages/` or `src/pages/`; `index` maps to its folder; `_app`, `_document`, `_error`, `404`, `500`, files starting with `_`, test/story files and `pages/api/` are ignored.
- **React Router** (the app depends on `react-router` or `react-router-dom`): absolute `path="/x"` and `path: "/x"` values in source files that mention `react-router` or `<Route`; paths containing `*` are ignored.
- Anything else: just `/`. (A Vite app's `src/pages/` folder is only components, so it's not read as routes.)

- [ ] **Step 1: Write the failing test**

`cli/test/routes.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { discoverRoutes } from "../src/stacks/react-web/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const PAGE = "export default function Page() { return null; }\n";
const pkg = (deps: Record<string, string>) => JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19", ...deps } });

describe("discoverRoutes", () => {
  test("Next.js App Router", () => {
    const root = makeProject({
      "package.json": pkg({ next: "^15" }),
      "app/page.tsx": PAGE,
      "app/layout.tsx": PAGE,
      "app/settings/page.tsx": PAGE,
      "app/(marketing)/about/page.tsx": PAGE,
      "app/posts/[id]/page.tsx": PAGE,
      "app/docs/[...slug]/page.mdx": PAGE,
      "app/@modal/(.)photo/page.tsx": PAGE,
      "app/_components/page.tsx": PAGE,
      "app/dashboard/layout.tsx": PAGE,
      "app/api/health/route.ts": "export function GET() {}\n",
    });
    expect(discoverRoutes(root)).toEqual({ routes: ["/", "/about", "/settings"], skipped: ["/docs/[...slug]", "/posts/[id]"] });
  });

  test("Next.js App Router under src/", () => {
    const root = makeProject({ "package.json": pkg({ next: "^15" }), "src/app/page.tsx": PAGE, "src/app/profile/page.tsx": PAGE });
    expect(discoverRoutes(root).routes).toEqual(["/", "/profile"]);
  });

  test("Next.js Pages Router", () => {
    const root = makeProject({
      "package.json": pkg({ next: "^15" }),
      "pages/index.tsx": PAGE,
      "pages/_app.tsx": PAGE,
      "pages/_document.tsx": PAGE,
      "pages/404.tsx": PAGE,
      "pages/about.tsx": PAGE,
      "pages/blog/index.tsx": PAGE,
      "pages/blog/[slug].tsx": PAGE,
      "pages/blog/post.test.tsx": PAGE,
      "pages/api/hello.ts": PAGE,
    });
    expect(discoverRoutes(root)).toEqual({ routes: ["/", "/about", "/blog"], skipped: ["/blog/[slug]"] });
  });

  test("React Router route objects and <Route> elements", () => {
    const root = makeProject({
      "package.json": pkg({ "react-router-dom": "^7", vite: "^6" }),
      "src/main.tsx": `import { createBrowserRouter } from "react-router-dom";
export const router = createBrowserRouter([{ path: "/", element: null }, { path: "/settings", element: null }, { path: "/users/:id", element: null }, { path: "*", element: null }]);
`,
      "src/App.tsx": `import { Route, Routes } from "react-router-dom";
export const App = () => (<Routes><Route path="/about" element={null} /><Route path="/about/" element={null} /></Routes>);
`,
      "src/api.ts": `export const endpoints = [{ path: "/api/users" }];\n`,
    });
    expect(discoverRoutes(root)).toEqual({ routes: ["/", "/about", "/settings"], skipped: ["/users/:id"] });
  });

  test("other apps get the home page only, even with a src/pages folder", () => {
    const root = makeProject({ "package.json": pkg({ vite: "^6" }), "src/pages/Home.tsx": PAGE, "src/main.tsx": "" });
    expect(discoverRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
    expect(discoverRoutes(makeProject({}))).toEqual({ routes: ["/"], skipped: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/routes.test.ts`
Expected: FAIL — `../src/stacks/react-web/routes` not found.

- [ ] **Step 3: Implement**

`cli/src/stacks/react-web/routes.ts`:
```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RouteDiscovery {
  routes: string[];
  /** Routes that need values in their address (/posts/[id]); shown to the developer, not captured. */
  skipped: string[];
}

const APP_PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const PAGES_FILE = /\.(tsx|ts|jsx|js|mdx)$/;
const NOT_A_PAGE = /\.(test|spec|stories|d)\.\w+$/;
const SOURCE = /\.(tsx|ts|jsx|js)$/;

const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
const entries = (dir: string) => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};
const needsValue = (segment: string) => segment.startsWith("[") || segment.startsWith(":");
const routeOf = (segments: string[]) => "/" + segments.join("/");

function dependencies(appDir: string): Record<string, unknown> {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8").replace(/^﻿/, ""));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

function add(out: RouteDiscovery, segments: string[]): void {
  (segments.some(needsValue) ? out.skipped : out.routes).push(routeOf(segments));
}

function appRouter(dir: string, segments: string[], out: RouteDiscovery): void {
  for (const entry of entries(dir)) {
    const path = join(dir, entry);
    if (isDir(path)) {
      // Private folders, parallel routes and intercepting routes aren't pages of their own.
      if (entry.startsWith("_") || entry.startsWith("@") || entry.startsWith("(.") || entry.startsWith(".") || entry === "node_modules") continue;
      const group = entry.startsWith("(") && entry.endsWith(")");
      appRouter(path, group ? segments : [...segments, entry], out);
    } else if (APP_PAGE.test(entry)) {
      add(out, segments);
    }
  }
}

function pagesRouter(dir: string, segments: string[], out: RouteDiscovery): void {
  for (const entry of entries(dir)) {
    const path = join(dir, entry);
    if (isDir(path)) {
      if (entry.startsWith(".") || entry.startsWith("_") || (segments.length === 0 && entry === "api")) continue;
      pagesRouter(path, [...segments, entry], out);
    } else if (PAGES_FILE.test(entry) && !NOT_A_PAGE.test(entry)) {
      const name = entry.replace(PAGES_FILE, "");
      if (name.startsWith("_") || (segments.length === 0 && (name === "404" || name === "500"))) continue;
      add(out, name === "index" ? segments : [...segments, name]);
    }
  }
}

function reactRouter(appDir: string, out: RouteDiscovery): void {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of entries(dir)) {
      if (files.length >= 500 || entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (isDir(path)) visit(path);
      else if (SOURCE.test(entry)) files.push(path);
    }
  };
  visit(isDir(join(appDir, "src")) ? join(appDir, "src") : appDir);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("react-router") && !text.includes("<Route")) continue;
    for (const m of text.matchAll(/\bpath\s*[=:]\s*["'`](\/[^"'`]*)["'`]/g)) {
      const route = m[1]!.replace(/\/+$/, "") || "/";
      if (route.includes("*")) continue;
      add(out, route.split("/").filter(Boolean));
    }
  }
}

export function discoverRoutes(appDir: string): RouteDiscovery {
  const out: RouteDiscovery = { routes: [], skipped: [] };
  const deps = dependencies(appDir);
  if (deps.next) {
    for (const base of ["app", "src/app"]) if (isDir(join(appDir, base))) appRouter(join(appDir, base), [], out);
    for (const base of ["pages", "src/pages"]) if (isDir(join(appDir, base))) pagesRouter(join(appDir, base), [], out);
  } else if (deps["react-router"] || deps["react-router-dom"]) {
    reactRouter(appDir, out);
  }
  const rest = [...new Set(out.routes)].filter((r) => r !== "/").sort();
  return { routes: ["/", ...rest], skipped: [...new Set(out.skipped)].sort() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cli && bun test test/routes.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/stacks/react-web/routes.ts cli/test/routes.test.ts
git commit -m "feat(react-web): discover pages from Next.js and React Router apps"
```

---

### Task 4: Screenshots of every page, at phone and desktop widths, light and dark

**Files:**
- Create: `cli/src/shot/capture.ts`
- Test: `cli/test/capture.test.ts`

**Interfaces:**
- Consumes: `launchBrowser`, `Page` (1C-1); `pngSize` (1C-1, tests); `findBrowser` (1A, tests); `tempDir`, `cleanupTempDirs` (test helpers).
- Produces:
  - `interface Viewport { name: "mobile" | "desktop"; width: number; height: number; scale: number; mobile: boolean }`; `VIEWPORTS: Viewport[]` (mobile 390×844 @2, desktop 1440×900 @1)
  - `SCHEMES = ["light", "dark"] as const`; `type Scheme = "light" | "dark"`; `MAX_HEIGHT = 8000`
  - `routeSlug(route: string): string` (`/` → `index`, `/settings/profile` → `settings-profile`); `routeUrl(base: string, route: string): string`; `shotName(slug: string, viewport: "mobile" | "desktop", scheme: Scheme): string`
  - `interface RouteResult { route: string; url: string; status: number; finalUrl?: string; error?: string; cropped?: boolean; shots: string[] }` (`status` 0 = couldn't be reached; `shots` are absolute paths in the order mobile-light, mobile-dark, desktop-light, desktop-dark)
  - `interface CaptureOptions { browserPath: string; baseUrl: string; routes: string[]; outDir: string; settleMs?: number; timeoutMs?: number }`
  - `captureScreens(opts: CaptureOptions): Promise<{ routes: RouteResult[] }>` — one browser for the whole run, a fresh tab per route (a stuck page can't spoil the next one); throws only when the browser can't start

For each route: an HTTP request first (status, redirects, and it lets Next.js compile the page before the browser arrives), then for each viewport and scheme: emulate the scheme and reduced motion, load, wait for fonts and `settleMs` (default 800 ms), hide the Next.js dev badge (`nextjs-portal`), and save a full-page PNG (cropped at 8000 CSS px). Error pages (404, 500) are captured too, because they show what went wrong; a route that can't be reached or never finishes loading gets an `error` and the run moves on.

- [ ] **Step 1: Write the failing test**

`cli/test/capture.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, routeSlug, routeUrl, shotName } from "../src/shot/capture";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("names and addresses", () => {
  test("routeSlug", () => {
    expect(routeSlug("/")).toBe("index");
    expect(routeSlug("/settings/profile")).toBe("settings-profile");
    expect(routeSlug("/Search?q=Shoes")).toBe("search-q-shoes");
  });
  test("routeUrl keeps the base path and the route's query", () => {
    expect(routeUrl("http://localhost:3000", "/")).toBe("http://localhost:3000/");
    expect(routeUrl("http://localhost:3000/", "/settings")).toBe("http://localhost:3000/settings");
    expect(routeUrl("http://localhost:5173/app/", "/settings?tab=billing")).toBe("http://localhost:5173/app/settings?tab=billing");
  });
  test("shotName", () => {
    expect(shotName("index", "mobile", "light")).toBe("index.mobile.png");
    expect(shotName("index", "desktop", "dark")).toBe("index.desktop.dark.png");
  });
});

const browser = findBrowser();
const PAGE = (body: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body { margin: 0; font: 16px sans-serif; } @media (prefers-color-scheme: dark) { body { background: #111111; color: #eeeeee; } }</style></head><body>${body}</body></html>`;
const html = (body: string, status = 200) => new Response(PAGE(body), { status, headers: { "content-type": "text/html" } });
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/") return html('<div style="height: 1000px">Home</div>');
      if (path === "/long") return html('<div style="height: 10000px">Long</div>');
      if (path === "/broken") return html("<h1>Something went wrong</h1>", 500);
      if (path === "/old") return Response.redirect(new URL("/", req.url).toString(), 302);
      if (path === "/slow") return html('<img src="/never" alt="">'); // the load event waits for this image forever
      if (path === "/never") return new Promise<Response>(() => {});
      return html("<h1>Not found</h1>", 404);
    },
  });
});
afterAll(() => server?.stop(true));

const size = (file: string) => pngSize(new Uint8Array(readFileSync(file)));

describe.skipIf(!browser)("captureScreens (needs Chrome, Edge or Chromium)", () => {
  test("every page at phone and desktop widths, light and dark; long pages are cropped", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({ browserPath: browser!.path, baseUrl: `http://localhost:${server.port}`, routes: ["/", "/long"], outDir: out, settleMs: 50 });
    expect(routes.map((r) => [r.route, r.status, r.error])).toEqual([["/", 200, undefined], ["/long", 200, undefined]]);
    expect(routes[0]!.shots.map((f) => f.slice(out.length + 1))).toEqual(["index.mobile.png", "index.mobile.dark.png", "index.desktop.png", "index.desktop.dark.png"]);
    expect(size(join(out, "index.mobile.png"))).toEqual({ width: 780, height: 2000 });
    expect(size(join(out, "index.desktop.png"))).toEqual({ width: 1440, height: 1000 });
    expect(routes[1]!.cropped).toBe(true);
    expect(size(join(out, "long.mobile.png"))).toEqual({ width: 780, height: 16000 });
    expect(size(join(out, "long.desktop.dark.png"))).toEqual({ width: 1440, height: 8000 });
  }, 120_000);

  test("error pages are captured and reported; unreachable or stuck pages don't stop the run", async () => {
    const out = tempDir("motif-shots-");
    const { routes } = await captureScreens({
      browserPath: browser!.path,
      baseUrl: `http://localhost:${server.port}`,
      routes: ["/broken", "/missing", "/old", "/slow", "/"],
      outDir: out,
      settleMs: 50,
      timeoutMs: 3000,
    });
    const byRoute = Object.fromEntries(routes.map((r) => [r.route, r]));
    expect(byRoute["/broken"]!.status).toBe(500);
    expect(byRoute["/broken"]!.shots).toHaveLength(4);
    expect(byRoute["/missing"]!.status).toBe(404);
    expect(byRoute["/old"]!.status).toBe(200);
    expect(byRoute["/old"]!.finalUrl).toBe(`http://localhost:${server.port}/`);
    expect(byRoute["/slow"]!.error).toBeString();
    expect(byRoute["/"]!.shots).toHaveLength(4);
    const unreachable = await captureScreens({ browserPath: browser!.path, baseUrl: "http://127.0.0.1:1", routes: ["/"], outDir: out, settleMs: 50, timeoutMs: 3000 });
    expect(unreachable.routes[0]).toMatchObject({ status: 0, shots: [] });
    expect(unreachable.routes[0]!.error).toContain("Couldn't reach");
  }, 120_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/capture.test.ts`
Expected: FAIL — `../src/shot/capture` not found.

- [ ] **Step 3: Implement**

`cli/src/shot/capture.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../browser/cdp";

export interface Viewport {
  name: "mobile" | "desktop";
  width: number;
  height: number;
  scale: number;
  mobile: boolean;
}

export const VIEWPORTS: Viewport[] = [
  { name: "mobile", width: 390, height: 844, scale: 2, mobile: true },
  { name: "desktop", width: 1440, height: 900, scale: 1, mobile: false },
];
export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];
/** Taller pages are cropped: 8000 CSS px at 2× stays under Chrome's 16384 px screenshot limit. */
export const MAX_HEIGHT = 8000;

export interface RouteResult {
  route: string;
  url: string;
  /** HTTP status; 0 when the page couldn't be reached at all. */
  status: number;
  /** Where a redirect ended up. */
  finalUrl?: string;
  error?: string;
  cropped?: boolean;
  shots: string[];
}

export interface CaptureOptions {
  browserPath: string;
  baseUrl: string;
  routes: string[];
  outDir: string;
  settleMs?: number;
  timeoutMs?: number;
}

export function routeSlug(route: string): string {
  const slug = route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "index";
}

export function routeUrl(base: string, route: string): string {
  const url = new URL(base);
  const [path, query] = route.split("?", 2);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path!.replace(/^\/+/, "")}`;
  url.search = query ? `?${query}` : "";
  url.hash = "";
  return url.toString();
}

export function shotName(slug: string, viewport: Viewport["name"], scheme: Scheme): string {
  return `${slug}.${viewport}${scheme === "dark" ? ".dark" : ""}.png`;
}

// The Next.js dev badge isn't part of the app.
const HIDE_DEV_BADGES = `(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); return true; })()`;
const PAGE_HEIGHT = "document.documentElement.scrollHeight";

async function probe(url: string, timeoutMs: number): Promise<{ status: number; finalUrl: string; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status, finalUrl: res.url };
  } catch (e) {
    return { status: 0, finalUrl: url, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function captureScreens(opts: CaptureOptions): Promise<{ routes: RouteResult[] }> {
  const settleMs = opts.settleMs ?? 800;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  mkdirSync(opts.outDir, { recursive: true });
  const browser = await launchBrowser(opts.browserPath);
  const results: RouteResult[] = [];
  const usedSlugs = new Set<string>();
  try {
    for (const route of opts.routes) {
      const url = routeUrl(opts.baseUrl, route);
      let slug = routeSlug(route);
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${routeSlug(route)}-${n}`;
      usedSlugs.add(slug);

      const answer = await probe(url, timeoutMs);
      const result: RouteResult = { route, url, status: answer.status, shots: [] };
      if (answer.finalUrl !== url) result.finalUrl = answer.finalUrl;
      results.push(result);
      if (answer.status === 0) {
        result.error = `Couldn't reach it: ${answer.error}`;
        continue;
      }

      const page = await browser.newPage();
      try {
        for (const viewport of VIEWPORTS) {
          await page.setViewport(viewport.width, viewport.height, viewport.scale, viewport.mobile);
          for (const scheme of SCHEMES) {
            await page.emulateMedia([
              { name: "prefers-color-scheme", value: scheme },
              { name: "prefers-reduced-motion", value: "reduce" },
            ]);
            await page.goto(url, timeoutMs);
            await page.evaluate("document.fonts.ready.then(() => true)");
            await Bun.sleep(settleMs);
            await page.evaluate(HIDE_DEV_BADGES);
            const fullHeight = await page.evaluate<number>(PAGE_HEIGHT);
            if (fullHeight > MAX_HEIGHT) result.cropped = true;
            const file = join(opts.outDir, shotName(slug, viewport.name, scheme));
            writeFileSync(file, await page.screenshot({ x: 0, y: 0, width: viewport.width, height: Math.min(fullHeight, MAX_HEIGHT) }));
            result.shots.push(file);
          }
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }
  return { routes: results };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cli && bun test test/capture.test.ts && bun run typecheck`
Expected: PASS (the browser tests run when Chrome, Edge or Chromium is installed).

- [ ] **Step 5: Commit**

```bash
git add cli/src/shot/capture.ts cli/test/capture.test.ts
git commit -m "feat(shot): capture every page at phone and desktop widths in light and dark"
```

---

### Task 5: The audit — contrast, tap targets and reduced motion as rendered

**Files:**
- Create: `cli/vendor/axe-core/axe.min.js`, `cli/vendor/axe-core/LICENSE`, `cli/vendor/axe-core/LICENSE-3RD-PARTY.txt` (copied unmodified), `cli/src/shot/axe.ts`, `cli/src/shot/audit.ts`
- Modify: `cli/src/shot/capture.ts`
- Test: `cli/test/audit.test.ts`
- Dev dependency: `cd cli && bun add -d axe-core@4.14.0` (the source of the vendored file)

**Interfaces:**
- Consumes: `Page` (1C-1); `captureScreens`, `CaptureOptions`, `RouteResult`, `Scheme` (Task 4); `findBrowser` (1A, tests).
- Produces:
  - From `src/shot/axe.ts`: `AXE_SOURCE: string`
  - From `src/shot/audit.ts`:
    - `type IssueRule = "color-contrast" | "target-size" | "target-mobile" | "motion"`
    - `interface RawIssue { rule: IssueRule; selector: string; label: string; kind: "link" | "button" | "field" | "element"; ratio?: number; expected?: number; fg?: string; bg?: string; width?: number; height?: number }`
    - `interface AuditIssue extends RawIssue { route: string; viewport: "mobile" | "desktop"; scheme: Scheme; shot: string }`
    - `type Severity = "critical" | "major" | "minor"`
    - `interface ReviewFinding { id: string; severity: Severity; category: "contrast" | "target-size" | "reduced-motion"; source: "exact"; location: { screen: string; selector: string; viewport: "mobile" | "desktop"; scheme?: Scheme }; summary: string; fix: string; shot: string; status: "open" }`
    - `interface Review { motifReview: 1; scope: string; date: string; findings: ReviewFinding[] }`
    - `auditPage(page: Page, ctx: { viewport: "mobile" | "desktop"; scheme: Scheme; motionSampleMs?: number }): Promise<RawIssue[]>`
    - `toFindings(issues: AuditIssue[]): ReviewFinding[]`; `reviewJson(findings: ReviewFinding[], routes: string[], date: string): Review`
  - `CaptureOptions` gains `audit?: boolean; motionSampleMs?: number`; `RouteResult` gains `auditError?: string`; `captureScreens` now resolves to `{ routes: RouteResult[]; issues: AuditIssue[] }`

What runs where (to avoid repeating the same finding four times):

| Check | Viewports | Schemes | Finding |
|---|---|---|---|
| axe `color-contrast` | both | both | critical below 3:1, otherwise major |
| axe `target-size` (24×24, WCAG spacing exception) | both | light | critical |
| Motif: interactive elements below 44×44 (links in sentences, hidden and disabled elements skipped) | mobile | light | minor |
| Motif: animations still running (`getAnimations`) or styles still changing over 300 ms (script-driven motion), under emulated reduced motion | desktop | light | major |

Repeats are merged: contrast per page + element + scheme, everything else per page + element; a target already critical isn't reported again as small on phones.

- [ ] **Step 1: Vendor axe-core**

Run:
```bash
cd cli && bun add -d axe-core@4.14.0
mkdir -p vendor/axe-core
cp node_modules/axe-core/axe.min.js node_modules/axe-core/LICENSE node_modules/axe-core/LICENSE-3RD-PARTY.txt vendor/axe-core/
head -c 60 vendor/axe-core/axe.min.js
```
Expected: the file starts with `/*! axe v4.14.0`.

- [ ] **Step 2: Write the failing test**

`cli/test/audit.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findBrowser } from "../src/detect/browser";
import { reviewJson, toFindings, type AuditIssue } from "../src/shot/audit";
import { AXE_SOURCE } from "../src/shot/axe";
import { captureScreens } from "../src/shot/capture";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

test("axe-core is embedded unmodified, with its licence", () => {
  const vendor = join(import.meta.dir, "../vendor/axe-core");
  expect(AXE_SOURCE.replace(/\r\n/g, "\n")).toBe(readFileSync(join(vendor, "axe.min.js"), "utf8").replace(/\r\n/g, "\n"));
  expect(AXE_SOURCE).toContain("4.14.0");
  expect(readFileSync(join(vendor, "LICENSE"), "utf8")).toContain("Mozilla Public License");
});

const issue = (over: Partial<AuditIssue>): AuditIssue => ({
  rule: "color-contrast", selector: "#a", label: "Hi", kind: "element", ratio: 3.5, expected: 4.5,
  route: "/", viewport: "mobile", scheme: "light", shot: "design/shots/index.mobile.png", ...over,
});

describe("toFindings", () => {
  test("merges repeats, keeps each scheme's contrast, and puts the worst first", () => {
    const findings = toFindings([
      issue({ rule: "target-mobile", selector: "#small", kind: "button", label: "Go", width: 32, height: 32 }),
      issue({}),
      issue({ viewport: "desktop" }),
      issue({ scheme: "dark", ratio: 2.1, shot: "design/shots/index.mobile.dark.png" }),
      issue({ rule: "target-size", selector: "#x", kind: "button", label: "", width: 16, height: 16 }),
      issue({ rule: "target-mobile", selector: "#x", kind: "button", label: "", width: 16, height: 16 }),
      issue({ rule: "motion", selector: "#spin", label: "", viewport: "desktop" }),
    ]);
    expect(findings.map((f) => `${f.id} ${f.severity} ${f.category} ${f.location.selector}`)).toEqual([
      "F-001 critical contrast #a",
      "F-002 critical target-size #x",
      "F-003 major contrast #a",
      "F-004 major reduced-motion #spin",
      "F-005 minor target-size #small",
    ]);
    expect(findings[0]).toEqual({
      id: "F-001",
      severity: "critical",
      category: "contrast",
      source: "exact",
      location: { screen: "/", selector: "#a", viewport: "mobile", scheme: "dark" },
      summary: 'Text "Hi" is hard to read in dark mode (2.1:1, needs 4.5:1).',
      fix: expect.any(String),
      shot: "design/shots/index.mobile.dark.png",
      status: "open",
    });
    expect(findings[1]!.summary).toBe("A button is 16×16 px with too little space around it; taps need at least 24×24 px (WCAG 2.2 AA).");
    expect(findings[3]!.summary).toBe("An element keeps moving when the viewer asks for reduced motion.");
    expect(findings[4]!.summary).toBe('The "Go" button is 32×32 px on a phone; 44×44 px is easier to tap.');
  });

  test("reviewJson follows the review format", () => {
    expect(reviewJson([], ["/", "/settings"], "2026-10-13")).toEqual({ motifReview: 1, scope: "screens: /, /settings", date: "2026-10-13", findings: [] });
  });
});

const BAD = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body { margin: 0; padding: 24px; font: 16px/1.5 sans-serif; background: #ffffff; color: #111111; }
.faint { color: #999999; }
@media (prefers-color-scheme: dark) { body { background: #222222; color: #eeeeee; } .faint { color: #bbbbbb; } }
.pair button { width: 16px; height: 16px; padding: 0; border: 0; margin: 0; }
#go { width: 32px; height: 32px; padding: 0; }
.box { width: 20px; height: 20px; background: #333333; margin: 8px; }
#spinner { animation: spin 1s linear infinite; }
@media (prefers-reduced-motion: no-preference) { #guarded { animation: spin 1s linear infinite; } }
#hello { animation: fade 100ms ease-out both; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fade { from { opacity: 0; } }
</style></head><body>
<p class="faint" id="faint">Faint note</p>
<p>Read the <a id="terms" href="#terms">terms</a> first.</p>
<div class="pair"><button id="zoom-in" aria-label="Zoom in"></button><button id="zoom-out" aria-label="Zoom out"></button></div>
<p><button id="go">Go</button></p>
<button id="off" disabled style="width: 16px; height: 16px; padding: 0" aria-label="Off"></button>
<button id="hidden" style="display: none" aria-label="Hidden"></button>
<div class="box" id="spinner"></div>
<div class="box" id="guarded"></div>
<div class="box" id="mover"></div>
<p id="hello">Hello</p>
<script>let x = 0; (function f() { x = (x + 1) % 100; document.getElementById("mover").style.transform = "translateX(" + x + "px)"; requestAnimationFrame(f); })();</script>
</body></html>`;
const CLEAN = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 24px; font: 16px sans-serif; background: #ffffff; color: #111111"><h1>Clean</h1><button style="width: 48px; height: 48px">OK</button><p>All good.</p></body></html>`;

const browser = findBrowser();
let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) => new Response(new URL(req.url).pathname === "/clean" ? CLEAN : BAD, { headers: { "content-type": "text/html" } }),
  });
});
afterAll(() => server?.stop(true));

describe.skipIf(!browser)("auditing real pages (needs Chrome, Edge or Chromium)", () => {
  test("finds what people would trip over, and nothing else", async () => {
    const { routes, issues } = await captureScreens({
      browserPath: browser!.path,
      baseUrl: `http://127.0.0.1:${server.port}`,
      routes: ["/", "/clean"],
      outDir: tempDir("motif-audit-"),
      audit: true,
      settleMs: 300,
    });
    expect(routes.map((r) => r.auditError)).toEqual([undefined, undefined]);
    const findings = toFindings(issues);
    expect(findings.map((f) => `${f.severity} ${f.category} ${f.location.screen} ${f.location.selector}${f.location.scheme ? ` ${f.location.scheme}` : ""}`)).toEqual([
      "critical contrast / #faint light",
      "critical target-size / #zoom-in",
      "critical target-size / #zoom-out",
      "critical contrast / #terms dark",
      "major reduced-motion / #spinner",
      "major reduced-motion / #mover",
      "minor target-size / #go",
    ]);
    expect(findings[0]!.summary).toContain("Faint note");
    expect(findings[0]!.shot).toEndWith("index.mobile.png");
  }, 120_000);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd cli && bun test test/audit.test.ts`
Expected: FAIL — `../src/shot/audit` not found.

- [ ] **Step 4: Embed axe-core**

`cli/src/shot/axe.ts`:
```ts
// @ts-ignore -- a text import of a .js file: Bun embeds its contents, TypeScript doesn't need to understand it
import axeSource from "../../vendor/axe-core/axe.min.js" with { type: "text" };

/** axe-core 4.14.0 (MPL-2.0), vendored unmodified with its licence files in cli/vendor/axe-core/. */
export const AXE_SOURCE: string = axeSource as unknown as string;
```

- [ ] **Step 5: Implement the audit**

`cli/src/shot/audit.ts`:
```ts
import type { Page } from "../browser/cdp";
import { AXE_SOURCE } from "./axe";
import type { Scheme } from "./capture";

export type IssueRule = "color-contrast" | "target-size" | "target-mobile" | "motion";

/** One problem, as the page reports it. */
export interface RawIssue {
  rule: IssueRule;
  /** A CSS selector that finds the element. */
  selector: string;
  /** Its visible text or accessible name, shortened. */
  label: string;
  kind: "link" | "button" | "field" | "element";
  ratio?: number;
  expected?: number;
  fg?: string;
  bg?: string;
  width?: number;
  height?: number;
}

export interface AuditIssue extends RawIssue {
  route: string;
  viewport: "mobile" | "desktop";
  scheme: Scheme;
  /** The screenshot of that page, viewport and scheme. */
  shot: string;
}

export type Severity = "critical" | "major" | "minor";

export interface ReviewFinding {
  id: string;
  severity: Severity;
  category: "contrast" | "target-size" | "reduced-motion";
  source: "exact";
  location: { screen: string; selector: string; viewport: "mobile" | "desktop"; scheme?: Scheme };
  summary: string;
  fix: string;
  shot: string;
  status: "open";
}

export interface Review {
  motifReview: 1;
  scope: string;
  date: string;
  findings: ReviewFinding[];
}

interface AuditApi {
  axe(rules: string[]): Promise<RawIssue[]>;
  smallTargets(min: number): RawIssue[];
  motion(sampleMs: number): Promise<RawIssue[]>;
}

declare const axe: { run(context: unknown, options: unknown): Promise<{ violations: any[] }> };

/** Runs inside the page and defines window.__motifAudit. It's sent as source text, so it may only use browser globals. */
function installAudit(): boolean {
  const unique = (selector: string) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const path = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const current = e;
      if (current.id && unique(`#${CSS.escape(current.id)}`)) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      let part = current.tagName.toLowerCase();
      const same = current.parentElement ? [...current.parentElement.children].filter((s) => s.tagName === current.tagName) : [];
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
      parts.unshift(part);
      if (unique(parts.join(" > "))) break;
    }
    return parts.join(" > ");
  };
  const kind = (el: Element): RawIssue["kind"] => {
    const role = el.getAttribute("role");
    if (el.tagName === "A" || role === "link") return "link";
    if (el.tagName === "BUTTON" || role === "button") return "button";
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return "field";
    return "element";
  };
  const label = (el: Element) =>
    (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || el.getAttribute("alt") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  const describe = (el: Element) => ({ selector: path(el), label: label(el), kind: kind(el) });

  const api: AuditApi = {
    async axe(rules) {
      const result = await axe.run(document, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] });
      const out: RawIssue[] = [];
      for (const violation of result.violations) {
        for (const node of violation.nodes) {
          const el = node.target.length === 1 ? document.querySelector(node.target[0]) : null;
          const info = el ? describe(el) : { selector: node.target.join(" >>> "), label: "", kind: "element" as const };
          const data = (node.any.find((c: any) => c.id === violation.id) ?? node.any[0] ?? {}).data ?? {};
          const rect = el?.getBoundingClientRect();
          out.push({
            rule: violation.id,
            ...info,
            ratio: data.contrastRatio,
            expected: data.expectedContrastRatio ? Number.parseFloat(data.expectedContrastRatio) : undefined,
            fg: data.fgColor,
            bg: data.bgColor,
            width: rect ? Math.round(rect.width) : data.width,
            height: rect ? Math.round(rect.height) : data.height,
          });
        }
      }
      return out;
    },
    smallTargets(min) {
      const selector =
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]';
      const out: RawIssue[] = [];
      for (const el of document.querySelectorAll(selector)) {
        if (el.matches(":disabled, [aria-disabled='true']") || el.closest("[hidden], [inert], [aria-hidden='true']")) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Links inside a sentence are exempt, as in WCAG 2.5.8.
        const parentText = el.parentElement?.textContent?.trim() ?? "";
        if (style.display === "inline" && parentText.length > (el.textContent?.trim().length ?? 0)) continue;
        if (rect.width < min || rect.height < min) {
          out.push({ rule: "target-mobile", ...describe(el), width: Math.round(rect.width), height: Math.round(rect.height) });
        }
      }
      return out;
    },
    async motion(sampleMs) {
      const moving = new Set<Element>();
      for (const animation of document.getAnimations()) {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (animation.playState === "running" && target instanceof Element) moving.add(target);
      }
      // Script-driven motion (requestAnimationFrame) doesn't show up in getAnimations: compare two samples.
      const elements = [...document.querySelectorAll("body *")];
      const sample = () =>
        elements.map((e) => {
          const s = getComputedStyle(e);
          return `${s.transform}|${s.translate}|${s.rotate}|${s.scale}|${s.opacity}`;
        });
      const before = sample();
      await new Promise((resolve) => setTimeout(resolve, sampleMs));
      const after = sample();
      elements.forEach((e, i) => {
        if (before[i] !== after[i]) moving.add(e);
      });
      return [...moving]
        .filter((e) => e.isConnected && e.getBoundingClientRect().width > 0)
        .map((e) => ({ rule: "motion" as const, ...describe(e) }));
    },
  };
  (window as unknown as { __motifAudit: AuditApi }).__motifAudit = api;
  return true;
}

const INSTALL_AUDIT = `(${installAudit.toString()})()`;

/** Audits the page as it is now (loaded and settled, reduced motion emulated). */
export async function auditPage(page: Page, ctx: { viewport: "mobile" | "desktop"; scheme: Scheme; motionSampleMs?: number }): Promise<RawIssue[]> {
  await page.evaluate(`${AXE_SOURCE}\n;true`);
  await page.evaluate(INSTALL_AUDIT);
  const light = ctx.scheme === "light";
  const rules = light ? ["color-contrast", "target-size"] : ["color-contrast"];
  const issues = await page.evaluate<RawIssue[]>(`__motifAudit.axe(${JSON.stringify(rules)})`);
  if (light && ctx.viewport === "mobile") issues.push(...(await page.evaluate<RawIssue[]>("__motifAudit.smallTargets(44)")));
  if (light && ctx.viewport === "desktop") issues.push(...(await page.evaluate<RawIssue[]>(`__motifAudit.motion(${ctx.motionSampleMs ?? 300})`)));
  return issues;
}

const ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

function subject(issue: RawIssue, textual: boolean): string {
  if (issue.kind !== "element") return issue.label ? `The "${issue.label}" ${issue.kind}` : `A ${issue.kind}`;
  if (textual) return issue.label ? `Text "${issue.label}"` : "Some text";
  return issue.label ? `The "${issue.label}" element` : "An element";
}

function judge(issue: AuditIssue): Pick<ReviewFinding, "severity" | "category" | "summary" | "fix"> & { withScheme: boolean } {
  switch (issue.rule) {
    case "color-contrast":
      return {
        severity: (issue.ratio ?? 0) < 3 ? "critical" : "major",
        category: "contrast",
        summary: `${subject(issue, true)} is hard to read in ${issue.scheme} mode (${issue.ratio}:1, needs ${issue.expected ?? 4.5}:1).`,
        fix: "Use a text colour role with more contrast on this background, or adjust the role in design/tokens.json (motif validate checks the pairs).",
        withScheme: true,
      };
    case "target-size":
      return {
        severity: "critical",
        category: "target-size",
        summary: `${subject(issue, false)} is ${issue.width}×${issue.height} px with too little space around it; taps need at least 24×24 px (WCAG 2.2 AA).`,
        fix: "Make it at least 24×24 px (padding counts), or give it more space from nearby targets.",
        withScheme: false,
      };
    case "target-mobile":
      return {
        severity: "minor",
        category: "target-size",
        summary: `${subject(issue, false)} is ${issue.width}×${issue.height} px on a phone; 44×44 px is easier to tap.`,
        fix: "Give it at least 44×44 px on small screens, with padding or a larger hit area.",
        withScheme: false,
      };
    case "motion":
      return {
        severity: "major",
        category: "reduced-motion",
        summary: `${subject(issue, false)} keeps moving when the viewer asks for reduced motion.`,
        fix: 'Stop or simplify this animation under prefers-reduced-motion (React web: MotionConfig reducedMotion="user" at the app root, or Tailwind\'s motion-safe: variant).',
        withScheme: false,
      };
  }
}

const mergeKey = (i: AuditIssue) =>
  i.rule === "color-contrast" ? `${i.rule}|${i.route}|${i.selector}|${i.scheme}` : `${i.rule}|${i.route}|${i.selector}`;

/** Findings in the review format: repeats merged, worst first, numbered F-001, F-002… */
export function toFindings(issues: AuditIssue[]): ReviewFinding[] {
  const seen = new Set<string>();
  const kept: Omit<ReviewFinding, "id">[] = [];
  for (const issue of issues) {
    const key = mergeKey(issue);
    // A target already reported as too small for everyone isn't reported again as small on phones.
    if (seen.has(key) || (issue.rule === "target-mobile" && seen.has(`target-size|${issue.route}|${issue.selector}`))) continue;
    seen.add(key);
    const { withScheme, ...verdict } = judge(issue);
    kept.push({
      severity: verdict.severity,
      category: verdict.category,
      source: "exact",
      location: { screen: issue.route, selector: issue.selector, viewport: issue.viewport, ...(withScheme ? { scheme: issue.scheme } : {}) },
      summary: verdict.summary,
      fix: verdict.fix,
      shot: issue.shot,
      status: "open",
    });
  }
  kept.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return kept.map((f, n) => ({ id: `F-${String(n + 1).padStart(3, "0")}`, ...f }));
}

export function reviewJson(findings: ReviewFinding[], routes: string[], date: string): Review {
  return { motifReview: 1, scope: `screens: ${routes.join(", ")}`, date, findings };
}
```

- [ ] **Step 6: Run the audit from the capture loop**

In `cli/src/shot/capture.ts`:
- add `import { auditPage, type AuditIssue } from "./audit";`
- in `interface RouteResult`, add `/** Set when the audit of this page couldn't finish. */ auditError?: string;`
- in `interface CaptureOptions`, add `audit?: boolean;` and `motionSampleMs?: number;`
- change the signature to `export async function captureScreens(opts: CaptureOptions): Promise<{ routes: RouteResult[]; issues: AuditIssue[] }>`, add `const issues: AuditIssue[] = [];` next to `const results: RouteResult[] = [];`, and change the final line to `return { routes: results, issues };`
- right after `result.shots.push(file);` add:
  ```ts
            if (opts.audit) {
              try {
                const found = await auditPage(page, { viewport: viewport.name, scheme, motionSampleMs: opts.motionSampleMs });
                for (const raw of found) issues.push({ ...raw, route, viewport: viewport.name, scheme, shot: file });
              } catch (e) {
                result.auditError = e instanceof Error ? e.message : String(e);
              }
            }
  ```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd cli && bun test test/audit.test.ts test/capture.test.ts && bun run typecheck`
Expected: PASS. If the real-page test lists an extra finding, compare it with the spike notes in this plan's header before changing the expectation: the page is built so that each element exercises exactly one rule.

- [ ] **Step 8: Commit**

```bash
git add cli/package.json cli/bun.lock cli/vendor/axe-core cli/src/shot/axe.ts cli/src/shot/audit.ts cli/src/shot/capture.ts cli/test/audit.test.ts
git commit -m "feat(shot): audit rendered contrast, tap targets and reduced motion (axe-core + Motif checks)"
```

---

### Task 6: `motif shot`

**Files:**
- Create: `cli/src/commands/shot.ts`
- Modify: `cli/src/main.ts`, `README.md`
- Test: `cli/test/shot-command.test.ts`, `cli/test/shot-e2e.test.ts`, `cli/test/main.test.ts` (append)

**Interfaces:**
- Consumes: `RunContext.flags` (1C-1); `findBrowser`, `BrowserInfo`; `detectApps`, `STACK_LABELS`, `AppInfo`; `selectApps`; `devCommand`, `startDevServer`, `DevServer` (Task 2); `discoverRoutes`, `RouteDiscovery` (Task 3); `captureScreens`, `CaptureOptions`, `RouteResult`, `MAX_HEIGHT` (Tasks 4–5); `toFindings`, `reviewJson`, `ReviewFinding`, `AuditIssue` (Task 5); `pngSize` (e2e); test helpers.
- Produces: `interface ShotDeps { findBrowser: () => BrowserInfo | null; devCommand: typeof devCommand; startDevServer: typeof startDevServer; capture: typeof captureScreens; today: () => string }`; `parseRoutes(value: string): string[]`; `runShot(cwd: string, ctx: RunContext, deps?: ShotDeps): Promise<CommandResult>`; new options `--url`, `--routes`, `--audit`

Behaviour:

| Situation | Result |
|---|---|
| `motif shot` in a React web app | starts its dev server, captures the discovered pages, stops the server; exit 0 when every page rendered (HTTP 200–399, no error), else 1 |
| `--url <address>` | uses that running app; nothing is started; routes from `--routes`, else discovery when the folder holds one React web app, else `/` |
| `--routes /,/settings` | exactly those pages (leading `/` added, repeats dropped); otherwise discovery; at most 12 pages per run (a note says how many were left out) |
| `--audit` | also writes `design/shots/audit.json` (review format) and lists the findings, worst first; exit 1 when there are findings |
| `--out <folder>` | screenshots go there instead (no `.gitignore` is written into a folder the developer chose) |
| no browser | exit 2, `status: "needs_browser"`, the `motif browser install` hint |
| no app / several apps / not React web (without `--url`) | exit 2: pass `--url`, or choose with `--app` |
| the app can't be started (no `dev` script, dependencies not installed, Node missing) or its dev server fails | exit 2 with the plain reason (and the server's last output lines) |
| capturing fails (the browser won't start) | exit 2; the dev server is still stopped |

`--json` callers get `{ url, routes: [{ route, status, finalUrl?, error?, shots }], shots, skipped, findings?, audit? }`, with paths relative to the project and forward slashes.

- [ ] **Step 1: Write the failing tests**

`cli/test/shot-command.test.ts`:
```ts
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
```

Append to `cli/test/main.test.ts`:
```ts
describe("main: shot", () => {
  test("is listed in help with its options", () => {
    const help = run("help").stdout.toString();
    for (const word of ["shot", "--url", "--routes", "--audit"]) expect(help).toContain(word);
  });
  test("with no app and no --url it says what to do", () => {
    const r = run("shot", "--cwd", tempDir("motif-empty-"));
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString()).toMatch(/--url|motif browser install/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd cli && bun test test/shot-command.test.ts test/main.test.ts`
Expected: FAIL — `../src/commands/shot` not found; the help test fails on `shot`.

- [ ] **Step 3: Implement the command**

`cli/src/commands/shot.ts`:
```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { findBrowser, type BrowserInfo } from "../detect/browser";
import { detectApps, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { selectApps } from "../project/apps";
import { reviewJson, toFindings, type ReviewFinding } from "../shot/audit";
import { captureScreens, MAX_HEIGHT, type RouteResult } from "../shot/capture";
import { devCommand, startDevServer, type DevServer } from "../shot/devserver";
import { discoverRoutes, type RouteDiscovery } from "../stacks/react-web/routes";

export interface ShotDeps {
  findBrowser: () => BrowserInfo | null;
  devCommand: typeof devCommand;
  startDevServer: typeof startDevServer;
  capture: typeof captureScreens;
  today: () => string;
}

const MAX_ROUTES = 12;
const INSTALL_HINT = '"motif browser install" downloads a private headless copy (about 100 MB) that only Motif uses.';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const defaultDeps: ShotDeps = { findBrowser: () => findBrowser(), devCommand, startDevServer, capture: captureScreens, today };

const usage = (text: string, data: Record<string, unknown>): CommandResult => ({ command: "shot", exitCode: 2, text, data });
const projectPath = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/") || ".";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rendered = (r: RouteResult) => !r.error && r.status >= 200 && r.status < 400;

/** "/, settings ,/about" → ["/", "/settings", "/about"] */
export function parseRoutes(value: string): string[] {
  const routes = value.split(",").map((r) => r.trim()).filter(Boolean).map((r) => (r.startsWith("/") ? r : `/${r}`));
  return [...new Set(routes)];
}

function routeLine(r: RouteResult, width: number): string {
  const what = rendered(r)
    ? `${r.shots.length} screenshots${r.finalUrl ? ` (went to ${new URL(r.finalUrl).pathname})` : ""}${r.cropped ? ` (cropped at ${MAX_HEIGHT} px)` : ""}`
    : `✗ ${r.error ?? `HTTP ${r.status}`}${r.shots.length > 0 ? " (the screenshots show the error page)" : ""}`;
  return `  ${r.route.padEnd(width)}  ${what}`;
}

function countText(findings: ReviewFinding[]): string {
  return (["critical", "major", "minor"] as const)
    .map((severity) => [severity, findings.filter((f) => f.severity === severity).length] as const)
    .filter(([, n]) => n > 0)
    .map(([severity, n]) => `${n} ${severity}`)
    .join(", ");
}

export async function runShot(cwd: string, ctx: RunContext, deps: ShotDeps = defaultDeps): Promise<CommandResult> {
  const flags = ctx.flags ?? {};
  const givenUrl = typeof flags.url === "string" ? flags.url : undefined;
  const audit = flags.audit === true;
  if (givenUrl !== undefined && !/^https?:\/\/\S+$/.test(givenUrl)) {
    return usage("--url needs the address of a running app, like http://localhost:3000.", { error: "usage" });
  }
  const browser = deps.findBrowser();
  if (!browser) {
    return usage(`No Chrome or Edge found, so Motif can't take screenshots. ${INSTALL_HINT}`, { error: "needs-browser", status: "needs_browser" });
  }

  const detected = detectApps(cwd).apps;
  const selected = selectApps(detected, ctx.app);
  if (selected === null) {
    return usage(`There's no app at "${ctx.app}". Apps here: ${detected.map((a) => a.path).join(", ") || "none"}.`, { error: "no-such-app" });
  }
  const app: AppInfo | undefined = selected.length === 1 ? selected[0] : undefined;
  if (!givenUrl) {
    if (selected.length === 0) {
      return usage("No app found in this folder. Run this inside your app's folder, or pass a running app's address with --url.", { error: "no-app" });
    }
    if (!app) return usage(`There are several apps here (${selected.map((a) => a.path).join(", ")}). Choose one with --app <path>.`, { error: "several-apps" });
    if (app.stack !== "react-web") {
      const what = app.stack ? `${STACK_LABELS[app.stack]} apps` : "this app";
      return usage(`Motif can't start ${what} for screenshots yet. Start it yourself and pass its address with --url.`, { error: "unsupported-stack" });
    }
  }
  const appDir = app ? join(cwd, app.path) : cwd;

  const discovery: RouteDiscovery =
    typeof flags.routes === "string"
      ? { routes: parseRoutes(flags.routes), skipped: [] }
      : app?.stack === "react-web"
        ? discoverRoutes(appDir)
        : { routes: ["/"], skipped: [] };
  if (discovery.routes.length === 0) return usage("--routes needs at least one page, like --routes /,/settings.", { error: "usage" });
  const routes = discovery.routes.slice(0, MAX_ROUTES);
  const notes: string[] = [];
  if (discovery.routes.length > routes.length) {
    notes.push(`Captured the first ${MAX_ROUTES} of ${discovery.routes.length} pages. Choose others with --routes.`);
  }
  if (discovery.skipped.length > 0) {
    notes.push(`Skipped pages that need values in their address: ${discovery.skipped.join(", ")}. Add real ones with --routes.`);
  }

  let server: DevServer | undefined;
  let baseUrl = givenUrl;
  if (!baseUrl) {
    const how = deps.devCommand(appDir);
    if ("error" in how) return usage(how.error, { error: "cant-start" });
    try {
      server = await deps.startDevServer({ cwd: appDir, command: how.command });
    } catch (e) {
      return usage(`Couldn't start the app with "${how.display}". ${message(e)}`, { error: "dev-server-failed" });
    }
    baseUrl = server.url;
  }

  const outDir = resolve(cwd, typeof flags.out === "string" ? flags.out : join("design", "shots"));
  let captured: Awaited<ReturnType<typeof captureScreens>>;
  try {
    mkdirSync(outDir, { recursive: true });
    const ignore = join(outDir, ".gitignore");
    if (typeof flags.out !== "string" && !existsSync(ignore)) {
      writeFileSync(ignore, "# Screenshots of the running app (motif shot). Not committed.\n*\n");
    }
    captured = await deps.capture({ browserPath: browser.path, baseUrl, routes, outDir, audit });
  } catch (e) {
    return usage(`Couldn't take screenshots: ${message(e)}`, { error: "capture-failed" });
  } finally {
    await server?.stop();
  }

  const failed = captured.routes.filter((r) => !rendered(r));
  const shots = captured.routes.flatMap((r) => r.shots.map((s) => projectPath(cwd, s)));
  const width = Math.max(...captured.routes.map((r) => r.route.length));
  const lines = [
    shots.length > 0
      ? `✓ ${shots.length} screenshots of ${captured.routes.length} ${captured.routes.length === 1 ? "page" : "pages"} (phone and desktop, light and dark) in ${projectPath(cwd, outDir)}/`
      : "✗ No screenshots were taken.",
    ...captured.routes.map((r) => routeLine(r, width)),
  ];

  let findings: ReviewFinding[] = [];
  let auditFile: string | undefined;
  if (audit) {
    findings = toFindings(captured.issues.map((i) => ({ ...i, shot: projectPath(cwd, i.shot) })));
    const file = join(outDir, "audit.json");
    writeFileSync(file, JSON.stringify(reviewJson(findings, routes, deps.today()), null, 2) + "\n");
    auditFile = projectPath(cwd, file);
    lines.push(
      findings.length === 0
        ? `✓ Audit: no contrast, tap-target or reduced-motion problems found (${auditFile}).`
        : `✗ Audit: ${countText(findings)} (details in ${auditFile}):`,
    );
    for (const f of findings.slice(0, 15)) {
      const where = `${f.location.screen} (${f.location.viewport}${f.location.scheme ? `, ${f.location.scheme}` : ""})`;
      lines.push(`  ${f.severity.padEnd(8)} ${where} ${f.summary}`);
    }
    if (findings.length > 15) lines.push(`  …and ${findings.length - 15} more in ${auditFile}.`);
    for (const r of captured.routes) if (r.auditError) notes.push(`Couldn't finish the audit of ${r.route}: ${r.auditError}`);
  }
  lines.push(...notes.map((n) => `• ${n}`));

  return {
    command: "shot",
    exitCode: failed.length > 0 || findings.length > 0 ? 1 : 0,
    text: lines.join("\n"),
    data: {
      url: baseUrl,
      routes: captured.routes.map((r) => ({
        route: r.route,
        status: r.status,
        ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
        ...(r.error ? { error: r.error } : {}),
        shots: r.shots.map((s) => projectPath(cwd, s)),
      })),
      shots,
      skipped: discovery.skipped,
      ...(audit ? { findings, audit: auditFile } : {}),
    },
  };
}
```

- [ ] **Step 4: Register the command, its options and help**

In `cli/src/main.ts`:
- import `runShot` from `./commands/shot` and add `shot: runShot,` to `COMMANDS`
- add to the `parseArgs` `options`: `url: { type: "string" }, routes: { type: "string" }, audit: { type: "boolean", default: false },`
- add to the `flags` object passed to the runner: `url: values.url, routes: values.routes, audit: values.audit,`
- in `HELP`, add after the `preview` command line:
  ```
    shot       Screenshot your app's pages (--audit checks what people actually see)
  ```
  and add this block after the `Preview options:` block:
  ```
  Shot options:
    --url <address>   Use an app that's already running instead of starting it
    --routes <list>   Pages to capture, e.g. /,/settings (default: found from your app)
    --audit           Also check contrast, tap-target sizes and reduced motion as rendered
  ```
  and change the `--out` line in `Preview options:` to `  --out <folder>    Where PNGs go (preview: design/previews, shot: design/shots)`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd cli && bun test test/shot-command.test.ts test/main.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Write the end-to-end test for the compiled binary**

`cli/test/shot-e2e.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO_ROOT = join(import.meta.dir, "../..");
const browser = findBrowser();
const bun = Bun.which("bun");
let bin = "";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// The fixture app's "dev server": a tiny Bun server, started by `bun run dev` like any other app.
const SERVER = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
const page = (body) => new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px;font:16px sans-serif;background:#ffffff;color:#111111">' + body + "</body></html>", { headers: { "content-type": "text/html" } });
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === "/") return page('<h1>Home</h1><button style="width:48px;height:48px">OK</button>');
  if (path === "/settings") return page('<p style="color:#aaaaaa">Faint</p><div><button aria-label="A" style="width:16px;height:16px;padding:0;border:0;margin:0"></button><button aria-label="B" style="width:16px;height:16px;padding:0;border:0;margin:0"></button></div>');
  return new Response("Not found", { status: 404 });
} });
console.log("  ➜  Local:   http://localhost:" + s.port + "/");
`;

describe.skipIf(!browser || !bun)("compiled motif shot (needs Chrome, Edge or Chromium, and bun on PATH)", () => {
  beforeAll(() => {
    bin = join(tempDir("motif-build-"), process.platform === "win32" ? "motif.exe" : "motif");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", bin]);
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  }, 180_000);

  test("starts the app, screenshots and audits its pages, then stops it", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "fixture", private: true, scripts: { dev: "bun server.ts" }, dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } }),
      "bun.lock": "",
      "node_modules/.keep": "",
      "server.ts": SERVER,
    });
    const r = Bun.spawnSync([bin, "shot", "--audit", "--routes", "/,/settings", "--json", "--cwd", root], { env: { ...process.env, MOTIF_HOME: tempDir("motif-home-") } });
    const out = JSON.parse(r.stdout.toString());
    expect(r.exitCode).toBe(1);
    expect(out.routes.map((x: { route: string; status: number }) => [x.route, x.status])).toEqual([["/", 200], ["/settings", 200]]);
    expect(out.shots).toHaveLength(8);
    expect(pngSize(new Uint8Array(readFileSync(join(root, "design/shots/index.mobile.png")))).width).toBe(780);
    const found = new Set(out.findings.map((f: { severity: string; category: string; location: { screen: string } }) => `${f.severity} ${f.category} ${f.location.screen}`));
    expect(found.has("critical contrast /settings")).toBe(true);
    expect(found.has("critical target-size /settings")).toBe(true);
    expect([...found].some((f) => String(f).endsWith(" /"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "design/shots/audit.json"), "utf8")).motifReview).toBe(1);
    expect(existsSync(join(root, "design/shots/.gitignore"))).toBe(true);
    const pid = Number(readFileSync(join(root, "server.pid"), "utf8"));
    const deadline = Date.now() + 5000;
    while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
    expect(alive(pid)).toBe(false);
  }, 180_000);
});
```

Run: `cd cli && bun test test/shot-e2e.test.ts`
Expected: PASS (skipped only without a browser or without `bun` on PATH; CI has both on all three OSes).

- [ ] **Step 7: Update the README**

In `README.md`, add this row after the `motif preview` row:
```markdown
| `motif shot` | Screenshots your real app's pages at phone and desktop widths in light and dark (starting its dev server if needed); `--audit` checks contrast, tap-target sizes and reduced motion as rendered |
```
and replace the privacy paragraph with:
```markdown
Previews and screenshots run on your computer only: the preview server listens on `127.0.0.1`, serves nothing outside your project, and nothing is uploaded. Screenshots of your app go to `design/shots/`, which Motif keeps out of git. Motif uses the Chrome or Edge you already have; it downloads a browser only when you run `motif browser install`.
```

- [ ] **Step 8: Run everything**

Run: `cd cli && bun test --timeout 120000 && bun run typecheck && bun run build`
Expected: all tests PASS; the build succeeds.

- [ ] **Step 9: Commit**

```bash
git add cli/src/commands/shot.ts cli/src/main.ts cli/test/shot-command.test.ts cli/test/shot-e2e.test.ts cli/test/main.test.ts README.md
git commit -m "feat(shot): motif shot screenshots the real app and audits it as rendered"
```

---

### Task 7: Side by side — the mockup while building, before and after a rebuild

**Files:**
- Create: `cli/src/shot/compare.ts`
- Modify: `cli/src/commands/shot.ts`, `cli/src/main.ts`, `README.md`
- Test: `cli/test/compare.test.ts`, `cli/test/shot-command.test.ts` (update `fakes`, append), `cli/test/shot-e2e.test.ts` (append)

**Interfaces:**
- Consumes: `launchBrowser` (1C-1); `pngSize` (1C-1); `MAX_HEIGHT` (Task 4); `runShot`, `ShotDeps` (Task 6); `mockupFrames` naming from `motif preview` (1C-1: `<name>.png`, `<name>-2.png`, `<name>.dark.png`).
- Produces:
  - From `src/shot/compare.ts`: `interface ComparePair { before: string; after: string; out: string }`; `interface Comparison extends ComparePair { changed?: number }`; `pairWithSet(shots: string[], setDir: string, compareDir: string): { pairs: ComparePair[]; added: string[] }`; `mockupFrames(mockup: string): string[]`; `pairWithMockup(frames: string[], shots: string[], compareDir: string): ComparePair[]`; `renderComparisons(opts: { browserPath: string; pairs: ComparePair[]; labels: [string, string]; measure: boolean }): Promise<Comparison[]>`
  - `ShotDeps.compare: typeof renderComparisons`; new options `--save <name>` and `--against <name|mockup>`; `--json` gains `comparisons: [{ before, after, image, changed? }]`, `added`, `saved`

How a developer and their agent use it:

| Moment | Command | Result |
|---|---|---|
| Before building | `motif preview design/previews/settings.html --png-only` (1C-1) | the mockup as PNGs |
| While building | `motif shot --routes /settings --against design/previews/settings.html` | `design/shots/compare/mockup/settings.png` (and `.dark`): **Mockup \| The app now** |
| Before a rebuild | `motif shot --save before` | this run kept in `design/shots/before/` |
| After the rebuild | `motif shot --against before` | `design/shots/compare/before/<page>.<viewport>[.dark].png`: **Before \| Now**, with "About 12.5% of the page looks different." under them; the summary lists what changed and what's new |

The side-by-side image is a small page the headless browser renders: both images at the same width (phone screenshots at their CSS size, wide ones at 720 CSS px), labelled, at 2×. Measuring happens in the same page with a canvas (see Global Constraints for the rule).

- [ ] **Step 1: Write the failing test for the comparison module**

`cli/test/compare.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser } from "../src/browser/cdp";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { mockupFrames, pairWithMockup, pairWithSet, renderComparisons } from "../src/shot/compare";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

/** Just enough of a PNG for pngSize: the signature and an IHDR chunk with this width and height. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("pairing", () => {
  test("with a saved set, by file name; screenshots the set doesn't have are new", () => {
    const dir = tempDir("motif-pairs-");
    mkdirSync(join(dir, "before"));
    writeFileSync(join(dir, "before", "index.mobile.png"), "x");
    const shots = [join(dir, "index.mobile.png"), join(dir, "settings.mobile.png")];
    const { pairs, added } = pairWithSet(shots, join(dir, "before"), join(dir, "compare", "before"));
    expect(pairs).toEqual([{ before: join(dir, "before", "index.mobile.png"), after: shots[0]!, out: join(dir, "compare", "before", "index.mobile.png") }]);
    expect(added).toEqual([shots[1]!]);
  });

  test("a mockup's PNGs, found from its .html or from any of its PNGs", () => {
    const dir = tempDir("motif-mockup-");
    for (const f of ["home.png", "home-2.png", "home.dark.png", "home-2.dark.png", "homepage.png", "other.png"]) writeFileSync(join(dir, f), "x");
    const expected = ["home-2.dark.png", "home-2.png", "home.dark.png", "home.png"].map((f) => join(dir, f));
    expect(mockupFrames(join(dir, "home.html"))).toEqual(expected);
    expect(mockupFrames(join(dir, "home.dark.png"))).toEqual(expected);
    expect(mockupFrames(join(dir, "missing", "x.html"))).toEqual([]);
  });

  test("phone frames pair with mobile screenshots, wider frames with desktop, dark with dark", () => {
    const dir = tempDir("motif-mockup-");
    writeFileSync(join(dir, "home.png"), pngHeader(820, 1728));
    writeFileSync(join(dir, "home.dark.png"), pngHeader(820, 1728));
    writeFileSync(join(dir, "home-2.png"), pngHeader(2880, 1800));
    const shots = ["index.mobile.png", "index.mobile.dark.png", "index.desktop.png", "index.desktop.dark.png"].map((f) => join(dir, "shots", f));
    const pairs = pairWithMockup(mockupFrames(join(dir, "home.html")), shots, join(dir, "compare"));
    expect(pairs.map((p) => [p.before.slice(dir.length + 1), p.after.slice(dir.length + 1), p.out.slice(dir.length + 1)])).toEqual([
      ["home-2.png", join("shots", "index.desktop.png"), join("compare", "home-2.png")],
      ["home.dark.png", join("shots", "index.mobile.dark.png"), join("compare", "home.dark.png")],
      ["home.png", join("shots", "index.mobile.png"), join("compare", "home.png")],
    ]);
  });
});

const browser = findBrowser();

/** A real 2× screenshot (400×600 px) of a 200×300 page. */
async function screenshotOf(body: string): Promise<Uint8Array> {
  const b = await launchBrowser(browser!.path);
  try {
    const page = await b.newPage();
    await page.setViewport(200, 300, 2);
    await page.goto("data:text/html," + encodeURIComponent(`<body style="margin: 0; background: #ffffff">${body}</body>`));
    return await page.screenshot();
  } finally {
    await b.close();
  }
}

describe.skipIf(!browser)("renderComparisons (needs Chrome, Edge or Chromium)", () => {
  test("side by side, with how much of the page changed", async () => {
    const dir = tempDir("motif-compare-");
    const box = (top: number) => `<div style="position: absolute; left: 20px; top: ${top}px; width: 100px; height: 100px; background: #e11d48"></div>`;
    writeFileSync(join(dir, "before.png"), await screenshotOf(box(20)));
    writeFileSync(join(dir, "after.png"), await screenshotOf(box(160)));
    writeFileSync(join(dir, "same.png"), await screenshotOf(box(20)));
    const results = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Before", "Now"],
      measure: true,
      pairs: [
        { before: join(dir, "before.png"), after: join(dir, "after.png"), out: join(dir, "out", "moved.png") },
        { before: join(dir, "before.png"), after: join(dir, "same.png"), out: join(dir, "out", "same.png") },
      ],
    });
    expect(results[0]!.changed).toBeGreaterThan(20); // two 100×100 boxes out of 200×300 ≈ 33 %
    expect(results[1]!.changed).toBe(0);
    // 400 px wide 2× screenshots are shown 200 CSS px wide per side, plus margins, captured at 2×.
    expect(pngSize(new Uint8Array(readFileSync(join(dir, "out", "moved.png")))).width).toBe((200 * 2 + 48) * 2);
  }, 60_000);

  test("mockup comparisons are side by side without a measure", async () => {
    const dir = tempDir("motif-compare-");
    writeFileSync(join(dir, "a.png"), await screenshotOf("<p>Mockup</p>"));
    writeFileSync(join(dir, "b.png"), await screenshotOf("<p>App</p>"));
    const [result] = await renderComparisons({
      browserPath: browser!.path,
      labels: ["Mockup", "The app now"],
      measure: false,
      pairs: [{ before: join(dir, "a.png"), after: join(dir, "b.png"), out: join(dir, "out.png") }],
    });
    expect(result!.changed).toBeUndefined();
    expect(pngSize(new Uint8Array(readFileSync(join(dir, "out.png")))).width).toBe(896);
  }, 60_000);

  test("nothing to compare is not an error", async () => {
    expect(await renderComparisons({ browserPath: browser!.path, labels: ["Before", "Now"], measure: true, pairs: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd cli && bun test test/compare.test.ts`
Expected: FAIL — `../src/shot/compare` not found.

- [ ] **Step 3: Implement the comparison module**

`cli/src/shot/compare.ts`:
```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { launchBrowser } from "../browser/cdp";
import { pngSize } from "../browser/png";
import { MAX_HEIGHT } from "./capture";

export interface ComparePair {
  before: string;
  after: string;
  /** Where the side-by-side image goes. */
  out: string;
}

export interface Comparison extends ComparePair {
  /** How much of the page looks different, in percent (before/after comparisons only). */
  changed?: number;
}

/** Pairs this run's screenshots with a saved set by file name; screenshots the set doesn't have are "added". */
export function pairWithSet(shots: string[], setDir: string, compareDir: string): { pairs: ComparePair[]; added: string[] } {
  const pairs: ComparePair[] = [];
  const added: string[] = [];
  for (const after of shots) {
    const before = join(setDir, basename(after));
    if (existsSync(before)) pairs.push({ before, after, out: join(compareDir, basename(after)) });
    else added.push(after);
  }
  return { pairs, added };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The PNGs `motif preview` made for a mockup. Given home.html or any of its PNGs: home.png, home-2.png, home.dark.png, … */
export function mockupFrames(mockup: string): string[] {
  const dir = dirname(mockup);
  const name = basename(mockup, extname(mockup)).replace(/(-\d+)?(\.dark)?$/, "");
  const frame = new RegExp(`^${escapeRegExp(name)}(-\\d+)?(\\.dark)?\\.png$`);
  try {
    return readdirSync(dir).filter((f) => frame.test(f)).sort().map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/** Pairs each mockup frame with this run's screenshot for the same viewport and scheme: phone frames ↔ mobile, wider frames ↔ desktop. */
export function pairWithMockup(frames: string[], shots: string[], compareDir: string): ComparePair[] {
  const pairs: ComparePair[] = [];
  for (const frame of frames) {
    const dark = frame.endsWith(".dark.png");
    const viewport = pngSize(new Uint8Array(readFileSync(frame))).width <= 1000 ? "mobile" : "desktop";
    const after = shots.find((s) => s.endsWith(`.${viewport}${dark ? ".dark" : ""}.png`));
    if (after) pairs.push({ before: frame, after, out: join(compareDir, basename(frame)) });
  }
  return pairs;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The tool's own page (not the app), so it uses fixed neutral colours.
function sideBySide(labels: [string, string], column: number, n: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; padding: 16px; background: #f4f4f5; color: #18181b; font: 600 14px/1.4 system-ui, sans-serif; }
.row { display: flex; gap: 16px; align-items: flex-start; }
figure { margin: 0; width: ${column}px; }
figcaption { margin: 0 0 8px; }
img { display: block; width: 100%; border: 1px solid #d4d4d8; background: #ffffff; }
#note { margin: 12px 0 0; font-weight: 400; }
</style></head><body><div class="row"><figure><figcaption>${escapeHtml(labels[0])}</figcaption><img id="a" src="/a.png?${n}"></figure><figure><figcaption>${escapeHtml(labels[1])}</figcaption><img id="b" src="/b.png?${n}"></figure></div><p id="note"></p></body></html>`;
}

/** In the page: the share of the two images that differs (scaled to 300 px wide), written under them and returned. */
const MEASURE = `(async () => {
  const a = document.getElementById("a"), b = document.getElementById("b");
  await Promise.all([a.decode(), b.decode()]);
  const w = 300;
  const ha = Math.max(1, Math.round((a.naturalHeight * w) / a.naturalWidth));
  const hb = Math.max(1, Math.round((b.naturalHeight * w) / b.naturalWidth));
  const h = Math.max(ha, hb);
  const pixels = (img, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, height);
    return g.getImageData(0, 0, w, h).data;
  };
  const pa = pixels(a, ha), pb = pixels(b, hb);
  let different = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 48) different++;
  }
  const changed = Math.round((different / (w * h)) * 1000) / 10;
  document.getElementById("note").textContent = changed < 0.1 ? "No visible change." : "About " + changed + "% of the page looks different.";
  return changed;
})()`;

/** Renders each pair side by side (labelled) into its out file; with measure, also says how much changed. */
export async function renderComparisons(opts: {
  browserPath: string;
  pairs: ComparePair[];
  labels: [string, string];
  measure: boolean;
}): Promise<Comparison[]> {
  if (opts.pairs.length === 0) return [];
  let current = opts.pairs[0]!;
  let html = "";
  const png = (file: string) => new Response(Bun.file(file), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (path === "/a.png") return png(current.before);
      if (path === "/b.png") return png(current.after);
      return new Response("Not found", { status: 404 });
    },
  });
  const results: Comparison[] = [];
  try {
    const browser = await launchBrowser(opts.browserPath);
    try {
      const page = await browser.newPage();
      for (const [n, pair] of opts.pairs.entries()) {
        current = pair;
        const width = pngSize(new Uint8Array(readFileSync(pair.after))).width;
        // Phone screenshots are 2× (780 px → 390 CSS px per side); wide ones are shown 720 CSS px wide.
        const column = width > 1000 ? 720 : Math.round(width / 2);
        const pageWidth = column * 2 + 48;
        html = sideBySide(opts.labels, column, n);
        await page.setViewport(pageWidth, 900, 2);
        await page.goto(`http://127.0.0.1:${server.port}/?${n}`);
        const changed = opts.measure ? await page.evaluate<number>(MEASURE) : undefined;
        const height = Math.min(await page.evaluate<number>("document.documentElement.scrollHeight"), MAX_HEIGHT);
        mkdirSync(dirname(pair.out), { recursive: true });
        writeFileSync(pair.out, await page.screenshot({ x: 0, y: 0, width: pageWidth, height }));
        results.push(changed === undefined ? { ...pair } : { ...pair, changed });
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.stop(true);
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd cli && bun test test/compare.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Write the failing command tests**

In `cli/test/shot-command.test.ts`:
- change the import lines to:
  ```ts
  import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
  import { dirname, join } from "node:path";
  import { parseRoutes, runShot, type ShotDeps } from "../src/commands/shot";
  import type { AuditIssue } from "../src/shot/audit";
  import type { CaptureOptions, RouteResult } from "../src/shot/capture";
  import type { ComparePair } from "../src/shot/compare";
  import { devCommand } from "../src/shot/devserver";
  ```
- replace the whole `fakes` function with this version (it also writes the screenshot files, so `--save` has something to copy, and records comparisons):
  ```ts
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
  ```
- add, after `const ctx = …`:
  ```ts
  /** Just enough of a PNG for pngSize. */
  function pngHeader(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
  }
  ```
- append:
  ```ts
  describe("motif shot: the mockup while building, before and after a rebuild", () => {
    test("--save keeps this run's screenshots as a named set", async () => {
      const root = makeProject({});
      const r = await runShot(root, ctx({ url: "http://localhost:3000", routes: "/,/settings", save: "before" }), fakes().deps);
      expect(r.exitCode).toBe(0);
      expect(readdirSync(join(root, "design/shots/before")).sort()).toEqual(["index.mobile.png", "settings.mobile.png"]);
      expect(r.data.saved).toBe("design/shots/before");
      expect(r.text).toContain("--against before");
      expect((await runShot(root, ctx({ url: "http://localhost:3000", save: "../x" }), fakes().deps)).exitCode).toBe(2);
    });

    test("--against a saved set compares page by page, then --save can replace the set", async () => {
      const root = makeProject({ "design/shots/before/index.mobile.png": "old" });
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
  ```

Run: `cd cli && bun test test/shot-command.test.ts`
Expected: FAIL — typecheck-level errors don't stop Bun, but the new tests fail (`saved`, `comparisons` are undefined; `compare` is never called).

- [ ] **Step 6: Wire comparisons into the command**

In `cli/src/commands/shot.ts`:
- change the `node:fs` and `node:path` imports to:
  ```ts
  import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
  import { basename, join, relative, resolve, sep } from "node:path";
  ```
  and add `import { mockupFrames, pairWithMockup, pairWithSet, renderComparisons, type ComparePair, type Comparison } from "../shot/compare";`
- add `compare: typeof renderComparisons;` to `interface ShotDeps` (after `capture`), and `compare: renderComparisons,` to `defaultDeps`
- add below `const rendered = …`:
  ```ts
  const SET_NAME = /^(?!compare$)[a-z0-9][a-z0-9-]*$/i;
  const isDir = (path: string) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };

  type Against = { kind: "set"; name: string; dir: string } | { kind: "mockup"; file: string; frames: string[] };

  /** What --against names: a saved set of screenshots, or a mockup (its .html, or one of its PNGs from motif preview). */
  function resolveAgainst(cwd: string, outDir: string, value: string, pages: number): Against | { error: string } {
    if (SET_NAME.test(value) && isDir(join(outDir, value))) return { kind: "set", name: value, dir: join(outDir, value) };
    const file = resolve(cwd, value);
    if (/\.(png|html)$/i.test(file) && existsSync(file)) {
      if (pages !== 1) return { error: "Compare one page with a mockup at a time: add --routes with that page, like --routes /settings." };
      const frames = mockupFrames(file);
      if (frames.length === 0) return { error: `There are no PNGs of this mockup yet. Make them first: motif preview ${value} --png-only` };
      return { kind: "mockup", file, frames };
    }
    return {
      error: `Nothing to compare with: "${value}" isn't a saved set of screenshots (keep one with --save ${SET_NAME.test(value) ? value : "before"}) or a mockup (.html or .png).`,
    };
  }
  ```
- move the line `const outDir = resolve(cwd, typeof flags.out === "string" ? flags.out : join("design", "shots"));` up to just after the `if (discovery.skipped.length > 0) { … }` block, and add right after it:
  ```ts
  const save = typeof flags.save === "string" ? flags.save : undefined;
  if (save !== undefined && !SET_NAME.test(save)) {
    return usage("--save needs a short name made of letters, digits and dashes, like --save before.", { error: "usage" });
  }
  const against = typeof flags.against === "string" ? resolveAgainst(cwd, outDir, flags.against, routes.length) : undefined;
  if (against && "error" in against) return usage(against.error, { error: "usage" });
  ```
- insert just before `lines.push(...notes.map((n) => \`• ${n}\`));`:
  ```ts
  const thisRun = captured.routes.flatMap((r) => r.shots);
  let comparisons: Comparison[] = [];
  let added: string[] = [];
  if (against) {
    const compareDir = join(outDir, "compare", against.kind === "set" ? against.name : "mockup");
    let pairs: ComparePair[];
    if (against.kind === "set") {
      const paired = pairWithSet(thisRun, against.dir, compareDir);
      pairs = paired.pairs;
      added = paired.added;
    } else {
      pairs = pairWithMockup(against.frames, thisRun, compareDir);
    }
    try {
      comparisons = await deps.compare({
        browserPath: browser.path,
        pairs,
        labels: against.kind === "set" ? [`Before ("${against.name}")`, "Now"] : ["Mockup", "The app now"],
        measure: against.kind === "set",
      });
    } catch (e) {
      notes.push(`Couldn't make the side-by-side images: ${message(e)}`);
    }
    const where = projectPath(cwd, compareDir);
    if (against.kind === "set") {
      const changed = comparisons.filter((c) => (c.changed ?? 0) >= 0.1);
      const newPart = added.length > 0 ? `, ${added.length} new` : "";
      lines.push(`Compared with "${against.name}": ${changed.length} changed, ${comparisons.length - changed.length} with no visible change${newPart} (side by side in ${where}/)`);
      for (const c of changed) lines.push(`  ${basename(c.after)}  ${c.changed}% different`);
    } else if (comparisons.length > 0) {
      lines.push(`Side by side with the mockup ${projectPath(cwd, against.file)}: ${comparisons.length} ${comparisons.length === 1 ? "image" : "images"} in ${where}/`);
    } else {
      notes.push("None of the mockup's frames matched these screenshots (phone frames pair with mobile, wider frames with desktop).");
    }
  }
  let saved: string | undefined;
  if (save) {
    const setDir = join(outDir, save);
    rmSync(setDir, { recursive: true, force: true });
    mkdirSync(setDir, { recursive: true });
    for (const shot of thisRun) copyFileSync(shot, join(setDir, basename(shot)));
    saved = projectPath(cwd, setDir);
    lines.push(`✓ Kept these screenshots as "${save}" (${saved}/). After changes, compare with --against ${save}.`);
  }
  ```
- in the returned `data`, add after the audit spread:
  ```ts
      ...(against
        ? {
            comparisons: comparisons.map((c) => ({
              before: projectPath(cwd, c.before),
              after: projectPath(cwd, c.after),
              image: projectPath(cwd, c.out),
              ...(c.changed !== undefined ? { changed: c.changed } : {}),
            })),
            added: added.map((a) => projectPath(cwd, a)),
          }
        : {}),
      ...(saved ? { saved } : {}),
  ```

In `cli/src/main.ts`:
- add to the `parseArgs` `options`: `save: { type: "string" }, against: { type: "string" },`
- add to the `flags` object: `save: values.save, against: values.against,`
- add to the `Shot options:` block in `HELP`:
  ```
    --save <name>     Keep these screenshots as a named set, e.g. --save before
    --against <what>  Side by side with a saved set (after a rebuild) or a mockup (while building)
  ```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd cli && bun test test/shot-command.test.ts test/compare.test.ts test/main.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 8: The whole flow, end to end**

In `cli/test/shot-e2e.test.ts`:
- change the `node:fs` import to `import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";`
- move the object passed to `makeProject` in the first test into a constant above the `describe` and use it there:
  ```ts
  const FIXTURE = {
    "package.json": JSON.stringify({ name: "fixture", private: true, scripts: { dev: "bun server.ts" }, dependencies: { react: "^19", "react-dom": "^19" }, devDependencies: { vite: "^6" } }),
    "bun.lock": "",
    "node_modules/.keep": "",
    "server.ts": SERVER,
  };
  ```
  (the first test becomes `const root = makeProject(FIXTURE);`)
- append inside the `describe`:
  ```ts
  test("the app next to its mockup while building, and before and after a change", async () => {
    const root = makeProject(FIXTURE);
    const run = (...args: string[]) => {
      const r = Bun.spawnSync([bin, ...args, "--json", "--cwd", root], { env: { ...process.env, MOTIF_HOME: tempDir("motif-home-") } });
      return { code: r.exitCode, out: JSON.parse(r.stdout.toString()) };
    };

    // While building: the mockup's PNGs, then the page next to them.
    mkdirSync(join(root, "design", "previews"), { recursive: true });
    writeFileSync(join(root, "design/previews/home.html"), readFileSync(join(REPO_ROOT, "skill/preview-kit/template.html"), "utf8"));
    expect(run("preview", "design/previews/home.html", "--png-only", "--preset", "minimal").code).toBe(0);
    const side = run("shot", "--routes", "/", "--against", "design/previews/home.html");
    expect(side.out.comparisons.map((c: { image: string }) => c.image)).toEqual(["design/shots/compare/mockup/home.dark.png", "design/shots/compare/mockup/home.png"]);
    expect(existsSync(join(root, "design/shots/compare/mockup/home.png"))).toBe(true);

    // Before and after a change.
    expect(run("shot", "--routes", "/,/settings", "--save", "before").out.saved).toBe("design/shots/before");
    writeFileSync(join(root, "server.ts"), SERVER.replace("<h1>Home</h1>", "<h1>Welcome home</h1><p>New intro text</p>"));
    const after = run("shot", "--routes", "/,/settings", "--against", "before");
    const changed = Object.fromEntries(after.out.comparisons.map((c: { after: string; changed: number }) => [c.after.split("/").pop(), c.changed]));
    expect(changed["index.mobile.png"]).toBeGreaterThan(0.1);
    expect(changed["settings.mobile.png"]).toBe(0);
    expect(existsSync(join(root, "design/shots/compare/before/index.mobile.png"))).toBe(true);
  }, 240_000);
  ```

Run: `cd cli && bun test test/shot-e2e.test.ts`
Expected: PASS (skipped only without a browser or without `bun` on PATH).

- [ ] **Step 9: README**

In `README.md`, replace the `motif shot` row with:
```markdown
| `motif shot` | Screenshots your real app's pages at phone and desktop widths in light and dark (starting its dev server if needed); `--audit` checks contrast, tap-target sizes and reduced motion as rendered; `--against` puts them side by side with the mockup while you build, or with an earlier run (`--save before`) after a rebuild |
```

- [ ] **Step 10: Run everything**

Run: `cd cli && bun test --timeout 120000 && bun run typecheck && bun run build`
Expected: all tests PASS; the build succeeds.

- [ ] **Step 11: Commit**

```bash
git add cli/src/shot/compare.ts cli/src/commands/shot.ts cli/src/main.ts cli/test/compare.test.ts cli/test/shot-command.test.ts cli/test/shot-e2e.test.ts README.md
git commit -m "feat(shot): side by side with the mockup while building, and before/after a rebuild"
```

---

## After this plan

- **Part 1C is complete**: previews before code (1C-1) and proof after code (1C-2).
- **1D Skill content** tells agents when to run `motif shot --audit` (init step 7, feature step 6, review step 3), to show the mockup next to the app while building (`--against design/previews/<screen>.html`), to keep a set before any rebuild (`--save before`) and show before/after afterwards (`--against before`), how to show the screenshots, how to merge `design/shots/audit.json` findings into `design/reviews/<date>-<scope>.json`, and to ask before `motif browser install` when `status` is `needs_browser`.
- **1E Evals** use `shot` for Test D ("all starter screens exist and render in `shot`") and the audit for Test C's exact findings.
- Deferred from 1C-1 and still open: the 1C-1 minors (PNG name collisions, quirks mode without `</head>`, skeleton pulse under reduced motion, stale live PNGs, installer polish, `MOTIF_HOME=""`, `MOTIF_BROWSER=none` wording) and the end-to-end check of a browser installed by `motif browser install`, which the developer asked to keep until the end of all plans.

