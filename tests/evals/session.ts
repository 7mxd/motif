// Runs one headless Claude Code session: the prompt on standard input, every event saved to a transcript, isolation checked as soon as
// the session starts, a time limit, and the developer's usage limit noticed. The whole process tree is stopped on a time limit or Ctrl+C.
import { spawn, type ChildProcess } from "node:child_process";
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
  expect: { pluginDir?: string; auto: boolean };
}

export type SessionEnd = "finished" | "turn-cap" | "budget-cap" | "time-limit" | "usage-limit" | "not-isolated" | "failed";

export interface SessionOutcome { end: SessionEnd; init?: InitInfo; result?: ResultInfo; problems: string[]; resetsAt?: number; minutes: number }

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
  const stop = () => {
    if (proc.pid) killTree(proc.pid, true);
  };
  const cancelExitHook = onExit(stop);

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
    if (i && !init) {
      init = i;
      const p = isolationProblems(i, spec.expect);
      if (p.length > 0) {
        problems.push(...p);
        notIsolated = true;
        stop();
      }
    }
    limit ??= usageLimit(e);
    result = resultInfo(e) ?? result;
  };

  proc.stdout!.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    appendFileSync(spec.transcript, text);
    pending += text;
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const l of lines) if (l.trim()) onEvent(l);
  });
  proc.stderr!.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
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
