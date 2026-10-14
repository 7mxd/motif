import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";
import { lineCount } from "./skill-lint";

const SKILL = join(import.meta.dir, "../../skill");
const read = (rel: string) => readFileSync(join(SKILL, rel), "utf8").replace(/\r\n/g, "\n");

/** The first part that's missing or out of order, or null when they all appear in this order. */
function outOfOrder(text: string, parts: string[]): string | null {
  let at = 0;
  for (const part of parts) {
    const i = text.indexOf(part, at);
    if (i < 0) return part;
    at = i + part.length;
  }
  return null;
}

const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];

describe("SKILL.md", () => {
  const skill = read("SKILL.md");

  test("says how to run the tool from every common shell", () => {
    for (const form of ['"<skill folder>/bin/motif" <command>', '& "<skill folder>\\bin\\motif.cmd" <command>', '"<skill folder>\\bin\\motif.cmd" <command>']) {
      expect(skill).toContain(form);
    }
    // Windows' default script policy blocks running a .ps1 directly; motif.cmd starts it with the policy bypassed.
    expect(skill).not.toContain("motif.ps1");
    for (const s of ["--json", "--png-only", "needs_browser", "motif browser install"]) expect(skill).toContain(s);
  });

  test("starts each session with doctor, the design sources and unfinished work", () => {
    expect(outOfOrder(skill, ["## At the start of a session", "motif doctor --json", "(sources/motion-dev.md)", "design/.progress.json"])).toBeNull();
  });

  test("routes to every mode and to the stack guides", () => {
    for (const link of ["(modes/design.md)", "(modes/init.md)", "(modes/feature.md)", "(modes/review.md)", "(adapters/react-web/README.md)", "(adapters/_template/README.md)", "(contract/spec.md#the-four-rules)"]) {
      expect(skill).toContain(link);
    }
  });

  test("carries the rules for every task", () => {
    for (const s of ["⏸", "skip previews", "your design guide", "theme values", "be brief", "Never a dead end", "Mock data only", "motif connect", ".gitignore", "directions/"]) {
      expect(skill).toContain(s);
    }
  });

  test("stays short, since it loads every time", () => {
    expect(lineCount(skill)).toBeLessThanOrEqual(200);
  });
});

describe("modes/design.md", () => {
  test("asks one question with three choices, then hands over", () => {
    const design = read("modes/design.md");
    for (const s of ["Start a new app", "Add a feature", "Improve my app's look", "(init.md)", "(feature.md)", "(review.md)", "design/.progress.json"]) {
      expect(design).toContain(s);
    }
  });
});

describe("modes/init.md", () => {
  const init = read("modes/init.md");

  test("has the seven steps of spec §7.3, with the gate on directions", () => {
    expect(outOfOrder(init, ["## 1. Brief", "## 2. Scaffold", "## 3. Research", "## 4. Directions ⏸", "## 5. Design guide", "## 6. Build", "## 7. Verify"])).toBeNull();
  });

  test("uses the tool for every exact step, in order", () => {
    expect(outOfOrder(init, [
      "motif preview --gallery --png-only", "design/directions/", "motif validate --tokens", "motif preview --compare",
      "motif validate", "motif tokens", "motif check", "motif shot --audit", "--against design/previews/",
    ])).toBeNull();
  });
});

describe("modes/feature.md", () => {
  const feature = read("modes/feature.md");

  test("has the six steps of spec §7.4, with the gate on the mockup", () => {
    expect(outOfOrder(feature, ["## 1. Read what exists", "## 2. Understand the feature", "## 3. Research the pattern", "## 4. Mockup ⏸", "## 5. Build", "## 6. Verify"])).toBeNull();
  });

  test("shows the mockup first, then compares the app with it while and after building", () => {
    expect(outOfOrder(feature, ["--png-only", "--against design/previews/", "motif check", "motif shot --audit", "--against design/previews/"])).toBeNull();
    expect(feature).toContain("(review.md#2-extract-only-when-there-is-no-design-guide)");
  });
});

describe("modes/review.md", () => {
  const review = read("modes/review.md");

  test("has the six steps of spec §7.5, with gates on the extracted guide and the report", () => {
    expect(outOfOrder(review, ["## 1. Scope", "## 2. Extract (only when there is no design guide)", "⏸", "## 3. Audit", "## 4. Report ⏸", "## 5. Rebuild", "## 6. A new look instead"])).toBeNull();
  });

  test("merges the exact checks into one report, naming every category and check rule", () => {
    for (const c of CATEGORIES) expect(review).toContain(`\`${c}\``);
    for (const id of RULE_IDS) expect(review).toContain(`\`${id}\``);
    for (const s of ["design/shots/audit.json", "design/reviews/", "motif extract", "design/tokens.draft.json", "low-contrast", '"source": "judgement"']) {
      expect(review).toContain(s);
    }
  });

  test("its example report is valid review JSON", () => {
    const report = JSON.parse(review.match(/```json\n([\s\S]*?)\n```/)![1]!);
    expect(report.motifReview).toBe(1);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) {
      expect(CATEGORIES).toContain(f.category);
      expect(["critical", "major", "minor"]).toContain(f.severity);
      expect(["exact", "judgement"]).toContain(f.source);
    }
  });

  test("proves a rebuild with screenshots from before and after", () => {
    expect(outOfOrder(review, ["--save before", "--against before", '"status": "fixed"'])).toBeNull();
  });
});
