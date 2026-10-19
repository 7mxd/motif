// The per-app half of the Flutter screenshot harness (motif_hooks.dart): the app's imports, and the few calls that
// depend on which packages the app uses. motif_shot_test.dart itself stays the same from run to run.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { dependsOn } from "./project";

/** The app's main file under lib/: main.dart, or a flavor's (main_dev.dart) when there's no plain one. */
export function mainFile(appDir: string): string {
  let names: string[] = [];
  try {
    names = readdirSync(join(appDir, "lib")).sort();
  } catch {
    // No lib/ folder: flutter test says so.
  }
  return names.includes("main.dart") ? "main.dart" : (names.find((n) => /^main.*\.dart$/.test(n)) ?? "main.dart");
}

/** Hooks for the app's main and the packages it depends on, with no theme, setup or screens. */
export function defaultHooks(appDir: string, pkg: string): HooksSpec {
  return {
    main: `package:${pkg}/${mainFile(appDir)}`,
    goRouter: dependsOn(appDir, "go_router"),
    googleFonts: dependsOn(appDir, "google_fonts"),
    sharedPreferences: dependsOn(appDir, "shared_preferences"),
    screens: [],
  };
}

export interface HooksSpec {
  /** The app's main file as a package: import (package:shop/main.dart). */
  main: string;
  goRouter: boolean;
  googleFonts: boolean;
  sharedPreferences: boolean;
  /** The generated motif_theme.dart as a package: import, when it has MotifTheme.debugVariantOverride. */
  theme?: string;
  /** design/states/setup.dart, as an import relative to .motif/shot/. */
  setup?: string;
  /** --screen widgets: the class name and the package: import of the file that defines it. */
  screens: { name: string; import: string }[];
}

const dartString = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$")}'`;

export const HOOKS_FILE = ".motif/shot/motif_hooks.dart";

/** The source of motif_hooks.dart for one app. */
export function hooksSource(spec: HooksSpec): string {
  const imports = [
    "import 'package:flutter/material.dart';",
    "",
    `import ${dartString(spec.main)} as app;`,
    ...(spec.goRouter ? ["import 'package:go_router/go_router.dart';"] : []),
    ...(spec.googleFonts ? ["import 'package:google_fonts/google_fonts.dart';"] : []),
    ...(spec.sharedPreferences ? ["import 'package:shared_preferences/shared_preferences.dart';"] : []),
    ...(spec.theme ? [`import ${dartString(spec.theme)} as theme;`] : []),
    ...(spec.setup ? [`import ${dartString(spec.setup)} as setup;`] : []),
    ...spec.screens.map((s, i) => `import ${dartString(s.import)} as s${i};`),
  ];
  const lines = [
    "// Written by Motif for one screenshot run and deleted after it: the app's imports, for motif_shot_test.dart.",
    "// ignore_for_file: type=lint",
    ...imports,
    "",
    "/// True when the app routes with go_router.",
    `const bool usesGoRouter = ${spec.goRouter};`,
    "",
    "/// Starts the app as its main() does; the future is main's own, when it's async.",
    "Future<void>? startApp() {",
    "  Object? result;",
    "  try {",
    "    result = Function.apply(app.main, const []);",
    "  } on NoSuchMethodError {",
    "    result = Function.apply(app.main, [<String>[]]);",
    "  }",
    "  return result is Future ? result.then((_) {}) : null;",
    "}",
    "",
    "/// google_fonts may not fetch: Motif loaded every font it needs from files.",
    "void fontsOffline() {",
    ...(spec.googleFonts ? ["  GoogleFonts.config.allowRuntimeFetching = false;"] : []),
    "}",
    "",
    "/// Empty storage for a fresh start.",
    "void resetStorage() {",
    ...(spec.sharedPreferences ? ["  SharedPreferences.setMockInitialValues(<String, Object>{});"] : []),
    "}",
    "",
    "/// Draws MotifTheme in a design variant (null: the default); says what's wrong when the theme lacks it.",
    "String? setVariant(String? name) {",
    ...(spec.theme
      ? [
          "  theme.MotifTheme.debugVariantOverride = null;",
          "  if (name == null) return null;",
          "  for (final v in theme.MotifVariant.values) {",
          "    if (v.name == name) {",
          "      theme.MotifTheme.debugVariantOverride = v;",
          "      return null;",
          "    }",
          "  }",
          "  return 'The generated theme has no $name variant: run motif tokens to bring it up to date.';",
        ]
      : ["  return null;"]),
    "}",
    "",
    "/// design/states/setup.dart's motifSetup: it may seed storage and return the widget to start instead of main().",
    "Future<Widget?> runSetup(String variant, Locale locale, Brightness brightness) async {",
    ...(spec.setup ? ["  return setup.motifSetup(variant: variant, locale: locale, brightness: brightness);"] : ["  return null;"]),
    "}",
    "",
    "/// The app's GoRouter, found from a context below it.",
    "Object? goRouterOf(BuildContext context) {",
    ...(spec.goRouter ? ["  return GoRouter.maybeOf(context);"] : ["  return null;"]),
    "}",
    "",
    "void goTo(Object router, String route) {",
    ...(spec.goRouter ? ["  (router as GoRouter).go(route);"] : []),
    "}",
    "",
    "/// Where the router is now; read loosely, as go_router's API differs between versions.",
    "String? goLocation(Object router) {",
    ...(spec.goRouter
      ? [
          "  try {",
          "    final dynamic config = (router as dynamic).routerDelegate.currentConfiguration;",
          "    return config.uri.toString() as String;",
          "  } catch (_) {",
          "    try {",
          "      return (router as dynamic).location as String;",
          "    } catch (_) {",
          "      return null;",
          "    }",
          "  }",
        ]
      : ["  return null;"]),
    "}",
    "",
    "/// What go_router said when it has no page for the location (it shows its error page then), or null.",
    "String? goMissing(Object router) {",
    ...(spec.goRouter
      ? [
          "  try {",
          "    final dynamic config = (router as dynamic).routerDelegate.currentConfiguration;",
          "    if (config.error != null) return '${config.error}';",
          "    if (config.isEmpty == true) return 'no page';",
          "  } catch (_) {}",
        ]
      : []),
    "  return null;",
    "}",
    "",
    "/// A --screen widget by its class name.",
    "Widget? screen(String name) {",
    ...spec.screens.map((s, i) => `  if (name == ${dartString(s.name)}) return s${i}.${s.name}();`),
    "  return null;",
    "}",
    "",
  ];
  return lines.join("\n");
}
