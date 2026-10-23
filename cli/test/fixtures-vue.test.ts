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
import { discoverVueRoutes } from "../src/stacks/vue/routes";
import { cleanupTempDirs, tempDir } from "./tmp";

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const APP = join(FIXTURES, "vue-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");
const list = JSON.parse(readFileSync(join(FIXTURES, "vue-seeded-app/seeded-issues.json"), "utf8"));
const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "accessibility", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];
type Consequence = { category: string; screens: string[]; schemes: string[]; note: string };
type Issue = {
  id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: { file?: string; line?: number; screen?: string; app?: boolean; path?: string }; anchor?: string; summary: string; consequences?: Consequence[];
};
const issues: Issue[] = list.issues;
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);
/** A route as the audit names it, against a listed screen whose [id] matches any value. */
const sameScreen = (listed: string, route: string) => new RegExp(`^${listed.replace(/\[[^/]+\]/g, "[^/]+")}$`).test(route);

/** The app's own source: its .vue and .ts files, without node_modules, the build and the generated theme. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return ["node_modules", "dist", "design", "styles"].includes(name) ? [] : sourceFiles(path);
    return /\.(vue|ts)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** The keys of one of the string tables in src/i18n/strings.ts. */
function tableKeys(source: string, table: "en" | "ar"): string[] {
  const start = source.indexOf(`export const ${table}`);
  const body = source.slice(source.indexOf("{", start), source.indexOf("\n};", start));
  return [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]!).sort();
}

describe("the Vue contract app (Bustan)", () => {
  test("its design guide is valid, with every pair readable in light and dark, in both variants", async () => {
    const r = await runValidate(APP);
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0, contrastChecks: tokens.$extensions["dev.motif"].pairs.length * 4 });
  });

  // A copy as git keeps it, without node_modules: a fresh clone, CI's checkout, an eval's workspace before npm ci.
  const fresh = join(tempDir("motif-bustan-"), "app");
  assemble("vue-contract-app", fresh);

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
    // Nothing left to wire: main.css imports the Tailwind theme, and motion-v is declared.
    expect(r.text).not.toContain("Next:");
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("npm install motion-v");
    for (const f of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts"]) {
      expect(readFileSync(join(fresh, f), "utf8").replace(/\r\n/g, "\n")).toBe(read(f));
    }
  });

  test("the guide declares a default look and the harvest, colours only, with Tajawal for Arabic", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.$extensions["dev.motif"].variants.map((v: { id: string }) => v.id)).toEqual(["default", "harvest"]);
    const varied = Object.entries(tokens.color as Record<string, any>).filter(([, t]) => t?.$extensions?.["dev.motif"]?.variants?.harvest).map(([k]) => k);
    expect(varied.sort()).toEqual(["action-primary", "action-secondary", "background", "focus"]);
    for (const group of ["font", "space", "radius", "duration", "easing", "spring", "shadow"]) expect(JSON.stringify(tokens[group])).not.toContain("harvest");
    expect(tokens.primitive.font.sans.$value.slice(0, 2)).toEqual(["Nunito", "Tajawal"]);
    expect(tokens.primitive.font.display.$value.slice(0, 2)).toEqual(["Fraunces", "Tajawal"]);
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Bustan");
    expect(guide).toMatch(/^## Variants$/m);
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("its theme is Motif's: generated files where the Vue guide puts them, with the harvest variant", () => {
    const css = read("src/styles/motif.css");
    expect(css.startsWith(CSS_HEADER + "\n")).toBe(true);
    expect(css).toContain(':root[data-variant="harvest"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(read("src/styles/motif.tailwind.css").startsWith(CSS_HEADER + "\n")).toBe(true);
    expect(read("src/design/motion.ts").startsWith(TS_HEADER + "\n")).toBe(true);
    expect(JSON.parse(read("design/motif.json")).apps).toEqual([{ path: ".", stack: "vue", srcDir: "src" }]);
  });

  test("it's a Vue app the way the Vue guide says: Vite, Vue Router, Tailwind 4, Motion for Vue, the theme's fonts, English and Arabic", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of [
      "vue", "vue-router", "motion-v", "vite", "@vitejs/plugin-vue", "tailwindcss", "@tailwindcss/vite", "typescript", "vue-tsc",
      "@fontsource/fraunces", "@fontsource/nunito", "@fontsource/tajawal",
    ]) expect(deps[dep] ? dep : `${dep} is missing`).toBe(dep);
    expect(pkg.scripts.dev).toBe("vite");
    expect(Number(/\d+/.exec(deps.vue)![0])).toBe(3);
    expect(Number(/\d+/.exec(deps.tailwindcss)![0])).toBe(4);
    expect(Number(/\d+/.exec(deps["motion-v"])![0])).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(APP, "package-lock.json"))).toBe(true);
    expect(read("vite.config.ts")).toContain("plugins: [vue(), tailwindcss()]");
    // The Tailwind theme right after Tailwind, so Tailwind's defaults can't win.
    expect(read("src/assets/main.css").startsWith('@import "tailwindcss";\n@import "../styles/motif.tailwind.css";\n')).toBe(true);
    const main = read("src/main.ts");
    for (const s of ['import "./assets/main.css";', '"@fontsource/nunito/400.css"', '"@fontsource/fraunces/700.css"', '"@fontsource/tajawal/400.css"', "html.dir ="]) {
      expect(main).toContain(s);
    }
    expect(read("src/App.vue")).toContain('<MotionConfig reduced-motion="user">');
    const strings = read("src/i18n/strings.ts");
    expect(tableKeys(strings, "ar")).toEqual(tableKeys(strings, "en"));
    expect(tableKeys(strings, "en").length).toBeGreaterThan(20);
  });

  test("its pages are plots to book, the harvest log, sign-in and a plot's page, and nothing for history or settings yet", () => {
    const routes = discoverVueRoutes(APP);
    expect(routes).toEqual({ routes: ["/", "/harvest", "/sign-in"], skipped: ["/plots/:id"] });
    // Test B's Vue cases add these.
    expect(JSON.stringify(routes)).not.toMatch(/history|settings/);
    expect(readdirSync(join(APP, "src/views")).filter((f) => /history|settings/i.test(f))).toEqual([]);
  });

  test("it stays small: about 20 files of its own", () => {
    const own = sourceFiles(join(APP, "src"));
    expect(own.length).toBeGreaterThanOrEqual(15);
    expect(own.length).toBeLessThanOrEqual(25);
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

  test("dependencies, the build, screenshots and Motif's own folder stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["node_modules/", "dist/", ".motif/"]) expect(ignore).toContain(s);
    for (const s of [".progress.json", "shots/"]) expect(read("design/.gitignore")).toContain(s);
  });
});

describe("the Vue seeded app's list of planted problems", () => {
  test("has the brief's problems: at least 8 exact ones and 4 that need judgement", () => {
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(8);
    expect(new Set(byDetector("check").map((i) => i.rule))).toEqual(new Set(["raw-color", "off-scale", "tailwind-arbitrary", "raw-motion", "raw-font", "generated-edited"]));
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(4);
    const anchors = issues.map((i) => i.anchor ?? "");
    for (const a of ["background: '#2E7D32'", "padding: 18px", "rounded-[10px]", "font-size: 15px", "cubic-bezier(", "margin-left:"]) {
      expect(anchors.some((x) => x.includes(a)) ? a : `${a} isn't planted`).toBe(a);
    }
    expect(byDetector("shot").map((i) => i.categories[0]).sort()).toEqual(["accessibility", "contrast", "target-size"]);
    expect(issues.filter((i) => i.kind === "judgement").map((i) => i.categories[0])).toEqual(
      expect.arrayContaining(["spacing", "hierarchy", "missing-state", "platform-convention"]),
    );
  });

  test("every entry is well formed, and knock-on findings are declared", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      expect(i.id).toMatch(/^V-\d\d$/);
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
    expect(issues.find((i) => i.id === "V-01")!.consequences?.length ?? 0).toBeGreaterThan(0);
  });

  test("the tests README and the seeded README list the Vue fixtures and every problem", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/vue-contract-app/", "fixtures/vue-seeded-app/", "assemble.ts vue-seeded-app"]) expect(readme).toContain(s);
    const seeded = readFileSync(join(FIXTURES, "vue-seeded-app/README.md"), "utf8");
    for (const i of issues) expect(seeded).toContain(`| ${i.id} |`);
  });
});

describe("the assembled Vue seeded app", () => {
  const dest = join(tempDir("motif-vue-seeded-"), "app");
  assemble("vue-seeded-app", dest);
  const at = (rel: string) => readFileSync(join(dest, rel), "utf8").replace(/\r\n/g, "\n");

  test("every file the list names exists", () => {
    for (const i of issues) if (i.location.file) expect(existsSync(join(dest, i.location.file)) ? i.id : `${i.id}: ${i.location.file} is missing`).toBe(i.id);
  });

  test("motif check reports every planted problem at its place, and nothing else", async () => {
    const r = await runCheck(dest, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])];
    for (const issue of byDetector("check")) {
      const hit = found.find((h) => h.rule === issue.rule && h.file === issue.location.file && h.line === issue.location.line);
      expect(hit ? issue.id : `${issue.id} not reported`).toBe(issue.id);
    }
    for (const h of found) {
      const planted = byDetector("check").some((i) => i.rule === h.rule && i.location.file === h.file && i.location.line === h.line);
      expect(planted ? "planted" : `unplanned ${h.rule} at ${h.file}:${h.line}`).toBe("planted");
    }
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

  test("nothing else is wrong on purpose: the small back link keeps its name, and the generated theme's one hand edit is radius md", () => {
    expect(at("src/views/PlotView.vue")).toContain(':aria-label="strings.back"');
    expect(at("src/components/TopBar.vue")).toContain('class="ms-auto inline-flex size-12');
    const seeded = at("src/styles/motif.css").split("\n");
    const original = read("src/styles/motif.css").split("\n");
    expect(seeded.length).toBe(original.length);
    expect(seeded.flatMap((line, i) => (line === original[i] ? [] : [[original[i], line]]))).toEqual([["  --motif-radius-md: 14px;", "  --motif-radius-md: 12px;"]]);
  });

  test("Bustan has no history or settings route in its seeded copy either", () => {
    expect(JSON.stringify(discoverVueRoutes(dest))).not.toMatch(/history|settings/);
  });
});

// The rest needs Node with npm (Vite runs on Node) and, for screenshots, Chrome, Edge or Chromium. bun's skipIf takes no
// reason, so each name says it. Each copy's node_modules are installed once (offline from npm's cache when it can), and
// each screenshot run starts the app's own dev script. Task 12 moves these under the vue CI job's heavy-test gate.
const npm = Bun.which("npm");
const node = Bun.which("node");
const npx = Bun.which("npx");
const browser = findBrowser() !== null;
const hasNode = Boolean(npm && node && npx);
const ready = hasNode && browser;

describe("Bustan and its seeded copy, installed, type-checked and drawn through Vite", () => {
  const ROUTES = "/,/harvest,/sign-in,/plots/by-the-gate";
  const SIZES = "390,1440";
  const copies: Record<string, string> = {};

  const run = (cmd: string[], cwd: string) => {
    const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
  };

  beforeAll(() => {
    if (!hasNode) {
      console.log("fixtures-vue: the installed tests are skipped, Node and npm aren't installed.");
      return;
    }
    if (!browser) console.log("fixtures-vue: the screenshot tests are skipped, no Chrome, Edge or Chromium was found.");
    for (const name of ["vue-contract-app", "vue-seeded-app"] as const) {
      // A space in the path, as in many Windows user folders.
      const dir = join(tempDir("motif vue fixture "), "app");
      assemble(name, dir);
      if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], dir).code !== 0) {
        const again = run([npm!, "ci", "--no-audit", "--no-fund"], dir);
        if (again.code !== 0) console.log(again.out);
        expect(again.code).toBe(0);
      }
      copies[name] = dir;
    }
  }, 900_000);

  test.skipIf(!hasNode)("Bustan's generated theme is the one motif tokens writes with its packages installed: up to date (skipped without Node and npm)", async () => {
    const r = await runTokens(copies["vue-contract-app"]!, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
  }, 120_000);

  test.skipIf(!hasNode)("Bustan, installed, follows the design guide with no violations, exceptions or warnings (skipped without Node and npm)", async () => {
    const r = await runCheck(copies["vue-contract-app"]!, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  }, 120_000);

  test.skipIf(!hasNode)("the seeded copy, installed, has the same check problems as before npm ci: the planted ones and nothing else (skipped without Node and npm)", async () => {
    const r = await runCheck(copies["vue-seeded-app"]!, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])]
      .map((h) => `${h.rule} ${h.file}:${h.line}`).sort();
    expect(found).toEqual(byDetector("check").map((i) => `${i.rule} ${i.location.file}:${i.location.line}`).sort());
  }, 120_000);

  test.skipIf(!hasNode)("npx vue-tsc --noEmit finds no errors in Bustan or its seeded copy (skipped without Node and npm)", () => {
    for (const dir of Object.values(copies)) {
      const r = run([npx!, "vue-tsc", "--noEmit"], dir);
      if (r.code !== 0) console.log(r.out);
      expect(r.code).toBe(0);
    }
  }, 300_000);

  test.skipIf(!ready)("Bustan's pages have no audit findings, in both variants, light and dark, left to right and right to left (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(copies["vue-contract-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: SIZES, audit: true, variant: "all", rtl: true } });
    if (r.exitCode !== 0) console.log(r.text);
    const routes = r.data.routes as { route: string; status: number; pageErrors?: string[]; error?: string }[];
    expect(routes.map((x) => [x.route, x.status, x.pageErrors ?? [], x.error])).toEqual(ROUTES.split(",").map((route) => [route, 200, [], undefined]));
    // 4 pages × 2 sizes × light and dark × 2 variants × both directions.
    expect((r.data.shots as string[]).length).toBe(4 * 2 * 2 * 2 * 2);
    const notes = JSON.stringify(r.data.notes ?? []);
    // Bustan turns right to left by itself in Arabic, and each variant and dark mode look different.
    expect(notes).not.toContain("doesn't switch to right to left by itself");
    expect(notes).not.toContain("looks the same as the default");
    expect(notes).not.toContain("Dark mode looks the same as light");
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 900_000);

  test.skipIf(!ready)("the seeded copy's audit finds its planted contrast, tap-target and name problems, and everything else is a declared knock-on (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(copies["vue-seeded-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: SIZES, audit: true, variant: "all", rtl: true } });
    type Place = { screen: string; selector: string; scheme?: string };
    type Found = { category: string; location: Place; locations?: Place[]; summary: string };
    const findings = r.data.findings as Found[];
    // What the audit says of each planted problem, in English or Arabic.
    const SHOWN: Record<string, RegExp> = {
      "V-06": /"(We only use your email for your plot and|نستخدم بريدك لقطعتك وأخبار البستان)/,
      "V-07": /^The "(Back to the plots|العودة إلى القطع)" link is 32×32 px/,
      "V-08": /^The link has no name/,
    };
    const shows = (f: Found, i: Issue) => SHOWN[i.id] !== undefined && i.categories.includes(f.category) && SHOWN[i.id]!.test(f.summary);
    for (const i of byDetector("shot")) {
      const seen = findings.filter((f) => shows(f, i));
      expect(seen.length > 0 ? i.id : `${i.id} not reported`).toBe(i.id);
      // The sign-in link is in the top bar of every page; the others are on their own page.
      if (i.id !== "V-08") for (const f of seen) for (const p of [f.location, ...(f.locations ?? [])]) expect(sameScreen(i.location.screen!, p.screen)).toBe(true);
    }
    for (const f of findings) {
      const planted = byDetector("shot").some((i) => shows(f, i));
      const knockOn = [f.location, ...(f.locations ?? [])].every((p) =>
        issues.some((i) => (i.consequences ?? []).some((c) => c.category === f.category && c.screens.some((s) => sameScreen(s, p.screen)) && (!p.scheme || c.schemes.includes(p.scheme)))),
      );
      expect(planted || knockOn ? "expected" : `unplanned ${f.category}: ${f.location.selector} ${f.summary}`).toBe("expected");
    }
  }, 900_000);
});
