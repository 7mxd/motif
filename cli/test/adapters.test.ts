import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";
import { expandHtml } from "../src/check/html";
import type { Lang } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
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
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "<!-- motif-ok", "## Screens behind a form or a click", "design/states/", "--state", "index@sent.mobile.png", "15 seconds"]) {
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
