import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { HARNESS_AUDIT, HARNESS_HTTP, HARNESS_TEST, RESULT_FILE } from "../src/stacks/flutter/harness";
import { HOOKS_FILE } from "../src/stacks/flutter/hooks";
import { FIXTURES, hasFlutter } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// Needs the Flutter SDK on the PATH (bun's skipIf takes no reason, so each name says it). The tests share one copy of
// flutter-min, which has a sign-in redirect on /home, a partner variant through the generated MotifTheme, and a list
// fetched over HTTP; flutter test reuses its compiled harness from one run to the next.
const flutter = hasFlutter();
let app = "";
const saved = { home: process.env.MOTIF_HOME, debug: process.env.MOTIF_DEBUG };

beforeAll(() => {
  if (!flutter) return;
  app = tempDir("motif flutter shot ");
  cpSync(join(FIXTURES, "flutter-min"), app, { recursive: true, filter: (src) => ![".dart_tool", "build"].includes(basename(src)) });
  const pubGet = (offline: boolean) =>
    Bun.spawnSync([Bun.which("flutter")!, "pub", "get", ...(offline ? ["--offline"] : [])], { cwd: app, stdout: "pipe", stderr: "pipe" }).exitCode;
  if (pubGet(true) !== 0) expect(pubGet(false)).toBe(0);
  // Fonts are fetched once into this checkout's test cache (gitignored), so later runs are offline.
  process.env.MOTIF_HOME = join(import.meta.dir, ".tmp", "flutter-home");
});

afterAll(() => {
  for (const [key, value] of [["MOTIF_HOME", saved.home], ["MOTIF_DEBUG", saved.debug]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  cleanupTempDirs();
});

const shot = (flags: Record<string, string | boolean | string[]>) => runShot(app, { positionals: [], flags });
const png = (name: string) => readFileSync(join(app, "design", "shots", name));
const routesOf = (data: Record<string, unknown>) => data.routes as { route: string; status: number; landedOn?: string; shots: string[] }[];

const SETUP = `import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Signed in, as someone who has used the app.
Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async {
  SharedPreferences.setMockInitialValues({'signedIn': true});
  return null;
}
`;

describe("motif shot on flutter-min, drawn by flutter test", () => {
  test.skipIf(!flutter)("/ and /home at 390 in light and dark; /home lands on /sign-in when nobody is signed in (skipped without Flutter)", async () => {
    const r = await shot({ routes: "/,/home", sizes: "390" });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.data.shots).toEqual([
      "design/shots/index.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/home.mobile.png", "design/shots/home.mobile.dark.png",
    ]);
    for (const name of ["index.mobile.png", "index.mobile.dark.png", "home.mobile.png", "home.mobile.dark.png"]) {
      expect(pngSize(png(name))).toEqual({ width: 780, height: 1688 });
    }
    expect(Buffer.compare(png("index.mobile.png"), png("index.mobile.dark.png"))).not.toBe(0);
    expect(routesOf(r.data)[1]).toMatchObject({ route: "/home", status: 200, landedOn: "/sign-in" });
    expect(r.text).toContain("(went to /sign-in)");
    // Only the ignored .motif folder is left, without the harness, its hooks or its options.
    expect(existsSync(join(app, HARNESS_TEST))).toBe(false);
    expect(existsSync(join(app, HOOKS_FILE))).toBe(false);
    expect(existsSync(join(app, HARNESS_HTTP))).toBe(false);
    expect(existsSync(join(app, HARNESS_AUDIT))).toBe(false);
    expect(existsSync(join(app, ".motif/shot/config.json"))).toBe(false);
    expect(readFileSync(join(app, ".motif/.gitignore"), "utf8")).toBe("*\n");
  }, 600_000);

  test.skipIf(!flutter)("with design/states/setup.dart signed in, /home renders; its request is noted until http.json answers it (skipped without Flutter)", async () => {
    mkdirSync(join(app, "design", "states"), { recursive: true });
    writeFileSync(join(app, "design", "states", "setup.dart"), SETUP);
    const unanswered = await shot({ routes: "/home", sizes: "390" });
    expect(unanswered.exitCode).toBe(0);
    expect(routesOf(unanswered.data)[0]!.landedOn).toBeUndefined();
    expect(unanswered.data.notes).toContain("Requests nothing answered on /home: GET https://api.example.com/items. Add them to design/states/http.json.");

    mkdirSync(join(app, "design", "fixtures"), { recursive: true });
    writeFileSync(join(app, "design", "fixtures", "items.json"), JSON.stringify([{ title: "Oat milk" }, { title: "Rice" }]));
    writeFileSync(join(app, "design", "states", "http.json"), JSON.stringify({ "GET /items": "fixtures/items.json" }));
    process.env.MOTIF_DEBUG = "1";
    try {
      const answered = await shot({ routes: "/home", sizes: "390" });
      expect(answered.exitCode).toBe(0);
      expect(JSON.stringify(answered.data.notes ?? [])).not.toContain("Requests nothing answered");
      const result = JSON.parse(readFileSync(join(app, RESULT_FILE), "utf8"));
      expect(result.screens[0].route).toBe("/home");
      expect(result.screens[0].texts).toContain("Oat milk");
    } finally {
      delete process.env.MOTIF_DEBUG;
      rmSync(join(app, "design", "states"), { recursive: true, force: true });
    }
  }, 600_000);

  test.skipIf(!flutter)("--variant all draws +partner files that differ from the default's, and --rtl draws .rtl ones (skipped without Flutter)", async () => {
    const r = await shot({ routes: "/", sizes: "390", variant: "all", rtl: true });
    if (r.exitCode !== 0) console.log(r.text);
    expect(r.exitCode).toBe(0);
    expect(r.data.shots).toEqual([
      "design/shots/index.mobile.png", "design/shots/index.mobile.rtl.png", "design/shots/index+partner.mobile.png", "design/shots/index+partner.mobile.rtl.png",
      "design/shots/index.mobile.dark.png", "design/shots/index.mobile.rtl.dark.png", "design/shots/index+partner.mobile.dark.png", "design/shots/index+partner.mobile.rtl.dark.png",
    ]);
    expect(Buffer.compare(png("index.mobile.png"), png("index+partner.mobile.png"))).not.toBe(0);
    expect(Buffer.compare(png("index.mobile.dark.png"), png("index+partner.mobile.dark.png"))).not.toBe(0);
    expect(Buffer.compare(png("index.mobile.png"), png("index.mobile.rtl.png"))).not.toBe(0);
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("looks exactly like the default");
    expect(JSON.stringify(r.data.notes ?? [])).not.toContain("doesn't offer ar");
  }, 600_000);

  test.skipIf(!flutter)("--audit finds /audit's pale caption, its small icon button with no name, and its icon that keeps turning (skipped without Flutter)", async () => {
    // An audit with no --variant checks every variant, as on the web.
    const r = await shot({ routes: "/audit", sizes: "390", audit: true });
    if (r.exitCode !== 1) console.log(r.text);
    expect(r.exitCode).toBe(1);
    expect(r.data.shots).toEqual([
      "design/shots/audit.mobile.png", "design/shots/audit+partner.mobile.png", "design/shots/audit.mobile.dark.png", "design/shots/audit+partner.mobile.dark.png",
    ]);
    expect(existsSync(join(app, HARNESS_AUDIT))).toBe(false);
    const review = JSON.parse(readFileSync(join(app, "design", "shots", "audit.json"), "utf8"));
    type Place = { selector: string; scheme?: string; variant?: string };
    const findings = review.findings as { category: string; severity: string; summary: string; location: Place; locations?: Place[]; shot: string }[];
    const of = (category: string) => findings.filter((f) => f.category === category);
    // Nothing else on the screen is a problem: the AppBar's title in the theme's colours, "Fresh today" (#949494 is
    // 3.03:1, enough for large bold text, which needs 3:1), and the text on a gradient (no one colour is its background,
    // so it isn't judged, as axe leaves such text "incomplete").
    expect(findings).toHaveLength(5);
    expect(JSON.stringify(findings)).not.toContain("Fresh today");
    expect(JSON.stringify(findings)).not.toContain("Summer sale");

    const [caption, faint] = of("contrast");
    expect(caption).toMatchObject({ severity: "critical", summary: 'Text "Prices include tax" is hard to read in light and dark mode (2.32:1, needs 4.5:1).' });
    expect(caption!.location.selector).toBe('AuditScreen > Scaffold > ListView > Text("Prices include tax")');
    expect([caption!.location, ...(caption!.locations ?? [])].map((l) => `${l.scheme} ${l.variant ?? "default"}`)).toEqual([
      "light default", "light partner", "dark default", "dark partner",
    ]);
    // #111111 at 40% opacity is drawn #a0a0a0 on white.
    expect(faint).toMatchObject({ severity: "critical", summary: 'Text "Delivery times are estimates" is hard to read in light and dark mode (2.62:1, needs 4.5:1).' });

    const small = of("target-size");
    expect(small.map((f) => f.summary)).toEqual(["A button is 32×32 px on a phone; 44×44 px is easier to tap."]);
    expect(small[0]!.location.selector).toBe("AuditScreen > Scaffold > ListView > IconButton");
    const unnamed = of("accessibility");
    expect(unnamed.map((f) => [f.summary, f.location.selector])).toEqual([["The button has no name a screen reader can say.", "AuditScreen > Scaffold > ListView > IconButton"]]);
    const moving = of("reduced-motion");
    expect(moving.map((f) => [f.summary, f.location.selector])).toEqual([
      ['The "Spinner" element keeps moving when the viewer asks for reduced motion.', "AuditScreen > Scaffold > ListView > Spinner"],
    ]);
    expect(moving[0]!.shot).toBe("design/shots/audit.mobile.png");
  }, 600_000);

  test.skipIf(!flutter)("Arabic text whose fallback font isn't loaded gets a note naming the font and the screen; text with a loaded fallback gets none (skipped without Flutter)", async () => {
    writeFileSync(join(app, "lib", "fallback_screen.dart"), FALLBACK_SCREEN);
    try {
      const r = await shot({ screen: "FallbackScreen", sizes: "390", variant: "default" });
      if (r.exitCode !== 0) console.log(r.text);
      expect(r.exitCode).toBe(0);
      const notes = (r.data.notes ?? []) as string[];
      expect(notes.filter((n) => n.includes("fallback font"))).toEqual([
        "Text on FallbackScreen needs the fallback font NoSuchArabic for letters its main font lacks (Arabic, say), but Motif couldn't load it, so those letters are drawn as boxes (bundle it in pubspec.yaml, or see the font notes).",
      ]);
    } finally {
      rmSync(join(app, "lib", "fallback_screen.dart"), { force: true });
    }
  }, 600_000);

  test.skipIf(!flutter)("a state that types an address gives home@filled; a state that throws is reported, and the other screenshots are kept (skipped without Flutter)", async () => {
    mkdirSync(join(app, "design", "states"), { recursive: true });
    writeFileSync(join(app, "design", "states", "filled.dart"), FILLED);
    writeFileSync(join(app, "design", "states", "broken.dart"), BROKEN);
    process.env.MOTIF_DEBUG = "1";
    try {
      const r = await shot({ routes: "/home", sizes: "390", state: ["design/states/filled.dart", "design/states/broken.dart"] });
      expect(r.exitCode).toBe(1);
      expect(r.data.shots).toEqual([
        "design/shots/home.mobile.png", "design/shots/home@filled.mobile.png", "design/shots/home@broken.mobile.png",
        "design/shots/home.mobile.dark.png", "design/shots/home@filled.mobile.dark.png", "design/shots/home@broken.mobile.dark.png",
      ]);
      expect(Buffer.compare(png("home.mobile.png"), png("home@filled.mobile.png"))).not.toBe(0);
      const route = routesOf(r.data)[0] as { pageErrors?: string[]; landedOn?: string };
      expect(route.landedOn).toBe("/sign-in");
      expect(route.pageErrors).toEqual(['State "broken": Bad state: The cart is empty.']);
      expect(r.text).toContain('✗ the page threw an error: State "broken": Bad state: The cart is empty.');
      const result = JSON.parse(readFileSync(join(app, RESULT_FILE), "utf8"));
      expect(result.screens[0].texts).toContain("sara@example.com");
    } finally {
      delete process.env.MOTIF_DEBUG;
      rmSync(join(app, "design", "states"), { recursive: true, force: true });
    }
  }, 600_000);

  test.skipIf(!flutter)("a state still waiting after 15 s is left behind: its screenshot and audit are taken, and so are the run's others; a pumpAndSettle that times out gets a note (skipped without Flutter)", async () => {
    mkdirSync(join(app, "design", "states"), { recursive: true });
    writeFileSync(join(app, "design", "states", "stuck.dart"), STUCK);
    writeFileSync(join(app, "design", "states", "settle.dart"), SETTLE);
    try {
      const r = await shot({ routes: "/audit", sizes: "390", variant: "default", audit: true, state: ["design/states/stuck.dart", "design/states/settle.dart"] });
      expect(r.exitCode).toBe(1);
      expect(r.data.shots).toEqual([
        "design/shots/audit.mobile.png", "design/shots/audit@stuck.mobile.png", "design/shots/audit@settle.mobile.png",
        "design/shots/audit.mobile.dark.png", "design/shots/audit@stuck.mobile.dark.png", "design/shots/audit@settle.mobile.dark.png",
      ]);
      for (const name of (r.data.shots as string[]).map((s) => basename(s))) expect(pngSize(png(name))).toEqual({ width: 780, height: 1688 });
      const route = routesOf(r.data)[0] as { pageErrors?: string[]; auditError?: string };
      expect(route.pageErrors).toEqual([
        'State "stuck": it was still running after 15 seconds (time passes in a state only when it pumps)',
        'State "settle": pumpAndSettle timed out',
      ]);
      expect(route.auditError).toBeUndefined();
      expect(r.text).not.toContain("Audit incomplete");
      expect(r.data.notes).toContain(
        'State "settle" waited in pumpAndSettle for a screen that keeps animating. Use tester.pump(const Duration(...)) instead of pumpAndSettle on screens that keep animating.',
      );
      // The 390 checks ran on the stuck state's screenshot too, motion (two more seconds of pumping) included.
      const issues = JSON.parse(readFileSync(join(app, RESULT_FILE), "utf8")).issues as { file: string; rule: string }[];
      expect(issues.filter((i) => i.file === "audit@stuck.mobile.png").map((i) => i.rule).sort()).toEqual([
        "color-contrast", "color-contrast", "motion", "name", "target-mobile",
      ]);
    } finally {
      rmSync(join(app, "design", "states"), { recursive: true, force: true });
    }
  }, 600_000);

  test.skipIf(!flutter)("a setup script that doesn't finish within 15 s is the screen's error, not a silent start without it (skipped without Flutter)", async () => {
    mkdirSync(join(app, "design", "states"), { recursive: true });
    writeFileSync(join(app, "design", "states", "setup.dart"), SLOW_SETUP);
    try {
      const r = await shot({ routes: "/", sizes: "390" });
      expect(r.exitCode).toBe(1);
      expect(routesOf(r.data)[0]).toMatchObject({ route: "/", status: 0, error: "design/states/setup.dart didn't finish within 15 s." });
    } finally {
      rmSync(join(app, "design", "states"), { recursive: true, force: true });
    }
  }, 600_000);
});

/** Arabic in Roboto twice: once falling back to the bundled Noto Naskh Arabic, once to a family nothing loads. */
const FALLBACK_SCREEN = `import 'package:flutter/material.dart';

class FallbackScreen extends StatelessWidget {
  const FallbackScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Column(
        children: [
          Text('مرحبا', style: TextStyle(fontFamily: 'Roboto', fontFamilyFallback: ['NotoNaskhArabic'])),
          Text('أهلا', style: TextStyle(fontFamily: 'Roboto', fontFamilyFallback: ['NoSuchArabic'])),
          Text('Hello', style: TextStyle(fontFamily: 'Roboto', fontFamilyFallback: ['NoSuchLatin'])),
        ],
      ),
    );
  }
}
`;
const FILLED = `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The sign-in form with an address typed in.
Future<void> motifState(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), 'sara@example.com');
  await tester.pump();
}
`;
const BROKEN = `import 'package:flutter_test/flutter_test.dart';

Future<void> motifState(WidgetTester tester) async {
  throw StateError('The cart is empty.');
}
`;
/** Waits on the test's clock without pumping: it never finishes by itself. */
const STUCK = `import 'package:flutter_test/flutter_test.dart';

Future<void> motifState(WidgetTester tester) async {
  await Future<void>.delayed(const Duration(seconds: 30));
}
`;
/** pumpAndSettle on a screen that keeps animating (the turning icon): it times out. */
const SETTLE = `import 'package:flutter_test/flutter_test.dart';

Future<void> motifState(WidgetTester tester) async {
  await tester.pumpAndSettle();
}
`;
const SLOW_SETUP =`import 'package:flutter/widgets.dart';

Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async {
  await Future<void>.delayed(const Duration(seconds: 30));
  return null;
}
`;

const PLAIN_PUBSPEC = `name: plain_app
publish_to: none
environment:
  sdk: ^3.8.0
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_test:
    sdk: flutter
flutter:
  uses-material-design: true
`;
const PLAIN_MAIN = `import 'package:flutter/material.dart';

void main() => runApp(
      MaterialApp(
        home: const Home(),
        routes: {'/settings': (context) => const Settings()},
      ),
    );

class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Plain home')));
}

class Settings extends StatelessWidget {
  const Settings({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Plain settings')));
}

class Profile extends StatelessWidget {
  const Profile({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Plain profile')));
}
`;

describe("motif shot on a Flutter app without go_router or google_fonts", () => {
  test.skipIf(!flutter)("opens routes with Navigator.pushNamed, a --screen on the root navigator, and says when a route doesn't exist (skipped without Flutter)", async () => {
    const plain = tempDir("motif plain flutter ");
    mkdirSync(join(plain, "lib"), { recursive: true });
    writeFileSync(join(plain, "pubspec.yaml"), PLAIN_PUBSPEC);
    writeFileSync(join(plain, "lib", "main.dart"), PLAIN_MAIN);
    const flutterCmd = Bun.which("flutter")!;
    if (Bun.spawnSync([flutterCmd, "pub", "get", "--offline"], { cwd: plain, stdout: "pipe", stderr: "pipe" }).exitCode !== 0) {
      expect(Bun.spawnSync([flutterCmd, "pub", "get"], { cwd: plain, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    }
    process.env.MOTIF_DEBUG = "1";
    try {
      const r = await runShot(plain, { positionals: [], flags: { routes: "/,/settings,/nope", screen: ["Profile"], sizes: "390" } });
      const routes = routesOf(r.data);
      expect(routes.map((x) => [x.route, x.status])).toEqual([["/", 200], ["/settings", 200], ["/nope", 0], ["Profile", 200]]);
      expect(r.text).toContain("The app has no page named /nope");
      expect(r.data.shots).toContain("design/shots/profile.mobile.png");
      const screens = JSON.parse(readFileSync(join(plain, RESULT_FILE), "utf8")).screens as { route: string; texts: string[] }[];
      const texts = (route: string) => screens.find((s) => s.route === route)!.texts;
      expect(texts("/")).toContain("Plain home");
      expect(texts("/settings")).toContain("Plain settings");
      expect(texts("Profile")).toContain("Plain profile");
    } finally {
      delete process.env.MOTIF_DEBUG;
    }
  }, 600_000);
});
