// Test C's model grader (spec §13.2: "judgement issues: model grader with a written rubric"). One read-only Claude Code session in the
// reviewed app decides which candidate findings describe each planted judgement problem, and whether unmatched serious findings are real.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, SeededIssue } from "./match";

export const RUBRIC = join(import.meta.dir, "rubric.md");

export const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: { issue: { type: "string" }, findings: { type: "array", items: { type: "string" } }, why: { type: "string" } },
        required: ["issue", "findings", "why"],
        additionalProperties: false,
      },
    },
    unmatched: {
      type: "array",
      items: {
        type: "object",
        properties: { finding: { type: "string" }, verdict: { type: "string", enum: ["real", "false"] }, why: { type: "string" } },
        required: ["finding", "verdict", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues", "unmatched"],
  additionalProperties: false,
};

export interface JudgeInput { issues: { issue: SeededIssue; candidates: Finding[] }[]; unmatched: Finding[] }
export interface JudgeVerdict {
  issues: Record<string, { findings: string[]; why: string }>;
  unmatched: Record<string, { verdict: "real" | "false"; why: string }>;
  notes: string[];
}
export type JudgeOutcome = { verdict: JudgeVerdict } | { paused: { resetsAt?: number } } | { error: string };
export type JudgeFn = (input: JudgeInput, cwd: string) => Promise<JudgeOutcome>;

/** Grading met the developer's usage limit: the run pauses, and --resume grades the case again. */
export class Paused extends Error {
  resetsAt?: number;
  constructor(resetsAt?: number) {
    super("The usage limit was reached while grading.");
    if (resetsAt) this.resetsAt = resetsAt;
  }
}

const show = (f: Finding) =>
  JSON.stringify({ id: f.id, severity: f.severity, category: f.category, location: f.location, ...(f.locations ? { locations: f.locations } : {}), summary: f.summary, fix: f.fix });

export function judgePrompt(input: JudgeInput, rubric: string = readFileSync(RUBRIC, "utf8")): string {
  const partA = input.issues
    .map(({ issue, candidates }) =>
      [`### ${issue.id} (${issue.categories.join(", ")})`, issue.summary, `Where: ${JSON.stringify(issue.location)}`, "Candidate findings:", ...candidates.map((f) => `- ${show(f)}`)].join("\n"))
    .join("\n\n");
  return [
    "You are grading a design review of the web app in this folder. Follow the rubric below exactly. Read the app's files (its code, design/ and the screenshots in design/shots/) to check claims. Don't change anything.",
    rubric,
    "## Part A: planted problems and the findings that might describe them",
    partA || "(none)",
    "## Part B: critical and major findings that matched no planted problem",
    input.unmatched.map((f) => `- ${show(f)}`).join("\n") || "(none)",
    'Answer with "issues" (one entry per Part A problem: the ids of the candidate findings that describe it, possibly none, and why) and "unmatched" (one entry per Part B finding: "real" or "false", and why).',
  ].join("\n\n");
}

/** Keeps only answers about findings each question offered; whatever wasn't answered is noted (a problem as not found, a finding as false). */
export function readVerdict(structured: unknown, input: JudgeInput): JudgeVerdict {
  const s = (structured ?? {}) as { issues?: any[]; unmatched?: any[] };
  const out: JudgeVerdict = { issues: {}, unmatched: {}, notes: [] };
  for (const { issue, candidates } of input.issues) {
    const answer = (s.issues ?? []).find((a) => a?.issue === issue.id);
    const offered = new Set(candidates.map((f) => f.id));
    if (!answer) out.notes.push(`No answer for ${issue.id}; counted as not found.`);
    const ids = (Array.isArray(answer?.findings) ? answer.findings : []).filter((id: unknown): id is string => typeof id === "string" && offered.has(id));
    out.issues[issue.id] = { findings: ids, why: String(answer?.why ?? "") };
  }
  for (const f of input.unmatched) {
    const answer = (s.unmatched ?? []).find((a) => a?.finding === f.id);
    if (answer?.verdict === "real" || answer?.verdict === "false") {
      out.unmatched[f.id] = { verdict: answer.verdict, why: String(answer.why ?? "") };
    } else {
      out.notes.push(`No verdict for ${f.id}; counted as false.`);
      out.unmatched[f.id] = { verdict: "false", why: "" };
    }
  }
  return out;
}
