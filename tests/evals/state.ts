// A run's record in tests/evals/results/<id>/run.json: every case's progress, so a run stopped by a usage limit or Ctrl+C
// continues where it left off (--resume <id>).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Grade } from "./grade";
import type { Workspace } from "./workspace";

export type CaseStatus = "pending" | "session-done" | "graded" | "interrupted" | "error";

export interface SessionSummary { end: string; model: string; turns: number; minutes: number; costUsd: number; denials: string[]; problems: string[] }

export interface CaseState { status: CaseStatus; attempts: number; workspace?: Workspace; session?: SessionSummary; grade?: Grade; note?: string }

export interface RunOptions { model?: string; judgeModel?: string; keep: boolean; maxTurns?: number; work: string }

export interface RunState {
  motifEvalRun: 1;
  id: string;
  commit: string;
  dirty: boolean;
  started: string;
  claudeVersion: string;
  /** Resumes on another commit, or with uncommitted changes, so the report says the cases ran on different code. */
  resumes: { at: string; commit: string; dirty: boolean }[];
  options: RunOptions;
  cases: Record<string, CaseState>;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const newRunId = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const runDir = (results: string, id: string) => join(results, id);

export function saveRun(results: string, state: RunState): void {
  const dir = runDir(results, state.id);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "run.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function loadRun(results: string, id: string): RunState | { error: string } {
  const file = join(runDir(results, id), "run.json");
  if (!/^[\w-]+$/.test(id) || !existsSync(file)) return { error: `There's no run "${id}" in ${results}.` };
  try {
    const state = JSON.parse(readFileSync(file, "utf8"));
    if (state?.motifEvalRun !== 1) return { error: `${file} isn't a run this version of the runner understands.` };
    return state as RunState;
  } catch (e) {
    return { error: `${file} can't be read: ${(e as Error).message}` };
  }
}

/** The cases still to do, in order: everything not yet graded. */
export const remaining = (state: RunState): string[] => Object.entries(state.cases).filter(([, c]) => c.status !== "graded").map(([id]) => id);

/** The checkout's commit, and whether tracked files have uncommitted changes. */
export function gitState(repo: string): { commit: string; dirty: boolean } {
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repo });
  const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=no"], { cwd: repo });
  return { commit: head.stdout.toString().trim() || "unknown", dirty: status.stdout.toString().trim() !== "" };
}
