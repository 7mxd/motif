import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { onExit } from "../cleanup";
import { windowsExe } from "../system";

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
  env: { platform?: NodeJS.Platform; which?: (cmd: string) => string | null; vars?: Record<string, string | undefined> } = {},
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
  // Yarn Plug'n'Play installs into .pnp.cjs instead of node_modules.
  const installed = (dir: string) => ["node_modules", ".pnp.cjs", ".pnp.js"].some((f) => existsSync(join(dir, f)));
  if (!installed(appDir) && !installed(root)) {
    return { error: `This app's dependencies aren't installed yet. Run "${pm} install" in its folder, then try again.` };
  }
  const display = `${pm} run dev`;
  // npm, pnpm and yarn are .cmd scripts on Windows, and only cmd.exe can run those.
  const command = platform === "win32" && pm !== "bun" ? [windowsExe("cmd.exe", env.vars), "/d", "/s", "/c", display] : [exe, "run", "dev"];
  return { command, display, packageManager: pm };
}

/** The first local address a dev server printed (Vite, Next.js and most others print one), or null. */
export function findLocalUrl(output: string): string | null {
  const address = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|0\.0\.0\.0)(?::\d+)?(?:\/[^\s'"`<>]*)?/;
  const text = output.replace(ANSI, "");
  // Where several programs print addresses (a dev server next to a mock API), the line that says "Local" is the app's.
  const local = text.split(/\r?\n/).find((line) => /\bLocal\b/i.test(line) && address.test(line));
  const m = (local ?? text).match(address);
  if (!m) return null;
  return m[0].replace(/[.,;)]+$/, "").replace("//0.0.0.0", "//127.0.0.1").replace("//[::]", "//[::1]");
}

// Lines that bury the cause: package-manager wrap-up, stack frames, object dumps, the Node version banner.
const NOISE = /^(npm (error|ERR!|warn)|\s*ELIFECYCLE|\s+at |\s*(code|errno|syscall|path|requireStack):|\s*[}\]]|Node\.js v\d)/i;
const CAUSE = /error|not recognized|cannot|not found|failed|EADDRINUSE|in use/i;

/** The few lines of a dev server's output that say why it stopped: its first error, then the last useful lines. */
export function outputSummary(output: string): string[] {
  const lines = output.replace(ANSI, "").split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const useful = lines.filter((l) => !NOISE.test(l));
  const cause = useful.find((l) => CAUSE.test(l));
  const tail = useful.slice(-8);
  return cause && !tail.includes(cause) ? [cause, ...tail.slice(-7)] : tail;
}

/** Stops a process and everything it started. */
export function killTree(pid: number, force = false): void {
  try {
    if (process.platform === "win32") {
      spawnSync(windowsExe("taskkill.exe"), ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-pid, force ? "SIGKILL" : "SIGTERM"); // the server runs in its own process group
    }
  } catch {
    // Already gone.
  }
}

/** Whether something answers at the address (a local dev server's own https certificate is fine). */
export async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), tls: { rejectUnauthorized: false } });
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
    const lines = outputSummary(output);
    return lines.length > 0 ? `\nIt said:\n  ${lines.join("\n  ")}` : "";
  };
  const stop = async () => {
    if (proc.pid && running()) {
      killTree(proc.pid);
      const done = await Promise.race([exited.then(() => true), Bun.sleep(3000).then(() => false)]);
      if (!done) killTree(proc.pid, true);
    } else if (proc.pid && process.platform !== "win32") {
      // The first process ended, but what it started in the background ("tsc -w & vite") is still in its group. (Not on
      // Windows, where the id could by now be another program's.)
      killTree(proc.pid, true);
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
