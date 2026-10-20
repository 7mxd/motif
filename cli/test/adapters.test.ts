import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";
import { expandHtml } from "../src/check/html";
import type { Lang } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { exceptionFor } from "../src/check/exceptions";
import { dartReducedMotion, scanDart } from "../src/stacks/flutter/rules";
import { docFrom, validTokens } from "./helpers";

const ADAPTERS = join(import.meta.dir, "../../skill/adapters");
const read = (rel: string) => readFileSync(join(ADAPTERS, rel), "utf8").replace(/\r\n/g, "\n");
const GUIDE_FILES = ["README.md", "checks.md", "components.md", "motion.md", "platform.md", "tokens.md"];
const STARTER_SET = [
  "Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar",
  "TabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the stack guide template", () => {
  test("names the six files every stack guide has, with the part each covers", () => {
    const template = read("_template/README.md");
    for (const file of GUIDE_FILES) expect(template).toContain(`\`${file}\``);
    for (const part of ["0. Detect and scaffold", "1. Theme code", "2. Components", "3. Motion", "4. Platform rules", "5. Checks and screenshots"]) {
      expect(template).toContain(part);
    }
  });
});

describe("the React web guide", () => {
  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "react-web")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: both starters, without Next.js agent feedback, plus build and type-check commands", () => {
    const readme = read("react-web/README.md");
    for (const s of ["create-next-app@latest", "--no-agent-feedback", "--src-dir", "create vite@latest", "--template react-ts", "@tailwindcss/vite", "npm install motion", "npm run build", "npx tsc --noEmit"]) {
      expect(readme).toContain(s);
    }
  });

  test("tokens.md: the generated files, wiring them in, dark mode and fonts", () => {
    const tokens = read("react-web/tokens.md");
    for (const s of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts", '@import "tailwindcss";', "data-theme", "@fontsource/", "next/font", "bg-action-primary"]) {
      expect(tokens).toContain(s);
    }
  });

  test("tokens.md: a fresh starter's own theme is removed first, so it can't override the design guide", () => {
    const tokens = read("react-web/tokens.md");
    expect(tokens).toContain("A fresh starter");
    for (const s of ["@theme inline", "Geist", "next/font/google", "src/App.css"]) expect(tokens).toContain(s);
  });

  test("components.md: the starter set, with states, focus and an example that uses only theme values", () => {
    const components = read("react-web/components.md");
    for (const c of STARTER_SET) expect(components).toContain(`\`${c}\``);
    for (const s of ["focus-visible:", "aria-busy", "aria-invalid", "radix-ui", "spring.snappy"]) expect(components).toContain(s);
    expect(components).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test("motion.md: MotionConfig, the motion roles and the common patterns", () => {
    const motion = read("react-web/motion.md");
    for (const s of ['reducedMotion="user"', 'from "@/design/motion"', "spring.smooth", "duration.fast", "easing.exit", "AnimatePresence", "layout"]) {
      expect(motion).toContain(s);
    }
  });

  test("platform.md: semantics, logical properties, pointers, breakpoints and safe areas", () => {
    const platform = read("react-web/platform.md");
    for (const s of ["ps-4", "text-start", "hover", "prefers-reduced-motion", "lang", "safe-area-inset", "DESIGN.md"]) expect(platform).toContain(s);
  });

  test("checks.md explains every motif check rule and every shot finding", () => {
    const checks = read("react-web/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(`## \`${id}\``);
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "motif-ok"]) expect(checks).toContain(s);
  });
});

const PLAIN_STARTER_SET = [
  "Button", "IconButton", "Field", "Checkbox", "Choice", "Switch", "Card", "ListItem", "TopBar", "TabBar",
  "Sidebar", "Dialog", "Sheet", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the plain web guide", () => {
  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "plain-web")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: how a site and its site folder are recognised, starting one, and nothing to build", () => {
    const readme = read("plain-web/README.md");
    for (const s of ["index.html", "`public/`", "`src/`", "`site/`", "`www/`", "plain-web", "srcDir", "components.css", "styles.css", "mock-data.js", "npm create vite@latest", "--template vanilla", "nothing to build", "--url"]) {
      expect(readme).toContain(s);
    }
  });

  test("tokens.md: motif.css in the site folder linked first, the site's own names, dark mode and fonts", () => {
    const tokens = read("plain-web/tokens.md");
    for (const s of ['<link rel="stylesheet" href="motif.css">', "var(--motif-color-background)", "--bg: var(--motif-color-background);", "data-theme", "@font-face", "fonts.googleapis.com", "tokens.flat.json", "motif extract", "motif-ok"]) {
      expect(tokens).toContain(s);
    }
  });

  test("components.md: the Component: lines, states through CSS, and the starter set", () => {
    const components = read("plain-web/components.md");
    for (const c of PLAIN_STARTER_SET) expect(components).toContain(`\`${c}\``);
    for (const s of ["/* Component:", "components.css", ":focus-visible", ":disabled", '[aria-busy="true"]', '[aria-invalid="true"]', "showModal()", "aria-label"]) {
      expect(components).toContain(s);
    }
    // A field's description includes hidden text, so error text starts empty rather than hidden.
    expect(components).not.toMatch(/id="[\w-]+-error"[^>]*hidden/);
    expect(components).toContain(".field-error:empty");
  });

  test("motion.md: the roles in CSS, View Transitions, and reduced motion in scripts", () => {
    const motion = read("plain-web/motion.md");
    for (const s of ["var(--motif-duration-base)", "var(--motif-easing-enter)", "var(--motif-easing-exit)", "@keyframes", "startViewTransition", "prefers-reduced-motion", "getPropertyValue"]) {
      expect(motion).toContain(s);
    }
  });

  test("platform.md: native elements, labels, logical properties, phones, and things used together", () => {
    const platform = read("plain-web/platform.md");
    for (const s of ["Native elements", "A placeholder isn't a label", "padding-inline-start", "@media (hover: hover)", "safe-area-inset", "lang", "DESIGN.md", "on one screen", "360, 390 and 430 px wide"]) {
      expect(platform).toContain(s);
    }
  });

  test("checks.md: every rule on plain web, the audit's findings, and state scripts", () => {
    const checks = read("plain-web/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(id.startsWith("tailwind") ? `\`${id}\`` : `## \`${id}\``);
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "<!-- motif-ok", "## Screens behind a form or a click", "design/states/", "--state", "index@sent.mobile.png", "15 seconds", "runs in every page", 'dispatchEvent(new Event("input"']) {
      expect(checks).toContain(s);
    }
  });

  test("every CSS, HTML and script example passes motif check as it is", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
    const LANGS: Record<string, Lang> = { css: "css", html: "markup", js: "script" };
    for (const file of GUIDE_FILES) {
      const text = read(`plain-web/${file}`);
      for (const [i, m] of [...text.matchAll(/```(css|html|js)\n([\s\S]*?)```/g)].entries()) {
        const path = `${file}-example-${i + 1}.${m[1]}`;
        const hits = expandHtml([{ path, abs: path, text: m[2]!, lang: LANGS[m[1]!]! }])
          .flatMap((f) => scanFile(f, scale, { tailwind: false }))
          .filter((h) => h.violation);
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});

describe("the Flutter guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`flutter/${file}`);
    for (const s of strings) expect(text).toContain(s);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "flutter")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: the starter, the build commands, the toolchain, the theme folder and monorepos", () => {
    has("README.md", [
      "flutter create --org", "flutter analyze", "flutter test", "design/motif.json", "themeDir",
      "Flutter SDK", "Flutter 3.44.8 (Dart 3.12.2)", "3.27", "https://docs.flutter.dev/get-started/install",
      "## Monorepos", "mobile/packages", "one guide for the web dashboard and the Flutter app", "platform notes", "flutter_test",
    ]);
  });

  test("tokens.md: wiring the generated file, reading it in widgets, fonts, and switching variants", () => {
    has("tokens.md", [
      "MotifTheme.light(", "MotifColors.of(context)", "MotifText.", "MotifSpace.", "fontFamilyFallback", "pubspec.yaml", "google_fonts",
      "## Switching variants", "MotifTheme.light(variant: MotifVariant.", "MotifTheme.debugVariantOverride", "colours only",
    ]);
  });

  test("components.md: where widgets live, private widgets, every state, and names", () => {
    has("components.md", [
      "lib/widgets/", "lib/features/<feature>/widgets/", "private `_Widget` classes are parts of a screen",
      "WidgetState.pressed", "WidgetState.focused", "WidgetState.disabled", "Semantics(", "tooltip:",
    ]);
    for (const c of ["Button", "IconButton", "Field", "Checkbox", "Switch", "Card", "ListItem", "TopBar", "TabBar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge"]) {
      expect(read("flutter/components.md")).toContain(`\`${c}\``);
    }
  });

  test("motion.md: the roles in Flutter's animation API, springs, and reduced motion", () => {
    has("motion.md", ["MotifCurves.", "MotifDurations.", "MotifSprings.", "SpringSimulation", "MotifMotion.duration(context"]);
  });

  test("platform.md: right to left, Material on Android and Cupertino conventions on iOS, locales", () => {
    has("platform.md", ["Directionality", "EdgeInsetsDirectional", "AlignmentDirectional", "Material 3 on Android", "Cupertino conventions on iOS", "supportedLocales", "DESIGN.md"]);
  });

  test("checks.md: every rule, the audit, the setup and state scripts, and the screenshot flags", () => {
    const checks = read("flutter/checks.md");
    for (const id of RULE_IDS.filter((r) => !r.startsWith("tailwind") && r !== "primitive-use")) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", [
      "## Contrast", "## Target size", "## Names", "## Reduced motion", "// motif-ok:",
      "design/states/setup.dart", "Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async",
      "design/states/http.json", "Future<void> motifState(WidgetTester tester) async", "--screen", "--rtl", "--state", "flutter_test",
    ]);
  });

  test("the Dart examples pass motif check as they are", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), "lib/design");
    for (const file of GUIDE_FILES) {
      const text = read(`flutter/${file}`);
      const blocks = [...text.matchAll(/```dart\n([\s\S]*?)```/g)].map((m) => m[1]!);
      if (file !== "README.md") expect(blocks.length).toBeGreaterThan(0);
      for (const [i, code] of blocks.entries()) {
        const path = `${file}-example-${i + 1}.dart`;
        const source = { path, abs: path, text: code, lang: "dart" as const };
        const lines = code.split("\n");
        const hits = [...scanDart(source, scale), ...dartReducedMotion([source])].filter((h) => h.violation && !("reason" in (exceptionFor(lines, h.line) ?? {})));
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});

describe("the parity checklist (docs/parity.md, Task 15)", () => {
  const REPO = join(import.meta.dir, "../..");
  const AREAS = ["Detect and set up", "Theme code", "Checks", "Drafting a guide", "Components", "Mockups", "Screenshots", "Audit", "Skill", "Evals", "Agents"];
  const parity = readFileSync(join(REPO, "docs/parity.md"), "utf8").replace(/\r\n/g, "\n");
  const cells = (line: string) => line.split("|").slice(1, -1).map((c) => c.trim());
  const table = parity.split("\n").filter((l) => l.startsWith("| ")).map(cells);
  const header = table.find((r) => r[0] === "Stack")!;
  const row = (stack: string) => table.find((r) => r[0] === stack);

  test("has one row per stack, with the spec's areas as columns", () => {
    expect(header.slice(1)).toEqual(AREAS);
    for (const stack of ["React web", "Plain web", "Flutter", "Jetpack Compose", "SwiftUI", "React Native (Expo)", "Vue / Nuxt", "Svelte / SvelteKit", "Angular"]) {
      expect(row(stack)?.length ?? `${stack} has no row`).toBe(AREAS.length + 1);
    }
  });

  test("React web, plain web and Flutter have every area done; the stacks still to come have none", () => {
    for (const stack of ["React web", "Plain web", "Flutter"]) expect([stack, row(stack)!.slice(1)]).toEqual([stack, AREAS.map(() => "done")]);
    for (const stack of ["Jetpack Compose", "SwiftUI", "React Native (Expo)", "Vue / Nuxt", "Svelte / SvelteKit", "Angular"]) {
      expect([stack, row(stack)!.slice(1)]).toEqual([stack, AREAS.map(() => "not yet")]);
    }
  });

  test("Flutter's proof names every area, and every file it links to exists", () => {
    const proof = parity.slice(parity.indexOf("## Flutter"));
    for (const area of AREAS) expect(proof).toContain(`| ${area} |`);
    const links = [...parity.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)].map((m) => m[1]!).filter((l) => !l.startsWith("http"));
    expect(links.length).toBeGreaterThan(AREAS.length);
    for (const link of links) expect(existsSync(join(REPO, "docs", link)) ? "ok" : link).toBe("ok");
  });
});
