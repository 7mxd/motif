import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { runValidate } from "../src/commands/validate";
import { findBrowser } from "../src/detect/browser";
import { CSS_HEADER, TS_HEADER } from "../src/generate/header";
import { nodeFloor } from "../src/project/node-floor";
import { discoverAngularRoutes } from "../src/stacks/angular/routes";
import { heavyStackTests } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

const REPO = join(import.meta.dir, "../..");
const FIXTURES = join(REPO, "tests/fixtures");
const APP = join(FIXTURES, "angular-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");
const list = JSON.parse(readFileSync(join(FIXTURES, "angular-seeded-app/seeded-issues.json"), "utf8"));

/** The review categories, as the review mode lists them: the list a grader accepts. */
const CATEGORIES = [...(/^\*\*Categories:\*\*(.*?)\. /m.exec(readFileSync(join(REPO, "skill/modes/review.md"), "utf8"))?.[1] ?? "").matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!);

type Consequence = { category: string; screens: string[]; schemes: string[]; note: string };
type Issue = {
  id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: { file?: string; line?: number; screen?: string; app?: boolean; path?: string }; anchor?: string; summary: string; consequences?: Consequence[];
};
const issues: Issue[] = list.issues;
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);
/** A route as the audit names it, against a listed screen whose [id] matches any value. */
const sameScreen = (listed: string, route: string) => new RegExp(`^${listed.replace(/\[[^/]+\]/g, "[^/]+")}$`).test(route);
type Hit = { rule: string; file: string; line: number };
/** What motif check reported, one "rule file:line" each, sorted: a second hit at a planted line shows up as a difference. */
const reported = (data: Record<string, unknown>) =>
  [...(data.violations as Hit[]), ...(data.warnings as Hit[])].map((h) => `${h.rule} ${h.file}:${h.line}`).sort();
const planted = () => byDetector("check").map((i) => `${i.rule} ${i.location.file}:${i.location.line}`).sort();

/** The app's own source: its .ts, .html and .css files, without node_modules, Angular's output and the generated theme. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return ["node_modules", ".angular", "dist", "design", "styles"].includes(name) ? [] : sourceFiles(path);
    return /\.(ts|html|css)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** The top-level keys of one of the string tables in src/app/i18n/strings.ts. */
function tableKeys(source: string, table: "en" | "ar"): string[] {
  const start = source.indexOf(`export const ${table}`);
  const body = source.slice(source.indexOf("{", start), source.indexOf("\n};", start));
  return [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]!).sort();
}

describe("the review categories", () => {
  test("are read from the review mode's list", () => {
    expect(CATEGORIES.length).toBeGreaterThan(10);
    for (const c of ["raw-value", "contrast", "accessibility", "missing-state", "platform-convention", "other"]) expect(CATEGORIES).toContain(c);
  });
});

describe("the Angular contract app (Ataa)", () => {
  test("its design guide is valid, with every pair readable in light and dark, in both variants", async () => {
    const r = await runValidate(APP);
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0, contrastChecks: tokens.$extensions["dev.motif"].pairs.length * 4 });
  });

  // A copy as git keeps it, without node_modules: a fresh clone, CI's checkout, an eval's workspace before npm ci.
  const fresh = join(tempDir("motif-ataa-"), "app");
  assemble("angular-contract-app", fresh);

  test("its code follows the design guide before npm ci: no violations, exceptions or warnings", async () => {
    expect(existsSync(join(fresh, "node_modules"))).toBe(false);
    const r = await runCheck(fresh, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("its generated theme is the one motif tokens writes, before npm ci too: up to date, and wired in", async () => {
    const r = await runTokens(fresh, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
    // Nothing left to wire (styles.css imports the Tailwind theme) and nothing to install (motion is declared).
    expect(r.text).not.toContain("Next:");
    expect(r.text).not.toContain("is for Motion's animate()");
    for (const f of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/app/design/motion.ts"]) {
      expect(readFileSync(join(fresh, f), "utf8").replace(/\r\n/g, "\n")).toBe(read(f));
    }
  });

  test("the guide declares a default look and Harvest night, colours only, with Noto Kufi Arabic for Arabic", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.$extensions["dev.motif"].variants.map((v: { id: string }) => v.id)).toEqual(["default", "harvest-night"]);
    const varied = Object.entries(tokens.color as Record<string, any>).filter(([, t]) => t?.$extensions?.["dev.motif"]?.variants?.["harvest-night"]).map(([k]) => k);
    expect(varied.sort()).toEqual(["action-primary", "action-secondary", "background", "focus"]);
    for (const group of ["font", "space", "radius", "duration", "easing", "spring", "shadow"]) expect(JSON.stringify(tokens[group])).not.toContain("harvest-night");
    expect(tokens.primitive.font.sans.$value.slice(0, 2)).toEqual(["Work Sans", "Noto Kufi Arabic"]);
    expect(tokens.primitive.font.display.$value.slice(0, 2)).toEqual(["Fraunces", "Noto Kufi Arabic"]);
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Ataa");
    expect(guide).toMatch(/^## Variants$/m);
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("its theme is Motif's: generated files where the Angular guide puts them, with the Harvest night variant", () => {
    const css = read("src/styles/motif.css");
    expect(css.startsWith(CSS_HEADER + "\n")).toBe(true);
    expect(css).toContain(':root[data-variant="harvest-night"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(read("src/styles/motif.tailwind.css").startsWith(CSS_HEADER + "\n")).toBe(true);
    expect(read("src/app/design/motion.ts").startsWith(TS_HEADER + "\n")).toBe(true);
    expect(JSON.parse(read("design/motif.json")).apps).toEqual([{ path: ".", stack: "angular", srcDir: "src" }]);
  });

  test("it's an Angular 21.2 app the way the Angular guide says: standalone, Tailwind 4, the theme's fonts, English and Arabic", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of [
      "@angular/core", "@angular/common", "@angular/router", "@angular/platform-browser", "@angular/build", "@angular/cli", "@angular/compiler-cli",
      "tailwindcss", "@tailwindcss/postcss", "typescript", "motion", "@fontsource/fraunces", "@fontsource/work-sans", "@fontsource/noto-kufi-arabic",
    ]) expect(deps[dep] ? dep : `${dep} is missing`).toBe(dep);
    expect(pkg.scripts.start).toBe("ng serve");
    expect(pkg.scripts.build).toBe("ng build");
    // Angular 21.2, so it runs on this computer's Node 22.14 (Angular 22 needs 22.22.3).
    expect(deps["@angular/core"]).toBe("~21.2.25");
    expect(Number(/\d+/.exec(deps.tailwindcss)![0])).toBe(4);
    // The deprecated package is what the seeded copy adds; Ataa uses animate.enter.
    expect(deps["@angular/animations"]).toBeUndefined();
    expect(existsSync(join(APP, "package-lock.json"))).toBe(true);
    expect(JSON.parse(read(".postcssrc.json")).plugins).toHaveProperty("@tailwindcss/postcss");
    expect(JSON.parse(read("angular.json")).projects.ataa.architect.build.options.styles).toEqual(["src/styles.css"]);
    // The Tailwind theme right after Tailwind, so Tailwind's defaults can't win, then each weight of the theme's fonts.
    const styles = read("src/styles.css");
    expect(styles.startsWith("@import 'tailwindcss';\n@import './styles/motif.tailwind.css';\n")).toBe(true);
    for (const s of ["work-sans/400", "work-sans/500", "fraunces/600", "fraunces/700", "noto-kufi-arabic/400", "noto-kufi-arabic/500", "noto-kufi-arabic/600", "noto-kufi-arabic/700"]) {
      expect(styles).toContain(`@import '@fontsource/${s}.css';`);
    }
    // The language, direction and variant on <html> from services the app starts before its first page.
    const config = read("src/app/app.config.ts");
    expect(config).toContain("provideAppInitializer(() => {\n      inject(LocaleService);\n      inject(VariantService);\n    })");
    expect(config).toContain("provideRouter(routes, withComponentInputBinding())");
    expect(read("src/app/i18n/locale.service.ts")).toContain("html.setAttribute('dir', this.lang() === 'ar' ? 'rtl' : 'ltr');");
    expect(read("src/app/variant.service.ts")).toContain("html.setAttribute('data-variant', variant)");
    // The guide's Button: an attribute selector on the real element, its boolean inputs written as plain attributes.
    const button = read("src/app/button/button.ts");
    expect(button).toContain("selector: 'button[appButton], a[appButton]'");
    expect(button).toContain("input(false, { transform: booleanAttribute })");
    // Standalone components with signal inputs and the built-in control flow, never NgModules or *ngIf.
    for (const file of sourceFiles(join(APP, "src"))) {
      const code = readFileSync(file, "utf8");
      for (const re of [/@NgModule/, /\*ng(If|For)/, /@Input\(/, /@Output\(/, /standalone:\s*false/]) expect(re.test(code) ? `${relative(APP, file)}: ${re}` : "ok").toBe("ok");
    }
    const strings = read("src/app/i18n/strings.ts");
    expect(tableKeys(strings, "ar")).toEqual(tableKeys(strings, "en"));
    expect(tableKeys(strings, "en").length).toBeGreaterThan(20);
  });

  test("its one animate.enter takes the motion roles, and Motion runs only when reduced motion is off", () => {
    const note = read("src/app/signup-note/signup-note.ts");
    expect(note).toContain('animate.enter="rise-in"');
    expect(note).toContain("animation: rise var(--motif-duration-base) var(--motif-easing-enter);");
    const enters = sourceFiles(join(APP, "src")).filter((f) => readFileSync(f, "utf8").includes("animate.enter"));
    expect(enters.map((f) => relative(APP, f).replace(/\\/g, "/"))).toEqual(["src/app/signup-note/signup-note.ts"]);
    const mine = read("src/app/my-shifts/my-shifts.ts");
    expect(mine).toContain("import { spring } from '../design/motion';");
    expect(mine.indexOf("matchMedia('(prefers-reduced-motion: reduce)').matches")).toBeGreaterThan(-1);
    expect(mine.indexOf("matchMedia(")).toBeLessThan(mine.indexOf("animate(event.target"));
    // The deprecated package is what the seeded copy plants; Ataa imports none of it.
    for (const file of sourceFiles(join(APP, "src"))) expect(readFileSync(file, "utf8").includes("@angular/animations") ? relative(APP, file) : "none").toBe("none");
  });

  test("its pages are open shifts, my shifts, sign-in and a shift's page, and nothing for history or settings yet", () => {
    const routes = discoverAngularRoutes(APP);
    expect(routes).toEqual({ routes: ["/", "/my-shifts", "/sign-in"], skipped: ["/shifts/:id"] });
    // Test B's Angular cases add these.
    expect(JSON.stringify(routes)).not.toMatch(/history|settings/);
    expect(readdirSync(join(APP, "src/app")).filter((f) => /history|settings/i.test(f))).toEqual([]);
  });

  test("it stays small: about 40 files of its own", () => {
    const own = sourceFiles(join(APP, "src"));
    expect(own.length).toBeGreaterThanOrEqual(30);
    expect(own.length).toBeLessThanOrEqual(45);
  });

  test("layouts are written from start and end, so Arabic mirrors", () => {
    for (const file of sourceFiles(join(APP, "src"))) {
      const code = readFileSync(file, "utf8");
      const where = relative(APP, file);
      for (const re of [
        /\b(margin|padding|border)-(left|right)\s*:/, /(^|[\s;{])(left|right)\s*:/m, /text-align\s*:\s*(left|right)/,
        /class="[^"]*(?<![\w-])(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)-/,
      ]) {
        expect(re.test(code) ? `${where}: ${re}` : "ok").toBe("ok");
      }
    }
  });

  test("dependencies, Angular's cache and output, screenshots and Motif's own folder stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["node_modules/", ".angular/", "dist/", ".motif/"]) expect(ignore).toContain(s);
    for (const s of [".progress.json", "shots/"]) expect(read("design/.gitignore")).toContain(s);
  });
});

describe("the Angular seeded app's list of planted problems", () => {
  test("has the brief's problems: at least 8 exact ones and 4 that need judgement", () => {
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(8);
    expect(new Set(byDetector("check").map((i) => i.rule))).toEqual(new Set(["raw-color", "off-scale", "tailwind-arbitrary", "raw-motion"]));
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(4);
    const anchors = issues.map((i) => i.anchor ?? "");
    for (const a of ["[style.color]=\"'#625D51'\"", "padding: 18px", "gap: 6px", "rounded-[14px]", "font-size: 15px", "animate('250ms'", "opacity-50", "margin-left:"]) {
      expect(anchors.some((x) => x.includes(a)) ? a : `${a} isn't planted`).toBe(a);
    }
    // The off-scale gap is in an inline styles:, the padding in a component's .css.
    expect(issues.find((i) => i.anchor === "gap: 6px")!.location.file).toMatch(/\.ts$/);
    expect(issues.find((i) => i.anchor === "padding: 18px")!.location.file).toMatch(/\.css$/);
    expect(byDetector("shot").map((i) => i.categories[0]).sort()).toEqual(["accessibility", "contrast"]);
    expect(issues.filter((i) => i.kind === "judgement").map((i) => i.categories[0])).toEqual(
      expect.arrayContaining(["spacing", "hierarchy", "missing-state", "platform-convention"]),
    );
  });

  test("every entry is well formed, and knock-on findings are declared", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      expect(i.id).toMatch(/^S-\d\d$/);
      expect(i.categories.length).toBeGreaterThan(0);
      for (const c of i.categories) expect(CATEGORIES).toContain(c);
      expect(["critical", "major", "minor"]).toContain(i.severity);
      expect(["exact", "judgement"]).toContain(i.kind);
      expect(Boolean(i.location.file || i.location.screen || i.location.app)).toBe(true);
      expect(i.summary.length).toBeGreaterThan(10);
      if (i.kind === "exact" && i.detectedBy === "check") expect(typeof i.rule).toBe("string");
      for (const c of i.consequences ?? []) {
        expect(CATEGORIES).toContain(c.category);
        for (const s of c.screens) expect(s.startsWith("/")).toBe(true);
        for (const s of c.schemes) expect(["light", "dark"]).toContain(s);
        expect(c.note.length).toBeGreaterThan(10);
      }
    }
    expect(issues.find((i) => i.id === "S-01")!.consequences?.length ?? 0).toBeGreaterThan(0);
  });

  test("the tests README and the seeded README list the Angular fixtures and every problem", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/angular-contract-app/", "fixtures/angular-seeded-app/", "assemble.ts angular-seeded-app"]) expect(readme).toContain(s);
    const seeded = readFileSync(join(FIXTURES, "angular-seeded-app/README.md"), "utf8");
    for (const i of issues) expect(seeded).toContain(`| ${i.id} |`);
  });
});

describe("the assembled Angular seeded app", () => {
  const dest = join(tempDir("motif-angular-seeded-"), "app");
  assemble("angular-seeded-app", dest);
  const at = (rel: string) => readFileSync(join(dest, rel), "utf8").replace(/\r\n/g, "\n");

  test("every file the list names exists", () => {
    for (const i of issues) if (i.location.file) expect(existsSync(join(dest, i.location.file)) ? i.id : `${i.id}: ${i.location.file} is missing`).toBe(i.id);
  });

  test("motif check reports every planted problem at its place, and nothing else", async () => {
    const r = await runCheck(dest, { positionals: [] });
    expect(reported(r.data)).toEqual(planted());
    expect(r.data.exceptions).toEqual([]);
  });

  test("motif validate finds nothing: every planted problem is in the code", async () => {
    const r = await runValidate(dest);
    expect(r.data.findings).toEqual([]);
  });

  test("every pinned line holds its anchor text", () => {
    for (const issue of issues.filter((i) => i.location.file && i.location.line)) {
      expect(typeof issue.anchor === "string" ? "anchored" : `${issue.id} has no anchor`).toBe("anchored");
      const line = at(issue.location.file!).split("\n")[issue.location.line! - 1] ?? "";
      expect(line.includes(issue.anchor!) ? issue.id : `${issue.id}: "${line.trim()}"`).toBe(issue.id);
    }
  });

  test("nothing else is wrong on purpose: the bare sign-in link keeps its size, the theme is Ataa's, and only the seeded copy has @angular/animations", () => {
    expect(at("src/app/top-bar/top-bar.html")).toContain('class="ms-auto inline-flex size-12');
    for (const f of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/app/design/motion.ts", "DESIGN.md", "design/tokens.json"]) expect(at(f)).toBe(read(f));
    const pkg = JSON.parse(at("package.json"));
    const base = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@angular/animations"]).toBe(base.dependencies["@angular/core"]);
    delete pkg.dependencies["@angular/animations"];
    expect(pkg).toEqual(base);
    expect(at("src/app/app.config.ts")).toContain("provideAnimationsAsync(),");
    // The withdrawal's matchMedia check stays, so reduced motion isn't a finding of its own.
    expect(at("src/app/my-shifts/my-shifts.ts")).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });

  test("Ataa has no history or settings route in its seeded copy either", () => {
    expect(JSON.stringify(discoverAngularRoutes(dest))).not.toMatch(/history|settings/);
  });
});

// The rest needs Node in Angular 21's range with npm (ng build runs on Node) and, for screenshots, Chrome, Edge or
// Chromium. bun's skipIf takes no reason, so each name says it. In CI they run in the angular job only
// (MOTIF_STACK_JOB), as angular-compile's; elsewhere wherever the toolchain is. Each copy's node_modules are installed once
// (offline from npm's cache when it can), and each screenshot run starts the app's own start script.
const ANGULAR_21_NODE = "^20.19.0 || ^22.12.0 || >=24.0.0";
const npm = Bun.which("npm");
const node = Bun.which("node");
const version = node ? Bun.spawnSync([node, "--version"], { stdout: "pipe" }).stdout.toString().trim().replace(/^v/, "") || null : null;
const nodeFits = Boolean(version !== null && nodeFloor(ANGULAR_21_NODE, version));
const gate = heavyStackTests("angular", Boolean(npm && node && nodeFits));
const hasNode = gate.run;
const browser = findBrowser() !== null;
const ready = hasNode && browser;
if (!hasNode) console.log(`[fixtures-angular] the installed tests are skipped: ${!npm || !node ? "Node and npm aren't installed" : !nodeFits ? `Node ${version} is outside Angular 21's range (${ANGULAR_21_NODE})` : gate.reason}.`);
else if (!browser) console.log("[fixtures-angular] the screenshot tests are skipped: no Chrome, Edge or Chromium was found.");

describe("Ataa and its seeded copy, installed, built and drawn through ng serve", () => {
  const ROUTES = "/,/my-shifts,/sign-in,/shifts/pack-sunday";
  const SIZES = "390,1440";
  const copies: Record<string, string> = {};

  const run = (cmd: string[], cwd: string) => {
    const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NG_CLI_ANALYTICS: "false" } });
    return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
  };

  beforeAll(() => {
    if (!hasNode) return;
    for (const name of ["angular-contract-app", "angular-seeded-app"] as const) {
      // A space in the path, as in many Windows user folders.
      const dir = join(tempDir("motif angular fixture "), "app");
      assemble(name, dir);
      if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], dir).code !== 0) {
        const again = run([npm!, "ci", "--no-audit", "--no-fund"], dir);
        if (again.code !== 0) console.log(again.out);
        expect(again.code).toBe(0);
      }
      copies[name] = dir;
    }
  }, 900_000);

  test.skipIf(!hasNode)("Ataa's generated theme is the one motif tokens writes with its packages installed: up to date (skipped without Node in Angular 21's range and npm)", async () => {
    const r = await runTokens(copies["angular-contract-app"]!, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
  }, 120_000);

  test.skipIf(!hasNode)("Ataa, installed, follows the design guide with no violations, exceptions or warnings (skipped without Node in Angular 21's range and npm)", async () => {
    const r = await runCheck(copies["angular-contract-app"]!, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  }, 120_000);

  test.skipIf(!hasNode)("the seeded copy, installed, has the same check problems as before npm ci: the planted ones and nothing else (skipped without Node in Angular 21's range and npm)", async () => {
    const r = await runCheck(copies["angular-seeded-app"]!, { positionals: [] });
    expect(reported(r.data)).toEqual(planted());
  }, 120_000);

  test.skipIf(!hasNode)("ng build passes on Ataa and its seeded copy with no errors or warnings (skipped without Node in Angular 21's range and npm)", () => {
    for (const dir of Object.values(copies)) {
      const r = run([npm!, "run", "build"], dir);
      if (r.code !== 0) console.log(r.out);
      expect(r.code).toBe(0);
      expect(r.out).not.toMatch(/\bWARNING\b|\[WARNING\]|▲/);
    }
  }, 600_000);

  test.skipIf(!ready)("Ataa's pages have no audit findings, in both variants, light and dark, left to right and right to left (skipped without Node in Angular 21's range, npm or a browser)", async () => {
    const r = await runShot(copies["angular-contract-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: SIZES, audit: true, variant: "all", rtl: true } });
    if (r.exitCode !== 0) console.log(r.text);
    const routes = r.data.routes as { route: string; status: number; pageErrors?: string[]; error?: string }[];
    expect(routes.map((x) => [x.route, x.status, x.pageErrors ?? [], x.error])).toEqual(ROUTES.split(",").map((route) => [route, 200, [], undefined]));
    // 4 pages × 2 sizes × light and dark × 2 variants × both directions.
    expect((r.data.shots as string[]).length).toBe(4 * 2 * 2 * 2 * 2);
    const notes = JSON.stringify(r.data.notes ?? []);
    // Ataa's locale service turns it right to left in Arabic, and each variant and dark mode look different.
    expect(notes).not.toContain("doesn't switch to right to left by itself");
    expect(notes).not.toContain("looks the same as the default");
    expect(notes).not.toContain("Dark mode looks the same as light");
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 900_000);

  test.skipIf(!ready)("the seeded copy's audit finds its planted contrast and name problems, and everything else is a declared knock-on (skipped without Node in Angular 21's range, npm or a browser)", async () => {
    const r = await runShot(copies["angular-seeded-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: SIZES, audit: true, variant: "all", rtl: true } });
    type Place = { screen: string; selector: string; scheme?: string };
    type Found = { category: string; location: Place; locations?: Place[]; summary: string };
    const findings = r.data.findings as Found[];
    // What the audit says of each planted problem, in English or Arabic.
    const SHOWN: Record<string, RegExp> = {
      "S-07": /"(We only use your email for your shifts|نستخدم بريدك لمناوباتك)/,
      "S-08": /^The link has no name/,
    };
    const shows = (f: Found, i: Issue) => SHOWN[i.id] !== undefined && i.categories.includes(f.category) && SHOWN[i.id]!.test(f.summary);
    for (const i of byDetector("shot")) {
      const seen = findings.filter((f) => shows(f, i));
      expect(seen.length > 0 ? i.id : `${i.id} not reported`).toBe(i.id);
      // The sign-in link is in the top bar of every page; the caption is on its own page.
      if (i.id !== "S-08") for (const f of seen) for (const p of [f.location, ...(f.locations ?? [])]) expect(sameScreen(i.location.screen!, p.screen)).toBe(true);
    }
    for (const f of findings) {
      const isPlanted = byDetector("shot").some((i) => shows(f, i));
      const knockOn = [f.location, ...(f.locations ?? [])].every((p) =>
        issues.some((i) => (i.consequences ?? []).some((c) => c.category === f.category && c.screens.some((s) => sameScreen(s, p.screen)) && (!p.scheme || c.schemes.includes(p.scheme)))),
      );
      expect(isPlanted || knockOn ? "expected" : `unplanned ${f.category}: ${f.location.selector} ${f.summary}`).toBe("expected");
    }
  }, 900_000);
});
