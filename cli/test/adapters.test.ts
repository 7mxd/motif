import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";

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
