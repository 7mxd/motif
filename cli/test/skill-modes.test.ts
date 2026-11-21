import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
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

describe("a screen's given content (2.0 evals)", () => {
  // Run 20261119-025418: with the screen's content written out, new apps added a figure, a sample card and a summary
  // bar nobody asked for. Content the developer gives is shown as given; the app's own frame still goes on each screen.
  test("init and feature build exactly the content the developer gives, and keep the app's own frame", () => {
    for (const f of ["modes/init.md", "modes/feature.md"]) {
      const text = read(f);
      for (const s of ["says what a screen shows", "show exactly that", "no data, figures, cards, sections, sample items or actions", "the app's own frame"]) {
        expect(`${f}: ${text.includes(s)}`).toBe(`${f}: true`);
      }
    }
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

  test("builds the feature at the route the developer names and keeps that route working, never redirecting it away (1.3.0 evals)", () => {
    // b-vue-history asked for "a booking history at /history" about one plot: the session built /history/:id and redirected /history to /.
    expect(outOfOrder(feature, [
      "## 2. Understand the feature", "names a route or a screen", "that route is the feature's page",
      "## 5. Build", "Build the feature at the route the developer named", "belongs to one item", "the named route still opens a page of its own",
      "never redirect it away", "## 6. Verify", "the route the developer named",
    ])).toBeNull();
  });
});

describe("modes/review.md", () => {
  const review = read("modes/review.md");

  test("state scripts name their screens: a review adds a missing line, and a lost state means the line or script is out of date (1.3)", () => {
    expect(review).toContain("// motif-screens:");
    expect(review).toContain("return false");
    expect(review).toMatch(/without a `\/\/ motif-screens:` line, add one/);
    expect(review).toContain("out of date with the app");
    // Except the sign-in state, which belongs on every page and keeps no line (final review, 1.3).
    expect(review).toMatch(/unless it belongs on every screen \(signing in\)/);
    expect(review).toMatch(/sign in with a state script that has no `\/\/ motif-screens:` line/);
  });

  test("the audit shot is a foreground step: wait for it, never background it (1.3 Mac evals)", () => {
    // In the 1.3 Mac C runs, sessions ran `motif shot --audit` in the background and ended their turn while it ran: no report.
    const audit = review.slice(review.indexOf("## 3. Audit"), review.indexOf("**Judgement**"));
    expect(outOfOrder(audit, ["`motif shot --audit`", "a foreground step", "wait for it to finish", "never run it in the background"])).toBeNull();
    expect(audit).toMatch(/longer than your shell allows, split the screens across runs with `--routes`/);
  });

  test("has the six steps of spec §7.5, with gates on the extracted guide and the report", () => {
    expect(outOfOrder(review, ["## 1. Scope", "## 2. Extract (only when there is no design guide)", "⏸", "## 3. Audit", "## 4. Report ⏸", "## 5. Rebuild", "## 6. A new look instead"])).toBeNull();
  });

  // The 2H SwiftUI evals: two reviews opened the loyalty card and menu screenshots and still missed Sign out drawn as the
  // main button and cards with no space between them, both rules written in the guide. Judgement is a written pass.
  test("judgement is a written pass per screen against the guide's own rules: the one main action, spacing, words, direction", () => {
    const judgement = review.slice(review.indexOf("**Judgement**"), review.indexOf("Two things screenshots hide"));
    for (const s of [
      "before writing the report",
      "**The one main action.**",
      "sign out",
      "`hierarchy` finding",
      "**Spacing between things.**",
      "touch",
      "`spacing` findings",
      "**Words.**",
      "\"Submit\"",
      "`copy` finding",
      "**Direction.**",
      "`platform-convention` findings",
      "still gets its line",
    ]) {
      expect(judgement).toContain(s);
    }
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

  test("review's written pass counts an item packed too tight inside as spacing, and hierarchy when it drops what people choose by (1.3 evals)", () => {
    // In the 1.3 Mac run, c-vue called a list of cramped items clean: the spacing point covered only the gaps between them.
    expect(outOfOrder(review, [
      "Make it a written pass", "**Spacing between things", "packed too tight inside", "below the guide's scale", "cut to fit",
      "dropped to make room", "`hierarchy`", "**Words.**",
    ])).toBeNull();
  });

  test("review's written pass checks the code for a physical side where the start or end side is meant (1.3 evals)", () => {
    // In the 1.3 Mac run, c-vue called its right-to-left screenshots clean: a gap on the wrong side looks only slightly off.
    expect(outOfOrder(review, [
      "**Direction.**", "don't mirror", "check the code too", "a physical side where the start or end side is meant",
      "`platform-convention` finding at that line", "`margin-left`", "`margin-inline-start`", "`gap`", "`marginLeft`", "`marginStart`",
      "`EdgeInsets.only(left: …)`", "`EdgeInsetsDirectional.only(start: …)`", "`Modifier.absolutePadding(left = …)`", "`Modifier.padding(start = …)`",
      "`.leading` and `.trailing` already mirror", "(../adapters/flutter/platform.md#right-to-left)", "A screen where you found nothing",
    ])).toBeNull();
  });

  test("review's written pass sets the actual spacing numbers against the guide's rule for that place, not only its scale (1.3.0 evals)", () => {
    // Runs on claude-sonnet-5 noted "cards sit on the scale" and passed planted 4 px padding and 0 gaps: both are real steps, so motif check is silent too.
    expect(outOfOrder(review, [
      "**Spacing between things.**", "not only its scale", "`motif check` passes them", "write the actual numbers in your notes",
      "the gap between a heading and what it heads", "what the guide says belongs in that place", "name the rule",
      "\"On the scale\" and \"even\" aren't results", "compare the item with its data", "its own detail screen", "which fields it shows and which it leaves out", "`truncate`",
      "A finding about a cramped item names all of it", "**Words.**",
    ])).toBeNull();
    expect(review).not.toContain("spacing on the scale between and inside items");
  });

  test("review's written pass searches every source file for physical sides, stylesheets included (1.3.0 evals)", () => {
    // Angular S-12 flipped: the run that searched found margin-left, the run that only read the templates never opened top-bar.css.
    expect(outOfOrder(review, [
      "**Direction.**", "check the code too", "by searching and not by what you happen to open", "stylesheets included",
      "an Angular component's styles sit in their own file", "note how many hits there were", "`platform-convention` finding at that line",
      "the search for physical sides found none",
    ])).toBeNull();
  });

  test("review's Markdown report ends with the written pass's notes, one line per screen (1.3 evals)", () => {
    // In the 1.3 Mac run, c-vue skipped the written pass and went from the screenshots straight to the report.
    expect(outOfOrder(review, [
      "Make it a written pass", "**What was checked**", "A screen where you found nothing",
      "## 4. Report ⏸", "**The Markdown version**", "lists the findings by severity", "**What was checked**", "one line per screen", "found nothing",
      "The JSON report has no such field",
    ])).toBeNull();
    expect(readFileSync(join(import.meta.dir, "../../docs/specs/2026-10-12-motif-core-design.md"), "utf8")).toContain("What was checked");
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

  test("review adds the file and line of each audit finding's cause to its location (1.3 evals)", () => {
    // In the 1.3 Mac runs, c-vue and c-svelte copied the audit's findings with only a screen and a selector: the report
    // didn't say where in the code to fix them.
    expect(outOfOrder(read("modes/review.md"), ["**Merging the exact checks.**", "name its cause", "add its `\"file\"` and `\"line\"` to the finding's `location`", '"locations"'])).toBeNull();
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
  test("agents.md has no sign-in steps: no design source needs one since 2.0", () => {
    expect(read("agents.md")).not.toContain("## Signing in to a design source");
  });

  test("the Motion note says motif connect sets it up in the agents the developer picks", () => {
    const note = read("sources/motion-dev.md");
    expect([note.includes("Claude Code"), note.includes("the agents the developer picks")]).toEqual([false, true]);
  });

  test("the sources retired in 2.0 are gone from the skill (2.0)", () => {
    expect(readdirSync(join(SKILL, "sources")).sort()).toEqual(["motion-dev.md", "supahero.md"]);
    const skill = read("SKILL.md");
    expect(skill).toContain("Built in: library, motion recipes, reference notes · Optional: Motion");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
    const naming = walk(SKILL)
      .filter((f) => /\.(md|json|txt)$/.test(f))
      .filter((f) => /refero|21st\.dev|60fps/i.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SKILL.length + 1).replace(/\\/g, "/"));
    expect(naming).toEqual([]);
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

describe("Vue in the skill and the modes", () => {
  test("SKILL.md sends Vue and Nuxt apps to their guide", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/vue/README.md)");
    expect(skill).toContain("Nuxt");
  });

  test("init names both starters", () => {
    const init = read("modes/init.md");
    for (const s of ["npm create vue@latest", "npm create nuxt@latest", "(../adapters/vue/README.md)"]) expect(init).toContain(s);
  });

  test("feature lists a Vue app's components from its guide", () => {
    expect(read("modes/feature.md")).toContain("(../adapters/vue/components.md)");
  });

  test("review links Vue's checks and state scripts", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/vue/checks.md)", "(../adapters/vue/checks.md#screens-behind-a-form-or-a-click)"]) expect(review).toContain(s);
  });

  test("variants: switching a Vue or Nuxt app's variant", () => {
    const variants = read("knowledge/variants.md");
    for (const s of ["data-variant", "useHead", "(../adapters/vue/tokens.md#switching-variants)"]) expect(variants).toContain(s);
  });
});

describe("Svelte in the skill and the modes", () => {
  test("SKILL.md sends Svelte and SvelteKit apps to their guide", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/svelte/README.md)");
    expect(skill).toContain("SvelteKit");
  });

  test("init names both starters", () => {
    const init = read("modes/init.md");
    for (const s of ["npx sv create", "npm create vite@latest", "(../adapters/svelte/README.md)"]) expect(init).toContain(s);
  });

  test("feature lists a Svelte app's components from its guide", () => {
    expect(read("modes/feature.md")).toContain("(../adapters/svelte/components.md)");
  });

  test("review links Svelte's checks and state scripts", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/svelte/checks.md)", "(../adapters/svelte/checks.md#screens-behind-a-form-or-a-click)"]) expect(review).toContain(s);
  });

  test("variants: switching a Svelte or SvelteKit app's variant", () => {
    const variants = read("knowledge/variants.md");
    for (const s of ["data-variant", "transformPageChunk", "(../adapters/svelte/tokens.md#switching-variants)"]) expect(variants).toContain(s);
  });
});

describe("Angular in the skill and the modes", () => {
  test("SKILL.md sends Angular apps to their guide", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("(adapters/angular/README.md)");
    expect(skill).toContain("Angular 15 or later with standalone components");
  });

  test("init names the starter", () => {
    const init = read("modes/init.md");
    for (const s of ["a web app in Angular", "npx @angular/cli@latest new <app> --defaults --style=tailwind", "ng new", "(../adapters/angular/README.md)"]) expect(init).toContain(s);
  });

  test("feature lists an Angular app's components from its guide", () => {
    expect(read("modes/feature.md")).toContain("(../adapters/angular/components.md)");
  });

  test("review links Angular's checks and state scripts", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/angular/checks.md)", "(../adapters/angular/checks.md#screens-behind-a-form-or-a-click)", "SvelteKit or Angular app's are JavaScript"]) expect(review).toContain(s);
  });

  test("variants: switching an Angular app's variant", () => {
    const variants = read("knowledge/variants.md");
    for (const s of ["data-variant", "a signal in a service", "DOCUMENT", "(../adapters/angular/tokens.md#switching-variants)"]) expect(variants).toContain(s);
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

describe("Jetpack Compose in the skill and the modes", () => {
  test("SKILL.md sends Compose apps to their guide, and the toolchain row names the JDK and the Android SDK", () => {
    const skill = read("SKILL.md");
    for (const s of ["(adapters/compose/README.md)", "Jetpack Compose", "a JDK and the Android SDK for Compose apps"]) expect(skill).toContain(s);
  });

  test("init offers Compose, starts it from Android Studio's Empty Activity template, and offers to write the template's files", () => {
    const init = read("modes/init.md");
    for (const s of ["an Android app in Jetpack Compose", "(../adapters/compose/README.md)", "Empty Activity", "no command-line starter", "write the template's files", "the Gradle wrapper, which the guide makes without Gradle installed"]) {
      expect(init).toContain(s);
    }
  });

  test("feature lists a Compose app's composables from its guide", () => {
    const feature = read("modes/feature.md");
    for (const s of ["(../adapters/compose/components.md)", "ui/components/"]) expect(feature).toContain(s);
  });

  test("review links Compose's checks and state files, which are Kotlin", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/compose/checks.md)", "(../adapters/compose/checks.md#screens-behind-a-form-or-a-click)", "`.kt` for a Compose app", "--rtl"]) {
      expect(review).toContain(s);
    }
  });

  test("variants: switching a Compose app's variant from its state, and what Compose varies", () => {
    const variants = read("knowledge/variants.md");
    for (const s of ["MotifTheme(variant = MotifVariant.", "rememberSaveable", "StateFlow", "(../adapters/compose/tokens.md#switching-variants)"]) {
      expect(variants).toContain(s);
    }
  });
});

describe("SwiftUI in the skill and the modes", () => {
  test("SKILL.md sends SwiftUI apps to their guide, and the toolchain row names a Mac with Xcode", () => {
    const skill = read("SKILL.md");
    for (const s of ["(adapters/swiftui/README.md)", "SwiftUI", "a Mac with Xcode for SwiftUI apps' screenshots"]) expect(skill).toContain(s);
  });

  test("init offers SwiftUI, starts it from Xcode's App template, which has no command-line starter, and says screenshots need a Mac", () => {
    const init = read("modes/init.md");
    for (const s of ["an iPhone or Mac app in SwiftUI", "(../adapters/swiftui/README.md)", "Xcode's App template", "no command-line starter", "a Mac with Xcode"]) {
      expect(init).toContain(s);
    }
  });

  test("feature lists a SwiftUI app's views from its guide", () => {
    const feature = read("modes/feature.md");
    for (const s of ["(../adapters/swiftui/components.md)", "Components/", "`.swift` for a SwiftUI app"]) expect(feature).toContain(s);
  });

  test("review links SwiftUI's checks and state files, which are Swift, and says screenshots need a Mac", () => {
    const review = read("modes/review.md");
    for (const s of ["(../adapters/swiftui/checks.md)", "(../adapters/swiftui/checks.md#screens-behind-a-form-or-a-tap)", "`.swift` for a SwiftUI app", "on a Mac"]) {
      expect(review).toContain(s);
    }
  });

  test("variants: switching a SwiftUI app's variant from @AppStorage, and what SwiftUI varies", () => {
    const variants = read("knowledge/variants.md");
    for (const s of [".motifTheme(variant: .", "@AppStorage", "(../adapters/swiftui/tokens.md#switching-variants)"]) expect(variants).toContain(s);
  });
});

describe("the skill picks from the built-in library (2.0)", () => {
  test("SKILL.md links the library and lists it in the folder map", () => {
    const skill = read("SKILL.md");
    expect([skill.includes("(library/README.md)"), skill.includes("`library/`")]).toEqual([true, true]);
  });
  for (const mode of ["init", "feature"]) {
    test(`${mode} mode picks pieces by the brief's personality, the screen's job and the motion level`, () => {
      const text = read(`modes/${mode}.md`);
      const missing = ["library/README.md", "personality", "motion level", "the developer can ask for a different piece"].filter((s) => !text.includes(s));
      expect(missing).toEqual([]);
    });
  }
  // Eval run 20261109-054943, b-notifications: the empty-state drawing and an unread badge became two new
  // shared components the design guide never named, so the feature failed "at most one new component".
  test("feature mode builds a library piece into an existing component or the screen's own file, and names every new component file in the guide", () => {
    const pick = read("modes/feature.md").split("\n").find((l) => l.includes("library/README.md")) ?? "";
    const missing = ["variant of an existing component", "the screen's own file", "a file of its own is a new component", "beside the route", "section 5", "by its name", "at most one new component"].filter((s) => !pick.includes(s));
    expect(missing).toEqual([]);
  });
  test("the library's How to pick says the same", () => {
    const how = read("library/README.md").split("## How to pick")[1]?.split("\n## ")[0] ?? "";
    const missing = ["variant of an existing component", "the screen's own file", "a file of its own is a new component", "section 5", "by its name"].filter((s) => !how.includes(s));
    expect(missing).toEqual([]);
  });
  test("review mode flags a plain first-impression or home screen and an empty band", () => {
    const text = read("modes/review.md");
    expect([text.includes("empty band"), text.includes("plain")]).toEqual([true, true]);
  });
  test("Hairline is an optional mention in the two web adapters only", () => {
    const adapters = readdirSync(join(SKILL, "adapters")).filter((d) => d !== "_template");
    const naming = adapters.filter((d) =>
      readdirSync(join(SKILL, "adapters", d)).some((f) => read(`adapters/${d}/${f}`).includes("@lucasmarkes/hairline")),
    );
    expect(naming.sort()).toEqual(["plain-web", "react-web"]);
    for (const d of naming) {
      const text = readdirSync(join(SKILL, "adapters", d)).map((f) => read(`adapters/${d}/${f}`)).find((t) => t.includes("@lucasmarkes/hairline"))!;
      expect(text.slice(text.indexOf("@lucasmarkes/hairline") - 300, text.indexOf("@lucasmarkes/hairline") + 300)).toContain("optional");
    }
  });
});

// 2.0 fair test, spec §5.3 and §5.5 (T1, T4, T13): states and messages.
describe("states and messages: no access, undo before confirm, message weight, smart-filled forms (2.0)", () => {
  test("feature and review list the no-access state", () => {
    for (const file of ["modes/feature.md", "modes/review.md"]) expect(read(file)).toContain("no access");
  });
  test("anti-patterns names a confirm dialog where undo would work", () => {
    expect(read("knowledge/anti-patterns.md")).toContain("where undo would work");
  });
  test("forms: a confirmation names its scope, and filled-in fields say where their values came from", () => {
    const forms = read("knowledge/ux-patterns/forms.md");
    for (const s of ["how many and who or when", "where their values came from"]) expect(forms).toContain(s);
  });
  test("notifications: a high-stakes message says what did and didn't happen", () => {
    expect(read("knowledge/ux-patterns/notifications.md")).toContain("Nothing was charged");
  });
});

// 2.0 fair test, spec §5.5 (T2, T3, T12): colour roles, numbers, data shapes.
describe("one meaning per colour role, locale digits and mirrored arrows, components by data shape (2.0)", () => {
  test("the template asks for the digit choice once, after the start/end line, and init fills it", () => {
    const template = read("contract/DESIGN.template.md");
    expect(outOfOrder(template, ["## 7. Accessibility", "- Layouts use start/end (not left/right), so right-to-left languages work.", "digits in right-to-left languages", "## 8. Platform notes"])).toBeNull();
    expect(read("modes/init.md")).toContain("digit choice");
  });
  test("spec.md and the template's Foundations: a colour role keeps one meaning on every screen", () => {
    expect(read("contract/spec.md")).toContain("keeps one meaning on every screen");
    const template = read("contract/DESIGN.template.md");
    expect(template.slice(template.indexOf("## 3. Foundations"), template.indexOf("\n## ", template.indexOf("## 3. Foundations") + 5))).toContain("keeps one meaning on every screen");
  });
  test("every stack guide formats numbers by locale", () => {
    const stacks = readdirSync(join(SKILL, "adapters")).filter((d) => d !== "_template");
    expect(stacks.filter((d) => !read(`adapters/${d}/platform.md`).includes("by locale"))).toEqual([]);
  });
  test("review checks arrows point the reading way, and flags a colour role used for another meaning", () => {
    const review = read("modes/review.md");
    for (const s of ["point the reading way", "digit choice", "unrelated meaning", "only by an arbitrary colour"]) expect(review).toContain(s);
  });
  test("the library says how to choose by the data's shape, and the home and list guides point to it", () => {
    expect(read("library/README.md")).toContain("Choose by the data's shape");
    for (const file of ["knowledge/ux-patterns/home-dashboard.md", "knowledge/ux-patterns/lists-feeds.md"]) {
      expect(read(file)).toContain("library/README.md#choose-by-the-datas-shape");
    }
  });
});

// Run 20261120-053030 (decision 0018). The baseline won 12 of 48 pairs on both orders, and the reasons repeated: every
// row's action drawn at one weight (the skill asked for "the same filled pill on each card"), a state nobody can act on
// drawn as a solid bar the shape of a button, a welcome whose drawing or tall hero pushed the points into a strip of
// their own, a floating button over a row's own button, and a light button on a pale tint of itself (the skill sent
// it there). The sessions had opened their own screenshots; the look-pass didn't ask about any of these. In Test C the
// review's taste calls (no crafted moment, an empty lower half) were rated major where the guide asked for none.
describe("action weight, the first screen, the look-pass and taste findings (2.0 evals, decision 0018)", () => {
  const character = read("knowledge/character.md");
  const line = (text: string, marker: string) => text.split("\n").find((l) => l.includes(marker)) ?? "";
  const missingFrom = (text: string, parts: string[]) => parts.filter((s) => !text.includes(s));

  test("repeated row actions keep one place and shape, and their weight says what they do", () => {
    const rule = line(character, "**Repeated actions keep their place and shape; their weight says what they do.**");
    expect(missingFrom(rule, [
      "at the same width", "two weights at most", "takes the person forward", "takes something back",
      "waiting on the person", "the only filled one in the list", "not with a new colour",
    ])).toEqual([]);
    expect(character).not.toContain("the same filled pill on each card");
    const one = line(read("knowledge/visual-craft.md"), "**One primary action per view.**");
    expect(missingFrom(one, ["repeated down a list counts as one", "(character.md#slips-that-undo-it)"])).toEqual([]);
  });

  test("a state nobody can act on is a soft notice, never a bar the shape of the card's button", () => {
    const facts = line(character, "**Facts people compare are figures.**");
    expect(missingFrom(facts, ["A notice about one item", "on a pale tint of that colour", "reads as a button nobody can press"])).toEqual([]);
  });

  test("a light button doesn't sit on a pale tint of its own hue, and a yellow one gets a `surface` ground", () => {
    const brand = line(character, "- `brand`: the brand's own colour");
    expect(brand).not.toContain("turns `brand-soft` or `surface` so the yellow button stands out");
    expect(missingFrom(brand, ["the ground right behind them is `surface`", "blends into its own hue"])).toEqual([]);
    expect(missingFrom(line(character, "**A button stands clear of its ground.**"), ["nearly as light as", "of the same hue"])).toEqual([]);
  });

  test("the brand moment gives way to the message and the main action, and a short welcome stays one group", () => {
    const recipes = character.slice(character.indexOf("\n## First-impression recipes\n"), character.indexOf("\n## Illustration\n"));
    const pitch = line(recipes, "**The first screen is the whole pitch:**");
    expect(missingFrom(pitch, [
      "gives way to it", "before the message or the main action moves down", "A short welcome",
      "in the headline's own column", "centred together in the first screen", "no separate strip of points", "about one screen tall",
    ])).toEqual([]);
    expect(missingFrom(line(recipes, "**Phone welcome on the web:**"), ["no more than a quarter of the screen", "about one screen", "the first thing to shrink"])).toEqual([]);
    // One size for the drawing everywhere: the Illustration section said a third where the recipes said a quarter.
    expect(character).not.toContain("about a third of a phone's welcome screen");
    expect(read("library/accents/soft.md")).not.toContain("a quarter to a third of a phone's height");
    const hero = read("library/screens/landing-hero.md");
    expect(missingFrom(hero, ["never displaces the message or the main action", "in the headline column", "centred together in the window", "about one screen tall"])).toEqual([]);
  });

  test("short given content is brought together, not padded with decoration", () => {
    expect(missingFrom(line(character, "**No empty areas.**"), ["empty band", "bring it together instead", "one group centred in the screen", "the list across the width", "just to use up room"])).toEqual([]);
    expect(missingFrom(line(character, "**A working list on a desktop is a full screen.**"), ["The list keeps the width", "takes room from the rows"])).toEqual([]);
  });

  test("nothing hides under a floating button either, and it stays off rows that end in their own button", () => {
    const bar = line(character, "**Nothing hides under a bar.**");
    expect(missingFrom(bar, ["a floating add button", "each row ends in its own button", "in the header or under the list"])).toEqual([]);
    expect(line(read("knowledge/ux-patterns/lists-feeds.md"), "- **Mobile:**")).toContain("its rows don't end in a button of their own");
  });

  test("init and feature look at each screenshot for what is covered or cut, action weight, a button on its ground and the first screen", () => {
    for (const f of ["modes/init.md", "modes/feature.md"]) {
      const text = read(f);
      const verify = text.slice(text.indexOf(f.endsWith("init.md") ? "\n## 7. Verify" : "\n## 6. Verify"));
      const missing = missingFrom(verify, [
        "**Covered or cut.**", "a floating button over a row's text or its own button", "two words of a headline run together",
        "**Action weight.**", "the row that needs the person", "(../knowledge/character.md#slips-that-undo-it)",
        "**A button on its ground.**",
        "**The first screen.**", "the whole main button", "without scrolling", "in a strip of their own",
        "**Small labels.**", "the language switch",
        "in writing",
      ]);
      expect(`${f}: ${missing.join(" | ")}`).toBe(`${f}: `);
    }
  });

  test("review: a judgement finding that nothing backs is minor, and is still reported", () => {
    const review = read("modes/review.md");
    const backed = review.split("\n").find((l) => l.startsWith("A finding from the judgement pass")) ?? "";
    expect(missingFrom(backed, [
      "`major` only when something backs it", "a rule in the design guide", "an exact check", "a harm you can state in one sentence",
      "report it, as `minor`",
    ])).toEqual([]);
    expect(outOfOrder(review, ["**Severity:**", "A finding from the judgement pass", "**Categories:**"])).toBeNull();
    const fullness = line(review, "**Character and fullness.**");
    expect(missingFrom(fullness, ["`anti-pattern` finding", "empty band", "plain", "`minor` unless the design guide asks for"])).toEqual([]);
  });
});
