// The run's report: a verdict per test and each case's criteria, as report.md for people (run.ts writes report.json beside it).
import { andList, type EvalCase, type TestId } from "./cases";
import type { RunState } from "./state";

export interface TestVerdict { test: TestId; status: "pass" | "fail" | "incomplete"; detail: string }

export const TEST_NAMES: Record<TestId, string> = { B: "Test B — consistency", C: "Test C — review accuracy", D: "Test D — zero accounts" };

/** "; c-swiftui was skipped (it needs a Mac)", for a test's Mac-only cases this run skipped; nothing when none were. */
function skippedText(state: RunState, cases: EvalCase[], test: TestId): string {
  const ids = cases.filter((c) => c.test === test && state.cases[c.id]?.status === "skipped").map((c) => c.id);
  if (ids.length === 0) return "";
  return `; ${andList(ids)} ${ids.length === 1 ? "was skipped (it needs a Mac)" : "were skipped (they need a Mac)"}`;
}

/** A test's verdict from the cases it has, leaving out those skipped here (Mac-only cases off macOS), which it names. */
function verdictOf(state: RunState, cases: EvalCase[], test: TestId): TestVerdict {
  const skipped = skippedText(state, cases, test);
  const mine = cases.filter((c) => c.test === test && state.cases[c.id]?.status !== "skipped");
  const graded = mine.filter((c) => state.cases[c.id]?.status === "graded");
  const failed = graded.filter((c) => state.cases[c.id]!.grade?.pass === false).map((c) => c.id);
  if (failed.length > 0) return { test, status: "fail", detail: `Failed: ${failed.join(", ")}${skipped}.` };
  if (graded.length < mine.length) return { test, status: "incomplete", detail: `${graded.length} of ${mine.length} cases graded${skipped}.` };
  return { test, status: "pass", detail: skipped ? `All ${mine.length} cases run passed${skipped}.` : `All ${mine.length} cases passed.` };
}

/** Test D is B and C with no MCP servers (every session here has none; each is checked as it starts) plus the new apps (spec §13.2). */
export function testVerdicts(state: RunState, cases: EvalCase[]): TestVerdict[] {
  const b = verdictOf(state, cases, "B");
  const c = verdictOf(state, cases, "C");
  const apps = verdictOf(state, cases, "D");
  let d: TestVerdict;
  if (apps.status === "fail") d = apps;
  else if (b.status === "fail" || c.status === "fail") d = { test: "D", status: "fail", detail: "Test D also needs B and C to pass with no design sources connected." };
  else if (apps.status === "incomplete" || b.status === "incomplete" || c.status === "incomplete") d = { test: "D", status: "incomplete", detail: `${apps.detail} Test D also needs B and C to pass.` };
  else d = { test: "D", status: "pass", detail: `The new apps passed, and B and C passed with no design sources connected${skippedText(state, cases, "D")}.` };
  return [b, c, d];
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const commit = (c: string, dirty: boolean) => `${c.slice(0, 12)}${dirty ? " (with uncommitted changes)" : ""}`;

export function renderReport(state: RunState, cases: EvalCase[], verdicts: TestVerdict[]): string {
  const models = [...new Set(Object.values(state.cases).map((c) => c.session?.model).filter(Boolean))].join(", ");
  const lines: string[] = [
    `# Motif evals: run ${state.id}`,
    "",
    `- Commit ${commit(state.commit, state.dirty)}, started ${state.started}`,
    ...state.resumes.map((r) => `- Resumed ${r.at} on commit ${commit(r.commit, r.dirty)}`),
    ...(state.regrades ?? []).map((r) => `- Re-graded ${r.at} on commit ${commit(r.commit, r.dirty)}: the new-component rule, from each B case's saved diff`),
    `- Claude Code ${state.claudeVersion || "(version unknown)"}; model: ${models || "your account's default"}`,
    "- Every session: your Claude account (no API key), none of your settings, plugins or MCP servers, and Motif's plugin only.",
    "",
    "## Verdicts",
    "",
    ...verdicts.map((v) => `- **${TEST_NAMES[v.test]}: ${v.status.toUpperCase()}** — ${v.detail}`),
    "",
  ];
  for (const c of cases) {
    const s = state.cases[c.id];
    if (!s) continue;
    lines.push(`## ${c.id}: ${c.title}`, "");
    if (s.status === "skipped") {
      lines.push(`Skipped: ${s.note ?? "it needs a Mac."}`, "");
      continue;
    }
    if (s.session) {
      const x = s.session;
      lines.push(`Session: ${x.end}, ${x.turns} turns, ${x.minutes} minutes, about $${x.costUsd.toFixed(2)} at API prices (your plan covers it)${x.denials.length ? `, ${x.denials.length} actions refused by auto mode` : ""}.`, "");
    }
    if (s.note) lines.push(`Note: ${s.note}`, "");
    if (s.status !== "graded" || !s.grade) {
      lines.push(`Not graded (${s.status}).`, "");
      continue;
    }
    lines.push(
      `**${s.grade.pass ? "PASS" : "FAIL"}**`, "",
      "| | Criterion | Detail |", "|---|---|---|",
      ...s.grade.criteria.map((k) => `| ${k.pass ? "✓" : "✗"} | ${cell(k.label)} | ${cell(k.detail)} |`),
      "",
    );
    if (s.session?.denials.length) lines.push("Refused by auto mode:", ...s.session.denials.map((d) => `- ${cell(d)}`), "");
  }
  return lines.join("\n");
}
