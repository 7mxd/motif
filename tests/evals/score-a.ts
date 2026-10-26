// Test A's scores and verdict (Part 4 §6): each brief is scored on its own pairs, so a web brief with twice the pairs
// counts no more than the others, and Test A passes only when every brief passes. The AI judges must pick Motif's side
// in at least 70% of a brief's judged pairs and the baseline in at most 15%; the owner must pick Motif in more than half
// ("about the same" counts as judged and isn't a win). A pair with a screen from one side only goes to that side, for the
// AI and the owner alike; so does every pair of a brief whose other side's app didn't build. A pair with neither is left out.
import { CASES, plural } from "./cases";
import type { Grade } from "./grade";
import { pairResult, readJudgements } from "./judge-a";
import { readPairs, type Pair } from "./pairs";
import type { StackId } from "../../cli/src/detect/stacks";
import type { RunState } from "./state";

export interface BriefScore {
  brief: string;
  /** Every pair of the brief, the ones left out included. */
  pairs: number;
  /** The AI judges' picks over the pairs judged so far. */
  ai: { motif: number; baseline: number; tie: number };
  /** The owner's votes over the pairs they decide; "other" is the baseline and "about the same". Absent until they vote. */
  owner?: { motif: number; other: number };
  /** Ids of the pairs left out: no side was drawn, or one side's app didn't build and the other's didn't draw it. */
  left: string[];
  /** Ids of the pairs decided without a judge or a vote (one side drew alone, or the other's app didn't build). */
  forced: string[];
  /**
   * Only for a brief Motif's side wins (or is winning) with no judge deciding it: the app without Motif didn't build, or
   * no pair had both apps' screens. Says so and names the log to read before the win is accepted.
   */
  forfeit?: string;
  /** null while the brief waits for judgements, the owner's votes or its pairs, or when different models built its two apps. */
  pass: boolean | null;
  why: string;
  /** Only when different models built the brief's two apps: each side's. */
  models?: { motif: string; baseline: string };
}

/** The model each side's session used, as the session's first event named it. */
export interface Models { motif?: string; baseline?: string }

export type OwnerPick = "motif" | "baseline" | "same";
export type AiResult = "motif" | "baseline" | "tie";
/** Whether each side's app for the brief built (and type-checked); a side whose app didn't loses its pairs. */
export interface Built {
  motif: boolean | null; baseline: boolean | null;
  /** The file in each side's results folder that says why its app didn't build (forfeitLog); build.log when not known. */
  logs?: { motif?: string; baseline?: string };
}

/**
 * How a pair is decided without a judge, or "open" when the judges (and the owner) decide it. A side whose app didn't
 * build loses the pairs the other side drew; a pair where both lose (one side didn't build and the other didn't draw the
 * screen), or neither side drew, is left out. An unknown build (null) is taken as built here.
 */
export function decide(p: Pair, built: Built): "motif" | "baseline" | "left" | "open" {
  const motifOk = built.motif !== false;
  const baselineOk = built.baseline !== false;
  if (p.outcome === "neither" || (!motifOk && !baselineOk)) return "left";
  if (!motifOk) return p.outcome === "motif-only" ? "left" : "baseline";
  if (!baselineOk) return p.outcome === "baseline-only" ? "left" : "motif";
  return p.outcome === "motif-only" ? "motif" : p.outcome === "baseline-only" ? "baseline" : "open";
}

const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;

/** The brief's name as people read it: "masar" is "Masar". */
const briefName = (brief: string) => brief.charAt(0).toUpperCase() + brief.slice(1);

/**
 * One brief's score. `results` is the AI's result per pair id (a pair with no entry is unjudged, not a tie); `owner` the
 * owner's picks per pair id, already mapped to Motif's and the baseline's side. `models` are the models each side's
 * session used: a brief whose two apps different models built is no comparison of Motif (the spec's baseline is the
 * same agent), so it neither passes nor fails; it's pending until both are built again by one model. A model not known
 * ("" or absent) isn't compared.
 */
export function scoreBrief(
  brief: string, pairs: Pair[], results: Map<string, AiResult>, owner?: Map<string, OwnerPick>, built: Built = { motif: true, baseline: true },
  models: Models = {},
): BriefScore {
  const s = scoreOf(brief, pairs, results, owner, built);
  if (!models.motif || !models.baseline || models.motif === models.baseline) return s;
  const why = `${briefName(brief)}'s two apps were built by different models: ${models.motif} (with Motif) and ${models.baseline} (without); it can't pass until both are built again by one model`;
  return { ...s, pass: null, why: s.why ? `${why}; ${s.why}` : why, models: { motif: models.motif, baseline: models.baseline } };
}

function scoreOf(
  brief: string, pairs: Pair[], results: Map<string, AiResult>, owner: Map<string, OwnerPick> | undefined, built: Built,
): BriefScore {
  const mine = pairs.filter((p) => p.brief === brief);
  const left: string[] = [];
  /** Pairs decided without a judge: one side's screen alone, or the other side's app not building. */
  const forced: ("motif" | "baseline")[] = [];
  const forcedIds: string[] = [];
  const open: Pair[] = [];
  for (const p of mine) {
    const how = decide(p, built);
    if (how === "left") left.push(p.id);
    else if (how === "open") open.push(p);
    else {
      forced.push(how);
      forcedIds.push(p.id);
    }
  }
  const base = { brief, pairs: mine.length, left, forced: forcedIds };
  const none = { motif: 0, baseline: 0, tie: 0 };
  if (mine.length === 0) return { ...base, ai: none, pass: null, why: "no pairs yet" };
  if (built.motif === null || built.baseline === null) {
    const side = (motif: boolean) => `the app made ${motif ? "with" : "without"} Motif`;
    const why = built.motif === null && built.baseline === null
      ? "waiting for the build results of both apps, the one made with Motif and the one made without"
      : built.motif === false || built.baseline === false
        ? `${side(built.motif === false)} didn't build, and the build result of ${side(built.motif === null)} isn't in yet`
        : `waiting for the build result of ${side(built.motif === null)}`;
    return { ...base, ai: none, pass: null, why };
  }
  if (!built.motif && !built.baseline) return { ...base, ai: none, pass: false, why: "neither app built" };
  if (forced.length + open.length === 0) return { ...base, ai: none, pass: false, why: "no pair had a screen from either app" };

  const ai = { ...none };
  for (const w of forced) ai[w]++;
  let unjudged = 0;
  for (const p of open) {
    const r = results.get(p.id);
    if (r) ai[r]++;
    else unjudged++;
  }
  const judged = ai.motif + ai.baseline + ai.tie;

  const votes = { motif: 0, other: 0 };
  for (const w of forced) votes[w === "motif" ? "motif" : "other"]++;
  let unvoted = 0;
  let voted = 0;
  for (const p of open) {
    const v = owner?.get(p.id);
    if (v) {
      votes[v === "motif" ? "motif" : "other"]++;
      voted++;
    } else unvoted++;
  }
  const ownerJudged = votes.motif + votes.other;

  const reasons: string[] = [];
  if (!built.motif) reasons.push("the app made with Motif didn't build, so it lost every pair");
  // Motif's side wins every pair it drew without a judge: said as a forfeit, with the log a person reads before accepting it.
  const unbuilt = !built.baseline ? `won by forfeit: the app without Motif didn't build — read a-${brief}/${built.logs?.baseline ?? "build.log"}` : undefined;
  if (unbuilt) reasons.push(unbuilt);
  const result = (pass: boolean | null, more: string[]): BriefScore => {
    const forfeit = unbuilt ?? (pass === true && open.length === 0 ? `won by forfeit: no pair had both apps' screens, so none was judged — read a-${brief}/pair-shots.json` : undefined);
    return {
      ...base, ai, ...(voted > 0 ? { owner: votes } : {}), pass, why: [...(forfeit && !unbuilt ? [forfeit] : []), ...reasons, ...more].join("; "),
      ...(forfeit && pass !== false ? { forfeit } : {}),
    };
  };

  const aiLine = judged > 0 ? `AI judges picked Motif in ${ai.motif} of ${judged} (${pct(ai.motif, judged)}) and the baseline in ${ai.baseline} (${pct(ai.baseline, judged)})` : "";
  // A brief fails early only when no outcome of the pairs still to be judged or voted could pass it.
  const aiTotal = judged + unjudged;
  const aiFails = aiTotal > 0 && ((ai.motif + unjudged) * 100 < 70 * aiTotal || ai.baseline * 100 > 15 * aiTotal);
  const ownerTotal = ownerJudged + unvoted;
  const ownerFails = ownerTotal > 0 && (votes.motif + unvoted) * 2 <= ownerTotal;
  const failures: string[] = [];
  if (aiFails && unjudged === 0) failures.push(`${aiLine}; it needs at least 70% and at most 15%`);
  else if (aiFails) failures.push(`${aiLine} so far, and ${plural(unjudged, "judgement")} to come can no longer bring it to 70% with at most 15% for the baseline`);
  if (ownerFails && unvoted === 0) failures.push(`the owner picked Motif in ${votes.motif} of ${ownerJudged} (${pct(votes.motif, ownerJudged)}); it needs more than half`);
  else if (ownerFails) failures.push(`the owner picked Motif in ${votes.motif} of ${ownerJudged} so far, and ${plural(unvoted, "vote")} to come can no longer make it more than half`);
  if (failures.length > 0) return result(false, failures);

  const waiting: string[] = [];
  if (unjudged > 0) waiting.push(`waiting for ${plural(unjudged, "judgement")}`);
  if (unvoted > 0) waiting.push("waiting for the owner's votes");
  if (waiting.length > 0) return result(null, waiting);
  return result(true, [`${aiLine}; the owner picked Motif in ${votes.motif} of ${ownerJudged} (${pct(votes.motif, ownerJudged)})`]);
}

/** Test A's verdict: fail when any brief fails; incomplete while an expected brief has no verdict yet; else pass. */
export function verdictA(scores: BriefScore[], expected: string[]): { status: "pass" | "fail" | "incomplete"; detail: string } {
  const of = (b: string) => scores.find((s) => s.brief === b);
  const failed = expected.filter((b) => of(b)?.pass === false);
  if (failed.length > 0) {
    return { status: "fail", detail: `Motif didn't win ${failed.join(", ")}: ${failed.map((b) => `${b}: ${of(b)!.why}`).join(" | ")}.` };
  }
  // Briefs passed with no judge deciding them: named, so a person reads their logs before the verdict is accepted.
  const forfeits = expected.filter((b) => of(b)?.pass === true && of(b)!.forfeit);
  const byForfeit = forfeits.length > 0 ? ` Won by forfeit: ${forfeits.map((b) => `${b} (${of(b)!.forfeit!.replace(/^won by forfeit: /, "")})`).join(", ")}.` : "";
  const waiting = expected.filter((b) => !of(b) || of(b)!.pass === null || of(b)!.pairs === 0);
  if (waiting.length > 0) {
    return { status: "incomplete", detail: `${waiting.length} of ${expected.length} briefs have no verdict yet: ${waiting.map((b) => `${b} (${of(b)?.why ?? "no pairs"})`).join(", ")}.${byForfeit}` };
  }
  return { status: "pass", detail: `Motif won all ${expected.length} briefs.${byForfeit}` };
}

/**
 * Whether an app built, from its case's grade: null when it wasn't graded (unknown). Only the build counts: its
 * `build` criterion; the type check stands in for it where it is the compile step (Compose, SwiftUI) or where the build
 * stopped at the same type errors (the criterion's typeErrorsOnly, set where grade.ts builds it). Flutter's analyze warnings and Expo's tsc errors don't forfeit pairs: those apps run
 * and draw. A grade with no build or type-check criterion is an app that wasn't found (its `app` criterion failed), which didn't build.
 */
export function appBuilt(grade: Grade | undefined, stack?: StackId): boolean | null {
  if (!grade) return null;
  const build = grade.criteria.find((k) => k.id === "build");
  const typecheck = grade.criteria.find((k) => k.id === "typecheck");
  if (!build && !typecheck) return !grade.criteria.some((k) => k.id === "app" && !k.pass);
  if (build && !build.pass) return false;
  if (typecheck && !typecheck.pass && (stack === "compose" || stack === "swiftui" || typecheck.typeErrorsOnly)) return false;
  return true;
}

/** Whether each side's app built, from the run's grading of its d-* and a-* cases; null for an app not graded (or skipped). */
export function builtFor(state: RunState, brief: string, stack: StackId | undefined = CASES.find((c) => c.id === `d-${brief}`)?.stack): Built {
  const [d, a] = [state.cases[`d-${brief}`]?.grade, state.cases[`a-${brief}`]?.grade];
  return {
    motif: appBuilt(d, stack), baseline: appBuilt(a, stack),
    logs: { ...(d ? { motif: forfeitLog(d, stack) } : {}), ...(a ? { baseline: forfeitLog(a, stack) } : {}) },
  };
}

/**
 * The file in a case's results folder that says why its app didn't build: the session's transcript when no app was
 * found, else the stack's build log (compile.log for Compose, xcodebuild.log for SwiftUI, analyze.log for Flutter,
 * typecheck.log for Expo, which have no build of their own; build.log for the rest).
 */
export function forfeitLog(grade: Grade, stack?: StackId): string {
  const log = grade.criteria.some((k) => k.id === "app" && !k.pass) ? "session.jsonl"
    : stack === "compose" ? "compile.log" : stack === "swiftui" ? "xcodebuild.log" : stack === "flutter" ? "analyze.log" : stack === "react-native" ? "typecheck.log" : "build.log";
  // A build that never started (no Gradle wrapper, JDK, SDK or Xcode project) writes no log: its grade says why.
  const failed = grade.criteria.find((k) => ["app", "build", "typecheck"].includes(k.id) && !k.pass);
  return failed?.detail ? `${log} (its grade says: ${failed.detail})` : log;
}

/** The model each side of a brief was built by, from its d-* and a-* sessions (absent when a session hasn't run). */
export const modelsFor = (state: RunState, brief: string): Models => ({
  motif: state.cases[`d-${brief}`]?.session?.model, baseline: state.cases[`a-${brief}`]?.session?.model,
});

/**
 * The pairs decided without a judge or a vote, by pair id: "motif" or "baseline" for the side that wins, "left" for a
 * pair left out. The AI judges skip them, and so does the owner's page.
 */
export function forcedPairs(state: RunState, out: string): Map<string, "motif" | "baseline" | "left"> {
  const m = new Map<string, "motif" | "baseline" | "left">();
  for (const p of readPairs(out)) {
    const how = decide(p, builtFor(state, p.brief));
    if (how !== "open") m.set(p.id, how);
  }
  return m;
}

/** The briefs Test A was asked about: those with an a-* case in the run, Mac-only ones skipped here included. */
export const expectedBriefs = (state: RunState): string[] => Object.keys(state.cases).filter((id) => id.startsWith("a-")).map((id) => id.slice(2));

/** Every expected brief's score from the run folder's pairs and judgements (the AI result needs both swaps judged). */
export function scoreRun(state: RunState, out: string, owner?: Map<string, OwnerPick>): BriefScore[] {
  const pairs = readPairs(out);
  const judgements = readJudgements(out);
  const results = new Map<string, AiResult>();
  for (const p of pairs) {
    const first = judgements.find((j) => j.pairId === p.id && j.order === "motif-left");
    const second = judgements.find((j) => j.pairId === p.id && j.order === "motif-right");
    if (first && second) results.set(p.id, pairResult(first.pick, second.pick));
  }
  return expectedBriefs(state).map((b) => scoreBrief(b, pairs, results, owner, builtFor(state, b), modelsFor(state, b)));
}
