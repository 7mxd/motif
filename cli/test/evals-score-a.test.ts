import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import type { Judgement } from "../../tests/evals/judge-a";
import type { Pair } from "../../tests/evals/pairs";
import { renderReport, testVerdicts } from "../../tests/evals/report";
import { missingJudgements } from "../../tests/evals/judge-a";
import { appBuilt, builtFor, forcedPairs, forfeitLog, scoreBrief, scoreRun, verdictA, type AiResult, type BriefScore, type OwnerPick } from "../../tests/evals/score-a";
import { gradeA, type Grade } from "../../tests/evals/grade";
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

  test("once nothing waits, the brief carries each side's share for the overall verdict", () => {
    expect(scoreBrief("pulse", pairs(10), results(10, 7, 1), votes(10, 6)).shares).toEqual({ ai: { motif: 0.7, baseline: 0.1 }, owner: 0.6 });
    expect(scoreBrief("pulse", pairs(10), results(10, 2, 7), votes(10, 3)).shares).toEqual({ ai: { motif: 0.2, baseline: 0.7 }, owner: 0.3 });
    expect(scoreBrief("pulse", pairs(10), results(10, 7, 1)).shares).toBeUndefined();
    expect(scoreBrief("pulse", pairs(10), results(5, 0, 5), votes(10, 6)).shares).toBeUndefined();
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

  test("a brief whose two apps were built by different models can't pass, or fail: it's pending until both are built again", () => {
    const differ = { motif: "claude-opus-x", baseline: "claude-sonnet-y" };
    const s = scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 10), { motif: true, baseline: true }, differ);
    expect(s.pass).toBeNull();
    expect(s.why).toStartWith("Pulse's two apps were built by different models: claude-opus-x (with Motif) and claude-sonnet-y (without)");
    expect(s.models).toEqual(differ);
    const f = scoreBrief("pulse", pairs(10), results(10, 0, 10), votes(10, 0), { motif: true, baseline: true }, differ);
    expect(f.pass).toBeNull();
    expect(f.why).toContain("different models");
    // The same model, or one not known, isn't flagged.
    expect(scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 10), { motif: true, baseline: true }, { motif: "m", baseline: "m" })).toMatchObject({ pass: true });
    expect(scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 10), { motif: true, baseline: true }, { motif: "m", baseline: "" }).pass).toBe(true);
  });

  test("no pairs: pending", () => {
    expect(scoreBrief("masar", [], new Map())).toMatchObject({ pairs: 0, pass: null });
  });
});

describe("exact boundaries and early failure", () => {
  test("20 pairs: 14 for Motif and 3 for the baseline passes (exactly 70% and exactly 15%)", () => {
    expect(scoreBrief("pulse", pairs(20), results(20, 14, 3), votes(20, 11)).pass).toBe(true);
  });
  test("20 pairs: 14 and 4 for the baseline fails; 13 and 3 fails", () => {
    expect(scoreBrief("pulse", pairs(20), results(20, 14, 4), votes(20, 20)).pass).toBe(false);
    expect(scoreBrief("pulse", pairs(20), results(20, 13, 3), votes(20, 20)).pass).toBe(false);
  });
  test("35 pairs: 25 for Motif and 6 for the baseline (17%) fails on the 15%", () => {
    expect(scoreBrief("pulse", pairs(35), results(35, 25, 6), votes(35, 35)).pass).toBe(false);
    expect(scoreBrief("pulse", pairs(35), results(35, 25, 5), votes(35, 35)).pass).toBe(true);
  });
  test("the owner at exactly half fails, over half passes", () => {
    expect(scoreBrief("pulse", pairs(20), results(20, 20, 0), votes(20, 10)).pass).toBe(false);
    expect(scoreBrief("pulse", pairs(20), results(20, 20, 0), votes(20, 11)).pass).toBe(true);
  });
  test("a tie judged first with nine to come is pending, not failed", () => {
    const r = new Map<string, AiResult>([["p0", "tie"]]);
    expect(scoreBrief("pulse", pairs(10), r, votes(10, 10)).pass).toBeNull();
  });
  test("one baseline pick first with nine to come is pending", () => {
    const r = new Map<string, AiResult>([["p0", "baseline"]]);
    expect(scoreBrief("pulse", pairs(10), r, votes(10, 10)).pass).toBeNull();
  });
  test("it fails early only when no remaining outcome could pass", () => {
    const two = new Map<string, AiResult>([["p0", "baseline"], ["p1", "baseline"]]);
    const s = scoreBrief("pulse", pairs(10), two, votes(10, 10));
    expect(s.pass).toBe(false);
    expect(s.why).toContain("to come");
    const four = new Map<string, AiResult>([["p0", "tie"], ["p1", "tie"], ["p2", "tie"], ["p3", "tie"]]);
    expect(scoreBrief("pulse", pairs(10), four, votes(10, 10)).pass).toBe(false);
  });
  test("owner votes so far under half are pending while enough votes are still to come", () => {
    const some = new Map<string, OwnerPick>([["p0", "motif"], ["p1", "baseline"], ["p2", "baseline"], ["p3", "baseline"]]);
    expect(scoreBrief("pulse", pairs(10), results(10, 10, 0), some).pass).toBeNull();
  });
  test("owner votes that no remaining votes could rescue fail", () => {
    const six = new Map<string, OwnerPick>(["p0", "p1", "p2", "p3", "p4", "p5"].map((id) => [id, "baseline" as OwnerPick]));
    expect(scoreBrief("pulse", pairs(10), results(10, 10, 0), six).pass).toBe(false);
  });
});

describe("what a side that didn't build loses", () => {
  const g = (...c: [string, boolean, string?][]): Grade => ({ pass: c.every((x) => x[1]), criteria: c.map(([id, pass, detail]) => ({ id, label: id, pass, detail: detail ?? "" })), metrics: {} });
  test("a failed build forfeits on any stack", () => {
    for (const stack of ["react-web", "vue", "svelte", "angular", "react-native", "flutter", "compose", "swiftui"] as const) {
      expect(appBuilt(g(["build", false], ["typecheck", true]), stack)).toBe(false);
    }
  });
  test("a failed type check forfeits only on Compose and SwiftUI, where it is the compile step", () => {
    expect(appBuilt(g(["typecheck", false]), "compose")).toBe(false);
    expect(appBuilt(g(["typecheck", false]), "swiftui")).toBe(false);
  });
  test("Flutter analyze warnings and Expo tsc errors don't forfeit", () => {
    expect(appBuilt(g(["typecheck", false]), "flutter")).toBe(true);
    expect(appBuilt(g(["typecheck", false]), "react-native")).toBe(true);
    expect(appBuilt(g(["build", true], ["typecheck", false]), "react-native")).toBe(true);
  });
  test("a build that stopped at the type errors counts as failed, from the criterion's flag, not its text", () => {
    // Vue and Angular: the build stopped at its type check, whose text an error message replaced (packages couldn't be got).
    for (const stack of ["vue", "angular"] as const) {
      const grade = gradeA({
        app: "/w/app", build: { code: 1, typeErrorsOnly: true }, typecheck: { code: 1, detail: "The packages couldn't be got: npm ci failed (exit code 1)." },
        screens: [{ route: "/", status: 200, pageErrors: 0 }], routes: ["/"],
      });
      const k = grade.criteria.find((c) => c.id === "typecheck")!;
      expect(k.typeErrorsOnly).toBe(true);
      expect(grade.criteria.some((c) => c.id === "build")).toBe(false);
      expect(appBuilt(grade, stack)).toBe(false);
      expect(appBuilt({ ...grade, criteria: grade.criteria.map((c) => (c.id === "typecheck" ? { ...c, detail: "Something else entirely." } : c)) }, stack)).toBe(false);
    }
    // Text that says so, without the flag, isn't it: an Expo app's tsc errors don't forfeit.
    expect(appBuilt(g(["typecheck", false, "The type check failed. The build stopped at the same errors, so it isn't counted again."]), "react-native")).toBe(true);
    // The text stays as it was.
    const vue = gradeA({ app: "/w/app", build: { code: 1, typeErrorsOnly: true }, typecheck: { code: 2, command: "vue-tsc" }, screens: [], routes: [] });
    expect(vue.criteria.find((c) => c.id === "typecheck")!.detail).toBe("The type check (vue-tsc) failed (exit code 2). The build stopped at the same errors, so it isn't counted again.");
  });
  test("no build facts (no app found) didn't build; no grade at all is unknown", () => {
    expect(appBuilt(g(["app", false]), "vue")).toBe(false);
    expect(appBuilt(undefined, "vue")).toBeNull();
  });
  test("a forfeit names the stack's log and the grade's own reason, so a build that never started (and wrote no log) still says why", () => {
    expect(forfeitLog(g(["app", true], ["typecheck", false, "Compose needs a JDK 17 or later, and none was found."]), "compose")).toBe("compile.log (its grade says: Compose needs a JDK 17 or later, and none was found.)");
    expect(forfeitLog(g(["app", true], ["build", false, ""]), "vue")).toBe("build.log");
    expect(forfeitLog(g(["app", false, "No app was found in the case's folder."]), "vue")).toBe("session.jsonl (its grade says: No app was found in the case's folder.)");
  });
  test("a D design guide that's missing doesn't forfeit when the build facts say it built", () => {
    expect(appBuilt(g(["app", true], ["validate", false], ["build", true], ["typecheck", true]), "vue")).toBe(true);
  });
  test("a brief Motif wins because the app without it didn't build says it was won by forfeit, naming the log to read", () => {
    const s = scoreBrief("stride", [pair("p0", "both", "stride"), pair("p1", "both", "stride")], new Map(), undefined, { motif: true, baseline: false, logs: { baseline: "build.log" } });
    expect(s.pass).toBe(true);
    expect(s.forfeit).toBe("won by forfeit: the app without Motif didn't build — read a-stride/build.log");
    expect(s.why).toStartWith("won by forfeit: the app without Motif didn't build — read a-stride/build.log");
    // No pair with both apps' screens: nothing was judged, and it says so.
    const shots = scoreBrief("stride", [pair("p0", "motif-only", "stride"), pair("p1", "neither", "stride")], new Map(), undefined, { motif: true, baseline: true });
    expect(shots.pass).toBe(true);
    expect(shots.forfeit).toBe("won by forfeit: no pair had both apps' screens, so none was judged — read a-stride/pair-shots.json");
    // A judged win isn't one.
    expect(scoreBrief("pulse", pairs(10), results(10, 10, 0), votes(10, 10)).forfeit).toBeUndefined();
  });

  test("the log a forfeit names is the one that says why: the stack's build log, or the session's when no app was found", () => {
    const st = (stack: string, grade: Grade): RunState => ({
      motifEvalRun: 1, id: "r", commit: "abc", dirty: false, started: "", claudeVersion: "2", resumes: [], options: { keep: false, work: "/w" },
      cases: { [`d-${stack}`]: { status: "graded", attempts: 1, grade: g(["build", true]) }, [`a-${stack}`]: { status: "graded", attempts: 1, grade } },
    });
    expect(builtFor(st("stride", g(["build", false])), "stride").logs).toEqual({ motif: "build.log", baseline: "build.log" });
    expect(builtFor(st("nabta", g(["typecheck", false])), "nabta").logs?.baseline).toBe("compile.log");
    expect(builtFor(st("masar", g(["typecheck", false])), "masar").logs?.baseline).toBe("xcodebuild.log");
    expect(builtFor(st("sanad", g(["app", false])), "sanad").logs?.baseline).toBe("session.jsonl");
  });

  test("an unknown build beside a failed one, or two unknown builds, keep the brief pending, the why naming both apps", () => {
    const one = scoreBrief("pulse", pairs(4), results(4, 4, 0), votes(4, 4), { motif: true, baseline: null });
    expect(one).toMatchObject({ pass: null, why: "waiting for the build result of the app made without Motif" });
    const failedAndUnknown = scoreBrief("pulse", pairs(4), results(4, 0, 4), votes(4, 0), { motif: false, baseline: null });
    expect(failedAndUnknown).toMatchObject({ pass: null, why: "the app made with Motif didn't build, and the build result of the app made without Motif isn't in yet" });
    const unknownAndFailed = scoreBrief("pulse", pairs(4), results(4, 4, 0), votes(4, 4), { motif: null, baseline: false });
    expect(unknownAndFailed).toMatchObject({ pass: null, why: "the app made without Motif didn't build, and the build result of the app made with Motif isn't in yet" });
    const both = scoreBrief("pulse", pairs(4), results(4, 4, 0), votes(4, 4), { motif: null, baseline: null });
    expect(both).toMatchObject({ pass: null, why: "waiting for the build results of both apps, the one made with Motif and the one made without" });
  });

  test("an unknown build keeps the brief pending", () => {
    const s = scoreBrief("pulse", pairs(4), results(4, 4, 0), votes(4, 4), { motif: true, baseline: null });
    expect(s.pass).toBeNull();
    expect(s.why).toContain("build result");
  });
  test("a pair where one side didn't build and the other didn't draw the screen is left out", () => {
    const ps = [pair("p0", "motif-only"), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => pair("p" + i))];
    const s = scoreBrief("pulse", ps, results(10, 9, 0), votes(10, 10), { motif: false, baseline: true });
    expect(s.left).toEqual(["p0"]);
    expect(s.ai.baseline).toBe(9);
    const t = scoreBrief("pulse", [pair("p0", "baseline-only"), pair("p1")], results(2, 0, 0), undefined, { motif: true, baseline: false });
    expect(t).toMatchObject({ left: ["p0"], forced: ["p1"] });
  });
});

describe("the verdict", () => {
  type Shares = NonNullable<BriefScore["shares"]>;
  const good: Shares = { ai: { motif: 0.9, baseline: 0 }, owner: 0.8 };
  const score = (brief: string, pass: boolean | null, n = 10, shares: Shares | null = pass === null ? null : good): BriefScore =>
    ({ brief, pairs: n, ai: { motif: 0, baseline: 0, tie: 0 }, left: [], forced: [], pass, why: pass === null ? "waiting for the owner's votes" : "ok", ...(shares ? { shares } : {}) });
  const briefs = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const all = (shares: Shares, j: Shares = shares) => briefs.map((b) => score(b, true, 10, b === "j" ? j : shares));

  test("passes when every brief passes", () => {
    const v = verdictA(briefs.map((b) => score(b, true)), briefs);
    expect(v.status).toBe("pass");
    expect(v.detail).toContain("Every brief also passed on its own.");
  });

  test("passes on the briefs' average, naming the ones below the bar on their own", () => {
    const scores = briefs.map((b) => (b === "j" ? score(b, false, 6, { ai: { motif: 0.5, baseline: 0.33 }, owner: 0.33 }) : score(b, true)));
    const v = verdictA(scores, briefs);
    expect(v.status).toBe("pass");
    expect(v.detail).toContain("the AI judges picked Motif in 86% of a brief's pairs and the baseline in 3%; the owner picked Motif in 75%");
    expect(v.detail).toContain("Below the bar on their own: j.");
  });

  test("each brief counts the same, whatever its number of pairs", () => {
    const scores = briefs.map((b) => score(b, true, b === "j" ? 3 : 6, b === "j" ? { ai: { motif: 0, baseline: 0 }, owner: 0.8 } : { ai: { motif: 0.7, baseline: 0 }, owner: 0.8 }));
    expect(verdictA(scores, briefs).detail).toContain("picked Motif in 63% of a brief's pairs");
  });

  test("fails when the AI judges' average for Motif is under 70%", () => {
    const v = verdictA(all({ ai: { motif: 0.69, baseline: 0 }, owner: 0.8 }), briefs);
    expect(v.status).toBe("fail");
    expect(v.detail).toContain("at least 70%");
  });

  test("fails when the AI judges' average for the baseline is over 15%", () => {
    expect(verdictA(all({ ai: { motif: 0.8, baseline: 0.16 }, owner: 0.8 }), briefs).status).toBe("fail");
    expect(verdictA(all({ ai: { motif: 0.8, baseline: 0.15 }, owner: 0.8 }), briefs).status).toBe("pass");
  });

  test("fails when the owner's average is half or less", () => {
    const v = verdictA(all({ ai: { motif: 0.9, baseline: 0 }, owner: 0.5 }), briefs);
    expect(v.status).toBe("fail");
    expect(v.detail).toContain("more than half");
  });

  test("fails when the baseline beats Motif on a brief with both the AI judges and the owner", () => {
    const v = verdictA(all(good, { ai: { motif: 0.2, baseline: 0.6 }, owner: 0.3 }), briefs);
    expect(v.status).toBe("fail");
    expect(v.detail).toContain("the baseline won j with both the AI judges and the owner");
    expect(verdictA(all(good, { ai: { motif: 0.2, baseline: 0.6 }, owner: 0.5 }), briefs).status).toBe("pass");
  });

  test("the verdict names the briefs won by forfeit", () => {
    const scores = briefs.map((b) => (b === "c" ? { ...score(b, true), forfeit: "won by forfeit: the app without Motif didn't build — read a-c/build.log" } : score(b, true)));
    const v = verdictA(scores, briefs);
    expect(v.status).toBe("pass");
    expect(v.detail).toContain("Won by forfeit: c (the app without Motif didn't build — read a-c/build.log).");
    const w = verdictA(scores.map((s) => (s.brief === "j" ? { ...s, pass: null } : s)), briefs);
    expect(w.detail).toContain("Won by forfeit: c (");
  });

  test("a brief with no verdict, no pairs or judgements still to come leaves it incomplete", () => {
    expect(verdictA(briefs.map((b) => score(b, b === "j" ? null : true)), briefs).status).toBe("incomplete");
    expect(verdictA(briefs.filter((b) => b !== "j").map((b) => score(b, true)), briefs).status).toBe("incomplete");
    expect(verdictA(briefs.map((b) => score(b, true, b === "j" ? 0 : 10)), briefs).status).toBe("incomplete");
    // Failed early on its own, with judgements still to come: the average can't be taken yet.
    expect(verdictA(briefs.map((b) => score(b, b === "j" ? false : true, 10, b === "j" ? null : good)), briefs).status).toBe("incomplete");
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

  test("reads each side's model from its case's session: different models hold the brief and Test A back, in the verdict and the report", () => {
    const ps = [pair("p0", "both", "stride"), pair("p1", "both", "stride")];
    const js: Judgement[] = ["p0", "p1"].flatMap((id) => [
      { pairId: id, order: "motif-left" as const, pick: "left" as const, why: "" },
      { pairId: id, order: "motif-right" as const, pick: "right" as const, why: "" },
    ]);
    const session = (model: string) => ({ end: "finished", model, turns: 1, minutes: 1, costUsd: 0, denials: [], problems: [] });
    const st = state({ "d-stride": { ...graded(), session: session("opus-x") }, "a-stride": { ...graded(), session: session("sonnet-y") } });
    const owner = new Map<string, OwnerPick>([["p0", "motif"], ["p1", "motif"]]);
    const out = folder(ps, js);
    const s = scoreRun(st, out, owner);
    expect(s[0]).toMatchObject({ pass: null, models: { motif: "opus-x", baseline: "sonnet-y" } });
    const verdicts = testVerdicts(st, CASES, s);
    const a = verdicts.find((v) => v.test === "A")!;
    expect(a.status).toBe("incomplete");
    expect(a.detail).toContain("Stride's two apps were built by different models: opus-x (with Motif) and sonnet-y (without)");
    expect(renderReport(st, CASES, verdicts, s)).toContain("| stride | 2 | 2 / 0 / 0 | 2 / 0 | pending | Stride's two apps were built by different models");
    // The same model on both sides passes.
    const same = state({ "d-stride": { ...graded(), session: session("opus-x") }, "a-stride": { ...graded(), session: session("opus-x") } });
    expect(scoreRun(same, out, owner)[0]!.pass).toBe(true);
  });

  test("pairs decided without a judge are listed and skipped by the judges and the owner", () => {
    const ps = [{ ...pair("p0"), motif: "a/img/1.png", baseline: "a/img/2.png" }, pair("p1", "motif-only"), pair("p2", "neither")];
    const out = folder(ps, []);
    const st = state({ "d-pulse": graded(), "a-pulse": graded() });
    expect([...forcedPairs(st, out)]).toEqual([["p1", "motif"], ["p2", "left"]]);
    const noBuild = state({ "d-pulse": graded(), "a-pulse": graded(false) });
    expect([...forcedPairs(noBuild, out)]).toEqual([["p0", "motif"], ["p1", "motif"], ["p2", "left"]]);
    expect(missingJudgements(out, new Set(forcedPairs(noBuild, out).keys()))).toEqual([]);
    expect(missingJudgements(out, new Set(forcedPairs(st, out).keys())).map((x) => x.pair.id)).toEqual(["p0", "p0"]);
  });

  test("Masar skipped off a Mac: Test A is incomplete, never pass, and names it", () => {
    const cases: Record<string, CaseState> = {};
    for (const b of aBriefs) cases[`a-${b}`] = b === "masar" ? { status: "skipped", attempts: 0, note: "It needs a Mac." } : graded();
    const scores: BriefScore[] = aBriefs.filter((b) => b !== "masar").map((b) => ({ brief: b, pairs: 4, ai: { motif: 4, baseline: 0, tie: 0 }, owner: { motif: 4, other: 0 }, left: [], forced: [], pass: true, why: "ok" }));
    const a = testVerdicts(state(cases), CASES, scores).find((v) => v.test === "A")!;
    expect(a.status).toBe("incomplete");
    expect(a.detail).toContain("masar");
    expect(a.detail).toContain("a-masar was skipped (it needs a Mac)");
  });

  test("the report's Test A section lists each brief's numbers, why, the pairs left out and the biases note", () => {
    const cases: Record<string, CaseState> = { "a-pulse": graded(), "a-masar": { status: "skipped", attempts: 0, note: "It needs a Mac." } };
    const scores: BriefScore[] = [
      { brief: "pulse", pairs: 11, ai: { motif: 7, baseline: 1, tie: 2 }, left: ["gone"], forced: [], pass: null, why: "waiting for the owner's votes" },
      { brief: "masar", pairs: 0, ai: { motif: 0, baseline: 0, tie: 0 }, left: [], forced: [], pass: null, why: "no pairs yet" },
    ];
    const verdicts = testVerdicts(state(cases), CASES, scores);
    const md = renderReport(state(cases), CASES, verdicts, scores);
    expect(md).toContain("Test A — with and without Motif: INCOMPLETE");
    expect(md).toContain("| pulse | 11 | 7 / 1 / 2 | waiting | pending | waiting for the owner's votes |");
    expect(md).toContain("| masar | 0 |");
    expect(md).toContain("Pairs left out because neither side could win them (neither app drew the screen, or one app didn't build and the other didn't draw it): pulse (gone).");
    expect(md).not.toContain("because neither app drew them");
    expect(md).toContain("docs/test-a.md");
  });

  test("the owner column shows a dash when every pair is decided without a vote", () => {
    const cases: Record<string, CaseState> = { [`a-${aBriefs[0]}`]: graded() };
    const scores: BriefScore[] = [{ brief: aBriefs[0]!, pairs: 2, ai: { motif: 2, baseline: 0, tie: 0 }, left: [], forced: ["p0", "p1"], pass: true, why: "ok" }];
    const md = renderReport(state(cases), CASES, testVerdicts(state(cases), CASES, scores), scores);
    expect(md).toContain(`| ${aBriefs[0]} | 2 | 2 / 0 / 0 | — | pass | ok |`);
  });
});
