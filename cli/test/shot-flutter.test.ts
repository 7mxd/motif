import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import { NATIVE_VIEWPORTS, type RouteResult } from "../src/shot/capture";
import { HARNESS_HTTP, HARNESS_TEST, RESULT_FILE, withNoProxy, type HarnessRun, type HarnessResult } from "../src/stacks/flutter/harness";
import { googleFamilies, resolvedPackages } from "../src/stacks/flutter/google";
import { HOOKS_FILE } from "../src/stacks/flutter/hooks";
import { findScreen, readHttpFixtures, screenSlug } from "../src/stacks/flutter/inputs";
import { FLUTTER_VARIANT_HOW, shootFlutter } from "../src/stacks/flutter/shot";
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
    const root = makeProject({ ...FLUTTER_APP, "design/states/editor.js": "document.body.click();", "design/states/filled.dart": "// a state\n" });
    const { deps, calls } = fakes();
    const js = await runShot(root, ctx({ state: ["design/states/editor.js"] }), deps);
    expect(js.exitCode).toBe(2);
    expect(js.text).toBe("--state: editor.js is a browser script; a Flutter app's states are Dart files, like design/states/editor.dart.");
    const dart = await runShot(root, ctx({ state: ["design/states/filled.dart"], routes: "/" }), deps);
    expect(dart.exitCode).toBe(0);
    expect(calls[0]!.states.map((s) => [s.name, s.file])).toEqual([["filled", join(root, "design/states/filled.dart")]]);
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
