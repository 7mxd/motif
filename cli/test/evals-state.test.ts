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
  test("every case passing passes B, C and D, and leaves Test A waiting for its pairs and votes", () => {
    expect(testVerdicts(state(allGraded(pass)), CASES).map((v) => v.status)).toEqual(["pass", "pass", "pass", "incomplete"]);
  });

  test("a failing B case fails B, and D with it (D needs B and C with no MCP servers)", () => {
    const s = state({ ...allGraded(pass), "b-search": { status: "graded", attempts: 1, grade: fail } });
    expect(testVerdicts(s, CASES).map((v) => v.status)).toEqual(["fail", "pass", "fail", "incomplete"]);
  });

  test("cases not run leave their tests incomplete", () => {
    expect(testVerdicts(state(allGraded(pass, ["c-review", "c-plain", "c-flutter", "c-compose", "c-rn", "c-vue", "c-svelte", "c-angular", "c-swiftui"])), CASES).map((v) => v.status)).toEqual(["incomplete", "pass", "incomplete"]);
  });

  test("Mac-only cases skipped off a Mac are left out of the count and named: the tests can pass without them", () => {
    const skip = (id: string): Record<string, CaseState> => ({ [id]: { status: "skipped", attempts: 0, note: "It needs a Mac with Xcode." } });
    const macOnly = ["b-swiftui-orders", "b-swiftui-rewards", "c-swiftui", "d-masar"];
    const s = state({ ...allGraded(pass, CASES.map((c) => c.id).filter((id) => !macOnly.includes(id))), ...Object.assign({}, ...macOnly.map(skip)) });
    expect(testVerdicts(s, CASES).filter((v) => v.test !== "A")).toEqual([
      { test: "B", status: "pass", detail: "All 18 cases run passed; b-swiftui-orders and b-swiftui-rewards were skipped (they need a Mac)." },
      { test: "C", status: "pass", detail: "All 8 cases run passed; c-swiftui was skipped (it needs a Mac)." },
      { test: "D", status: "pass", detail: "The new apps passed, and B and C passed with no design sources connected; d-masar was skipped (it needs a Mac)." },
    ]);
    // A skipped case still says so when its test fails or is incomplete.
    const failing = state({ ...s.cases, "c-review": { status: "graded", attempts: 1, grade: fail } });
    expect(testVerdicts(failing, CASES)[1]).toEqual({ test: "C", status: "fail", detail: "Failed: c-review; c-swiftui was skipped (it needs a Mac)." });
    const partial = state({ ...s.cases, "c-review": { status: "pending", attempts: 0 } });
    expect(testVerdicts(partial, CASES)[1]).toEqual({ test: "C", status: "incomplete", detail: "7 of 8 cases graded; c-swiftui was skipped (it needs a Mac)." });
  });

  test("a Mac-only case that wasn't run at all (not skipped) still leaves its test incomplete", () => {
    expect(testVerdicts(state(allGraded(pass, ["c-review", "c-plain", "c-flutter", "c-compose", "c-rn", "c-vue", "c-svelte", "c-angular"])), CASES)[1]).toEqual({ test: "C", status: "incomplete", detail: "8 of 9 cases graded." });
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

  test("shows each skipped case with its reason", () => {
    const why = "It needs a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Resume this run on a Mac to run it: bun tests/evals/run.ts --resume 20261014-120000";
    const s = state({ "c-review": { status: "graded", attempts: 1, grade: pass }, "c-swiftui": { status: "skipped", attempts: 0, note: why } });
    const md = renderReport(s, CASES, testVerdicts(s, CASES));
    expect(md).toContain(`## c-swiftui: Review of the seeded SwiftUI app\n\nSkipped: ${why}\n`);
    expect(md).not.toContain("Not graded (skipped)");
  });
});
