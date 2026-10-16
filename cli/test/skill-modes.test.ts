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

  test("asks every open decision so none is missed, and writes nothing to the design guide before it's approved (hands-on test)", () => {
    // The hands-on review wrote two rules into DESIGN.md under the developer's name before showing them, and a question
    // about the card's look sat in the middle of a long message, where the developer's answer missed it.
    for (const s of [
      "numbered list at the end of your message",
      "ask again any that wasn't answered",
      "only after the developer approves that exact change",
      "Never put a name on an approval that didn't happen",
      "differs from what you showed",
      "ask before keeping it",
    ]) expect(skill).toContain(s);
  });

  test("asks with the agent's own question prompt when it has one, the numbered list otherwise (hands-on test)", () => {
    // In the hands-on test the feature session typed its four questions into the chat; Claude Code can prompt for them instead.
    expect(outOfOrder(skill, ["Ask with choices", "own question prompt", "(Recommended)", "up to four per prompt", "Without one", "numbered list at the end of your message"])).toBeNull();
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

  test("a new project gets its own folder, and the brief's design/ folder moves into it", () => {
    expect(outOfOrder(init, ["## 2. Scaffold", "new folder named after the app", "move the `design/` folder", "run every later command"])).toBeNull();
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

  test("a new look updates the existing design guide and keeps its history", () => {
    expect(outOfOrder(review, ["## 6. A new look instead", "keep its change log", "component list"])).toBeNull();
    expect(read("modes/init.md")).toContain("replacing the template's example line");
  });

  test("proves a rebuild with screenshots from before and after", () => {
    expect(outOfOrder(review, ["--save before", "--against before", '"status": "fixed"'])).toBeNull();
  });
});

describe("plain web, screens behind forms, and every size", () => {
  test("SKILL.md sends plain web sites to their guide; they need no Node.js", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/plain-web/README.md)");
    expect(skill).toContain("plain web sites need none");
  });

  test("init offers a simple web page and starts it from the plain web guide", () => {
    const init = read("modes/init.md");
    for (const s of ["a simple web page or site with no framework", "(../adapters/plain-web/README.md)", "linking `motif.css` in each page", "a plain web site has none", "--state"]) {
      expect(init).toContain(s);
    }
  });

  test("feature lists a plain site's components from components.css, and captures new states", () => {
    const feature = read("modes/feature.md");
    for (const s of ["(../adapters/plain-web/components.md)", "`Component:` lines", "--state"]) expect(feature).toContain(s);
  });

  test("review captures screens behind forms, checks every fix at every size, and keeps things used together on one screen", () => {
    const review = read("modes/review.md");
    expect(outOfOrder(review, [
      "## 3. Audit", "design/states/", "(../adapters/plain-web/checks.md#screens-behind-a-form-or-a-click)", "fit on one screen",
      "## 5. Rebuild", "--state design/states/<state>.js --save before", "--against before", "360, 390 and 430 px", "on one screen", '"status": "fixed"',
    ])).toBeNull();
    expect(review).toContain("(../adapters/plain-web/checks.md)");
  });

  test("review shows a guide change before writing it, and asks before keeping a fix that turned out differently (hands-on test)", () => {
    const review = read("modes/review.md");
    expect(outOfOrder(review, [
      "## 1. Scope", "A site with one page",
      "## 5. Rebuild", "goes through a design guide change ⏸ before you write it", "differently from the report's fix", "ask before keeping it ⏸",
      '"status": "fixed"',
    ])).toBeNull();
  });

  test("a feature's mockup marks each state's frame, and the comparison captures those states (hands-on test)", () => {
    // In the hands-on test the "five recent recipes" frame was compared with the empty first screen.
    const feature = read("modes/feature.md");
    expect(outOfOrder(feature, ["## 4. Mockup", 'data-state="<state>"', "## 6. Verify", "--state design/states/<state>.js --against design/previews/"])).toBeNull();
    const kit = read("preview-kit/README.md");
    for (const s of ['data-state="<state>"', "<mockup>@<state>.png", "--against"]) expect(kit).toContain(s);
  });

  test("review keeps a cause and its effect as two findings (first eval run)", () => {
    // In c-plain the typed colours behind two contrast failures were reported only as contrast, so the raw-value cause was lost.
    const review = read("modes/review.md");
    expect(outOfOrder(review, ["**Merging the exact checks.**", "A cause and its effect stay two findings", "`raw-value`", "Merge only the same problem"])).toBeNull();
  });

  test("the design mode asks for Node.js only for React apps", () => {
    expect(read("modes/design.md")).toContain("No Node.js for a React app");
  });
});
