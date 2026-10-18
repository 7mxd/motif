import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { JUDGE_SCHEMA, judgePrompt, Paused, readVerdict, RUBRIC, type JudgeInput } from "../../tests/evals/judge";
import type { Finding, SeededIssue } from "../../tests/evals/match";

const issue: SeededIssue = {
  id: "S-14", kind: "judgement", detectedBy: "review", categories: ["hierarchy"], severity: "major",
  location: { file: "src/app/page.tsx", screen: "/" }, summary: "Home has three primary buttons side by side, so nothing says what to do first.",
};
const f = (id: string, summary: string): Finding => ({ id, severity: "major", category: "hierarchy", location: { screen: "/" }, summary, fix: "Make one primary." });
const input: JudgeInput = {
  issues: [{ issue, candidates: [f("F-001", "Three equal primary buttons compete."), f("F-002", "The headline is too big.")] }],
  unmatched: [f("F-009", "The settings page is missing.")],
};

describe("test C's model grader", () => {
  test("has a written rubric with both parts", () => {
    expect(existsSync(RUBRIC)).toBe(true);
    const r = readFileSync(RUBRIC, "utf8");
    expect(r).toContain("## Part A");
    expect(r).toContain("## Part B");
  });

  test("is asked about each planted problem with its candidates, and each serious unmatched finding", () => {
    const p = judgePrompt(input, "RUBRIC TEXT");
    for (const s of ["RUBRIC TEXT", "S-14", "F-001", "F-002", "F-009", "Three equal primary buttons compete.", "Don't change anything"]) expect(p).toContain(s);
  });

  test("answers in a schema that needs both parts", () => {
    const schema = JSON.parse(JSON.stringify(JUDGE_SCHEMA));
    expect(schema.required).toEqual(["issues", "unmatched"]);
    expect(schema.properties.unmatched.items.properties.verdict.enum).toEqual(["real", "false"]);
  });

  test("only findings it was offered count, and anything unanswered is noted", () => {
    const v = readVerdict({ issues: [{ issue: "S-14", findings: ["F-001", "F-777"], why: "F-001 names it." }], unmatched: [] }, input);
    expect(v.issues["S-14"]!.findings).toEqual(["F-001"]);
    expect(v.unmatched["F-009"]!.verdict).toBe("false");
    expect(v.notes.join(" ")).toContain("F-009");
  });

  test("a problem it didn't answer counts as not found", () => {
    const v = readVerdict({ issues: [], unmatched: [{ finding: "F-009", verdict: "real", why: "True." }] }, input);
    expect(v.issues["S-14"]!.findings).toEqual([]);
    expect(v.unmatched["F-009"]!.verdict).toBe("real");
    expect(v.notes.join(" ")).toContain("S-14");
  });

  test("a usage limit while grading is a pause, with when it resets", () => {
    const e = new Paused(1792000800);
    expect(e).toBeInstanceOf(Error);
    expect(e.resetsAt).toBe(1792000800);
  });
});

describe("where the app is (review of batch F)", () => {
  test("the rubric points at the folder the prompt names, and /src paths are relative to it", () => {
    expect(readFileSync(RUBRIC, "utf8")).not.toContain("in this folder");
    const p = judgePrompt({ issues: [], unmatched: [] }, undefined, "/work/c-review/app");
    expect(p).toContain("/work/c-review/app");
    expect(p).toContain("a path starting with / is relative to it too");
  });
});
