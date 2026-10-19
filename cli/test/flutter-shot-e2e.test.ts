import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { HARNESS_HTTP, HARNESS_TEST, RESULT_FILE } from "../src/stacks/flutter/harness";
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
});

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
