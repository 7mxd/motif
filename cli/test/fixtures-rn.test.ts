import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { runValidate } from "../src/commands/validate";
import { findBrowser } from "../src/detect/browser";
import { TS_HEADER } from "../src/generate/header";
import { discoverExpoRoutes } from "../src/stacks/react-native/routes";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs, 120_000);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const APP = join(FIXTURES, "rn-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");
const list = JSON.parse(readFileSync(join(FIXTURES, "rn-seeded-app/seeded-issues.json"), "utf8"));
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

/** The app's own TypeScript: everything but node_modules, Expo's folders and the generated theme. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return ["node_modules", ".expo", "dist", "web-build", "design"].includes(name) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** The keys of one of the string tables in i18n/strings.ts. */
function tableKeys(source: string, table: "en" | "ar"): string[] {
  const start = source.indexOf(`export const ${table}`);
  const body = source.slice(source.indexOf("{", start), source.indexOf("\n};", start));
  return [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]!).sort();
}

describe("the Expo contract app (Dukkan)", () => {
  test("its design guide is valid, with every pair readable in light and dark, in both variants", async () => {
    const r = await runValidate(APP);
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0, contrastChecks: tokens.$extensions["dev.motif"].pairs.length * 4 });
  });

  // A copy as git keeps it, without node_modules: a fresh clone, CI's checkout, an eval's workspace before npm ci. The theme
  // names the font faces its packages export; before they're installed, Motif takes them from the theme file it wrote.
  const fresh = join(tempDir("motif-dukkan-"), "app");
  assemble("rn-contract-app", fresh);

  test("its code follows the design guide before npm ci: no violations, exceptions or warnings", async () => {
    expect(existsSync(join(fresh, "node_modules"))).toBe(false);
    const r = await runCheck(fresh, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("its generated theme is the one motif tokens writes, before npm ci too: up to date, with no weight cut to the regular face", async () => {
    const r = await runTokens(fresh, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("isn't installed");
    expect(readFileSync(join(fresh, "design/motif-theme.tsx"), "utf8").replace(/\r\n/g, "\n")).toBe(read("design/motif-theme.tsx"));
  });

  test("the guide declares a default look and the night market, colours only, with Readex Pro for Arabic", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.$extensions["dev.motif"].variants.map((v: { id: string }) => v.id)).toEqual(["default", "night-market"]);
    const varied = Object.entries(tokens.color as Record<string, any>).filter(([, t]) => t?.$extensions?.["dev.motif"]?.variants?.["night-market"]).map(([k]) => k);
    expect(varied.sort()).toEqual(["action-primary", "action-secondary", "background", "focus"]);
    for (const group of ["font", "space", "radius", "duration", "easing", "spring", "shadow"]) expect(JSON.stringify(tokens[group])).not.toContain("night-market");
    expect(tokens.primitive.font.sans.$value.slice(0, 2)).toEqual(["Onest", "Readex Pro"]);
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Dukkan");
    expect(guide).toMatch(/^## Variants$/m);
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("its theme is Motif's: generated, quoted variant ids, and Onest with Readex Pro from their Google font packages", () => {
    const theme = read("design/motif-theme.tsx");
    expect(theme.startsWith(TS_HEADER + "\n")).toBe(true);
    expect(theme).toContain('export type MotifVariant = "default" | "night-market";');
    expect(theme).toContain('from "@expo-google-fonts/onest"');
    expect(theme).toContain('from "@expo-google-fonts/readex-pro"');
    expect(theme).toContain('title: { fontFamily: "ReadexPro_700Bold"');
  });

  test("it's an Expo app the way the React Native guide says: Expo Router, the web target's packages, the theme's fonts, English and Arabic", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.main).toBe("expo-router/entry");
    for (const dep of [
      "expo", "expo-router", "expo-font", "react-native", "react-native-web", "react-dom", "@expo/metro-runtime", "react-native-reanimated",
      "react-native-safe-area-context", "@expo/vector-icons", "@expo-google-fonts/onest", "@expo-google-fonts/readex-pro",
    ]) expect(pkg.dependencies[dep] ? dep : `${dep} is missing`).toBe(dep);
    expect(Number(/\d+/.exec(pkg.dependencies.expo)![0])).toBeGreaterThanOrEqual(52);
    expect(existsSync(join(APP, "package-lock.json"))).toBe(true);
    const layout = read("app/_layout.tsx");
    for (const s of ["useFonts({ ...motifFonts", "<MotifProvider variant=", "<ThemeProvider value={theme}>"]) expect(layout).toContain(s);
    const strings = read("i18n/strings.ts");
    expect(tableKeys(strings, "ar")).toEqual(tableKeys(strings, "en"));
    expect(tableKeys(strings, "en").length).toBeGreaterThan(20);
    expect(JSON.parse(read("tsconfig.json")).compilerOptions.paths).toEqual({ "@/*": ["./*"] });
  });

  test("its screens are the shop, the basket, sign-in and a product's page, and nothing for orders or favourites yet", () => {
    const routes = discoverExpoRoutes(APP);
    expect(routes).toEqual({ routes: ["/", "/basket", "/sign-in"], skipped: ["/products/[id]"] });
    // Test B's Expo cases add these.
    expect(JSON.stringify(routes)).not.toMatch(/orders|favourites/);
  });

  test("it stays small: about 15 TypeScript files of its own", () => {
    const own = sourceFiles(APP).filter((f) => !f.endsWith("motif-theme.tsx"));
    expect(own.length).toBeGreaterThanOrEqual(12);
    expect(own.length).toBeLessThanOrEqual(20);
  });

  test("layouts are written from start and end, so Arabic mirrors", () => {
    for (const file of sourceFiles(APP)) {
      const code = readFileSync(file, "utf8");
      const where = relative(APP, file);
      for (const re of [/\b(margin|padding)(Left|Right)\s*:/, /\b(left|right)\s*:\s*[\d-]/, /textAlign\s*:\s*["'](left|right)/, /border(Top|Bottom)(Left|Right)Radius/]) {
        expect(re.test(code) ? `${where}: ${re}` : "ok").toBe("ok");
      }
    }
  });

  test("dependencies, Expo's output, screenshots and Motif's own folder stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["node_modules/", ".expo/", "dist/", "web-build/", ".motif/"]) expect(ignore).toContain(s);
    for (const s of [".progress.json", "shots/"]) expect(read("design/.gitignore")).toContain(s);
  });
});

describe("the Expo seeded app's list of planted problems", () => {
  test("has the brief's problems: at least 8 exact ones and 4 that need judgement", () => {
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(8);
    expect(new Set(byDetector("check").map((i) => i.rule))).toEqual(new Set(["raw-color", "off-scale", "raw-motion", "raw-font", "generated-edited"]));
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(4);
    const anchors = issues.map((i) => i.anchor ?? "");
    for (const a of ['"#2E7D32"', "padding: 18", "borderRadius: 10", "fontSize: 15", "Easing.bezier(", "marginLeft:"]) {
      expect(anchors.some((x) => x.includes(a)) ? a : `${a} isn't planted`).toBe(a);
    }
    expect(byDetector("shot").map((i) => i.categories[0]).sort()).toEqual(["accessibility", "contrast", "target-size"]);
    expect(issues.filter((i) => i.kind === "judgement").map((i) => i.categories[0])).toEqual(
      expect.arrayContaining(["spacing", "consistency", "missing-state", "platform-convention"]),
    );
  });

  test("every entry is well formed, and knock-on findings are declared", () => {
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length);
    for (const i of issues) {
      expect(i.id).toMatch(/^E-\d\d$/);
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
    expect(issues.find((i) => i.id === "E-01")!.consequences?.length ?? 0).toBeGreaterThan(0);
  });

  test("the tests README and the seeded README list the Expo fixtures and every problem", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/rn-contract-app/", "fixtures/rn-seeded-app/", "assemble.ts rn-seeded-app"]) expect(readme).toContain(s);
    const seeded = readFileSync(join(FIXTURES, "rn-seeded-app/README.md"), "utf8");
    for (const i of issues) expect(seeded).toContain(`| ${i.id} |`);
  });
});

describe("the assembled Expo seeded app", () => {
  const dest = join(tempDir("motif-rn-seeded-"), "app");
  assemble("rn-seeded-app", dest);
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

  test("nothing else is wrong on purpose: the small button and the unnamed button still work, and the generated theme's one hand edit is radius md", () => {
    expect(at("components/product-row.tsx")).toContain("accessibilityLabel={strings.addNamed(name)}");
    expect(at("app/index.tsx")).toContain('onPress={() => router.push("/sign-in")}');
    const seeded = at("design/motif-theme.tsx").split("\n");
    const original = read("design/motif-theme.tsx").split("\n");
    expect(seeded.length).toBe(original.length);
    expect(seeded.flatMap((line, i) => (line === original[i] ? [] : [[original[i], line]]))).toEqual([["  md: 8,", "  md: 6,"]]);
  });

  test("Dukkan has no orders or favourites route in its seeded copy either", () => {
    expect(JSON.stringify(discoverExpoRoutes(dest))).not.toMatch(/orders|favourites/);
  });
});

// The rest needs Node with npm (Expo runs on Node) and, for screenshots, Chrome, Edge or Chromium. bun's skipIf takes no
// reason, so each name says it. Each copy's node_modules are installed once (offline from npm's cache when it can), and
// each screenshot run starts Expo and waits for its first web bundle, so these take minutes.
const npm = Bun.which("npm");
const node = Bun.which("node");
const npx = Bun.which("npx");
const browser = findBrowser() !== null;
const hasNode = Boolean(npm && node && npx);
const ready = hasNode && browser;

describe("Dukkan and its seeded copy, installed, type-checked and drawn through Expo's web target", () => {
  const ROUTES = "/,/sign-in,/basket,/products/oat-milk";
  const copies: Record<string, string> = {};

  const run = (cmd: string[], cwd: string) => {
    const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
  };

  beforeAll(() => {
    if (!hasNode) {
      console.log("fixtures-rn: the installed tests are skipped, Node and npm aren't installed.");
      return;
    }
    if (!browser) console.log("fixtures-rn: the screenshot tests are skipped, no Chrome, Edge or Chromium was found.");
    for (const name of ["rn-contract-app", "rn-seeded-app"] as const) {
      // A space in the path, as in many Windows user folders.
      const dir = join(tempDir("motif rn fixture "), "app");
      assemble(name, dir);
      if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], dir).code !== 0) {
        const again = run([npm!, "ci", "--no-audit", "--no-fund"], dir);
        if (again.code !== 0) console.log(again.out);
        expect(again.code).toBe(0);
      }
      copies[name] = dir;
    }
  }, 900_000);

  test.skipIf(!hasNode)("Dukkan's generated theme is the one motif tokens writes with its packages installed: up to date (skipped without Node and npm)", async () => {
    const r = await runTokens(copies["rn-contract-app"]!, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("expo install");
  }, 120_000);

  test.skipIf(!hasNode)("Dukkan, installed, follows the design guide with no violations, exceptions or warnings (skipped without Node and npm)", async () => {
    const r = await runCheck(copies["rn-contract-app"]!, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  }, 120_000);

  test.skipIf(!hasNode)("the seeded copy, installed, has the same check problems as before npm ci: the planted ones and nothing else (skipped without Node and npm)", async () => {
    const r = await runCheck(copies["rn-seeded-app"]!, { positionals: [] });
    const found = [...(r.data.violations as { rule: string; file: string; line: number }[]), ...(r.data.warnings as { rule: string; file: string; line: number }[])]
      .map((h) => `${h.rule} ${h.file}:${h.line}`).sort();
    expect(found).toEqual(byDetector("check").map((i) => `${i.rule} ${i.location.file}:${i.location.line}`).sort());
  }, 120_000);

  test.skipIf(!hasNode)("npx tsc --noEmit finds no errors in Dukkan or its seeded copy (skipped without Node and npm)", () => {
    for (const dir of Object.values(copies)) {
      const r = run([npx!, "tsc", "--noEmit"], dir);
      if (r.code !== 0) console.log(r.out);
      expect(r.code).toBe(0);
    }
  }, 300_000);

  test.skipIf(!ready)("Dukkan's screens have no audit findings, in both variants, light and dark, left to right and right to left (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(copies["rn-contract-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: "390", audit: true, variant: "all", rtl: true } });
    if (r.exitCode !== 0) console.log(r.text);
    const routes = r.data.routes as { route: string; status: number; pageErrors?: string[]; error?: string }[];
    expect(routes.map((x) => [x.route, x.status, x.pageErrors ?? [], x.error])).toEqual(ROUTES.split(",").map((route) => [route, 200, [], undefined]));
    expect((r.data.shots as string[]).length).toBe(4 * 8);
    const notes = JSON.stringify(r.data.notes ?? []);
    expect(notes).toContain("React Native screenshots are of Expo's web target in Chrome");
    expect(notes).not.toContain("looks exactly like the default");
    expect(notes).not.toContain("Dark mode looks exactly like light");
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 900_000);

  test.skipIf(!ready)("the seeded copy's audit finds its planted contrast, tap-target and name problems, and everything else is a declared knock-on (skipped without Node, npm or a browser)", async () => {
    const r = await runShot(copies["rn-seeded-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: "390", audit: true, variant: "all", rtl: true } });
    type Place = { screen: string; selector: string; scheme?: string };
    type Found = { category: string; location: Place; locations?: Place[]; summary: string };
    const findings = r.data.findings as Found[];
    // What the audit says of each planted problem, in English or Arabic.
    const SHOWN: Record<string, RegExp> = {
      "E-06": /"(We use your number only for your orders\.|نستخدم رقمك لطلباتك فقط\.)"/,
      "E-07": /^The "(Add .+ to basket|أضف .+ إلى السلة)" button is 32×32 px/,
      "E-08": /^The icon has no name/,
    };
    const shows = (f: Found, i: Issue) => SHOWN[i.id] !== undefined && i.categories.includes(f.category) && SHOWN[i.id]!.test(f.summary);
    for (const i of byDetector("shot")) {
      const seen = findings.filter((f) => shows(f, i));
      expect(seen.length > 0 ? i.id : `${i.id} not reported`).toBe(i.id);
      for (const f of seen) for (const p of [f.location, ...(f.locations ?? [])]) expect(sameScreen(i.location.screen!, p.screen)).toBe(true);
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
