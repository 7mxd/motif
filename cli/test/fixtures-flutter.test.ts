import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { runValidate } from "../src/commands/validate";
import { discoverFlutterRoutes } from "../src/stacks/flutter/routes";
import { hasFlutter } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const APP = join(FIXTURES, "flutter-contract-app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");
const list = JSON.parse(readFileSync(join(FIXTURES, "flutter-seeded-app/seeded-issues.json"), "utf8"));
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
/** A route as the audit names it, against a listed screen whose :id matches any value. */
const sameScreen = (listed: string, route: string) => new RegExp(`^${listed.replace(/:[^/]+/g, "[^/]+")}$`).test(route);

function dartFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? dartFiles(path) : name.endsWith(".dart") ? [path] : [];
  });
}

describe("the Flutter contract app (Maktaba)", () => {
  test("its design guide is valid, with every pair readable in light and dark, in both variants", async () => {
    const r = await runValidate(APP);
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(r.exitCode).toBe(0);
    expect(r.data.summary).toMatchObject({ errors: 0, warnings: 0, contrastChecks: tokens.$extensions["dev.motif"].pairs.length * 4 });
  });

  test("its code follows the design guide: no violations, exceptions or warnings", async () => {
    const r = await runCheck(APP, { positionals: [] });
    expect(r.data.summary).toMatchObject({ violations: 0, exceptions: 0, warnings: 0 });
    expect(r.exitCode).toBe(0);
  });

  test("its generated theme is the one motif tokens writes: up to date", async () => {
    const copy = join(tempDir("motif-maktaba-"), "app");
    assemble("flutter-contract-app", copy);
    const r = await runTokens(copy, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
  });

  test("the guide declares a default look and the kids' corner, colours only, with Readex Pro for Arabic", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.$extensions["dev.motif"].variants.map((v: { id: string }) => v.id)).toEqual(["default", "kids"]);
    const varied = Object.entries(tokens.color as Record<string, any>).filter(([, t]) => t?.$extensions?.["dev.motif"]?.variants?.kids).map(([k]) => k);
    expect(varied.sort()).toEqual(["action-primary", "action-secondary", "background", "focus"]);
    for (const group of ["font", "space", "radius", "duration", "easing", "spring", "shadow"]) expect(JSON.stringify(tokens[group])).not.toContain("kids");
    expect(tokens.primitive.font.sans.$value.slice(0, 2)).toEqual(["Onest", "Readex Pro"]);
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Maktaba");
    expect(guide).toMatch(/^## Variants$/m);
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("it's a Flutter app the way the Flutter guide says: go_router, Riverpod, shared_preferences, an HTTP client, English and Arabic", () => {
    const pubspec = read("pubspec.yaml");
    for (const dep of ["go_router:", "flutter_riverpod:", "shared_preferences:", "http:", "google_fonts:", "flutter_localizations:"]) expect(pubspec).toContain(dep);
    expect(pubspec).toMatch(/dev_dependencies:\n {2}flutter_test:\n {4}sdk: flutter/);
    expect(existsSync(join(APP, "pubspec.lock"))).toBe(true);
    expect(read("lib/main.dart")).toContain("ProviderScope(");
    const app = read("lib/app.dart");
    for (const s of ["MotifTheme.light(variant: variant)", "MotifTheme.dark(variant: variant)", "AppLocalizations.supportedLocales"]) expect(app).toContain(s);
    const keys = (f: string) => Object.keys(JSON.parse(read(f))).filter((k) => !k.startsWith("@")).sort();
    expect(keys("lib/l10n/app_ar.arb")).toEqual(keys("lib/l10n/app_en.arb"));
    expect(read("lib/design/motif_theme.dart").startsWith("// Generated by Motif")).toBe(true);
  });

  test("its screens are /, /books, a book, /loans and /sign-in", () => {
    expect(discoverFlutterRoutes(APP)).toEqual({ routes: ["/", "/books", "/loans", "/sign-in"], skipped: ["/books/:id"] });
  });

  test("it stays small: about 15 Dart files of its own", () => {
    const own = dartFiles(join(APP, "lib")).filter((f) => !/app_localizations|motif_theme\.dart$/.test(f));
    expect(own.length).toBeGreaterThanOrEqual(12);
    expect(own.length).toBeLessThanOrEqual(18);
  });

  test("layouts are written from start and end, so Arabic mirrors", () => {
    for (const file of dartFiles(join(APP, "lib"))) {
      const code = readFileSync(file, "utf8");
      const where = relative(APP, file);
      for (const re of [/EdgeInsets\.only\(\s*(left|right):/, /Alignment\.center(Left|Right)/, /TextAlign\.(left|right)/, /Positioned\(\s*(left|right):/]) {
        expect(re.test(code) ? `${where}: ${re}` : "ok").toBe("ok");
      }
    }
  });

  test("screenshots get a signed-in member and the catalogue from design/", () => {
    const setup = read("design/states/setup.dart");
    expect(setup.replace(/\s+/g, " ")).toContain("Future<Widget?> motifSetup({ required String variant, required Locale locale, required Brightness brightness, }) async {");
    expect(setup).toContain("'signedIn': true");
    const http = JSON.parse(read("design/states/http.json")) as Record<string, string>;
    expect(Object.keys(http)).toEqual(["GET /books", "GET /loans"]);
    for (const file of Object.values(http)) expect(Array.isArray(JSON.parse(read(`design/${file}`)))).toBe(true);
  });

  test("build output, screenshots, Motif's own folder and generated translations stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of [".dart_tool/", "build/", ".motif/", "lib/l10n/app_localizations*.dart"]) expect(ignore).toContain(s);
    for (const s of [".progress.json", "shots/"]) expect(read("design/.gitignore")).toContain(s);
  });
});

describe("the Flutter seeded app's list of planted problems", () => {
  test("has the brief's problems: at least 10 exact ones (so a review that finds 9 still makes 90%) and 4 that need judgement", () => {
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(10);
    expect(new Set(byDetector("check").map((i) => i.rule))).toEqual(new Set(["raw-color", "off-scale", "raw-motion", "raw-font", "generated-edited"]));
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(4);
    const anchors = issues.map((i) => i.anchor ?? "");
    for (const a of ["Color(0xFF", "EdgeInsets.all(18)", "BorderRadius.circular(12)", "fontSize: 15", "Curves.easeIn", "EdgeInsets.only(left:"]) {
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
    expect(issues.find((i) => i.id === "F-01")!.consequences?.length ?? 0).toBeGreaterThan(0);
  });

  test("the tests README and the seeded README list the Flutter fixtures and every problem", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/flutter-contract-app/", "fixtures/flutter-seeded-app/", "assemble.ts flutter-seeded-app"]) expect(readme).toContain(s);
    const seeded = readFileSync(join(FIXTURES, "flutter-seeded-app/README.md"), "utf8");
    for (const i of issues) expect(seeded).toContain(`| ${i.id} |`);
  });
});

describe("the assembled Flutter seeded app", () => {
  const dest = join(tempDir("motif-flutter-seeded-"), "app");
  assemble("flutter-seeded-app", dest);
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

  test("nothing else is wrong on purpose: the small button and the refresh button work, and the generated theme's one hand edit is radius md", () => {
    expect(at("lib/features/home/home_screen.dart")).toContain("tooltip: l10n.homeSeeAll,");
    expect(at("lib/features/books/books_screen.dart")).toContain("onPressed: () => ref.invalidate(booksProvider),");
    const seeded = at("lib/design/motif_theme.dart").split("\n");
    const original = read("lib/design/motif_theme.dart").split("\n");
    expect(seeded.length).toBe(original.length);
    expect(seeded.flatMap((line, i) => (line === original[i] ? [] : [[original[i], line]]))).toEqual([["  static const double md = 6;", "  static const double md = 8;"]]);
  });
});

describe("Maktaba and its seeded copy, drawn by flutter test", () => {
  const flutter = hasFlutter();
  const ROUTES = "/,/sign-in,/loans,/books,/books/season-of-migration";
  const saved = process.env.MOTIF_HOME;
  const copies: Record<string, string> = {};

  beforeAll(() => {
    if (!flutter) return;
    // Fonts are fetched once into this checkout's test cache (gitignored), so later runs are offline.
    process.env.MOTIF_HOME = join(import.meta.dir, ".tmp", "flutter-home");
    for (const name of ["flutter-contract-app", "flutter-seeded-app"] as const) {
      const dir = join(tempDir("motif flutter fixture "), "app");
      assemble(name, dir);
      const pubGet = (offline: boolean) =>
        Bun.spawnSync([Bun.which("flutter")!, "pub", "get", ...(offline ? ["--offline"] : [])], { cwd: dir, stdout: "pipe", stderr: "pipe" }).exitCode;
      if (pubGet(true) !== 0) expect(pubGet(false)).toBe(0);
      copies[name] = dir;
    }
  }, 600_000);

  afterAll(() => {
    if (saved === undefined) delete process.env.MOTIF_HOME;
    else process.env.MOTIF_HOME = saved;
  });

  test.skipIf(!flutter)("flutter analyze finds no issues in Maktaba or its seeded copy (skipped without Flutter)", () => {
    for (const dir of Object.values(copies)) {
      const r = Bun.spawnSync([Bun.which("flutter")!, "analyze"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
      if (r.exitCode !== 0) console.log(r.stdout.toString());
      expect(r.exitCode).toBe(0);
    }
  }, 300_000);

  test.skipIf(!flutter)("Maktaba's screens have no audit findings, in both variants, light and dark, left to right and right to left (skipped without Flutter)", async () => {
    const r = await runShot(copies["flutter-contract-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: "390", audit: true, variant: "all", rtl: true } });
    if (r.exitCode !== 0) console.log(r.text);
    const routes = r.data.routes as { route: string; status: number; landedOn?: string; pageErrors?: string[] }[];
    expect(routes.map((x) => [x.route, x.status, x.landedOn, x.pageErrors ?? []])).toEqual(ROUTES.split(",").map((route) => [route, 200, undefined, []]));
    expect((r.data.shots as string[]).length).toBe(5 * 8);
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("Requests nothing answered");
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("drawn as boxes");
    // Its Arabic text has its companion font in every style (final review, Important #3).
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("draws as boxes");
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 600_000);

  test.skipIf(!flutter)("the seeded copy's audit finds its planted contrast, tap-target and name problems, and everything else is a declared knock-on (skipped without Flutter)", async () => {
    const r = await runShot(copies["flutter-seeded-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: "390", audit: true, variant: "all", rtl: true } });
    type Place = { screen: string; selector: string; scheme?: string };
    type Found = { category: string; location: Place; locations?: Place[]; summary: string };
    const findings = r.data.findings as Found[];
    // What the audit shows of each planted problem: the element's selector or its text.
    const SHOWN: Record<string, string> = {
      "F-06": 'Text("Lost your card?',
      "F-07": "HomeScreen > Scaffold > ListView > IconButton(", // "See all books", and "كل الكتب" right to left
      "F-08": "BooksScreen > Scaffold > AppBar > IconButton",
    };
    const shows = (f: Found, i: Issue) =>
      SHOWN[i.id] !== undefined && i.categories.includes(f.category) && `${f.location.selector} ${f.summary}`.includes(SHOWN[i.id]!);
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
  }, 600_000);
});
