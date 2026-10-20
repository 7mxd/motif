import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { runCheck } from "../src/commands/check";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { runValidate } from "../src/commands/validate";
import { discoverComposeScreens } from "../src/stacks/compose/screens";
import { androidToolchain, hasAndroid } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const FIXTURES = join(import.meta.dir, "../../tests/fixtures");
const APP = join(FIXTURES, "compose-contract-app");
const SOURCES = "app/src/main/java/dev/motif/rafiq";
const THEME = `${SOURCES}/ui/motif/MotifTheme.kt`;
const read = (rel: string) => readFileSync(join(APP, rel), "utf8").replace(/\r\n/g, "\n");
const list = JSON.parse(readFileSync(join(FIXTURES, "compose-seeded-app/seeded-issues.json"), "utf8"));
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

function kotlinFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? kotlinFiles(path) : name.endsWith(".kt") ? [path] : [];
  });
}

/** A string resource file's names, without the ones marked translatable="false". */
function stringNames(rel: string): string[] {
  return [...read(rel).matchAll(/<(?:string|plurals) name="([^"]+)"([^>]*)>/g)].filter((m) => !m[2]!.includes('translatable="false"')).map((m) => m[1]!).sort();
}

describe("the Compose contract app (Rafiq)", () => {
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
    const copy = join(tempDir("motif-rafiq-"), "app");
    assemble("compose-contract-app", copy);
    const r = await runTokens(copy, { positionals: [] });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("up to date");
    expect(new Set((r.data.files as { status: string }[]).map((f) => f.status))).toEqual(new Set(["unchanged"]));
  });

  test("the guide declares a default look and High contrast, colours only, with Readex Pro for Arabic", () => {
    const tokens = JSON.parse(read("design/tokens.json"));
    expect(tokens.$extensions["dev.motif"].variants).toEqual([{ id: "default", label: "Default", default: true }, { id: "contrast", label: "High contrast" }]);
    const varied = Object.entries(tokens.color as Record<string, any>).filter(([, t]) => t?.$extensions?.["dev.motif"]?.variants?.contrast).map(([k]) => k);
    expect(varied.sort()).toEqual(["action-primary", "background", "border", "focus", "text-primary", "text-secondary"]);
    for (const group of ["font", "space", "radius", "duration", "easing", "spring", "shadow"]) expect(JSON.stringify(tokens[group])).not.toContain("contrast");
    expect(tokens.primitive.font.sans.$value.slice(0, 2)).toEqual(["Nunito", "Readex Pro"]);
    const guide = read("DESIGN.md");
    expect(guide).toContain("name: Rafiq");
    expect(guide).toMatch(/^## Variants$/m);
    expect(guide).toMatch(/^## 10\. Change log\n\n- \d{4}-\d{2}-\d{2} — .+ — .+ — approved by .+$/m);
  });

  test("it's an Android Studio project: one app module, a version catalogue and the Gradle wrapper, with ViewModels and Navigation Compose", () => {
    expect(read("settings.gradle.kts")).toContain('include(":app")');
    const catalogue = read("gradle/libs.versions.toml");
    for (const lib of ["navigation-compose", "lifecycle-viewmodel-compose", "lifecycle-runtime-compose", "ui-text-google-fonts", "material3", "compose-bom"]) {
      expect(catalogue).toContain(`name = "${lib}"`);
    }
    for (const file of ["gradlew", "gradlew.bat", "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties", "app/build.gradle.kts"]) {
      expect(existsSync(join(APP, file)) ? file : `${file} is missing`).toBe(file);
    }
    expect(read("gradle/wrapper/gradle-wrapper.properties")).toContain("gradle-8.14.3-bin.zip");
    expect(read("app/build.gradle.kts")).toContain('namespace = "dev.motif.rafiq"');
    expect(read("app/src/main/AndroidManifest.xml")).toContain('android:supportsRtl="true"');
    const main = read(`${SOURCES}/MainActivity.kt`);
    for (const s of ["NavHost(navController = navController, startDestination = Routes.TODAY)", "MotifTheme(variant = if (highContrast) MotifVariant.Contrast else MotifVariant.Default)", "enableEdgeToEdge()"]) {
      expect(main).toContain(s);
    }
    expect(read(`${SOURCES}/data/Session.kt`)).toContain("getSharedPreferences(FILE, Context.MODE_PRIVATE)");
    for (const screen of ["today/TodayViewModel.kt", "habit/HabitViewModel.kt", "add/AddHabitViewModel.kt", "signin/SignInViewModel.kt"]) {
      expect(read(`${SOURCES}/ui/${screen}`)).toContain(": ViewModel()");
    }
    expect(stringNames("app/src/main/res/values-ar/strings.xml")).toEqual(stringNames("app/src/main/res/values/strings.xml"));
    expect(read(THEME).startsWith("// Generated by Motif")).toBe(true);
    expect(read("app/src/main/res/values/motif_font_certs.xml").startsWith("<!-- Generated by Motif")).toBe(true);
  });

  test("its screens are /, /add, /sign-in and a habit's page, with a preview for each", () => {
    const found = discoverComposeScreens(join(APP, "app"));
    expect(found).toMatchObject({ routes: ["/", "/add", "/sign-in"], skipped: ["/habit/{id}"], skippedPreviews: [] });
    expect(found.previews.map((p) => p.name).sort()).toEqual(["AddHabitPreview", "HabitPreview", "SignInPreview", "TodayEmptyPreview", "TodayPreview"]);
  });

  test("it stays small: about 15 Kotlin files of its own", () => {
    const own = kotlinFiles(join(APP, "app/src")).filter((f) => !f.endsWith("MotifTheme.kt"));
    expect(own.length).toBeGreaterThanOrEqual(12);
    expect(own.length).toBeLessThanOrEqual(18);
  });

  test("layouts are written from start and end, and pointing icons mirror, so Arabic mirrors", () => {
    for (const file of kotlinFiles(join(APP, "app/src"))) {
      const code = readFileSync(file, "utf8");
      const where = relative(APP, file);
      for (const re of [/absolutePadding\(/, /absoluteOffset\(/, /AbsoluteAlignment\./, /Arrangement\.Absolute\./, /TextAlign\.(Left|Right)/, /AbsoluteRoundedCornerShape/, /Icons\.(Filled|Outlined|Rounded)\.(ArrowBack|ArrowForward|KeyboardArrow(Left|Right)|ExitToApp)\b/]) {
        expect(re.test(code) ? `${where}: ${re}` : "ok").toBe("ok");
      }
    }
  });

  test("screenshots get a signed-in member and the habits the app starts with, from design/states/Setup.kt", () => {
    const setup = read("design/states/Setup.kt");
    expect(setup).toContain("package dev.motif.states");
    expect(setup).toContain("fun motifSetup(variant: String, locale: Locale, dark: Boolean) {");
    expect(setup).toContain(".putBoolean(Session.SIGNED_IN, true)");
    expect(setup).toContain("HabitRepository.reset()");
  });

  test("build output, local settings, screenshots and Motif's own folder stay out of git", () => {
    const ignore = read(".gitignore");
    for (const s of [".gradle/", "build/", "local.properties", ".motif/", ".kotlin/"]) expect(ignore).toContain(s);
    for (const s of [".progress.json", "shots/"]) expect(read("design/.gitignore")).toContain(s);
    const tracked = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "."], { cwd: APP }).stdout.toString();
    expect(tracked).not.toMatch(/(^|\/)(\.gradle|build|\.motif|\.kotlin)\/|local\.properties/m);
  });
});

describe("the Compose seeded app's list of planted problems", () => {
  test("has the brief's problems: at least 8 exact ones and 4 that need judgement", () => {
    expect(issues.filter((i) => i.kind === "exact").length).toBeGreaterThanOrEqual(8);
    expect(new Set(byDetector("check").map((i) => i.rule))).toEqual(new Set(["raw-color", "off-scale", "raw-motion", "raw-font", "generated-edited"]));
    expect(issues.filter((i) => i.kind === "judgement").length).toBeGreaterThanOrEqual(4);
    const anchors = issues.map((i) => i.anchor ?? "");
    for (const a of ["Color(0xFF", "padding(18.dp)", "RoundedCornerShape(12.dp)", "fontSize = 15.sp", "FastOutSlowInEasing", "absolutePadding(left =", "Icons.Filled.ArrowBack"]) {
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
    expect(issues.find((i) => i.id === "J-01")!.consequences?.length ?? 0).toBeGreaterThan(0);
  });

  test("the tests README and the seeded README list the Compose fixtures and every problem", () => {
    const readme = readFileSync(join(FIXTURES, "../README.md"), "utf8");
    for (const s of ["fixtures/compose-contract-app/", "fixtures/compose-seeded-app/", "assemble.ts compose-seeded-app"]) expect(readme).toContain(s);
    const seeded = readFileSync(join(FIXTURES, "compose-seeded-app/README.md"), "utf8");
    for (const i of issues) expect(seeded).toContain(`| ${i.id} |`);
  });
});

describe("the assembled Compose seeded app", () => {
  const dest = join(tempDir("motif-compose-seeded-"), "app");
  assemble("compose-seeded-app", dest);
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

  test("nothing else is wrong on purpose: Sign out keeps its size, Add keeps its name, and the generated theme's one hand edit is radius md", () => {
    const today = at(`${SOURCES}/ui/today/TodayScreen.kt`);
    expect(today).toContain("IconButton(onClick = onSignOut) {");
    expect(today).toContain('Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.today_add))');
    const seeded = at(THEME).split("\n");
    const original = read(THEME).split("\n");
    expect(seeded.length).toBe(original.length);
    expect(seeded.flatMap((line, i) => (line === original[i] ? [] : [[original[i], line]]))).toEqual([["    val md = 14.dp", "    val md = 16.dp"]]);
  });
});

describe("Rafiq and its seeded copy, built by Gradle and drawn by Robolectric", () => {
  // Needs a JDK and the Android SDK (bun's skipIf takes no reason, so each name says it).
  const android = hasAndroid();
  const ROUTES = "/,/sign-in,/add,/habit/walk";
  const saved = process.env.MOTIF_HOME;
  const copies: Record<string, string> = {};

  beforeAll(() => {
    if (!android) return;
    // Google fonts are fetched once into this checkout's test cache (gitignored), so later runs are offline.
    process.env.MOTIF_HOME = join(import.meta.dir, ".tmp", "compose-home");
    for (const name of ["compose-contract-app", "compose-seeded-app"] as const) {
      const dir = join(tempDir("motif compose fixture "), "app");
      assemble(name, dir);
      copies[name] = dir;
    }
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.MOTIF_HOME;
    else process.env.MOTIF_HOME = saved;
  });

  test.skipIf(!android)("Rafiq compiles with its own Gradle wrapper (skipped without a JDK and the Android SDK)", () => {
    const { java, sdk } = androidToolchain()!;
    const dir = copies["compose-contract-app"]!;
    writeFileSync(join(dir, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`);
    // The wrapper's jar, started with java as motif shot starts it (gradlew.bat trips on some paths).
    const env = { ...process.env, JAVA_HOME: dirname(dirname(java)) };
    const gradle = (offline: boolean) =>
      Bun.spawnSync(
        [java, "-Xmx64m", "-classpath", "gradle/wrapper/gradle-wrapper.jar", "org.gradle.wrapper.GradleWrapperMain", ":app:compileDebugKotlin", "--console=plain", ...(offline ? ["--offline"] : [])],
        { cwd: dir, env, stdout: "pipe", stderr: "pipe" },
      );
    // Offline once Gradle, the Android plugin and Compose have been downloaded on this machine.
    let build = gradle(true);
    if (build.exitCode !== 0) build = gradle(false);
    const out = `${build.stdout.toString()}\n${build.stderr.toString()}`;
    if (build.exitCode !== 0) console.log(out);
    expect(build.exitCode).toBe(0);
    // The app's own code compiles without warnings.
    expect(out.split(/\r?\n/).filter((l) => /^w: /.test(l) && l.includes("dev/motif/rafiq/") && !l.includes("/ui/motif/"))).toEqual([]);
  }, 1_200_000);

  test.skipIf(!android)("Rafiq's screens have no audit findings, in both variants, light and dark, left to right and right to left (skipped without a JDK and the Android SDK)", async () => {
    const r = await runShot(copies["compose-contract-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: "390", audit: true, variant: "all", rtl: true } });
    if (r.exitCode !== 0) console.log(r.text);
    const routes = r.data.routes as { route: string; status: number; error?: string; pageErrors?: string[] }[];
    expect(routes.map((x) => [x.route, x.status, x.error, x.pageErrors ?? []])).toEqual(ROUTES.split(",").map((route) => [route, 200, undefined, []]));
    expect((r.data.shots as string[]).length).toBe(4 * 8);
    // design/states/Setup.kt signed the member in: / is Today, not Sign in.
    expect(Buffer.compare(readFileSync(join(copies["compose-contract-app"]!, "design/shots/index.mobile.png")), readFileSync(join(copies["compose-contract-app"]!, "design/shots/sign-in.mobile.png")))).not.toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  }, 1_200_000);

  test.skipIf(!android)("the seeded copy's audit finds its planted contrast, touch-target and name problems, and everything else is a declared knock-on (skipped without a JDK and the Android SDK)", async () => {
    const r = await runShot(copies["compose-seeded-app"]!, { positionals: [], flags: { routes: ROUTES, sizes: "390", audit: true, variant: "all", rtl: true } });
    type Place = { screen: string; selector: string; scheme?: string };
    type Found = { category: string; location: Place; locations?: Place[]; summary: string };
    const findings = r.data.findings as Found[];
    // What the audit shows of each planted problem: the element's selector and what it says.
    const SHOWN: Record<string, string> = {
      "J-08": 'SignInContent > Text("',
      "J-09": 'TodayContent > Button("', // "Add a habit", and "أضف عادة" right to left
      "J-10": "TodayContent > Button The button has no name",
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
  }, 1_200_000);
});
