import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { onExit } from "../cleanup";
import { windowsExe } from "../system";
import { installRoot, packageManager, readJson, type PackageManager } from "../project/package";
import { isExpoApp } from "../stacks/react-native/project";
import type { WebStack } from "../stacks/web";

export { addPackages, packageManager, type PackageManager } from "../project/package";

export interface DevCommand {
  command: string[];
  /** How a person would type it, e.g. "pnpm run dev". */
  display: string;
  packageManager: PackageManager;
  /** Variables the server needs besides the usual (Expo: CI=1, so it doesn't prompt). */
  env?: Record<string, string>;
}

export interface DevServer {
  url: string;
  pid: number;
  stop(): Promise<void>;
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/** A port nothing is listening on, for a server that must be told one. */
function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port!;
  probe.stop(true);
  return port;
}

/** Expo doesn't prompt, and sends nothing to its telemetry, when Motif starts it. */
const EXPO_ENV = { CI: "1", EXPO_NO_TELEMETRY: "1" };
/** The refusal when a web stack's devScript finds no script in the app that starts it. */
const NO_DEV_SCRIPT = "This app has no script in package.json that starts its dev server. Start it yourself and pass its address with --url.";
const noScript = (script: string) => `This app has no "${script}" script in package.json. Start it yourself and pass its address with --url.`;

/** How each package manager runs a program from the app's dependencies. */
const EXEC: Record<PackageManager, string[]> = { npm: ["npx"], pnpm: ["pnpm", "exec"], yarn: ["yarn"], bun: ["bunx"] };

/**
 * How to start this app's dev server, or a plain explanation of why Motif can't. A web stack's devScript names the
 * script to run and its arguments (after --), given the port; without one, the app's "dev" script runs.
 */
export function devCommand(
  appDir: string,
  env: {
    platform?: NodeJS.Platform;
    which?: (cmd: string) => string | null;
    vars?: Record<string, string | undefined>;
    port?: number;
    devScript?: WebStack["devScript"];
  } = {},
): DevCommand | { error: string } {
  const platform = env.platform ?? process.platform;
  const which = env.which ?? ((cmd: string) => Bun.which(cmd));
  const pkg = readJson<{ scripts?: Record<string, unknown> }>(join(appDir, "package.json"));
  if (!pkg) return { error: "This app has no readable package.json, so Motif can't start it. Start it yourself and pass its address with --url." };
  const expo = isExpoApp(appDir);
  const own = !expo && env.devScript ? env.devScript(appDir, env.port ?? freePort()) : undefined;
  if (own === null) return { error: NO_DEV_SCRIPT };
  const wanted = own?.script ?? "dev";
  if (!expo && typeof pkg.scripts?.[wanted] !== "string") return { error: noScript(wanted) };
  const root = installRoot(appDir);
  const pm = packageManager(appDir);
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
  // An Expo app starts its web target: its "web" script, else expo itself on a port Motif chose.
  const script = expo && typeof pkg.scripts?.web === "string" ? "web" : expo ? null : wanted;
  const [bin, ...pre] = script === null ? EXEC[pm] : [pm, "run", script];
  const args = script === null ? ["expo", "start", "--web", "--port", String(env.port ?? freePort())] : own?.args.length ? ["--", ...own.args] : [];
  const display = [bin, ...pre, ...args].join(" ");
  // npm, pnpm and yarn are .cmd scripts on Windows, and only cmd.exe can run those.
  const runner = which(bin!);
  if (!runner && pm !== "bun") return { error: `This app uses ${pm}, and ${bin} isn't on PATH. Install Node.js, or start the app yourself and pass its address with --url.` };
  const command =
    platform === "win32" && pm !== "bun"
      ? [windowsExe("cmd.exe", env.vars), "/d", "/s", "/c", display]
      : runner
        ? [runner, ...pre, ...args]
        : [exe, "x", ...args]; // bun without bunx: "bun x" is the same program
  return { command, display, packageManager: pm, ...(expo ? { env: EXPO_ENV } : {}) };
}

/** The first local address a dev server printed (Vite, Next.js and most others print one), or null. */
export function findLocalUrl(output: string): string | null {
  return findLocalAddress(output)?.url ?? null;
}

/**
 * The local address a dev server printed, and whether it was on a line that says "Local": where several programs print
 * addresses (a dev server next to a mock API), that line is the app's.
 */
export function findLocalAddress(output: string): { url: string; onLocalLine: boolean } | null {
  const address = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|0\.0\.0\.0)(?::\d+)?(?:\/[^\s'"`<>]*)?/;
  const text = output.replace(ANSI, "");
  const local = text.split(/\r?\n/).find((line) => /\bLocal\b/i.test(line) && address.test(line));
  const m = (local ?? text).match(address);
  if (!m) return null;
  return { url: m[0].replace(/[.,;)]+$/, "").replace("//0.0.0.0", "//127.0.0.1").replace("//[::]", "//[::1]"), onLocalLine: local !== undefined };
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

/** The HTTP status at the address, or null when nothing answers (a local dev server's own https certificate is fine). */
async function answerStatus(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), tls: { rejectUnauthorized: false } });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

/** Whether something answers at the address (a local dev server's own https certificate is fine). */
export async function answers(url: string): Promise<boolean> {
  return (await answerStatus(url)) !== null;
}

/**
 * Starts the dev server and waits until it answers. With buildingStatus (Nuxt's 503), an answer with that status is the
 * server's loading screen while it builds the app, not the app: it waits on for another.
 */
export async function startDevServer(opts: { cwd: string; command: string[]; timeoutMs?: number; env?: Record<string, string>; buildingStatus?: number }): Promise<DevServer> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const proc = spawn(opts.command[0]!, opts.command.slice(1), {
    cwd: opts.cwd,
    // BROWSER=none: dev servers that open a browser tab on start shouldn't.
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1", ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32", // its own process group, so the whole tree can be stopped
    windowsHide: true,
  });
  let output = "";
  const collect = (chunk: string) => {
    output = (output + chunk).slice(-20_000);
  };
  // Decoded as a stream: a character split between two pieces of output arrives whole.
  proc.stdout!.setEncoding("utf8");
  proc.stderr!.setEncoding("utf8");
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
      // Windows, where the id could by now be another program's.) Asked to stop first, as above.
      killTree(proc.pid);
      await Bun.sleep(1000);
      killTree(proc.pid, true);
    }
    cancelExitHook();
  };

  const deadline = Date.now() + timeoutMs;
  let url: string | null = null;
  // An address not on a "Local" line (another program's, printed first) is taken only if no Local line comes soon.
  let otherSince: number | null = null;
  // Whether the last answer was the server's loading screen.
  let building = false;
  try {
    while (Date.now() < deadline) {
      if (failure.error) throw new Error(`Couldn't run "${opts.command.join(" ")}": ${failure.error.message}`);
      if (!running()) {
        await Promise.race([closed, Bun.sleep(500)]); // let the last output arrive
        throw new Error(`The dev server stopped (exit code ${proc.exitCode ?? proc.signalCode}) before it was ready.${tail()}`);
      }
      const found = findLocalAddress(output);
      if (found && !found.onLocalLine) otherSince ??= Date.now();
      url = found && (found.onLocalLine || Date.now() - otherSince! >= 1500) ? found.url : null;
      const status = url ? await answerStatus(url) : null;
      building = status !== null && status === opts.buildingStatus;
      if (status !== null && !building) return { url: url!, pid: proc.pid!, stop };
      await Bun.sleep(250);
    }
    const limit = `${Math.round(timeoutMs / 1000)} s`;
    if (building) throw new Error(`The dev server at ${url} was still building the app after ${limit} (it answered HTTP ${opts.buildingStatus}). If the page really answers ${opts.buildingStatus}, start the app yourself and pass its address with --url.${tail()}`);
    throw new Error(`The dev server didn't ${url ? `answer at ${url}` : "say where it's running"} within ${limit}.${tail()}`);
  } catch (e) {
    await stop();
    throw e;
  }
}
