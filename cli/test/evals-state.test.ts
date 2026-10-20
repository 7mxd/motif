import { afterAll, describe, expect, test } from "bun:test";
import { CASES } from "../../tests/evals/cases";
import type { Grade } from "../../tests/evals/grade";
import { renderReport, testVerdicts } from "../../tests/evals/report";
import { loadRun, newRunId, remaining, saveRun, type CaseState, type RunState } from "../../tests/evals/state";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const pass: Grade = { pass: true, criteria: [{ id: "build", label: "The app builds", pass: true, detail: "The build passed." }], metrics: {} };
const fail: Grade = { pass: false, criteria: [{ id: "check", label: "motif check finds nothing", pass: false, detail: "2 problems | 0 warnings." }], metrics: {} };
const state = (cases: Record<string, CaseState>): RunState => ({
  motifEvalRun: 1, id: "20261014-120000", commit: "369b8d8aaaaaaaaaaaaaaa", dirty: false, started: "2026-10-14T12:00:00.000Z",
  claudeVersion: "2.1.289 (Claude Code)", resumes: [], options: { keep: false, work: "/tmp/w" }, cases,
});
const allGraded = (grade: Grade, ids = CASES.map((c) => c.id)) => Object.fromEntries(ids.map((id) => [id, { status: "graded" as const, attempts: 1, grade }]));

describe("a run's record", () => {
  test("run ids sort by time", () => {
    expect(newRunId(new Date(2026, 9, 14, 9, 5, 7))).toBe("20261014-090507");
  });

  test("saves and loads", () => {
    const dir = tempDir("motif-runs-");
    const s = state({ "b-settings": { status: "pending", attempts: 0 } });
    saveRun(dir, s);
    expect(loadRun(dir, s.id)).toEqual(s);
  });

  test("an unknown or odd run id is refused", () => {
    const dir = tempDir("motif-runs-");
    expect(loadRun(dir, "nope")).toEqual({ error: expect.stringContaining('"nope"') });
    expect(loadRun(dir, "../x")).toEqual({ error: expect.any(String) });
  });

  test("what's left is everything not graded, in order", () => {
    expect(remaining(state({
      a: { status: "graded", attempts: 1 }, b: { status: "interrupted", attempts: 1 }, c: { status: "session-done", attempts: 1 },
      d: { status: "pending", attempts: 0 }, e: { status: "error", attempts: 1 },
    }))).toEqual(["b", "c", "d", "e"]);
  });
});

describe("the verdicts", () => {
  test("every case passing passes all three tests", () => {
    expect(testVerdicts(state(allGraded(pass)), CASES).map((v) => v.status)).toEqual(["pass", "pass", "pass"]);
  });

  test("a failing B case fails B, and D with it (D needs B and C with no MCP servers)", () => {
    const s = state({ ...allGraded(pass), "b-search": { status: "graded", attempts: 1, grade: fail } });
    expect(testVerdicts(s, CASES).map((v) => v.status)).toEqual(["fail", "pass", "fail"]);
  });

  test("cases not run leave their tests incomplete", () => {
    expect(testVerdicts(state(allGraded(pass, ["c-review", "c-plain", "c-flutter", "c-compose"])), CASES).map((v) => v.status)).toEqual(["incomplete", "pass", "incomplete"]);
  });
});

describe("the report", () => {
  test("shows the verdicts, each case's criteria and session, and what wasn't graded", () => {
    const s = state({
      "b-settings": { status: "graded", attempts: 1, grade: fail, session: { end: "finished", model: "m", turns: 40, minutes: 12.5, costUsd: 3.2, denials: ['Bash: {"command":"rm -rf .."}'], problems: [] } },
      "c-review": { status: "interrupted", attempts: 1, note: "Usage limit reached." },
    });
    s.resumes.push({ at: "2026-10-15T08:00:00.000Z", commit: "def4567890abcdef", dirty: true });
    const md = renderReport(s, CASES, testVerdicts(s, CASES));
    for (const t of ["Test B — consistency: FAIL", "✗", "2 problems \\| 0 warnings.", "Not graded (interrupted)", "Usage limit reached.", "Refused by auto mode", "40 turns", "def4567890ab"]) {
      expect(md).toContain(t);
    }
  });
});
