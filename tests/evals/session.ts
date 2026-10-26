// Runs one headless Claude Code session: the prompt on standard input, every event saved to a transcript, isolation checked as soon as
// the session starts, a time limit, and the developer's usage limit noticed. The whole process tree is stopped on a time limit or Ctrl+C.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { onExit } from "../../cli/src/cleanup";
import { killTree } from "../../cli/src/shot/devserver";
import { initInfo, isolationProblems, resultInfo, usageLimit, type InitInfo, type ResultInfo } from "./claude";

export interface SessionSpec {
  /** The program and anything before the session's own arguments (a stand-in for Claude Code in tests). */
  command: string[];
  args: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  transcript: string;
  timeoutMs: number;
  /** What the first event must show; with no pluginDir (the grader, Test A's a-* sessions), no plugin may be loaded. */
  expect: { pluginDir?: string; auto: boolean; tools: string[]; personal?: string[] };
}

export type SessionEnd = "finished" | "turn-cap" | "budget-cap" | "time-limit" | "usage-limit" | "not-isolated" | "failed";

export interface SessionOutcome { end: SessionEnd; init?: InitInfo; result?: ResultInfo; problems: string[]; resetsAt?: number; minutes: number }

/**
 * The process groups a process's descendants run in, from `ps -A -o pid=,ppid=,pgid=`: Claude Code starts each shell
 * command in a group of its own, which outlives Claude Code's (a dev server a session started).
 */
export function descendantGroups(root: number, ps: string): number[] {
  const children = new Map<number, { pid: number; pgid: number }[]>();
  for (const line of ps.split("\n")) {
    const [pid, ppid, pgid] = line.trim().split(/\s+/).map(Number);
    if (!pid || !pgid || ppid === undefined || Number.isNaN(ppid)) continue;
    children.set(ppid, [...(children.get(ppid) ?? []), { pid, pgid }]);
  }
  const groups = new Set<number>();
  const seen = new Set<number>();
  for (const todo = [root]; todo.length > 0; ) {
    const p = todo.pop()!;
    if (seen.has(p)) continue;
    seen.add(p);
    for (const c of children.get(p) ?? []) {
      groups.add(c.pgid);
      todo.push(c.pid);
    }
  }
  return [...groups];
}

/** The groups a process's descendants run in now (macOS, Linux); none on Windows, where taskkill /T follows the tree. */
function groupsNow(pid: number): number[] {
  if (process.platform === "win32") return [];
  const r = spawnSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], { encoding: "utf8" });
  return r.status === 0 ? descendantGroups(pid, r.stdout) : [];
}

export async function runSession(spec: SessionSpec): Promise<SessionOutcome> {
  mkdirSync(dirname(spec.transcript), { recursive: true });
  writeFileSync(spec.transcript, "");
  const started = Date.now();
  let proc: ChildProcess;
  try {
    proc = spawn(spec.command[0]!, [...spec.command.slice(1), ...spec.args], {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32", // its own process group, so the whole tree can be stopped
      windowsHide: true,
    });
  } catch (e) {
    return { end: "failed", problems: [`Claude Code couldn't start: ${(e as Error).message}`], minutes: 0 };
  }
  // The groups its commands run in, noted while it's alive, so what it started can be stopped after it ends.
  const groups = new Set<number>();
  const note = () => {
    if (proc.pid) for (const g of groupsNow(proc.pid)) groups.add(g);
  };
  const stopGroups = () => {
    for (const g of groups) {
      try {
        process.kill(-g, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  };
  // Asked first, so Claude Code can stop what it started, and made to a few seconds later; at once when it isn't
  // isolated or the runner is stopping (Ctrl+C).
  let forced: ReturnType<typeof setTimeout> | undefined;
  const stop = (now = false) => {
    if (!proc.pid) return;
    note();
    if (now) {
      killTree(proc.pid, true);
      stopGroups();
      return;
    }
    if (forced) return;
    killTree(proc.pid);
    forced = setTimeout(() => killTree(proc.pid!, true), 3000);
    forced.unref?.();
  };
  const cancelExitHook = onExit(() => stop(true));

  let init: InitInfo | undefined;
  let result: ResultInfo | undefined;
  let limit: { resetsAt?: number } | null = null;
  let notIsolated = false;
  let timedOut = false;
  const problems: string[] = [];
  let pending = "";
  let stderr = "";

  const onEvent = (line: string) => {
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      return;
    }
    const i = initInfo(e);
    if (!init && !i && !notIsolated) {
      // Fail closed: without the first event, nothing about the session can be checked.
      problems.push(
        `Claude Code's first event didn't describe the session (it was ${JSON.stringify((e as any)?.type ?? null)}${(e as any)?.subtype ? `/${JSON.stringify((e as any).subtype)}` : ""}), so the runner can't check the session is isolated. This version of Claude Code may need the runner updated.`,
      );
      notIsolated = true;
      stop(true);
      return;
    }
    if (i && !init) {
      init = i;
      const p = isolationProblems(i, spec.expect);
      if (p.length > 0) {
        problems.push(...p);
        notIsolated = true;
        stop(true);
      }
    }
    limit ??= usageLimit(e);
    const r = resultInfo(e);
    if (r) {
      result = r;
      note();
    }
  };

  // Decoded as a stream: a character split between two pieces of output arrives whole.
  proc.stdout!.setEncoding("utf8");
  proc.stderr!.setEncoding("utf8");
  proc.stdout!.on("data", (text: string) => {
    appendFileSync(spec.transcript, text);
    pending += text;
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const l of lines) if (l.trim()) onEvent(l);
  });
  proc.stderr!.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  let spawnError: Error | undefined;
  const ended = new Promise<number | null>((resolve) => {
    proc.once("close", (code) => resolve(code));
    proc.once("error", (e) => {
      spawnError = e;
      resolve(null);
    });
  });
  proc.stdin!.on("error", () => {}); // a session that exits early closes its input
  proc.stdin!.end(spec.prompt);
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, spec.timeoutMs);
  const code = await ended;
  clearTimeout(timer);
  if (forced) clearTimeout(forced);
  // Whatever it left running (a dev server, a watcher) goes too: on macOS and Linux its process group outlives it.
  if (proc.pid && process.platform !== "win32") killTree(proc.pid, true);
  stopGroups();
  cancelExitHook();
  if (pending.trim()) onEvent(pending);

  // Set inside the event handler, which TypeScript's narrowing can't see.
  const hit = limit as { resetsAt?: number } | null;
  const base = { init, result, problems, minutes: Math.round((Date.now() - started) / 600) / 100, ...(hit?.resetsAt ? { resetsAt: hit.resetsAt } : {}) };
  if (notIsolated) return { ...base, end: "not-isolated" };
  if (hit) return { ...base, end: "usage-limit" };
  if (timedOut) return { ...base, end: "time-limit" };
  if (result?.subtype === "success" && !result.isError) return { ...base, end: "finished" };
  if (result?.subtype === "error_max_turns") return { ...base, end: "turn-cap" };
  if (result?.subtype === "error_max_budget_usd") return { ...base, end: "budget-cap" };
  const why = spawnError?.message ?? (stderr.trim().split("\n").slice(-5).join(" ") || result?.text || `exit code ${code}`);
  return { ...base, problems: [...problems, `Claude Code stopped unexpectedly: ${why}`], end: "failed" };
}
