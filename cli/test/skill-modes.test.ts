import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS } from "../src/agents/catalog";
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
  "raw-value", "contrast", "target-size", "reduced-motion", "accessibility", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];

describe("SKILL.md", () => {
  const skill = read("SKILL.md");

  test("says how to run the tool from every common shell", () => {
    for (const form of ['sh "<skill folder>/bin/motif" <command>', '& "<skill folder>\\bin\\motif.cmd" <command>', '"<skill folder>\\bin\\motif.cmd" <command>']) {
      expect(skill).toContain(form);
    }
    // Claude Code unpacks the plugin from a zip, which may drop the executable flag: POSIX shells run the bootstrap with sh.
    expect(skill).not.toMatch(/\| `"<skill folder>\/bin\/motif"/);
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

  test("review reads each data screen's code for its loading, empty and error states, and looks for emoji used as UI (evals 2026-10-19)", () => {
    // c-review missed a product list with no loading or empty state (its screenshots, from mock data, looked complete)
    // and emoji standing in for the app's icons.
    const review = read("modes/review.md");
    expect(outOfOrder(review, [
      "## 3. Audit", "**Judgement**", "loading, empty and error", "mock data", "(../knowledge/anti-patterns.md#emoji-as-ui)", "## 4. Report ⏸",
    ])).toBeNull();
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

  test("review lists a finding's other places, and names the cause of each group of audit findings (third eval run)", () => {
    expect(outOfOrder(read("modes/review.md"), ["**Merging the exact checks.**", "already groups", "name its cause", '"locations"'])).toBeNull();
    expect(readFileSync(join(import.meta.dir, "../../docs/specs/2026-10-12-motif-core-design.md"), "utf8")).toContain("`locations`");
  });

  test("review puts a screen's state in its own field, as audit.json does (second eval run)", () => {
    expect(outOfOrder(read("modes/review.md"), ["**Judgement findings**", '`{ "screen": "/", "state": "sent" }`'])).toBeNull();
  });

  test("the design mode asks for Node.js only for React apps", () => {
    expect(read("modes/design.md")).toContain("No Node.js for a React app");
  });
});

describe("Motif in every agent (Part 3)", () => {
  const skill = read("SKILL.md");
  const agents = read("agents.md");

  test("a bare /motif starts the design mode, as /design does", () => {
    expect(skill).toContain("| types /design, /motif or $motif with nothing else, or asks for design help without saying what | [modes/design.md](modes/design.md) |");
  });

  test("SKILL.md sends agents to agents.md for the skill folder and the question prompt", () => {
    expect(outOfOrder(skill, ["## Running the motif tool", "(agents.md)", "3. **Ask with choices.**", "(agents.md)", "## What's in the skill folder", "(agents.md)"])).toBeNull();
  });

  test("agents.md covers every agent: the skill folder, the question prompt and the shell", () => {
    for (const a of ["Claude Code", "Codex", "Cursor", "GitHub Copilot", "VS Code", "Gemini CLI", "OpenCode", "Any other agent"]) expect(agents).toContain(a);
    for (const s of ["skills/motif", "~/.agents/skills/motif", "request_user_input", "Plan mode", "ask_user", "numbered list", "PowerShell", "motif.cmd"]) {
      expect(agents).toContain(s);
    }
  });
});

describe("design sources in every agent (Part 3)", () => {
  test("agents.md says how to sign in to a design source in each agent, as motif connect does", () => {
    const agents = read("agents.md");
    expect(agents).toContain("## Signing in to a design source");
    const fragment: Record<string, string> = {
      claude: "type /mcp", codex: "codex mcp login", cursor: "cursor-agent mcp login", copilot: "/mcp and sign in",
      vscode: "VS Code asks", gemini: "/mcp auth", opencode: "opencode mcp auth",
    };
    for (const a of AGENTS) {
      expect([a.id, a.signIn("refero").includes(fragment[a.id]!), agents.includes(fragment[a.id]!)]).toEqual([a.id, true, true]);
    }
  });

  test("the source notes say motif connect sets a source up in the agents the developer picks", () => {
    for (const f of ["sources/motion-dev.md", "sources/refero.md", "sources/21st.md", "sources/60fps.md"]) {
      const note = read(f);
      expect([f, note.includes("Claude Code"), note.includes("the agents the developer picks")]).toEqual([f, false, true]);
    }
    for (const f of ["sources/refero.md", "sources/60fps.md"]) expect([f, read(f).includes("(../agents.md)")]).toEqual([f, true]);
  });
});

describe("design variants and project fonts in the skill", () => {
  test("the format: spec.md documents variants, the default one, project fonts and data-variant", () => {
    const spec = read("contract/spec.md");
    for (const s of ['"variants"', '"default": true', '"fonts"', "data-variant"]) expect(spec).toContain(s);
  });

  test("the variants guide has its five headings and links to the format", () => {
    const guide = read("knowledge/variants.md");
    expect(outOfOrder(guide, ["## When a variant is worth it", "## What to vary", "## What never varies", "## Audience variants without stereotypes", "## Checking every variant"])).toBeNull();
    expect(guide).toContain("../contract/spec.md");
  });

  test("init and design research a variant and wait for approval before writing it", () => {
    for (const f of ["modes/init.md", "modes/design.md"]) {
      expect(outOfOrder(read(f), ["variant", "research", "⏸", "(../knowledge/variants.md)"])).toBeNull();
    }
  });

  test("review looks at every variant, and feature builds in every one", () => {
    expect(read("modes/review.md")).toContain("--variant all");
    expect(read("modes/feature.md")).toContain("--variant all");
  });

  test("both web stacks show how to choose a variant and how to load a project font", () => {
    for (const f of ["adapters/react-web/tokens.md", "adapters/plain-web/tokens.md"]) {
      for (const s of ["data-variant", "@font-face"]) expect(read(f)).toContain(s);
    }
  });

  test("the template has an optional Variants section after Foundations", () => {
    expect(outOfOrder(read("contract/DESIGN.template.md"), ["## 3. Foundations", "## Variants", "delete this section", "## 4. Motion"])).toBeNull();
  });
});

describe("React Native in the skill and the modes", () => {
  test("SKILL.md sends Expo apps to their guide", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/react-native/README.md)");
    expect(skill).toContain("Expo");
  });

  test("init starts an Expo app with create-expo-app", () => {
    const init = read("modes/init.md");
    for (const s of ["npx create-expo-app@latest", "(../adapters/react-native/README.md)"]) expect(init).toContain(s);
  });

  test("feature lists an Expo app's components from its guide", () => {
    expect(read("modes/feature.md")).toContain("(../adapters/react-native/components.md)");
  });

  test("review links React Native's checks and state scripts, and mentions --rtl", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/react-native/checks.md)", "(../adapters/react-native/checks.md#screens-behind-a-form-or-a-tap)", "--rtl"]) expect(review).toContain(s);
  });

  test("variants: switching an Expo app's variant", () => {
    const variants = read("knowledge/variants.md");
    for (const s of ["<MotifProvider variant=", "(../adapters/react-native/tokens.md#switching-variants)"]) expect(variants).toContain(s);
  });
});

describe("Flutter in the skill and the modes", () => {
  test("SKILL.md sends Flutter apps to their guide, and the toolchain row names the Flutter SDK", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/flutter/README.md)");
    expect(skill).toContain("Flutter SDK");
  });

  test("init starts a Flutter app with flutter create, and apps need flutter_test", () => {
    const init = read("modes/init.md");
    for (const s of ["flutter create --org", "(../adapters/flutter/README.md)", "flutter_test", "dev_dependencies"]) expect(init).toContain(s);
  });

  test("feature lists a Flutter app's widgets from its guide", () => {
    expect(read("modes/feature.md")).toContain("(../adapters/flutter/components.md)");
  });

  test("review links Flutter's checks, mentions --rtl, and reports unnamed controls as accessibility", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/flutter/checks.md)", "(../adapters/flutter/checks.md#screens-behind-a-form-or-a-click)", "--rtl", "right to left", "motif shot --audit` reports unnamed controls under `accessibility`"]) {
      expect(review).toContain(s);
    }
    expect(review).not.toContain("accessible-name");
  });

  test("variants: switching a Flutter app's variant, and what Flutter varies", () => {
    const variants = read("knowledge/variants.md");
    for (const s of ["MotifTheme.light(variant: MotifVariant.", "(../adapters/flutter/tokens.md#switching-variants)"]) expect(variants).toContain(s);
  });

  test("the template makes the parity checklist the definition of a finished guide", () => {
    const template = read("adapters/_template/README.md");
    for (const s of ["## A finished guide", "right-to-left", "the toolchain", "state scripts"]) expect(template).toContain(s);
  });
});
