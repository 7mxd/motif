import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import { NATIVE_VIEWPORTS, type RouteResult } from "../src/shot/capture";
import { HARNESS_AUDIT, HARNESS_HTTP, HARNESS_TEST, RESULT_FILE, withNoProxy, type HarnessRun, type HarnessResult } from "../src/stacks/flutter/harness";
import { googleFamilies, resolvedPackages } from "../src/stacks/flutter/google";
import { HOOKS_FILE } from "../src/stacks/flutter/hooks";
import { findScreen, readHttpFixtures, screenSlug } from "../src/stacks/flutter/inputs";
import { FLUTTER_VARIANT_HOW, screenNotes, shootFlutter } from "../src/stacks/flutter/shot";
import { fontFileScripts, scriptName } from "../src/stacks/flutter/scripts";
import type { NativeShotOptions } from "../src/stacks/native";
import { partnerTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const PUBSPEC = `name: shop
dependencies:
  flutter:
    sdk: flutter
  go_router: ^14.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
`;
const MAIN = `import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

void main() => runApp(MaterialApp.router(routerConfig: router));

final router = GoRouter(routes: [
  GoRoute(path: '/', builder: (c, s) => const Home(), routes: [GoRoute(path: 'settings', builder: (c, s) => const Settings())]),
  GoRoute(path: '/home', builder: (c, s) => const Items()),
]);

class Settings extends StatelessWidget {
  const Settings({super.key});
  @override
  Widget build(BuildContext context) => const Text('Settings');
}

class Order extends StatelessWidget {
  const Order({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) => Text(id);
}
`;
const FLUTTER_APP = { "pubspec.yaml": PUBSPEC, "lib/main.dart": MAIN };
/** Classes --screen must refuse or accept: a private widget, a model, a plain class, and a widget on the app's own base. */
const EXTRA = `import 'package:flutter/material.dart';

class _Hidden extends StatelessWidget {
  const _Hidden();
  @override
  Widget build(BuildContext context) => const Text('Hidden');
}

class Cart extends ChangeNotifier {}

class Plain {}

abstract class BaseScreen extends StatefulWidget {
  const BaseScreen({super.key});
}

class Promo extends BaseScreen {
  const Promo({super.key});
  @override
  State<Promo> createState() => _PromoState();
}

class _PromoState extends State<Promo> {
  @override
  Widget build(BuildContext context) => const _Hidden();
}
`;
const FILLED_STATE = `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The sign-in form with an address typed in.
Future<void> motifState(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), 'sara@example.com');
  await tester.pump();
}
`;
const NEXT_PKG = JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "^15", react: "^19", "react-dom": "^19" } });

const ctx = (flags: Record<string, string | string[] | boolean> = {}) => ({ positionals: [], flags });

/** Stand-ins for Flutter and the screenshot run; the browser and the dev server must never be used. */
function fakes(answer?: (o: NativeShotOptions) => { routes: RouteResult[]; notes?: string[] }) {
  const calls: NativeShotOptions[] = [];
  const never = () => {
    throw new Error("a Flutter app needs no browser or dev server");
  };
  const deps: ShotDeps = {
    findBrowser: never,
    devCommand: never,
    startDevServer: never,
    serveStatic: never,
    capture: never,
    compare: async () => [],
    today: () => "2026-10-20",
    which: (cmd) => (cmd === "flutter" ? "/fake/flutter/bin/flutter" : null),
    shoot: async (o) => {
      calls.push(o);
      const made: { routes: RouteResult[]; notes?: string[] } = answer?.(o) ?? {
        routes: o.routes.map((route) => ({
          route,
          url: route,
          status: 200,
          shots: [join(o.outDir, `${route === "/" ? "index" : route.slice(1)}.mobile.png`)],
        })),
      };
      for (const shot of made.routes.flatMap((r) => r.shots)) {
        mkdirSync(dirname(shot), { recursive: true });
        writeFileSync(shot, "png");
      }
      return { routes: made.routes, issues: [], notes: made.notes ?? [] };
    },
  };
  return { deps, calls };
}

describe("motif shot on a Flutter app", () => {
  test("captures the app's routes at the four native sizes, with the variants and RTL asked for", async () => {
    const root = makeProject({ ...FLUTTER_APP, "design/tokens.json": JSON.stringify(partnerTokens()) });
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx({ variant: "all", rtl: "ar" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    const o = calls[0]!;
    expect(o.routes).toEqual(["/", "/settings", "/home"]);
    expect(o.screens).toEqual([]);
    expect(o.viewports).toEqual(NATIVE_VIEWPORTS);
    expect(o.viewports.map((v) => `${v.file ?? v.name} ${v.width}x${v.height}@${v.scale}`)).toEqual([
      "mobile-360 360x800@2", "mobile 390x844@2", "mobile-430 430x932@2", "tablet 768x1024@2",
    ]);
    expect(o.variants).toEqual(["partner"]);
    expect(o.rtl).toBe("ar");
    expect(o.app.stack).toBe("flutter");
    expect(o.outDir).toBe(join(root, "design", "shots"));
    // 3 routes × 4 sizes × 2 schemes × 2 variants × 2 directions, at 3 s each, on top of 240 s (decision 0007).
    expect(o.timeoutMs).toBe(240_000 + 3_000 * 96);
    expect(r.text).toContain("three phone sizes and a tablet, light and dark, right to left in ar, 2 design variants");
  });

  test("--sizes chooses among the native sizes, and only --sizes desktop adds the desktop", async () => {
    const root = makeProject(FLUTTER_APP);
    const { deps, calls } = fakes();
    await runShot(root, ctx({ sizes: "390,desktop", routes: "/" }), deps);
    expect(calls[0]!.viewports.map((v) => [v.file ?? v.name, v.width, v.height, v.scale])).toEqual([["mobile", 390, 844, 2], ["desktop", 1440, 900, 1]]);
    expect(calls[0]!.timeoutMs).toBe(240_000 + 3_000 * 4);
    const bad = await runShot(root, ctx({ sizes: "1024" }), deps);
    expect(bad.exitCode).toBe(2);
    expect(bad.text).toContain("360, 390, 430, 768, 1440");
  });

  test("--screen captures widgets as well as routes, and alone captures only them", async () => {
    const root = makeProject(FLUTTER_APP);
    const { deps, calls } = fakes((o) => ({ routes: o.screens.map((s) => ({ route: s, url: s, status: 200, shots: [join(o.outDir, `${screenSlug(s)}.mobile.png`)] })) }));
    const r = await runShot(root, ctx({ screen: ["Settings"] }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls[0]!.routes).toEqual([]);
    expect(calls[0]!.screens).toEqual(["Settings"]);
    expect(r.data.shots).toEqual(["design/shots/settings.mobile.png"]);
    const web = await runShot(makeProject({ "package.json": NEXT_PKG, "app/page.tsx": "" }), ctx({ screen: "Settings" }), fakes().deps);
    expect(web.exitCode).toBe(2);
    expect(web.text).toBe("--screen opens a Flutter widget by its class name; this app isn't a Flutter app. Use --routes for its pages.");
  });

  test("an audit of routes and --screen widgets names both in audit.json's scope (plan 2F, Task 15)", async () => {
    const root = makeProject(FLUTTER_APP);
    const { deps } = fakes((o) => ({
      routes: [...o.routes, ...o.screens].map((s) => ({ route: s, url: s, status: 200, shots: [join(o.outDir, `${s === "/" ? "index" : screenSlug(s)}.mobile.png`)] })),
    }));
    const r = await runShot(root, ctx({ routes: "/", screen: ["Settings"], audit: true }), deps);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8")).scope).toBe("screens: /, Settings");
    // A run of widgets alone used to say "screens: " with nothing after it.
    await runShot(root, ctx({ screen: ["Settings"], audit: true }), deps);
    expect(JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8")).scope).toBe("screens: Settings");
  });

  test("a screen that redirected is reported where it landed, and the identical-variant note says how Flutter switches", async () => {
    const root = makeProject({ ...FLUTTER_APP, "design/tokens.json": JSON.stringify(partnerTokens()) });
    const { deps } = fakes((o) => {
      const dir = o.outDir;
      mkdirSync(dir, { recursive: true });
      for (const f of ["home.mobile.png", "home+partner.mobile.png"]) writeFileSync(join(dir, f), "same");
      return {
        routes: [
          { route: "/home", url: "/home", status: 200, landedOn: "/sign-in", shots: [join(dir, "home.mobile.png"), join(dir, "home+partner.mobile.png")] },
          { route: "/gone", url: "/gone", status: 0, error: "The app has no page at /gone (go_router: no routes for location: /gone).", shots: [] },
        ],
        notes: ["Requests nothing answered on /home: GET https://api.example.com/salons. Add them to design/states/http.json."],
      };
    });
    const r = await runShot(root, ctx({ routes: "/home,/gone", variant: "partner" }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("/home  2 screenshots (went to /sign-in)");
    expect(r.text).toContain("/gone  ✗ The app has no page at /gone");
    expect(r.text).toContain(`The partner variant looks exactly like the default on every screen: the app may not switch variants the way Motif sets them (${FLUTTER_VARIANT_HOW}).`);
    expect(r.text).toContain("• Requests nothing answered on /home: GET https://api.example.com/salons. Add them to design/states/http.json.");
    const data = r.data.routes as { route: string; landedOn?: string; status: number }[];
    expect(data[0]).toMatchObject({ route: "/home", landedOn: "/sign-in", status: 200 });
    expect(data[1]).toMatchObject({ route: "/gone", status: 0 });
  });
});

describe("motif shot on a Flutter app: what it refuses", () => {
  test("--url: the screens come from the code", async () => {
    const r = await runShot(makeProject(FLUTTER_APP), ctx({ url: "http://localhost:3000" }), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe("Flutter apps are screenshotted from their code, not a URL; drop --url.");
  });

  test("a .js state, with a hint, while a .dart one is passed through", async () => {
    const root = makeProject({ ...FLUTTER_APP, "design/states/editor.js": "document.body.click();", "design/states/filled.dart": FILLED_STATE });
    const { deps, calls } = fakes();
    const js = await runShot(root, ctx({ state: ["design/states/editor.js"] }), deps);
    expect(js.exitCode).toBe(2);
    expect(js.text).toBe("--state: editor.js is a browser script; a Flutter app's states are Dart files, like design/states/editor.dart.");
    const dart = await runShot(root, ctx({ state: ["design/states/filled.dart"], routes: "/" }), deps);
    expect(dart.exitCode).toBe(0);
    expect(calls[0]!.states.map((s) => [s.name, s.file])).toEqual([["filled", join(root, "design/states/filled.dart")]]);
    // States run now: no note says they don't.
    expect(JSON.stringify(dart.data.notes ?? [])).not.toContain("--state doesn't run");
  });

  test("a .dart state without motifState: exit 2 before anything is written", async () => {
    const root = makeProject({ ...FLUTTER_APP, "design/states/filled.dart": "// a state\n" });
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx({ state: ["design/states/filled.dart"], routes: "/" }), deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("usage");
    expect(r.text).toBe(
      "--state: filled.dart must define Future<void> motifState(WidgetTester tester) async, which Motif runs on each screen once it has opened. Add it, then run motif shot again.",
    );
    expect(calls).toHaveLength(0);
    expect(existsSync(join(root, "design", "shots"))).toBe(false);
  });

  test("--screen problems are usage errors before anything is written: private, not a widget, missing; repeats count once", async () => {
    const root = makeProject({ ...FLUTTER_APP, "lib/extra.dart": EXTRA });
    const { deps, calls } = fakes((o) => ({ routes: o.screens.map((s) => ({ route: s, url: s, status: 200, shots: [join(o.outDir, `${screenSlug(s)}.mobile.png`)] })) }));
    for (const [name, text] of [
      ["_Hidden", "--screen _Hidden: it's private to its file (its name starts with _), so Motif can't open it. Make it public, or capture it through its route with --routes."],
      ["Cart", "--screen Cart: it isn't a widget (it extends ChangeNotifier). Give a screen's widget class, one that extends StatelessWidget or StatefulWidget, or capture the screen through its route with --routes."],
      ["Plain", "--screen Plain: it isn't a widget. Give a screen's widget class, one that extends StatelessWidget or StatefulWidget, or capture the screen through its route with --routes."],
      ["Order", "--screen Order: Motif opens a screen with no arguments (Order()), and its constructor has required arguments. Give it a constructor that needs none, or capture it through its route with --routes."],
      ["Nope", "--screen Nope: there's no class Nope in the app's lib/ folder."],
    ]) {
      const r = await runShot(root, ctx({ screen: [name!] }), deps);
      expect(r.exitCode).toBe(2);
      expect(r.data.error).toBe("usage");
      expect(r.text).toBe(text!);
    }
    expect(calls).toHaveLength(0);
    expect(existsSync(join(root, "design", "shots"))).toBe(false);
    // A widget that extends the app's own base widget is a widget; a name given twice is opened once.
    const ok = await runShot(root, ctx({ screen: ["Promo", "Settings,Promo"] }), deps);
    expect(ok.exitCode).toBe(0);
    expect(calls[0]!.screens).toEqual(["Promo", "Settings"]);
  });

  test("no Flutter: exit 2 with the install line", async () => {
    const { deps } = fakes();
    const r = await runShot(makeProject(FLUTTER_APP), ctx(), { ...deps, which: () => null });
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("needs-flutter");
    expect(r.text).toBe(
      "Flutter isn't installed, so Motif can't draw this app's screens: install it from https://docs.flutter.dev/get-started/install. Then run motif shot again.",
    );
  });

  test("no flutter_test: exit 2 with the lines to add, and pubspec.yaml untouched", async () => {
    const pubspec = "name: shop\ndependencies:\n  flutter:\n    sdk: flutter\n";
    const root = makeProject({ "pubspec.yaml": pubspec, "lib/main.dart": "void main() {}\n" });
    const r = await runShot(root, ctx(), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("needs-flutter-test");
    expect(r.text).toContain("dev_dependencies:\n  flutter_test:\n    sdk: flutter");
    expect(r.text).toContain("pubspec.yaml");
    expect(readFileSync(join(root, "pubspec.yaml"), "utf8")).toBe(pubspec);
  });

  test("a --screen that needs arguments, or doesn't exist", async () => {
    const root = makeProject(FLUTTER_APP);
    expect(findScreen(root, "shop", "Settings")).toEqual({ import: "package:shop/main.dart" });
    expect(findScreen(root, "shop", "Order")).toEqual({
      error: "--screen Order: Motif opens a screen with no arguments (Order()), and its constructor has required arguments. Give it a constructor that needs none, or capture it through its route with --routes.",
    });
    expect(findScreen(root, "shop", "Nope")).toEqual({ error: "--screen Nope: there's no class Nope in the app's lib/ folder." });
    expect(screenSlug("SignInScreen")).toBe("sign-in-screen");
    expect(screenSlug("OTPScreen")).toBe("otp-screen");
  });
});

/** The options runShot would pass, for one route at one size. */
function options(root: string, over: Partial<NativeShotOptions> = {}): NativeShotOptions {
  return {
    root,
    app: { path: ".", stack: "flutter", source: "detected" },
    routes: ["/", "/home", "/gone"],
    screens: [],
    outDir: join(root, "design", "shots"),
    viewports: [NATIVE_VIEWPORTS[1]!],
    variants: [],
    states: [],
    audit: false,
    timeoutMs: 60_000,
    ...over,
  };
}

describe("FLUTTER.shoot", () => {
  test("turns what the harness drew into results: rendered, redirected, unreachable, and requests nothing answered", async () => {
    const root = makeProject(FLUTTER_APP);
    let given: HarnessRun | undefined;
    const run = async (r: HarnessRun): Promise<HarnessResult> => {
      given = r;
      return {
        code: 0,
        timedOut: false,
        output: "",
        shots: [],
        notes: ["Google Fonts has no family named Brand. Its text is drawn in a fallback font."],
        result: {
          screens: [
            { route: "/", shots: ["index.mobile.png", "index.mobile.dark.png"], errors: [] },
            {
              route: "/home",
              shots: ["home.mobile.png", "home.mobile.dark.png"],
              errors: ["camera needs a phone; stub it in design/states/setup.dart."],
              landedOn: "/sign-in",
              unanswered: ["GET https://api.example.com/salons"],
              missingFonts: ["Inter_700", "Inter_regular"],
              missingFallbacks: ["ReadexPro_regular", "ReadexPro_700"],
            },
            { route: "/gone", shots: [], errors: [], unreachable: "The app has no page at /gone (go_router: no routes for location: /gone)." },
          ],
          issues: [],
          notes: ["This app doesn't offer ar (supportedLocales), so its RTL screenshots show it left to right."],
        },
      };
    };
    const out = await shootFlutter(options(root), { themeDir: "lib/design", run });
    expect(given!.shots.map((s) => s.file)).toEqual([
      "index.mobile.png", "index.mobile.dark.png", "home.mobile.png", "home.mobile.dark.png", "gone.mobile.png", "gone.mobile.dark.png",
    ]);
    expect(given!.shots[0]).toMatchObject({ target: "/", route: "/", width: 390, height: 844, dpr: 2, safeTop: 47, safeBottom: 34, dark: false, locale: "en_US" });
    expect(given!.hooks).toContain("import 'package:shop/main.dart' as app;");
    expect(given!.hooks).toContain("import 'package:go_router/go_router.dart';");
    expect(given!.hooks).not.toContain("package:google_fonts");
    expect(given!.timeoutMs).toBe(60_000);
    const shots = join(root, "design", "shots");
    expect(out.routes).toEqual([
      { route: "/", url: "/", status: 200, shots: [join(shots, "index.mobile.png"), join(shots, "index.mobile.dark.png")] },
      {
        route: "/home",
        url: "/home",
        status: 200,
        landedOn: "/sign-in",
        shots: [join(shots, "home.mobile.png"), join(shots, "home.mobile.dark.png")],
        pageErrors: ["camera needs a phone; stub it in design/states/setup.dart."],
      },
      { route: "/gone", url: "/gone", status: 0, error: "The app has no page at /gone (go_router: no routes for location: /gone).", shots: [] },
    ]);
    expect(out.notes).toEqual([
      "Google Fonts has no family named Brand. Its text is drawn in a fallback font.",
      "This app doesn't offer ar (supportedLocales), so its RTL screenshots show it left to right.",
      "Requests nothing answered on /home: GET https://api.example.com/salons. Add them to design/states/http.json.",
      "Text in Inter on /home is drawn as boxes: Motif couldn't load that font (bundle it in pubspec.yaml, or see the font notes).",
      "Text on /home needs the fallback font ReadexPro for letters its main font lacks (Arabic, say), but Motif couldn't load it, so those letters are drawn as boxes (bundle it in pubspec.yaml, or see the font notes).",
    ]);
  });

  test("variants and RTL: file names, the theme's variant names, and the RTL locale", async () => {
    const root = makeProject({
      ...FLUTTER_APP,
      "design/tokens.json": JSON.stringify(partnerTokens()),
      "lib/design/motif_theme.dart": "// Generated by Motif\nabstract final class MotifTheme {\n  static MotifVariant? debugVariantOverride;\n}\n",
      "design/states/setup.dart": "Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async => null;\n",
    });
    let given: HarnessRun | undefined;
    await shootFlutter(options(root, { routes: ["/"], variants: ["partner"], rtl: "ar" }), {
      themeDir: "lib/design",
      run: async (r) => {
        given = r;
        return { code: 0, timedOut: false, output: "", shots: [], notes: [], result: { screens: [], issues: [], notes: [] } };
      },
    });
    expect(given!.shots.map((s) => s.file)).toEqual([
      "index.mobile.png", "index.mobile.rtl.png", "index+partner.mobile.png", "index+partner.mobile.rtl.png",
      "index.mobile.dark.png", "index.mobile.rtl.dark.png", "index+partner.mobile.dark.png", "index+partner.mobile.rtl.dark.png",
    ]);
    expect(given!.shots[1]).toMatchObject({ locale: "ar", rtl: true });
    expect(given!.shots[2]).toMatchObject({ variant: "partner", variantId: "partner" });
    expect(given!.config).toMatchObject({ defaultVariant: "default" });
    expect(given!.hooks).toContain("import 'package:shop/design/motif_theme.dart' as theme;");
    expect(given!.hooks).toContain("import '../../design/states/setup.dart' as setup;");
  });

  test("design/states/http.json: requests mapped to files under design/, and refusals for what can't work", () => {
    const root = makeProject({
      "design/states/http.json": JSON.stringify({ "GET /items": "fixtures/items.json", "POST https://api.example.com/orders": { file: "design/fixtures/order.json", status: 201 } }),
      "design/fixtures/items.json": "[]",
      "design/fixtures/order.json": "{}",
    });
    expect(readHttpFixtures(root)).toEqual([
      { method: "GET", path: "/items", url: null, file: join(root, "design/fixtures/items.json"), status: 200 },
      { method: "POST", path: null, url: "https://api.example.com/orders", file: join(root, "design/fixtures/order.json"), status: 201 },
    ]);
    const outside = makeProject({ "design/states/http.json": JSON.stringify({ "GET /x": "../secrets.json" }), "secrets.json": "{}" });
    expect(readHttpFixtures(outside)).toEqual({ error: 'design/states/http.json: "GET /x" answers with ../secrets.json, which isn\'t under design/.' });
    const badKey = makeProject({ "design/states/http.json": JSON.stringify({ "/items": "x.json" }) });
    expect(readHttpFixtures(badKey)).toMatchObject({ error: expect.stringContaining('"GET /items"') });
  });

  test("a run that fails removes the harness and says what Flutter said last", async () => {
    const root = makeProject(FLUTTER_APP);
    const failing = join(root, "fail.ts");
    writeFileSync(
      failing,
      `console.log("Error: google_fonts was unable to load font Onest-Regular because the following exception occurred:");
console.error("lib/main.dart:3:1: Error: Expected ';' after this.");
process.exit(1);`,
    );
    let error: unknown;
    try {
      await shootFlutter(options(root), { themeDir: "lib/design", flutter: join(root, "no-sdk", "bin", "flutter"), command: [process.execPath, failing] });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("flutter test stopped before drawing any screen. The last lines it printed:\nlib/main.dart:3:1: Error: Expected ';' after this.");
    expect(existsSync(join(root, HARNESS_TEST))).toBe(false);
    expect(existsSync(join(root, HOOKS_FILE))).toBe(false);
    expect(existsSync(join(root, HARNESS_HTTP))).toBe(false);
    expect(existsSync(join(root, HARNESS_AUDIT))).toBe(false);
    expect(existsSync(join(root, ".motif/shot/config.json"))).toBe(false);
  });

  test("a result file cut short is a plain error, not a crash", async () => {
    const root = makeProject(FLUTTER_APP);
    const cut = join(root, "cut.ts");
    writeFileSync(cut, `await Bun.write(${JSON.stringify(join(root, RESULT_FILE))}, '{"screens": [{"route": "/", "sh'); console.log("00:03 +2: index.mobile.png");`);
    const run = shootFlutter(options(root), { themeDir: "lib/design", flutter: join(root, "no-sdk", "bin", "flutter"), command: [process.execPath, cut] });
    expect(run).rejects.toThrow("The harness's result file is cut short; the run may have been stopped while writing it. The last lines it printed:\n00:03 +2: index.mobile.png");
  });

  test("flutter test runs with 127.0.0.1 and localhost kept off any proxy", () => {
    expect(withNoProxy({ HTTPS_PROXY: "http://proxy:8080", NO_PROXY: "corp.example" })).toMatchObject({
      NO_PROXY: "corp.example,127.0.0.1,localhost",
      no_proxy: "corp.example,127.0.0.1,localhost",
    });
    expect(withNoProxy({})).toMatchObject({ NO_PROXY: "127.0.0.1,localhost" });
  });
});

describe("the audit and states on a Flutter app", () => {
  const harness = (result: Record<string, unknown>, seen: { run?: HarnessRun }) => async (r: HarnessRun): Promise<HarnessResult> => {
    seen.run = r;
    return { code: 0, timedOut: false, output: "", shots: [], notes: [], result };
  };

  test("--audit runs: each screenshot gets its checks, and the harness's issues become audit.json's findings, in Flutter's terms", async () => {
    const root = makeProject(FLUTTER_APP);
    const caption = 'AuditScreen > Scaffold > ListView > Text("Prices include tax")';
    const close = "AuditScreen > Scaffold > ListView > IconButton";
    const light = { route: "/", size: "mobile", scheme: "light", file: "index.mobile.png" };
    const seen: { run?: HarnessRun } = {};
    const run = harness(
      {
        screens: [{ route: "/", shots: ["index.mobile.png", "index.mobile.dark.png"], errors: [] }],
        issues: [
          { rule: "color-contrast", selector: caption, label: "Prices include tax", kind: "element", ratio: 2.32, expected: 4.5, fg: "#aaaaaa", bg: "#ffffff", ...light },
          { rule: "color-contrast", selector: caption, label: "Prices include tax", kind: "element", ratio: 2.32, expected: 4.5, fg: "#aaaaaa", bg: "#ffffff", ...light, scheme: "dark", file: "index.mobile.dark.png" },
          { rule: "target-mobile", selector: close, label: "", kind: "button", width: 32, height: 32, ...light },
          { rule: "name", selector: close, label: "", kind: "button", ...light },
          { rule: "motion", selector: "AuditScreen > Scaffold > ListView > Spinner", label: "Spinner", kind: "element", ...light },
        ],
        notes: [],
      },
      seen,
    );
    const deps: ShotDeps = { ...fakes().deps, shoot: (o) => shootFlutter(o, { themeDir: "lib/design", run }) };
    const r = await runShot(root, ctx({ routes: "/", sizes: "390", audit: true }), deps);
    expect(r.exitCode).toBe(1);
    expect(seen.run!.shots.map((s) => [s.file, s.size, s.checks])).toEqual([
      ["index.mobile.png", "mobile", ["contrast", "names", "targets", "motion"]],
      ["index.mobile.dark.png", "mobile", ["contrast", "names"]],
    ]);
    expect(r.text).toContain("✗ Audit: 1 critical, 2 major, 1 minor (details in design/shots/audit.json):");
    const review = JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8"));
    expect(review).toMatchObject({ motifReview: 1, scope: "screens: /", date: "2026-10-20" });
    expect(review.findings).toEqual([
      {
        id: "F-001",
        severity: "critical",
        category: "contrast",
        source: "exact",
        location: { screen: "/", selector: caption, viewport: "mobile", scheme: "light" },
        locations: [{ screen: "/", selector: caption, viewport: "mobile", scheme: "dark" }],
        summary: 'Text "Prices include tax" is hard to read in light and dark mode (2.32:1, needs 4.5:1).',
        fix: "Use a text colour role with more contrast on this background, or adjust the role in design/tokens.json (motif validate checks the pairs).",
        shot: "design/shots/index.mobile.png",
        status: "open",
      },
      {
        id: "F-002",
        severity: "major",
        category: "accessibility",
        source: "exact",
        location: { screen: "/", selector: close, viewport: "mobile" },
        summary: "The button has no name a screen reader can say.",
        fix: "Give it a name a screen reader can say: a tooltip (IconButton takes one), a visible label, or Semantics(label: …).",
        shot: "design/shots/index.mobile.png",
        status: "open",
      },
      {
        id: "F-003",
        severity: "major",
        category: "reduced-motion",
        source: "exact",
        location: { screen: "/", selector: "AuditScreen > Scaffold > ListView > Spinner", viewport: "mobile" },
        summary: 'The "Spinner" element keeps moving when the viewer asks for reduced motion.',
        fix: "Stop this animation, or keep it still, when MediaQuery.disableAnimationsOf(context) is true (the system's reduce motion setting); MotifMotion.duration(context, …) is zero then.",
        shot: "design/shots/index.mobile.png",
        status: "open",
      },
      {
        id: "F-004",
        severity: "minor",
        category: "target-size",
        source: "exact",
        location: { screen: "/", selector: close, viewport: "mobile" },
        summary: "A button is 32×32 px on a phone; 44×44 px is easier to tap.",
        fix: "Give it at least 44×44 px: padding, a SizedBox or a minimumSize in its style (Material's tap target size, 48, is the default).",
        shot: "design/shots/index.mobile.png",
        status: "open",
      },
    ]);
  });

  test("a screen whose contrast check left texts out says how many, and why, so it isn't taken as clean", () => {
    expect(screenNotes([{ route: "/", covered: 1 }, { route: "/offers", covered: 2, overImages: 3 }, { route: "/clean" }])).toEqual([
      "Contrast on / wasn't judged for 1 text something is drawn over (a floating bar, a dialog's barrier): check them by eye.",
      "Contrast on /offers wasn't judged for 2 texts something is drawn over (a floating bar, a dialog's barrier) and 3 texts over an image the screenshot doesn't show: check them by eye.",
    ]);
  });

  test("an icon of Flutter's own is named from the SDK's icons.dart (Icons.star); any other keeps its code point (HiSalon #2)", async () => {
    const root = makeProject({
      ...FLUTTER_APP,
      "sdk/bin/flutter": "",
      "sdk/packages/flutter/lib/src/material/icons.dart":
        "  static const IconData star = IconData(0xe5f9, fontFamily: 'MaterialIcons');\n  static const IconData star_rate = IconData(0xe5f9, fontFamily: 'MaterialIcons');\n",
      "sdk/packages/flutter/lib/src/cupertino/icons.dart": "  static const IconData heart = IconData(\n    0xf442,\n    fontFamily: iconFont,\n    fontPackage: iconFontPackage,\n  );\n",
    });
    const where = { route: "/", size: "mobile", scheme: "light", file: "index.mobile.png", ratio: 2.1, expected: 3, fg: "#bbbbbb", bg: "#ffffff" };
    const out = await shootFlutter(options(root, { routes: ["/"], audit: true }), {
      themeDir: "lib/design",
      flutter: join(root, "sdk/bin/flutter"),
      run: harness(
        {
          screens: [{ route: "/", shots: ["index.mobile.png"], errors: [] }],
          issues: [
            { rule: "color-contrast", selector: "Row > Icon(U+E5F9)", label: "", kind: "icon", icon: "U+E5F9", iconFont: "MaterialIcons", ...where },
            { rule: "color-contrast", selector: "Row > Icon(U+F442)", label: "", kind: "icon", icon: "U+F442", iconFont: "CupertinoIcons", ...where },
            { rule: "color-contrast", selector: 'Row > Icon("Rating")', label: "Rating", kind: "icon", icon: "U+F01D4", iconFont: "HiSalonIcons", ...where },
          ],
          notes: [],
        },
        {},
      ),
    });
    expect(out.issues.map((i) => [i.icon, i.selector, "iconFont" in i])).toEqual([
      ["Icons.star", "Row > Icon(Icons.star)", false],
      ["CupertinoIcons.heart", "Row > Icon(CupertinoIcons.heart)", false],
      ["U+F01D4", 'Row > Icon("Rating")', false],
    ]);
  });

  test("states: a screenshot after each state, its import and runner in the hooks, and main() told from main(args) by its type", async () => {
    const root = makeProject({ ...FLUTTER_APP, "design/states/filled.dart": FILLED_STATE });
    const seen: { run?: HarnessRun } = {};
    const out = await shootFlutter(
      options(root, { routes: ["/"], audit: true, viewports: [NATIVE_VIEWPORTS[3]!], states: [{ name: "filled", script: FILLED_STATE, file: join(root, "design/states/filled.dart") }] }),
      {
        themeDir: "lib/design",
        run: harness(
          {
            screens: [{ route: "/", shots: ["index.tablet.png", "index@filled.tablet.png"], errors: ['State "filled": Bad state: no field'], auditError: "the semantics tree wasn't ready" }],
            issues: [{ rule: "name", selector: "Scaffold > IconButton", label: "", kind: "button", route: "/", size: "tablet", scheme: "light", state: "filled", file: "index@filled.tablet.png" }],
            notes: [],
          },
          seen,
        ),
      },
    );
    expect(seen.run!.shots.map((s) => [s.file, s.state ?? null, s.checks])).toEqual([
      ["index.tablet.png", null, ["contrast", "names", "targets"]],
      ["index@filled.tablet.png", "filled", ["contrast", "names", "targets"]],
      ["index.tablet.dark.png", null, ["contrast", "names"]],
      ["index@filled.tablet.dark.png", "filled", ["contrast", "names"]],
    ]);
    expect(seen.run!.hooks).toContain("import '../../design/states/filled.dart' as state0;");
    expect(seen.run!.hooks).toContain("  if (name == 'filled') return state0.motifState(tester);");
    expect(seen.run!.hooks).toContain("main is Function() ? main() : Function.apply(main, [<String>[]])");
    expect(seen.run!.hooks).not.toContain("NoSuchMethodError");
    const shots = join(root, "design", "shots");
    expect(out.routes).toEqual([
      {
        route: "/",
        url: "/",
        status: 200,
        shots: [join(shots, "index.tablet.png"), join(shots, "index@filled.tablet.png")],
        auditError: "the semantics tree wasn't ready",
        pageErrors: ['State "filled": Bad state: no field'],
      },
    ]);
    expect(out.issues).toEqual([
      {
        rule: "name",
        selector: "Scaffold > IconButton",
        label: "",
        kind: "button",
        route: "/",
        size: "tablet",
        scheme: "light",
        state: "filled",
        viewport: "mobile",
        shot: join(shots, "index@filled.tablet.png"),
        fix: "Give it a name a screen reader can say: a tooltip (IconButton takes one), a visible label, or Semantics(label: …).",
      },
    ]);
    expect(out.notes).toEqual([]);
  });

  test("--sizes without the 390 phone says the reduced-motion check didn't run", async () => {
    const root = makeProject(FLUTTER_APP);
    const r = await runShot(root, ctx({ routes: "/", sizes: "360", audit: true }), fakes().deps);
    expect(r.data.notes).toContain("The reduced-motion check runs at the 390 px phone size, which --sizes left out.");
    expect(JSON.stringify(r.data.notes)).not.toContain("desktop size");
  });
});

describe("the google_fonts families an app uses", () => {
  function appWithGoogleFonts(code: string, tokens?: unknown): string {
    const root = makeProject({
      "pubspec.yaml": `${PUBSPEC}  google_fonts: ^6.2.1\n`,
      "lib/main.dart": code,
      // A stand-in for the google_fonts package the app resolved, with its asMap() table.
      "pub/google_fonts-6.2.1/lib/google_fonts.dart": `class GoogleFonts {
  static Map<String, dynamic> asMap() => const {
        'IBM Plex Sans': PartI.ibmPlexSans,
        'Inter': PartI.inter,
        'Onest': PartO.onest,
      };
  static Map<String, dynamic> _asMapOfTextThemes() => const {
        'Onest': PartO.onestTextTheme,
      };
}
`,
      ".dart_tool/package_config.json": JSON.stringify({ configVersion: 2, packages: [{ name: "google_fonts", rootUri: "../pub/google_fonts-6.2.1", packageUri: "lib/" }] }),
      ...(tokens ? { "design/tokens.json": JSON.stringify(tokens) } : {}),
    });
    return root;
  }

  test("from GoogleFonts calls in the code, through the table of the package the app resolved, and from the guide", () => {
    const root = appWithGoogleFonts(
      `final a = GoogleFonts.onestTextTheme();
final b = GoogleFonts.ibmPlexSans(fontWeight: FontWeight.w700);
final c = GoogleFonts.getFont('Readex Pro');
// final d = GoogleFonts.inter();
final e = GoogleFonts.config;
`,
    );
    const packages = resolvedPackages(root);
    expect(packages?.get("google_fonts")?.version).toBe("6.2.1");
    expect(googleFamilies(root, packages, [readFileSync(join(root, "lib/main.dart"), "utf8")])).toEqual(["IBM Plex Sans", "Onest", "Readex Pro"]);
    // The guide's Inter counts too, once google_fonts has it.
    const guided = appWithGoogleFonts("void main() {}\n", partnerTokens());
    expect(googleFamilies(guided, resolvedPackages(guided), [])).toEqual(["Inter"]);
  });

  test("before flutter pub get, an app on google_fonts is asked to run it", async () => {
    const root = makeProject({ "pubspec.yaml": `${PUBSPEC}  google_fonts: ^6.2.1\n`, "lib/main.dart": MAIN });
    const r = await runShot(root, ctx(), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("needs-pub-get");
    expect(r.text).toBe("Run flutter pub get in the app's folder first: Motif reads which fonts google_fonts has from the packages it resolved. Then run motif shot again.");
  });
});

describe("motif shot on a Flutter app: which pages, past twelve (Task 15 wave B, #11)", () => {
  // HiSalon's shape: the auth routes come last in the router, after more than twelve signed-in pages.
  const pages = Array.from({ length: 14 }, (_, i) => `GoRoute(path: '/page${i + 1}', builder: (c, s) => const Text('${i + 1}'))`);
  const ROUTER = `import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

final router = GoRouter(routes: [
  ${pages.join(",\n  ")},
  GoRoute(path: '/', builder: (c, s) => const Text('home')),
  GoRoute(path: '/auth', builder: (c, s) => const Text('auth'), routes: [GoRoute(path: 'phone', builder: (c, s) => const Text('phone'))]),
  GoRoute(path: '/welcome', builder: (c, s) => const Text('welcome')),
]);
`;

  test("sign-in-like pages and / come first, the rest in source order, and the note names what was left out", async () => {
    const root = makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": ROUTER });
    const { deps, calls } = fakes();
    const r = await runShot(root, ctx(), deps);
    expect(calls[0]!.routes).toEqual(["/auth", "/auth/phone", "/welcome", "/", ...Array.from({ length: 8 }, (_, i) => `/page${i + 1}`)]);
    expect(r.text).toContain(
      "Captured 12 of 18 pages: sign-in pages and / first, then the rest in the order your code lists them. Left out: /page9, /page10, /page11, /page12, /page13 and /page14. Choose others with --routes.",
    );
  });

  test("past six pages left out, the note names five and counts the rest", async () => {
    const more = ROUTER.replace("final router", "final more = [GoRoute(path: '/x1', builder: (c, s) => const Text('x')), GoRoute(path: '/x2', builder: (c, s) => const Text('x'))];\nfinal router");
    const { deps } = fakes();
    const r = await runShot(makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": more }), ctx(), deps);
    expect(r.text).toContain("Left out: /page7, /page8, /page9, /page10, /page11 and 3 more.");
  });

  test("--routes keeps the order it's given", async () => {
    const root = makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": ROUTER });
    const { deps, calls } = fakes();
    await runShot(root, ctx({ routes: "/page2,/auth/phone,/" }), deps);
    expect(calls[0]!.routes).toEqual(["/page2", "/auth/phone", "/"]);
  });
});

describe("wave B review fixes: the left-out note says only what the app has (review #7)", () => {
  test("an app without sign-in pages: / first, then the rest", async () => {
    const pages = Array.from({ length: 14 }, (_, i) => `GoRoute(path: '/page${i + 1}', builder: (c, s) => const Text('${i + 1}'))`);
    const router = `import 'package:flutter/material.dart';\nimport 'package:go_router/go_router.dart';\n\nfinal router = GoRouter(routes: [\n  ${pages.join(",\n  ")},\n]);\n`;
    const { deps } = fakes();
    const r = await runShot(makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": router }), ctx(), deps);
    expect(r.text).toContain("Captured 12 of 15 pages: / first, then the rest in the order your code lists them.");
    expect(r.text).not.toContain("sign-in pages");
  });
});

describe("final review: each Flutter app of a monorepo has its own setup (Important #1)", () => {
  const pubspec = (name: string) => PUBSPEC.replace("name: shop", `name: ${name}`);
  const setup = (pkg: string) =>
    `import 'package:flutter/widgets.dart';\nimport 'package:${pkg}/main.dart';\n\nFuture<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async => null;\n`;
  const monorepo = (extra: Record<string, string> = {}) =>
    makeProject({
      "mobile/customer/pubspec.yaml": pubspec("customer"),
      "mobile/customer/lib/main.dart": MAIN,
      "mobile/customer/design/states/setup.dart": setup("customer"),
      "mobile/admin/pubspec.yaml": pubspec("admin"),
      "mobile/admin/lib/main.dart": MAIN,
      ...extra,
    });
  const fakeRun = () => {
    const given: HarnessRun[] = [];
    const run = async (r: HarnessRun): Promise<HarnessResult> => {
      given.push(r);
      return { code: 0, timedOut: false, output: "", shots: [], notes: [], result: { screens: [], issues: [], notes: [] } };
    };
    return { given, run };
  };
  const app = (path: string) => ({ path, stack: "flutter" as const, source: "detected" as const });

  test("an app's own design/states/setup.dart and http.json come first, and a note says so", async () => {
    const root = monorepo({
      "design/states/setup.dart": setup("customer"),
      "mobile/admin/design/states/setup.dart": setup("admin"),
      "mobile/admin/design/states/http.json": JSON.stringify({ "GET /items": "fixtures/items.json" }),
      "mobile/admin/design/fixtures/items.json": "[]",
    });
    const { given, run } = fakeRun();
    const out = await shootFlutter(options(root, { app: app("mobile/admin"), routes: ["/"] }), { themeDir: "mobile/admin/lib/design", run });
    expect(given[0]!.hooks).toContain("import '../../design/states/setup.dart' as setup;");
    expect(given[0]!.hooks).not.toContain("package:customer");
    expect(given[0]!.config).toMatchObject({
      setupFile: "mobile/admin/design/states/setup.dart",
      http: [{ method: "GET", path: "/items", url: null, file: join(root, "mobile/admin/design/fixtures/items.json"), status: 200 }],
    });
    expect(out.notes).toEqual(["This app used its own mobile/admin/design/states/setup.dart and mobile/admin/design/states/http.json, not the project's design/states/setup.dart."]);
  });

  test("each app runs with its own setup, which imports its own package", async () => {
    const root = monorepo({ "mobile/admin/design/states/setup.dart": setup("admin") });
    for (const [path, pkg] of [["mobile/customer", "customer"], ["mobile/admin", "admin"]] as const) {
      const { given, run } = fakeRun();
      const out = await shootFlutter(options(root, { app: app(path), routes: ["/"] }), { themeDir: `${path}/lib/design`, run });
      expect(given[0]!.hooks).toContain("import '../../design/states/setup.dart' as setup;");
      expect(given[0]!.hooks).toContain(`import 'package:${pkg}/main.dart' as app;`);
      expect(given[0]!.config).toMatchObject({ setupFile: `${path}/design/states/setup.dart` });
      expect(out.notes).toEqual([`This app used its own ${path}/design/states/setup.dart.`]);
    }
  });

  test("an app without its own uses the project's, with no note; requests nothing answered name the file the app reads", async () => {
    const root = monorepo({ "design/states/setup.dart": setup("admin"), "mobile/customer/design/states/http.json": "{}" });
    const { given, run } = fakeRun();
    const out = await shootFlutter(options(root, { app: app("mobile/admin"), routes: ["/"] }), { themeDir: "mobile/admin/lib/design", run });
    expect(given[0]!.hooks).toContain("import '../../../../design/states/setup.dart' as setup;");
    expect(given[0]!.config).toMatchObject({ setupFile: "design/states/setup.dart", http: [] });
    expect(out.notes).toEqual([]);
    expect(screenNotes([{ route: "/", unanswered: ["GET https://x.test/a"] }], "mobile/customer/design/states/http.json")).toEqual([
      "Requests nothing answered on /: GET https://x.test/a. Add them to mobile/customer/design/states/http.json.",
    ]);
  });

  test("a broken setup names the app's own file, before anything is written", async () => {
    const root = monorepo({ "mobile/admin/design/states/setup.dart": "void main() {}\n", "design/states/setup.dart": setup("admin") });
    const r = await runShot(root, { positionals: [], flags: { routes: "/" }, app: "mobile/admin" }, fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe(
      "mobile/admin/design/states/setup.dart must define Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async.",
    );
    const http = makeProject({ "a/design/states/http.json": JSON.stringify({ "GET /x": "../../secrets.json" }), "a/secrets.json": "{}" });
    expect(readHttpFixtures(http, join(http, "a"))).toEqual({ error: 'a/design/states/http.json: "GET /x" answers with ../../secrets.json, which isn\'t under design/.' });
  });
});

describe("final review: text no loaded font has letters for (Important #3, hands-on #12)", () => {
  test("which scripts a font file has, from its cmap: Noto Naskh Arabic has Arabic; a file that isn't a font has none", () => {
    const naskh = readFileSync(join(import.meta.dir, "fixtures", "flutter-min", "assets", "fonts", "NotoNaskhArabic.ttf"));
    expect(fontFileScripts(naskh)).toEqual(["arabic"]);
    expect(fontFileScripts(new Uint8Array([0, 1, 0, 0, 0, 0]))).toEqual([]);
    expect(scriptName("arabic")).toBe("Arabic");
  });

  test("one note per script and family, naming its screens; google_fonts' Family_700 is the family", () => {
    const notes = screenNotes([
      { route: "/profile", noScriptFont: [{ script: "arabic", family: "Onest_regular" }, { script: "arabic", family: "Onest_700" }] },
      { route: "/settings", noScriptFont: [{ script: "arabic", family: "Onest_regular" }, { script: "hebrew", family: "Roboto" }] },
    ]);
    expect(notes).toEqual([
      "/profile and /settings: Arabic text in Onest has no Arabic font loaded, so it draws as boxes here (a phone would use a system font). Add an Arabic companion to the type role (fontFamilyFallback).",
      "/settings: Hebrew text in Roboto has no Hebrew font loaded, so it draws as boxes here (a phone would use a system font). Add a Hebrew companion to the type role (fontFamilyFallback).",
    ]);
  });
});

describe("final review: several apps and no browser (Minor #8)", () => {
  test("says to choose an app with --app before any browser advice: a Flutter app needs no browser", async () => {
    const root = makeProject({
      "mobile/customer/pubspec.yaml": PUBSPEC.replace("name: shop", "name: customer"),
      "mobile/customer/lib/main.dart": MAIN,
      "mobile/admin/pubspec.yaml": PUBSPEC.replace("name: shop", "name: admin"),
      "mobile/admin/lib/main.dart": MAIN,
    });
    const { deps } = fakes();
    const r = await runShot(root, ctx(), { ...deps, findBrowser: () => null });
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("several-apps");
    expect(r.text).toBe("There are several apps here (mobile/admin, mobile/customer). Choose one with --app <path>.");
  });
});

describe("final review: a state script is what the stack says (Minor #10)", () => {
  test("a file that isn't Dart is refused in the stack's words", async () => {
    const root = makeProject({ ...FLUTTER_APP, "design/states/notes.txt": "x" });
    const r = await runShot(root, ctx({ state: "design/states/notes.txt" }), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe("--state: notes.txt isn't a Dart file; a Flutter app's states are Dart files, like design/states/notes.dart.");
  });
});

describe("final review: routes Motif can't read are named in the run's notes (Minor #11)", () => {
  test("only / from a router of constants Motif can't find: the run says to name the screens with --routes", async () => {
    const router = "import 'package:go_router/go_router.dart';\nfinal router = GoRouter(routes: [GoRoute(path: Routes.home, builder: (c, s) => const Home())]);\n";
    const r = await runShot(makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": router }), ctx(), fakes().deps);
    expect(r.exitCode).toBe(0);
    expect(r.data.notes).toEqual(["Only / was found; some routes are built at run time or named by constants Motif can't find — name the screens with --routes."]);
  });
});

describe("final review: --save then --against on a Flutter app (Minor #12)", () => {
  test("the second run pairs each screenshot with the saved one, and needs the browser only for that", async () => {
    const root = makeProject(FLUTTER_APP);
    const { deps } = fakes();
    const browser = { path: "/fake/chrome", name: "Chrome" } as const;
    const saved = await runShot(root, ctx({ routes: "/", save: "before" }), deps);
    expect(saved.exitCode).toBe(0);
    expect(existsSync(join(root, "design", "shots", "before", "index.mobile.png"))).toBe(true);
    const given: Parameters<ShotDeps["compare"]>[0][] = [];
    const r = await runShot(root, ctx({ routes: "/", against: "before" }), {
      ...deps,
      findBrowser: () => browser as never,
      compare: async (o) => {
        given.push(o);
        return o.pairs.map((p) => ({ ...p, changed: 0 }));
      },
    });
    expect(r.exitCode).toBe(0);
    const shots = join(root, "design", "shots");
    expect(given[0]!.browserPath).toBe("/fake/chrome");
    expect(given[0]!.pairs).toEqual([{ before: join(shots, "before", "index.mobile.png"), after: join(shots, "index.mobile.png"), out: join(shots, "compare", "before", "index.mobile.png") }]);
    expect(r.text).toContain('Compared with "before": 0 changed, 1 with no visible change');
  });
});
