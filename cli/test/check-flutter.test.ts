import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emit } from "../src/cli/output";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");
const PUBSPEC = "name: shop\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n  google_fonts: ^6.2.1\n\nflutter:\n  uses-material-design: true\n";
const HOME = `import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      color: Color(0xFF3B82F6),
      padding: EdgeInsets.all(13),
      // motif-ok: partner brand
      child: Text('Hi', style: TextStyle(color: Color(0xFFFF00AA))),
    );
  }
}
`;
const FADE = `import 'package:flutter/material.dart';

Widget fade(Widget child) => AnimatedOpacity(opacity: 1, duration: Duration(milliseconds: 200), child: child);
`;
const MOTION = "import 'package:flutter/widgets.dart';\n\nDuration fast(BuildContext context) => MotifMotion.duration(context, MotifDurations.fast);\n";

/** A Flutter app at the project's root, with its theme code written by motif tokens. */
async function flutterApp(files: Record<string, string>): Promise<string> {
  const root = makeProject({ "pubspec.yaml": PUBSPEC, "design/tokens.json": TOKENS, "lib/main.dart": "void main() {}\n", ...files });
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  return root;
}
const check = (root: string) => runCheck(root, { positionals: [] });
const where = (r: any) => (r.data.violations as any[]).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);

describe("motif check on a Flutter app", () => {
  test("reports typed colours and sizes with Dart fixes, and honours a reasoned motif-ok", async () => {
    const r = await check(await flutterApp({ "lib/home.dart": HOME }));
    expect(r.exitCode).toBe(1);
    expect(where(r)).toEqual(["raw-color lib/home.dart:7:14", "off-scale lib/home.dart:8:31"]);
    expect(r.text).toContain("Use MotifColors.of(context).<role>.");
    expect(r.text).toContain("Use MotifSpace.s<N>.");
    expect(r.text).not.toContain("var(--motif");
    expect((r.data.exceptions as any[]).map((e) => [e.rule, e.file, e.line, e.reason])).toEqual([["raw-color", "lib/home.dart", 10, "partner brand"]]);
    expect(r.text).toContain("lib/home.dart:10  raw-color  Color(0xFFFF00AA) — motif-ok: partner brand");
  });

  test("--json lists each hit with its file, line and column", async () => {
    const r = await check(await flutterApp({ "lib/home.dart": HOME }));
    let out = "";
    emit(r, true, (s) => void (out += s));
    const hits = JSON.parse(out).violations as any[];
    expect(hits.map((h) => `${h.file}:${h.line}:${h.column}`)).toEqual(["lib/home.dart:7:14", "lib/home.dart:8:31"]);
    expect(hits[0]).toMatchObject({ rule: "raw-color", kind: "color", value: "#3b82f6", context: "background", fix: "Use MotifColors.of(context).<role>." });
  });

  test("the generated theme file is never scanned; edited by hand, it is a warning", async () => {
    const root = await flutterApp({ "lib/home.dart": "Widget a() => const SizedBox();\n" });
    const clean = await check(root);
    expect(clean.exitCode).toBe(0);
    expect(clean.text).toStartWith("✓ No design problems found in 2 files.");
    expect(clean.data.warnings).toEqual([]);

    const theme = join(root, "lib/design/motif_theme.dart");
    writeFileSync(theme, readFileSync(theme, "utf8").replace("Color(0x", "Color(0x1"));
    const edited = await check(root);
    expect(edited.data.violations).toEqual([]);
    expect((edited.data.warnings as any[]).map((w) => [w.rule, w.file])).toEqual([["generated-edited", "lib/design/motif_theme.dart"]]);
    expect(edited.text).toContain("Warnings:");
  });

  test("reduce motion: reported when the app animates without MotifMotion, gone once it uses it", async () => {
    const bare = await check(await flutterApp({ "lib/fade.dart": FADE }));
    expect(where(bare)).toEqual(["reduced-motion lib/fade.dart:3:30"]);
    expect(bare.text).toContain('Animations here ignore the "reduce motion" setting.');
    expect(bare.text).toContain("Use MotifMotion.duration(context, …) for durations");

    const motif = await check(await flutterApp({ "lib/fade.dart": FADE, "lib/motion.dart": MOTION }));
    expect(motif.data.violations).toEqual([]);
    expect(motif.exitCode).toBe(0);
  });

  test("many problems are grouped with the closest generated member", async () => {
    const lines = Array.from({ length: 26 }, (_, i) => `final c${i} = Container(color: Color(0xFF4B5563));`);
    const r = await check(await flutterApp({ "lib/many.dart": [...lines, "final p = EdgeInsets.all(13);", "final o = Container(color: Color(0xFFFF00AA));", ""].join("\n") }));
    expect(r.text).toContain("26× Color(0xFF4B5563)");
    expect(r.text).toContain("Closest: MotifColors.of(context).textSecondary.");
    expect(r.text).toContain("Closest: MotifSpace.s3 (12px).");
    // An off-brand colour has no role close to it: the plain fix, not a misleading "closest".
    expect(r.text).toContain("1× Color(0xFFFF00AA)  Raw colour Color(0xFFFF00AA). Use MotifColors.of(context).<role>. At lib/many.dart:28.");
  });

  test("an app's in-repo path: packages are checked with it; a file two apps share is reported once (HiSalon #1)", async () => {
    const shared = "mobile/packages/core/lib/design";
    const app = (name: string) => `name: ${name}\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n  core:\n    path: ../packages/core\n\nflutter:\n  uses-material-design: true\n`;
    const CARD = "import 'package:flutter/material.dart';\n\nWidget card() => Container(color: Colors.white);\n";
    const files = {
      "design/tokens.json": TOKENS,
      "mobile/customer/pubspec.yaml": app("customer"),
      "mobile/customer/lib/main.dart": "void main() {}\n",
      "mobile/admin/pubspec.yaml": app("admin"),
      "mobile/admin/lib/main.dart": "void main() {}\n",
      "mobile/packages/core/pubspec.yaml": "name: core\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n",
      "mobile/packages/core/lib/card.dart": CARD,
      "mobile/packages/core/lib/card.g.dart": CARD,
      "mobile/packages/core/lib/generated/assets.dart": CARD,
    };
    const settings = (apps: string[]) => JSON.stringify({ motifContract: 1, apps: apps.map((path) => ({ path, stack: "flutter", themeDir: shared })), ignore: [] });

    const one = makeProject({ ...files, "design/motif.json": settings(["mobile/customer"]) });
    expect((await runTokens(one, { positionals: [] })).exitCode).toBe(0);
    const r = await runCheck(one, { positionals: [], app: "mobile/customer" });
    // The package's widget is read; its generated files (*.g.dart, lib/generated/) and Motif's motif_theme.dart there are not.
    expect(where(r)).toEqual(["raw-color mobile/packages/core/lib/card.dart:3:35"]);

    const two = makeProject({ ...files, "design/motif.json": settings(["mobile/customer", "mobile/admin"]) });
    expect((await runTokens(two, { positionals: [] })).exitCode).toBe(0);
    const both = await check(two);
    expect(where(both)).toEqual(["raw-color mobile/packages/core/lib/card.dart:3:35"]);
    expect((both.data as any).summary.files).toBe(3);

    // Both apps expect the one generated file: edited by hand, it is one warning, not one per app.
    const theme = join(two, shared, "motif_theme.dart");
    writeFileSync(theme, readFileSync(theme, "utf8").replace("Color(0x", "Color(0x1"));
    const edited = await check(two);
    expect((edited.data.warnings as any[]).map((w) => [w.rule, w.file])).toEqual([["generated-edited", `${shared}/motif_theme.dart`]]);
  });

  test("paths with no Dart files: the message names .dart", async () => {
    const root = await flutterApp({ "assets/notes.txt": "hi\n" });
    const r = await runCheck(root, { positionals: ["assets"] });
    expect(r.exitCode).toBe(2);
    expect(r.text).toBe("None of these paths contain files motif check reads (.dart, .css, .ts, .tsx, .js, .jsx, .html, …), or they're ignored: assets.");
  });

  test("a Flutter app without a guide is sent to motif extract, which reads it (Task 15)", async () => {
    const r = await check(makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": "void main() {}\n" }));
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("Draft one from your code with motif extract");
  });

  test("names the stacks it reads when it can't read an app", async () => {
    const root = makeProject({ "design/tokens.json": TOKENS, "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "compose-multiplatform" }] }) });
    const r = await check(root);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motif check works on Flutter apps, Jetpack Compose apps, React Native (Expo) apps, SwiftUI apps, Vue / Nuxt apps, Svelte / SvelteKit apps, Angular apps, React web apps and plain web sites in this version.");
  });
});

describe("motif check on a Flutter app: groups and the app's own palette (Task 15 wave B, #7 and ruling U)", () => {
  test("a group names each place once: EdgeInsets.fromLTRB(28, 60, 28, 28) is one place", async () => {
    const lines = Array.from({ length: 9 }, (_, i) => `final p${i} = EdgeInsets.fromLTRB(28, 60, 28, 28);`);
    const r = await check(await flutterApp({ "lib/pad.dart": [...lines, ""].join("\n") }));
    const line = r.text.split(/\r?\n/).find((l) => l.startsWith("  27× 28 "));
    expect(line).toEndWith("At lib/pad.dart:1, lib/pad.dart:2, lib/pad.dart:3 and 6 more.");
  });

  test("a pill's corner (999) suggests MotifRadius.full", async () => {
    const lines = Array.from({ length: 26 }, (_, i) => `final r${i} = BorderRadius.circular(999);`);
    const r = await check(await flutterApp({ "lib/pill.dart": [...lines, ""].join("\n") }));
    expect(r.text).toContain("Closest: MotifRadius.full (9999px).");
    expect(r.text).not.toContain("MotifRadius.lg (16px)");
  });

  const PALETTE = `import 'package:flutter/material.dart';

class AppColors extends ThemeExtension<AppColors> {
  const AppColors({required this.bg, required this.text});
  final Color bg;
  final Color text;

  static const light = AppColors(bg: Color(0xFFF8FAF9), text: Color(0xFF0A1733));
  static const dark = AppColors(bg: Color(0xFF0F1413), text: Color(0xFFF1F5F4));

  @override
  AppColors copyWith({Color? bg, Color? text}) => AppColors(bg: bg ?? this.bg, text: text ?? this.text);
  @override
  AppColors lerp(AppColors? other, double t) => this;
}
`;
  const BRAND = `import 'package:flutter/material.dart';

class Brand {
  static const Color mint = Color(0xFF7EEBC1);
  static const Color navy = Color(0xFF0A1733);
  static const Color sand = Color(0xFFF1E9DA);
}
`;
  const HINT = (file: string) => `${file} is your own theme's palette: once the app uses Motif's theme, remove it, or list its folder under "ignore" in design/motif.json.`;

  test("typed colours in the app's own palette are still flagged, with one hint line per palette file", async () => {
    const r = await check(await flutterApp({ "lib/theme/app_colors.dart": PALETTE, "lib/theme/brand.dart": BRAND, "lib/home.dart": HOME }));
    const files = new Set((r.data.violations as any[]).map((h) => h.file));
    expect([...files].sort()).toEqual(["lib/home.dart", "lib/theme/app_colors.dart", "lib/theme/brand.dart"]);
    expect(r.text).toContain(HINT("lib/theme/app_colors.dart"));
    expect(r.text).toContain(HINT("lib/theme/brand.dart"));
    expect(r.text).not.toContain(HINT("lib/home.dart"));
    expect(r.text.split(HINT("lib/theme/brand.dart")).length).toBe(2);
    expect(r.data.palettes).toEqual(["lib/theme/app_colors.dart", "lib/theme/brand.dart"]);
  });
});

describe("wave B review fixes: check", () => {
  // flutter create's lib/main.dart: its one typed colour is the seed of ColorScheme.fromSeed.
  const TEMPLATE = `import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple)),
      home: const Text('Hello'),
    );
  }
}
`;
  const HINT = "is your own theme's palette";

  test("the flutter create template's main.dart isn't a palette: its colour is flagged, with no hint (review #1)", async () => {
    const root = makeProject({ "pubspec.yaml": PUBSPEC, "design/tokens.json": TOKENS, "lib/main.dart": TEMPLATE });
    expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
    const r = await check(root);
    expect((r.data.violations as any[]).map((h) => h.text)).toContain("Colors.deepPurple");
    expect(r.text).not.toContain(HINT);
    expect(r.data.palettes).toBeUndefined();
  });

  test("a file with main() or runApp is never a palette, even with a full ColorScheme in it (review #1)", async () => {
    const scheme = "ColorScheme.light(primary: Color(0xFF4338CA), surface: Color(0xFFFFFFFF), onSurface: Color(0xFF111827))";
    const app = await flutterApp({
      "lib/main.dart": `import 'package:flutter/material.dart';\n\nvoid main() => runApp(MaterialApp(theme: ThemeData(colorScheme: ${scheme})));\n`,
      "lib/scheme.dart": `import 'package:flutter/material.dart';\n\nconst scheme = ${scheme};\n`,
      "lib/seed.dart": `import 'package:flutter/material.dart';\n\nfinal seeded = ColorScheme.fromSeed(seedColor: Color(0xFF4338CA));\n`,
    });
    const r = await check(app);
    expect(r.data.palettes).toEqual(["lib/scheme.dart"]);
  });

  test("a corner at or past the full cut-off (999 px) suggests full; a 120 px one keeps the nearest finite role (review #5)", async () => {
    const lines = [
      ...Array.from({ length: 13 }, (_, i) => `final a${i} = BorderRadius.circular(120);`),
      ...Array.from({ length: 13 }, (_, i) => `final b${i} = BorderRadius.circular(999);`),
    ];
    const r = await check(await flutterApp({ "lib/r.dart": [...lines, ""].join("\n") }));
    const line = (text: string) => r.text.split(/\r?\n/).find((l) => l.startsWith(`  13× ${text} `)) ?? "";
    expect(line("999")).toContain("Closest: MotifRadius.full (9999px).");
    expect(line("120")).toContain("Closest: MotifRadius.lg (16px).");
  });
});
