import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { runValidate } from "../src/commands/validate";
import { discoverSwiftUIScreens } from "../src/stacks/swiftui/screens";
import { heavyStackTests, isMacWithXcode } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs, 120_000);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const APP = join(FIXTURES, "swiftui-contract-app");
const SOURCES = "Qahwa";
const THEME = `${SOURCES}/Design/MotifTheme.swift`;
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");
const list = JSON.parse(readFileSync(join(FIXTURES, "swiftui-seeded-app/seeded-issues.json"), "utf8"));
const CATEGORIES = [
  "raw-value", "contrast", "target-size", "reduced-motion", "accessibility", "missing-state", "hierarchy", "spacing", "typography",
  "motion", "navigation", "copy", "platform-convention", "consistency", "anti-pattern", "other",
];
type Consequence = { category: string; screens: string[]; schemes: string[]; note: string };
type Issue = {
  id: string; kind: string; detectedBy: string; rule?: string; categories: string[]; severity: string;
  location: { file?: string; line?: number; screen?: string; app?: boolean; path?: string }; anchor?: string; summary: string; consequences?: Consequence[];
  /** More screens the problem shows on: the root, or a #Preview by its name. */
  screens?: string[];
  also?: { file: string; line: number; anchor: string }[];
};
const issues: Issue[] = list.issues;
const PREVIEWS = discoverSwiftUIScreens(APP).previews.map((p) => p.name);
const byDetector = (d: string) => issues.filter((i) => i.detectedBy === d);
/** Every screen a planted problem shows on. */
const screensOf = (i: Issue) => [...(i.location.screen ? [i.location.screen] : []), ...(i.screens ?? [])];
const isScreen = (s: string) => s === "/" || PREVIEWS.includes(s);

/** Every file under a folder, as paths relative to it. */
function filesUnder(dir: string, from = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path, from) : [relative(from, path).replace(/\\/g, "/")];
  });
}

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? swiftFiles(path) : name.endsWith(".swift") ? [path] : [];
  });
}

type Unit = { state: string; value: string };
type Plural = Record<string, { stringUnit: Unit }>;
type Localization = { stringUnit?: Unit; variations?: { plural?: Plural }; substitutions?: Record<string, { argNum: number; formatSpecifier: string; variations: { plural: Plural } }> };
type Catalogue = Record<string, { shouldTranslate?: boolean; localizations?: Record<string, Localization> }>;

/** Every string a localization holds: its own, its plural forms, and its substitutions' plural forms. */
function unitsOf(l: Localization | undefined): Unit[] {
  if (!l) return [];
  const forms = (p: Plural | undefined) => Object.values(p ?? {}).map((f) => f.stringUnit);
  return [...(l.stringUnit ? [l.stringUnit] : []), ...forms(l.variations?.plural), ...Object.values(l.substitutions ?? {}).flatMap((x) => forms(x.variations.plural))];
}

/** The string catalogue's keys, and the ones with no Arabic (leaving out those marked not to translate). */
function catalogue(rel: string): { strings: Catalogue; keys: string[]; untranslated: string[] } {
  const strings = JSON.parse(read(rel)).strings as Catalogue;
  const keys = Object.keys(strings).sort();
  const untranslated = keys.filter((k) => {
    if (strings[k]!.shouldTranslate === false) return false;
    const units = unitsOf(strings[k]!.localizations?.ar);
    return units.length === 0 || units.some((u) => u.state !== "translated");
  });
  return { strings, keys, untranslated };
}

describe("the SwiftUI contract app (Qahwa)", () => {
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

  test("its generated theme is the one motif tokens writes: up to date, with Readex Pro bundled and registered already", async () => {
    const copy = join(tempDir("motif-qahwa-"), "app");
    assemble("swiftui-contract-app", copy);
    const r = await runTokens(copy, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
    // The font is in the target's synchronized folder and in UIAppFonts: nothing to copy, nothing to register, no Google family.
    expect(r.text).not.toContain("Register the theme's fonts");
    expect(r.text).not.toContain("Google Fonts");
    expect(readFileSync(join(copy, THEME), "utf8").replace(/\r\n/g, "\n")).toBe(read(THEME));
  });

  test("the guide declares a default look and Evening, colours only, with Readex Pro for Arabic, bundled with its licence", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    const motif = tokens.$extensions["dev.motif"];
    expect(motif.variants).toEqual([{ id: "default", label: "Default", default: true }, { id: "evening", label: "Evening" }]);
    const varied = Object.entries(tokens.color as Record<string, any>).filter(([, t]) => t?.$extensions?.["dev.motif"]?.variants?.evening).map(([k]) => k);
    expect(varied.sort()).toEqual(["action-primary", "action-secondary", "background", "border", "focus", "surface", "surface-raised", "text-secondary"]);
    for (const group of ["font", "space", "radius", "duration", "easing", "spring", "shadow"]) expect(JSON.stringify(tokens[group])).not.toContain("evening");
    expect(tokens.primitive.font.sans.$value.slice(0, 2)).toEqual(["SF Pro", "Readex Pro"]);
    expect(tokens.primitive.font.display.$value.slice(0, 2)).toEqual(["New York", "Readex Pro"]);
    expect(motif.fonts).toEqual([{ family: "Readex Pro", files: [{ path: "Qahwa/Fonts/ReadexPro.ttf", weight: 400, style: "normal" }] }]);
    // A TrueType file (Apple's platforms can't use WOFF2), under the SIL Open Font License beside it.
    expect([...readFileSync(join(APP, "Qahwa/Fonts/ReadexPro.ttf")).subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    expect(read("Qahwa/Fonts/OFL.txt")).toContain("SIL Open Font License, Version 1.1");
    expect(read("Qahwa/Fonts/OFL.txt")).toContain("Readex Pro");
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Qahwa");
    expect(guide).toMatch(/^## Variants$/m);
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("it's an Xcode 16 App project: object version 77, a synchronized folder, iOS 17, Swift 5, English and Arabic", () => {
    const pbx = read("Qahwa.xcodeproj/project.pbxproj");
    expect(pbx).toContain("objectVersion = 77;");
    expect(pbx).toContain("preferredProjectObjectVersion = 77;");
    expect(pbx).toMatch(/isa = PBXFileSystemSynchronizedRootGroup;[\s\S]*?path = Qahwa;/);
    expect(pbx).toContain("LastUpgradeCheck = 1600;");
    expect(pbx).toContain('productType = "com.apple.product-type.application";');
    expect(pbx.match(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)).toEqual(["IPHONEOS_DEPLOYMENT_TARGET = 17.0;", "IPHONEOS_DEPLOYMENT_TARGET = 17.0;"]);
    expect(pbx.match(/SWIFT_VERSION = [\d.]+;/g)).toEqual(["SWIFT_VERSION = 5.0;", "SWIFT_VERSION = 5.0;"]);
    expect(pbx).toMatch(/knownRegions = \(\s*en,\s*Base,\s*ar,\s*\);/);
    expect(pbx).toContain("INFOPLIST_FILE = Qahwa/Info.plist;");
    expect(read("Qahwa.xcodeproj/project.xcworkspace/contents.xcworkspacedata")).toContain('location = "self:"');
    // Fonts provided by application, as motif tokens prints it.
    expect(read("Qahwa/Info.plist")).toMatch(/<key>UIAppFonts<\/key>\s*<array>\s*<string>ReadexPro\.ttf<\/string>\s*<\/array>/);
    for (const file of ["Assets.xcassets/AccentColor.colorset/Contents.json", "Assets.xcassets/AppIcon.appiconset/Contents.json", "Localizable.xcstrings"]) {
      expect(existsSync(join(APP, SOURCES, file)) ? file : `${file} is missing`).toBe(file);
    }
    const app = read(`${SOURCES}/QahwaApp.swift`);
    expect(app).toContain("@main");
    expect(app).toContain(".motifTheme(variant: MotifVariant(rawValue: variant) ?? .defaultVariant)");
    expect(read(THEME).startsWith("// Generated by Motif")).toBe(true);
    // Every string has its Arabic.
    const strings = catalogue(`${SOURCES}/Localizable.xcstrings`);
    expect(strings.keys.length).toBeGreaterThan(20);
    expect(strings.untranslated).toEqual([]);
  });

  test("counted strings have plural forms: English one and other, Arabic zero, one, two, few, many and other", () => {
    const { strings } = catalogue(`${SOURCES}/Localizable.xcstrings`);
    const AR = ["few", "many", "one", "other", "two", "zero"];
    const counted = Object.keys(strings).filter((k) => /%(\d\$)?lld/.test(k)).sort();
    expect(counted).toEqual(["%lld more drinks until a free one", "%lld of %lld stamps"]);
    // A count in the sentence: the sentence's own plural forms.
    const drinks = strings["%lld more drinks until a free one"]!.localizations!;
    expect(Object.keys(drinks.en!.variations!.plural!).sort()).toEqual(["one", "other"]);
    expect(drinks.en!.variations!.plural!.other!.stringUnit.value).toBe("%lld more drinks until a free one");
    expect(Object.keys(drinks.ar!.variations!.plural!).sort()).toEqual(AR);
    // Two counts, the noun after the second: a substitution for it, as Xcode writes one.
    const stamps = strings["%lld of %lld stamps"]!.localizations!;
    for (const [lang, forms] of [["en", ["one", "other"]], ["ar", AR]] as const) {
      const l = stamps[lang]!;
      expect(l.stringUnit!.value).toContain("%1$lld");
      expect(l.stringUnit!.value).toContain("%2$#@stamps@");
      expect(l.substitutions!.stamps).toMatchObject({ argNum: 2, formatSpecifier: "lld" });
      expect(Object.keys(l.substitutions!.stamps!.variations.plural).sort()).toEqual([...forms]);
      for (const u of unitsOf(l)) expect(u.state).toBe("translated");
    }
  });

  test("its screens are the root (the menu) and a preview each for the menu, a drink, the loyalty card and sign-in; nothing for orders or rewards history yet", () => {
    const found = discoverSwiftUIScreens(APP);
    expect(found).toMatchObject({ routes: ["/"], skipped: [], skippedPreviews: [] });
    expect(found.previews.map((p) => p.name)).toEqual(["Drink", "Loyalty card", "Menu", "Sign in"]);
    const all = swiftFiles(join(APP, SOURCES)).map((f) => relative(APP, f).replace(/\\/g, "/"));
    expect(all.filter((f) => /order|reward|history/i.test(f))).toEqual([]);
  });

  test("it stays small: about 15 Swift files of its own", () => {
    const own = swiftFiles(join(APP, SOURCES)).filter((f) => !f.endsWith("MotifTheme.swift"));
    expect(own.length).toBeGreaterThanOrEqual(10);
    expect(own.length).toBeLessThanOrEqual(18);
  });

  test("layouts are written from leading and trailing, and pointing symbols mirror, so Arabic mirrors", () => {
    for (const file of swiftFiles(join(APP, SOURCES))) {
      const code = readFileSync(file, "utf8");
      const where = relative(APP, file);
      for (const re of [/systemName: "(chevron|arrow)\.(left|right)/, /\.offset\(x:/, /\.position\(x:/, /\.leftToRight/, /flipsForRightToLeftLayoutDirection\(false/]) {
        expect(re.test(code) ? `${where}: ${re}` : "ok").toBe("ok");
      }
    }
  });

  test("screenshots get a signed-in member and the variant's own switch, from design/states/Setup.swift", () => {
    const setup = read("design/states/Setup.swift");
    expect(setup).toContain("func motifSetup(variant: String, locale: Locale, dark: Bool) {");
    expect(setup).toContain("UserDefaults.standard.set(true, forKey: Session.signedInKey)");
    expect(setup).toContain("UserDefaults.standard.set(variant, forKey: Session.variantKey)");
  });

  test("build output, user state, screenshots and Motif's own folder stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of ["build/", "DerivedData/", "xcuserdata/", ".motif/", ".DS_Store"]) expect(ignore).toContain(s);
    for (const s of [".progress.json", "shots/"]) expect(read("design/.gitignore")).toContain(s);
    const tracked = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "."], { cwd: APP }).stdout.toString();
    expect(tracked).not.toMatch(/(^|\/)(build|DerivedData|xcuserdata|\.motif)\//m);
  });
});

describe("the SwiftUI seeded app's list of planted problems", () => {
  test("has the brief's problems: at least 8 exact ones and 4 that need judgement", () => {
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(8);
    expect(new Set(byDetector("check").map((i) => i.rule))).toEqual(new Set(["raw-color", "off-scale", "raw-motion", "raw-font", "generated-edited"]));
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(4);
    const anchors = issues.map((i) => i.anchor ?? "");
    for (const a of ["Color(red:", ".padding(18)", "cornerRadius: 10", ".system(size: 15)", ".easeInOut(duration: 0.3)", '.custom("Georgia"', ".layoutDirection, .leftToRight"]) {
      expect(anchors.some((x) => x.includes(a)) ? a : `${a} isn't planted`).toBe(a);
    }
    expect(byDetector("shot").map((i) => i.categories[0]).sort()).toEqual(["accessibility", "contrast", "reduced-motion", "target-size"]);
    expect(issues.filter((i) => i.kind === "judgement").map((i) => i.categories[0])).toEqual(
      expect.arrayContaining(["spacing", "consistency", "hierarchy", "platform-convention"]),
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
      // A screen is the root (/) or one of Qahwa's previews by its name (motif shot draws both).
      for (const s of screensOf(i)) expect(isScreen(s) ? s : `${i.id}: ${s} isn't the root or a preview`).toBe(s);
      for (const a of i.also ?? []) expect(a.file && a.line > 0 && a.anchor ? i.id : `${i.id}: a bad also entry`).toBe(i.id);
      for (const c of i.consequences ?? []) {
        expect(CATEGORIES).toContain(c.category);
        for (const s of c.screens) expect(isScreen(s) ? s : `${i.id}: ${s} isn't the root or a preview`).toBe(s);
        for (const s of c.schemes) expect(["light", "dark"]).toContain(s);
        expect(c.note.length).toBeGreaterThan(10);
      }
    }
    // The Mac run draws the seeded copy only where its audit problems are, so S-01's knock-on on / and Menu is pinned here.
    expect(issues.find((i) => i.id === "S-01")!.consequences?.length ?? 0).toBeGreaterThan(0);
    expect(issues.find((i) => i.id === "S-01")!.consequences![0]).toMatchObject({ category: "contrast", screens: ["/", "Menu"], schemes: ["dark"] });
  });

  test("the tests README and the seeded README list the SwiftUI fixtures and every problem", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/swiftui-contract-app/", "fixtures/swiftui-seeded-app/", "assemble.ts swiftui-seeded-app"]) expect(readme).toContain(s);
    const seeded = readFileSync(join(FIXTURES, "swiftui-seeded-app/README.md"), "utf8");
    for (const i of issues) expect(seeded).toContain(`| ${i.id} |`);
  });
});

describe("the assembled SwiftUI seeded app", () => {
  const dest = join(tempDir("motif-swiftui-seeded-"), "app");
  assemble("swiftui-seeded-app", dest);
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
    for (const issue of issues) {
      for (const a of issue.also ?? []) {
        const line = at(a.file).split("\n")[a.line - 1] ?? "";
        expect(line.includes(a.anchor) ? issue.id : `${issue.id} (also): "${line.trim()}"`).toBe(issue.id);
      }
    }
  });

  test("nothing else is wrong on purpose: the root's card keeps its name and size, and the generated theme's one hand edit is radius md", () => {
    expect(at(`${SOURCES}/Features/Menu/MenuScreen.swift`)).toContain("LoyaltySummary(stamps: card.stamps, goal: card.goal)");
    const seeded = at(THEME).split("\n");
    const original = read(THEME).split("\n");
    expect(seeded.length).toBe(original.length);
    expect(seeded.flatMap((line, i) => (line === original[i] ? [] : [[original[i], line]]))).toEqual([["    static let md: CGFloat = 12", "    static let md: CGFloat = 14"]]);
  });

  test("the seeded copy has no orders or rewards-history screen either", () => {
    const all = swiftFiles(join(dest, SOURCES)).map((f) => relative(dest, f).replace(/\\/g, "/"));
    expect(all.filter((f) => /order|reward|history/i.test(f))).toEqual([]);
    expect(discoverSwiftUIScreens(dest).previews.map((p) => p.name)).toEqual(PREVIEWS);
  });
});

describe("Qahwa and its seeded copy, built by Xcode and drawn in the iOS simulator", () => {
  // Needs a Mac with Xcode and an iOS simulator runtime (bun's skipIf takes no reason, so each name says it).
  const heavy = heavyStackTests("swiftui", isMacWithXcode());
  const mac = heavy.run;
  if (!heavy.run) console.log(`[fixtures-swiftui] Xcode and simulator tests skipped: ${heavy.reason}`);
  // The brief's command, with no --screen: the root, then every preview.
  const FLAGS = { sizes: "390", audit: true, variant: "all", rtl: true };
  const SCREENS = ["/", "Drink", "Loyalty card", "Menu", "Sign in"];
  // The seeded copy is drawn where its planted audit problems are, in the default variant, light and dark, both
  // directions: 12 shots, not 40, to keep CI's SwiftUI job within its time. S-01's knock-on on / and Menu was seen
  // in the full run when the list was made (the seeded README says so).
  const SEEDED_SCREENS = [...new Set(byDetector("shot").flatMap(screensOf))].sort();
  const SEEDED_FLAGS = { sizes: "390", audit: true, variant: "default", rtl: true, screen: SEEDED_SCREENS };
  const saved = process.env.MOTIF_HOME;
  let root = "";
  // Both apps are drawn from one folder: the seeded copy is Qahwa's copy with the overlay written over it, so the build
  // Motif keeps is reused and only the overlay's files are compiled again.
  let app = "";

  beforeAll(() => {
    if (!mac) return;
    root = tempDir("motif qahwa ");
    app = join(root, "Qahwa");
    process.env.MOTIF_HOME = join(root, "home");
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.MOTIF_HOME;
    else process.env.MOTIF_HOME = saved;
  });

  test.skipIf(!mac)("Qahwa builds for the iOS simulator with xcodebuild, and its own code has no warnings (skipped without Xcode)", () => {
    const copy = join(root, "build-check");
    assemble("swiftui-contract-app", copy);
    const started = Date.now();
    const build = Bun.spawnSync(
      [
        "xcodebuild", "-project", "Qahwa.xcodeproj", "-scheme", "Qahwa", "-destination", "generic/platform=iOS Simulator",
        "-derivedDataPath", join(root, "build-check-dd"), "build", "CODE_SIGNING_ALLOWED=NO", "COMPILER_INDEX_STORE_ENABLE=NO",
      ],
      { cwd: copy, stdout: "pipe", stderr: "pipe" },
    );
    const out = `${build.stdout.toString()}\n${build.stderr.toString()}`;
    console.log(`[fixtures-swiftui] xcodebuild build: ${Math.round((Date.now() - started) / 1000)} s`);
    if (build.exitCode !== 0) console.log(out.split("\n").filter((l) => /error|warning/.test(l)).join("\n") || out.slice(-4000));
    expect(build.exitCode).toBe(0);
    expect(out).toContain("** BUILD SUCCEEDED **");
    const own = out.split("\n").filter((l) => /: warning: /.test(l) && l.includes("/Qahwa/") && !l.includes("/Design/MotifTheme.swift"));
    expect([...new Set(own)]).toEqual([]);
    rmSync(join(root, "build-check-dd"), { recursive: true, force: true });
  }, 1_800_000);

  test.skipIf(!mac)("Qahwa's root and previews have no audit findings, in both variants, light and dark, left to right and right to left (skipped without Xcode)", async () => {
    assemble("swiftui-contract-app", app);
    const started = Date.now();
    const r = await runShot(app, { positionals: [], flags: FLAGS });
    console.log(`[fixtures-swiftui] Qahwa: ${Math.round((Date.now() - started) / 1000)} s`);
    if (r.exitCode !== 0) console.log(r.text);
    const routes = r.data.routes as { route: string; status: number; error?: string; pageErrors?: string[] }[];
    expect(routes.map((x) => [x.route, x.status, x.error, x.pageErrors ?? []])).toEqual(SCREENS.map((route) => [route, 200, undefined, []]));
    expect((r.data.shots as string[]).length).toBe(SCREENS.length * 8);
    const png = (name: string) => readFileSync(join(app, "design/shots", name));
    // design/states/Setup.swift signed the member in: / is the menu, not Sign in.
    expect(Buffer.compare(png("index.mobile.png"), png("sign-in.mobile.png"))).not.toBe(0);
    // Evening and dark are drawn as themselves.
    expect(Buffer.compare(png("index.mobile.png"), png("index+evening.mobile.png"))).not.toBe(0);
    expect(Buffer.compare(png("index.mobile.png"), png("index.mobile.dark.png"))).not.toBe(0);
    // The app has Arabic strings.
    expect(r.text).not.toContain("doesn't offer ar");
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 1_800_000);

  test.skipIf(!mac)("the seeded copy's audit finds its planted contrast, tap-target, name and motion problems, and nothing else (skipped without Xcode)", async () => {
    if (!existsSync(app)) assemble("swiftui-contract-app", app);
    rmSync(join(app, "design/shots"), { recursive: true, force: true });
    // What assemble does for a seeded fixture, over the copy that is there, which leaves Qahwa's other files untouched.
    expect(list.remove).toEqual([]);
    const overlay = join(FIXTURES, "swiftui-seeded-app/overlay");
    for (const f of filesUnder(overlay)) {
      mkdirSync(dirname(join(app, f)), { recursive: true });
      copyFileSync(join(overlay, f), join(app, f));
    }
    // The folder is now what assemble makes of the seeded fixture: the same files, the same contents.
    const fresh = join(root, "seeded-check");
    assemble("swiftui-seeded-app", fresh);
    expect(filesUnder(app).sort()).toEqual(filesUnder(fresh).sort());
    for (const f of filesUnder(fresh)) expect(readFileSync(join(app, f)).equals(readFileSync(join(fresh, f))) ? f : `${f} differs`).toBe(f);
    const started = Date.now();
    const r = await runShot(app, { positionals: [], flags: SEEDED_FLAGS });
    console.log(`[fixtures-swiftui] seeded copy: ${Math.round((Date.now() - started) / 1000)} s`);
    expect(SEEDED_SCREENS).toEqual(["Drink", "Loyalty card", "Sign in"]);
    expect((r.data.routes as { route: string }[]).map((x) => x.route)).toEqual(SEEDED_SCREENS);
    expect((r.data.shots as string[]).length).toBe(SEEDED_SCREENS.length * 4);
    type Place = { screen: string; selector: string; scheme?: string };
    type Found = { category: string; location: Place; locations?: Place[]; summary: string };
    const findings = r.data.findings as Found[];
    console.log(JSON.stringify(findings.map((f) => [f.category, f.location.selector, f.summary, [f.location, ...(f.locations ?? [])].map((p) => `${p.screen} ${p.scheme ?? ""}`)]), null, 1));
    // What the audit shows of each planted problem: the element's selector and what it says.
    const SHOWN: Record<string, RegExp> = {
      // Selectors keep a text's first 40 characters, its English (the summary names the Arabic too).
      "S-08": /^Text\("Sign in to collect a stamp with every dr"\) .*hard to read/,
      "S-09": /^Button\("(Copy member number|نسخ رقم العضوية)"\) .*px on a phone/,
      "S-10": /^Button\(heart\) .*no name/,
      "S-11": /keeps moving when the viewer asks for reduced motion/,
    };
    const shows = (f: Found, i: Issue) => SHOWN[i.id] !== undefined && i.categories.includes(f.category) && SHOWN[i.id]!.test(`${f.location.selector} ${f.summary}`);
    for (const i of byDetector("shot")) {
      const seen = findings.filter((f) => shows(f, i));
      expect(seen.length > 0 ? i.id : `${i.id} not reported`).toBe(i.id);
      for (const f of seen) for (const p of [f.location, ...(f.locations ?? [])]) expect(screensOf(i).includes(p.screen) ? p.screen : `${i.id} on ${p.screen}`).toBe(p.screen);
    }
    for (const f of findings) {
      const planted = byDetector("shot").some((i) => shows(f, i));
      const knockOn = [f.location, ...(f.locations ?? [])].every((p) =>
        issues.some((i) => (i.consequences ?? []).some((c) => c.category === f.category && c.screens.includes(p.screen) && (!p.scheme || c.schemes.includes(p.scheme)))),
      );
      expect(planted || knockOn ? "expected" : `unplanned ${f.category}: ${f.location.selector} ${f.summary}`).toBe("expected");
    }
  }, 1_800_000);
});
