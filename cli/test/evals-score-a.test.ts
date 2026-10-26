import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import type { Judgement } from "../../tests/evals/judge-a";
import type { Pair } from "../../tests/evals/pairs";
import { renderReport, testVerdicts } from "../../tests/evals/report";
import { scoreBrief, scoreRun, verdictA, type AiResult, type BriefScore, type OwnerPick } from "../../tests/evals/score-a";
import type { CaseState, RunState } from "../../tests/evals/state";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const pair = (id: string, outcome: Pair["outcome"] = "both", brief = "pulse"): Pair => ({ id, brief, screen: "/", size: 390, outcome });
const pairs = (n: number, outcome: Pair["outcome"] = "both") => Array.from({ length: n }, (_, i) => pair(`p${i}`, outcome));
/** The AI's results: the first `motif` pairs to Motif, then `baseline` to the baseline, the rest ties. */
function results(n: number, motif: number, baseline: number): Map<string, AiResult> {
  return new Map(Array.from({ length: n }, (_, i) => [`p${i}`, i < motif ? "motif" : i < motif + baseline ? "baseline" : "tie"] as [string, AiResult]));
}
const votes = (n: number, motif: number, same = 0): Map<string, OwnerPick> =>
  new Map(Array.from({ length: n }, (_, i) => [`p${i}`, i < motif ? "motif" : i < motif + same ? "same" : "baseline"] as [string, OwnerPick]));

describe("one brief's score", () => {
  test("7 of 10 for Motif and 1 for the baseline passes the AI part", () => {
    const s = scoreBrief("pulse", pairs(10), results(10, 7, 1), votes(10, 6));
    expect(s).toMatchObject({ pairs: 10, ai: { motif: 7, baseline: 1, tie: 2 }, owner: { motif: 6, other: 4 }, pass: true, left: [] });
  });

  test("7 of 10 with 2 for the baseline fails on the 15%", () => {
    const s = scoreBrief("pulse", pairs(10), results(10, 7, 2), votes(10, 10));
    expect(s.pass).toBe(false);
    expect(s.why).toContain("at most 15%");
  });

  test("6 of 10 fails on the 70%", () => {
    expect(scoreBrief("pulse", pairs(10), results(10, 6, 0), votes(10, 10)).pass).toBe(false);
  });

  test("the owner needs more than half, and 'about the same' counts as judged, not as a win", () => {
    expect(scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 5, 3)).pass).toBe(false);
    const s = scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 6, 4));
    expect(s).toMatchObject({ pass: true, owner: { motif: 6, other: 4 } });
  });

  test("no owner votes yet: pending, not a pass", () => {
    const s = scoreBrief("pulse", pairs(10), results(10, 10, 0));
    expect(s.pass).toBeNull();
    expect(s.why).toContain("waiting for the owner's votes");
    expect(s.owner).toBeUndefined();
  });

  test("a pair missing a judgement is unjudged, not a tie: it leaves the denominator and holds the verdict back", () => {
    const r = results(10, 7, 0);
    r.delete("p9");
    r.delete("p8");
    const s = scoreBrief("pulse", pairs(10), r, votes(10, 10));
    expect(s.ai).toEqual({ motif: 7, baseline: 0, tie: 1 });
    expect(s.pass).toBeNull();
    expect(s.why).toContain("waiting for 2 judgements");
  });

  test("a brief already short of the 70% fails even with judgements to come", () => {
    const r = results(10, 0, 5);
    for (const id of ["p5", "p6", "p7", "p8", "p9"]) r.delete(id);
    expect(scoreBrief("pulse", pairs(10), r, votes(10, 10)).pass).toBe(false);
  });

  test("one-sided pairs are wins for the side that drew, for the AI and the owner alike", () => {
    const ps = [pair("p0", "motif-only"), pair("p1", "motif-only"), pair("p2", "baseline-only"), ...[3, 4, 5, 6, 7, 8, 9].map((i) => pair(`p${i}`))];
    const r = new Map<string, AiResult>(ps.slice(3).map((p) => [p.id, "motif"]));
    const s = scoreBrief("pulse", ps, r, new Map(ps.slice(3).map((p) => [p.id, "motif" as OwnerPick])));
    expect(s).toMatchObject({ ai: { motif: 9, baseline: 1, tie: 0 }, owner: { motif: 9, other: 1 }, pass: true });
  });

  test("a neither pair is left out and listed, and doesn't count", () => {
    const ps = [...pairs(10), pair("gone", "neither")];
    const s = scoreBrief("pulse", ps, results(10, 7, 1), votes(10, 6));
    expect(s).toMatchObject({ pairs: 11, left: ["gone"], pass: true });
    expect(s.ai.motif + s.ai.baseline + s.ai.tie).toBe(10);
  });

  test("other briefs' pairs are not counted", () => {
    const s = scoreBrief("pulse", [...pairs(10), pair("x", "both", "masar")], results(10, 7, 1), votes(10, 6));
    expect(s.pairs).toBe(10);
  });

  test("a side whose app didn't build loses its pairs even when its screens rendered", () => {
    const lost = scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 10), { motif: false, baseline: true });
    expect(lost).toMatchObject({ ai: { motif: 0, baseline: 10, tie: 0 }, pass: false });
    expect(lost.why).toContain("with Motif didn't build");
    const won = scoreBrief("pulse", pairs(10), new Map(), undefined, { motif: true, baseline: false });
    expect(won).toMatchObject({ ai: { motif: 10, baseline: 0, tie: 0 }, pass: true });
    expect(won.why).toContain("without Motif didn't build");
  });

  test("neither app built: the brief fails, with that reason", () => {
    const s = scoreBrief("pulse", pairs(4), new Map(), undefined, { motif: false, baseline: false });
    expect(s).toMatchObject({ pass: false, why: "neither app built" });
  });

  test("no pairs: pending", () => {
    expect(scoreBrief("masar", [], new Map())).toMatchObject({ pairs: 0, pass: null });
  });
});

describe("the verdict", () => {
  const score = (brief: string, pass: boolean | null, n = 10): BriefScore => ({ brief, pairs: n, ai: { motif: 0, baseline: 0, tie: 0 }, left: [], pass, why: pass === null ? "waiting for the owner's votes" : "ok" });
  const briefs = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

  test("passes only when every brief passes", () => {
    expect(verdictA(briefs.map((b) => score(b, true)), briefs).status).toBe("pass");
  });

  test("nine passing and one failing fails", () => {
    const v = verdictA(briefs.map((b) => score(b, b !== "j")), briefs);
    expect(v.status).toBe("fail");
    expect(v.detail).toContain("j");
  });

  test("a brief with no verdict or no pairs leaves it incomplete", () => {
    expect(verdictA(briefs.map((b) => score(b, b === "j" ? null : true)), briefs).status).toBe("incomplete");
    expect(verdictA(briefs.filter((b) => b !== "j").map((b) => score(b, true)), briefs).status).toBe("incomplete");
    expect(verdictA(briefs.map((b) => score(b, true, b === "j" ? 0 : 10)), briefs).status).toBe("incomplete");
  });
});

describe("a run's Test A", () => {
  const graded = (pass = true): CaseState => ({
    status: "graded", attempts: 1,
    grade: { pass, criteria: [{ id: "build", label: "The app builds", pass, detail: "x" }], metrics: {} },
  });
  const state = (cases: Record<string, CaseState>): RunState => ({
    motifEvalRun: 1, id: "r", commit: "abc", dirty: false, started: "2026-10-26T00:00:00.000Z", claudeVersion: "2", resumes: [], options: { keep: false, work: "/w" }, cases,
  });
  const aBriefs = CASES.filter((c) => c.test === "A").map((c) => c.brief!);

  function folder(ps: Pair[], js: Judgement[]) {
    const out = tempDir("motif-score-a-");
    mkdirSync(join(out, "a"), { recursive: true });
    writeFileSync(join(out, "a", "pairs.json"), JSON.stringify(ps));
    writeFileSync(join(out, "a", "judgements.json"), JSON.stringify(js));
    return out;
  }

  test("reads each pick by its order, not its place in the file, and reads the build from the cases' grades", () => {
    const ps = [pair("p0"), pair("p1")];
    // Interleaved: p1's judgements come between p0's.
    const js: Judgement[] = [
      { pairId: "p0", order: "motif-right", pick: "right", why: "" },
      { pairId: "p1", order: "motif-left", pick: "left", why: "" },
      { pairId: "p1", order: "motif-right", pick: "right", why: "" },
      { pairId: "p0", order: "motif-left", pick: "left", why: "" },
    ];
    const s = scoreRun(state({ "d-pulse": graded(), "a-pulse": graded() }), folder(ps, js));
    expect(s).toHaveLength(1);
    expect(s[0]!.ai).toEqual({ motif: 2, baseline: 0, tie: 0 });
    const lost = scoreRun(state({ "d-pulse": graded(false), "a-pulse": graded() }), folder(ps, js));
    expect(lost[0]).toMatchObject({ ai: { motif: 0, baseline: 2, tie: 0 }, pass: false });
  });

  test("Masar skipped off a Mac: Test A is incomplete, never pass, and names it", () => {
    const cases: Record<string, CaseState> = {};
    for (const b of aBriefs) cases[`a-${b}`] = b === "masar" ? { status: "skipped", attempts: 0, note: "It needs a Mac." } : graded();
    const scores: BriefScore[] = aBriefs.filter((b) => b !== "masar").map((b) => ({ brief: b, pairs: 4, ai: { motif: 4, baseline: 0, tie: 0 }, owner: { motif: 4, other: 0 }, left: [], pass: true, why: "ok" }));
    const a = testVerdicts(state(cases), CASES, scores).find((v) => v.test === "A")!;
    expect(a.status).toBe("incomplete");
    expect(a.detail).toContain("masar");
    expect(a.detail).toContain("a-masar was skipped (it needs a Mac)");
  });

  test("the report's Test A section lists each brief's numbers, why, the pairs left out and the biases note", () => {
    const cases: Record<string, CaseState> = { "a-pulse": graded(), "a-masar": { status: "skipped", attempts: 0, note: "It needs a Mac." } };
    const scores: BriefScore[] = [
      { brief: "pulse", pairs: 11, ai: { motif: 7, baseline: 1, tie: 2 }, left: ["gone"], pass: null, why: "waiting for the owner's votes" },
      { brief: "masar", pairs: 0, ai: { motif: 0, baseline: 0, tie: 0 }, left: [], pass: null, why: "no pairs yet" },
    ];
    const verdicts = testVerdicts(state(cases), CASES, scores);
    const md = renderReport(state(cases), CASES, verdicts, scores);
    expect(md).toContain("Test A — with and without Motif: INCOMPLETE");
    expect(md).toContain("| pulse | 11 | 7 / 1 / 2 | waiting | pending | waiting for the owner's votes |");
    expect(md).toContain("| masar | 0 |");
    expect(md).toContain("gone");
    expect(md).toContain("docs/test-a.md");
  });
});
