// Test A's scores and verdict (Part 4 §6): each brief is scored on its own pairs, so a web brief with twice the pairs
// counts no more than the others, and Test A passes only when every brief passes. The AI judges must pick Motif's side
// in at least 70% of a brief's judged pairs and the baseline in at most 15%; the owner must pick Motif in more than half
// ("about the same" counts as judged and isn't a win). A pair with a screen from one side only goes to that side, for the
// AI and the owner alike; so does every pair of a brief whose other side's app didn't build. A pair with neither is left out.
import { pairResult, readJudgements } from "./judge-a";
import { readPairs, type Pair } from "./pairs";
import type { RunState } from "./state";

export interface BriefScore {
  brief: string;
  /** Every pair of the brief, the ones left out included. */
  pairs: number;
  /** The AI judges' picks over the pairs judged so far. */
  ai: { motif: number; baseline: number; tie: number };
  /** The owner's votes over the pairs they decide; "other" is the baseline and "about the same". Absent until they vote. */
  owner?: { motif: number; other: number };
  /** Ids of the pairs left out: neither side was drawn. */
  left: string[];
  /** null while the brief waits for judgements, the owner's votes or its pairs. */
  pass: boolean | null;
  why: string;
}

export type OwnerPick = "motif" | "baseline" | "same";
export type AiResult = "motif" | "baseline" | "tie";
/** Whether each side's app for the brief built (and type-checked); a side whose app didn't loses its pairs. */
export interface Built { motif: boolean; baseline: boolean }

const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One brief's score. `results` is the AI's result per pair id (a pair with no entry is unjudged, not a tie); `owner` the
 * owner's picks per pair id, already mapped to Motif's and the baseline's side.
 */
export function scoreBrief(
  brief: string, pairs: Pair[], results: Map<string, AiResult>, owner?: Map<string, OwnerPick>, built: Built = { motif: true, baseline: true },
): BriefScore {
  const mine = pairs.filter((p) => p.brief === brief);
  const left: string[] = [];
  /** Pairs decided without a judge: one side's screen alone, or the other side's app not building. */
  const forced: ("motif" | "baseline")[] = [];
  const open: Pair[] = [];
  for (const p of mine) {
    if (p.outcome === "neither") left.push(p.id);
    else if (!built.motif && !built.baseline) left.push(p.id);
    else if (!built.motif) forced.push("baseline");
    else if (!built.baseline) forced.push("motif");
    else if (p.outcome === "motif-only") forced.push("motif");
    else if (p.outcome === "baseline-only") forced.push("baseline");
    else open.push(p);
  }
  const base = { brief, pairs: mine.length, left };
  const none = { motif: 0, baseline: 0, tie: 0 };
  if (mine.length === 0) return { ...base, ai: none, pass: null, why: "no pairs yet" };
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
  if (!built.baseline) reasons.push("the app made without Motif didn't build, so it lost every pair");
  const result = (pass: boolean | null, more: string[]): BriefScore => ({
    ...base, ai, ...(voted > 0 ? { owner: votes } : {}), pass, why: [...reasons, ...more].join("; "),
  });

  const aiLine = judged > 0 ? `AI judges picked Motif in ${ai.motif} of ${judged} (${pct(ai.motif, judged)}) and the baseline in ${ai.baseline} (${pct(ai.baseline, judged)})` : "";
  const aiFails = judged > 0 && (ai.motif * 100 < 70 * judged || ai.baseline * 100 > 15 * judged);
  const ownerFails = unvoted === 0 && ownerJudged > 0 && votes.motif * 2 <= ownerJudged;
  const failures: string[] = [];
  if (aiFails && unjudged === 0) failures.push(`${aiLine}; it needs at least 70% and at most 15%`);
  else if (aiFails) failures.push(`${aiLine} so far, already short`);
  if (ownerFails) failures.push(`the owner picked Motif in ${votes.motif} of ${ownerJudged} (${pct(votes.motif, ownerJudged)}); it needs more than half`);
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
  const waiting = expected.filter((b) => !of(b) || of(b)!.pass === null || of(b)!.pairs === 0);
  if (waiting.length > 0) {
    return { status: "incomplete", detail: `${waiting.length} of ${expected.length} briefs have no verdict yet: ${waiting.map((b) => `${b} (${of(b)?.why ?? "no pairs"})`).join(", ")}.` };
  }
  return { status: "pass", detail: `Motif won all ${expected.length} briefs.` };
}

/** Whether each side's app built, from the run's grading of its d-* and a-* cases; an app not graded counts as built. */
export function builtFor(state: RunState, brief: string): Built {
  const built = (id: string): boolean => {
    const criteria = state.cases[id]?.grade?.criteria ?? [];
    return !criteria.some((k) => ["app", "build", "typecheck"].includes(k.id) && !k.pass);
  };
  return { motif: built(`d-${brief}`), baseline: built(`a-${brief}`) };
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
  return expectedBriefs(state).map((b) => scoreBrief(b, pairs, results, owner, builtFor(state, b)));
}
