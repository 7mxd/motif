// Running programs for the evals (npm, npx, git, the motif tool) with a time limit. On Windows, .cmd programs go through cmd.exe.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { onExit } from "../../cli/src/cleanup";
import { spawnArgs } from "../../cli/src/commands/connect";
import { killTree } from "../../cli/src/shot/devserver";

export interface RunResult { code: number; stdout: string; stderr: string; timedOut: boolean }
export type Run = (cmd: string[], cwd: string, timeoutMs: number, env?: Record<string, string | undefined>) => Promise<RunResult>;

export const tail = (r: RunResult, lines = 8): string => `${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-lines).join("\n");

/** npm, npx and other .cmd programs run through cmd.exe on Windows (spawnArgs quotes each argument); everything else starts directly. */
export function commandLine(
  cmd: string[],
  which: (c: string) => string | null = (c) => Bun.which(c),
  platform: NodeJS.Platform = process.platform,
): { cmd: string[]; verbatim: boolean } {
  return spawnArgs(which(cmd[0]!) ?? cmd[0]!, cmd.slice(1), platform);
}

const KEEP = 5_000_000;

export const runCmd: Run = (cmd, cwd, timeoutMs, env) =>
  new Promise((resolve) => {
    const line = commandLine(cmd);
    let proc: ChildProcess;
    try {
      proc = spawn(line.cmd[0]!, line.cmd.slice(1), {
        cwd,
        env: env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
        windowsVerbatimArguments: line.verbatim,
      });
    } catch (e) {
      resolve({ code: 127, stdout: "", stderr: (e as Error).message, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;
    proc.stdout!.on("data", (c: Buffer) => {
      stdout = (stdout + c.toString()).slice(-KEEP);
    });
    proc.stderr!.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-KEEP);
    });
    const stop = () => {
      if (proc.pid) killTree(proc.pid, true);
    };
    const cancelExitHook = onExit(stop);
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const finish = (code: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancelExitHook();
      resolve({ code, stdout, stderr, timedOut });
    };
    proc.once("error", (e) => {
      stderr += e.message;
      finish(127);
    });
    proc.once("close", (code) => finish(code ?? 1));
  });

export interface MotifResult { code: number; json: any; output: string }
export type Motif = (args: string[], cwd: string, timeoutMs?: number) => Promise<MotifResult>;

/** Runs the motif tool with --json and reads the one JSON line it prints last. */
export function motifRunner(command: string[], run: Run = runCmd, env?: Record<string, string | undefined>): Motif {
  return async (args, cwd, timeoutMs = 600_000) => {
    const r = await run([...command, ...args, "--json"], cwd, timeoutMs, env);
    let json: any = null;
    try {
      json = JSON.parse(r.stdout.trim().split("\n").pop() ?? "");
    } catch {
      // Not JSON: the text stays in output.
    }
    return { code: r.code, json, output: tail(r, 20) };
  };
}

const LOCKFILES: [string, string][] = [["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"]];

export function packageManager(dir: string): string {
  return LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1] ?? "npm";
}
