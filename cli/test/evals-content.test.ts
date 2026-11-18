import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, type EvalCase } from "../../tests/evals/cases";
import { CONTENT_INTRO, briefContent, contentProblems, screenContent } from "../../tests/evals/content";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const brief = (sections: string) => `# Darb\n\n## What it is\n\nA trip planner.\n\n${sections}`;
const CONTENT = [
  "## Content",
  "",
  CONTENT_INTRO,
  "",
  "### Welcome (/)",
  "",
  "- Headline: Plan a trip",
  "- One action: Get started",
  "",
  "### Sign in (Sign in)",
  "",
  "- Fields: Email, Password",
  "",
  "### Your trips (/trips)",
  "",
  "- Trip: Muscat, 3 days",
  "- Trip: Salalah (صلالة), 5 days",
  "",
  "## Apps they like",
  "",
  "Not content.",
].join("\n");

const kase = (id: string, test: EvalCase["test"], name: string | undefined, routes: string[]): EvalCase =>
  ({ id, test, title: id, ...(name ? { brief: name } : {}), routes, prompt: "", maxTurns: 1, maxBudgetUsd: 1, minutes: 1 }) as EvalCase;

describe("briefContent", () => {
  test("keys each sub-heading's body by the screen in its last parentheses", () => {
    const c = briefContent(brief(CONTENT));
    expect([...c.keys()]).toEqual(["/", "Sign in", "/trips"]);
    expect(c.get("/")).toBe("- Headline: Plan a trip\n- One action: Get started");
    expect(c.get("/trips")).toBe("- Trip: Muscat, 3 days\n- Trip: Salalah (صلالة), 5 days");
  });
  test("reads Windows line endings the same", () => {
    const c = briefContent(brief(CONTENT).replace(/\n/g, "\r\n"));
    expect(c.get("Sign in")).toBe("- Fields: Email, Password");
  });
  test("no Content section is an empty map", () => {
    expect(briefContent(brief("## Feel\n\nCalm.\n")).size).toBe(0);
  });
});

describe("screenContent", () => {
  test("a screen without content is undefined", () => {
    const dir = tempDir("motif-content-");
    writeFileSync(join(dir, "darb.md"), brief(CONTENT));
    expect(screenContent("darb", "/trips", dir)).toContain("Muscat");
    expect(screenContent("darb", "/settings", dir)).toBeUndefined();
  });
});

describe("contentProblems", () => {
  const setup = (text: string) => {
    const dir = tempDir("motif-content-");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "darb.md"), text);
    return dir;
  };
  test("a brief without a screen's sub-heading names the brief and the screen", () => {
    const dir = setup(brief(CONTENT.replace("### Your trips (/trips)", "### Your trips")));
    expect(contentProblems([kase("d-darb", "D", "darb", ["/", "Sign in", "/trips"])], dir)).toEqual([
      "d-darb: brief darb has no Content for /trips (a \"### <Label> (/trips)\" sub-heading under ## Content).",
    ]);
  });
  test("a brief without ## Content, or without its first line, is one problem", () => {
    const none = setup(brief("## Feel\n\nCalm.\n"));
    expect(contentProblems([kase("a-darb", "A", "darb", ["/"])], none)).toEqual(["a-darb: brief darb has no ## Content section."]);
    const noIntro = setup(brief(CONTENT.replace(CONTENT_INTRO, "")));
    expect(contentProblems([kase("a-darb", "A", "darb", ["/"])], noIntro)).toEqual([`a-darb: brief darb's ## Content doesn't start with: ${CONTENT_INTRO}`]);
  });
  test("every brief has content for its screens", () => {
    expect(contentProblems(CASES)).toEqual([]);
  });
  test("B and C cases, and a complete brief, have none", () => {
    const dir = setup(brief(CONTENT));
    expect(contentProblems([kase("b-x", "B", undefined, ["/"]), kase("d-darb", "D", "darb", ["/", "Sign in", "/trips"])], dir)).toEqual([]);
  });
});
