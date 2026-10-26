// Test A's AI judges (Part 4 §6): for each pair where both apps' screens were drawn, a read-only Claude Code session
// (isolated as test C's grader is, decision 0003) is given the brief's "What it is", "Who it's for" and "Feel", the
// rubric, and the two screenshots as left.png and right.png, and picks the better design, or a tie. Every pair is judged
// twice, Motif's screen on the left and then on the right; a side wins only when both judgements pick it. Each judgement
// is saved in a/judgements.json as it's made, so a run paused by a usage limit judges only what's left when resumed.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Paused } from "./judge";
import { readPairs, type Pair } from "./pairs";

export const RUBRIC_A = join(import.meta.dir, "rubric-a.md");
const BRIEFS = join(import.meta.dir, "..", "fixtures", "briefs");

/** The judge's only tool: it reads the two images. */
export const JUDGE_A_TOOLS = ["Read"];
/** What the judge's first event may list: Read, and the StructuredOutput tool Claude Code adds for --json-schema. */
export const JUDGE_A_EXPECTED_TOOLS = [...JUDGE_A_TOOLS, "StructuredOutput"];

export const JUDGE_A_SCHEMA = {
  type: "object",
  properties: { pick: { type: "string", enum: ["left", "right", "tie"] }, why: { type: "string" } },
  required: ["pick", "why"],
  additionalProperties: false,
};

/** A judge's pick (named so it doesn't shadow TypeScript's own Pick). */
export type JudgePick = "left" | "right" | "tie";
export type Order = "motif-left" | "motif-right";
export interface Judgement { pairId: string; order: Order; pick: JudgePick; why: string }

/** The parts of a brief the judge sees, the same for both sides. */
export interface BriefParts { whatItIs: string; whoItsFor: string; feel: string }

/** A brief's "What it is", "Who it's for" and "Feel" sections; a brief missing one is an error. */
export function briefParts(markdown: string): BriefParts {
  const section = (title: string): string => {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${title.toLowerCase()}`);
    if (start < 0) throw new Error(`The brief has no "${title}" section.`);
    const end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
    const text = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
    if (!text) throw new Error(`The brief's "${title}" section is empty.`);
    return text;
  };
  return { whatItIs: section("What it is"), whoItsFor: section("Who it's for"), feel: section("Feel") };
}

/** tests/fixtures/briefs/<brief>.md's three sections. */
export const readBriefParts = (brief: string): BriefParts => briefParts(readFileSync(join(BRIEFS, `${brief}.md`), "utf8"));

/** The judge's prompt: the brief's three sections, the rubric, and the two images, named only Left and Right. */
export function judgeAPrompt(brief: BriefParts, rubric: string = readFileSync(RUBRIC_A, "utf8")): string {
  return [
    'You are comparing two designs of the same screen of an app. The two screenshots are in this folder: "Left" is left.png and "Right" is right.png. Read both images, follow the rubric below, and answer. Don\'t change anything.',
    "## The app",
    `### What it is\n${brief.whatItIs}`,
    `### Who it's for\n${brief.whoItsFor}`,
    `### Feel\n${brief.feel}`,
    rubric,
    'Answer in the schema: "pick" is "left", "right" or "tie", and "why" is one sentence.',
  ].join("\n\n");
}

/** The judge's answer, or null when it isn't one of the three picks. */
export function readPick(structured: unknown): { pick: JudgePick; why: string } | null {
  const s = (structured ?? {}) as { pick?: unknown; why?: unknown };
  return s.pick === "left" || s.pick === "right" || s.pick === "tie" ? { pick: s.pick, why: String(s.why ?? "") } : null;
}

/**
 * A pair's result from its two judgements: the first had Motif's screen on the left, the second on the right. A side
 * wins only when both pick it; anything else is a tie, which cancels a judge's lean towards one position.
 */
export function pairResult(first: JudgePick, second: JudgePick): "motif" | "baseline" | "tie" {
  if (first === "left" && second === "right") return "motif";
  if (first === "right" && second === "left") return "baseline";
  return "tie";
}

export type JudgeAOutcome = { pick: JudgePick; why: string } | { paused: { resetsAt?: number } } | { error: string };
/**
 * One judgement: the two images' paths (in the run's folder) as they are to be shown, and the brief's parts. `name` is
 * for the transcript's file name only; the judge never sees it.
 */
export type JudgeAFn = (images: { left: string; right: string }, brief: BriefParts, name: string) => Promise<JudgeAOutcome>;

/** Every judgement so far, relative to the run folder. */
export const judgementsFile = "a/judgements.json";

export function readJudgements(out: string): Judgement[] {
  const file = join(out, judgementsFile);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Judgement[]) : [];
}

function saveJudgements(out: string, all: Judgement[]): void {
  const file = join(out, judgementsFile);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 2));
  renameSync(`${file}.tmp`, file);
}

const ORDERS: Order[] = ["motif-left", "motif-right"];

/** The judgements a run's pairs still need: two for each pair where both apps' screens were drawn, less those made. */
/** `exclude` holds the ids of pairs not to judge: those already decided without a judge (forcedPairs). */
export function missingJudgements(out: string, exclude: ReadonlySet<string> = new Set()): { pair: Pair; order: Order }[] {
  const done = new Set(readJudgements(out).map((j) => `${j.pairId} ${j.order}`));
  return readPairs(out)
    .filter((p) => p.outcome === "both" && p.motif && p.baseline && !exclude.has(p.id))
    .flatMap((pair) => ORDERS.filter((order) => !done.has(`${pair.id} ${order}`)).map((order) => ({ pair, order })));
}

/**
 * Makes the judgements still missing, saving each as it's made. A usage limit throws Paused (what was judged stands); a
 * judge that isn't isolated throws from `judge` itself. A judgement that couldn't be made is left for --resume: it's
 * skipped (and listed in `failed`) while `skip` holds it, so a run asks again only when resumed.
 */
export async function judgePairs(
  out: string, judge: JudgeAFn, opts: { brief?: (name: string) => BriefParts; skip?: Set<string>; exclude?: ReadonlySet<string>; log?: (line: string) => void } = {},
): Promise<{ judged: number; failed: string[] }> {
  const brief = opts.brief ?? readBriefParts;
  const skip = opts.skip ?? new Set<string>();
  let judged = 0;
  const failed: string[] = [];
  for (const { pair, order } of missingJudgements(out, opts.exclude)) {
    const key = `${pair.id} ${order}`;
    if (skip.has(key)) continue;
    const [m, b] = [join(out, pair.motif!), join(out, pair.baseline!)];
    const r = await judge(order === "motif-left" ? { left: m, right: b } : { left: b, right: m }, brief(pair.brief), `${pair.id}.${order}`);
    if ("paused" in r) throw new Paused(r.paused.resetsAt);
    if ("error" in r) {
      skip.add(key);
      failed.push(key);
      opts.log?.(`${pair.brief}: Test A's pair ${pair.id} (${pair.screen}, ${pair.size} px) couldn't be judged: ${r.error} --resume asks again.`);
      continue;
    }
    saveJudgements(out, [...readJudgements(out), { pairId: pair.id, order, pick: r.pick, why: r.why }]);
    judged++;
  }
  return { judged, failed };
}
