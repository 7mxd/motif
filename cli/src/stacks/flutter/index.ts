import { isAbsolute, relative, resolve, sep } from "node:path";
import { listDartFiles, type SourceFile } from "../../check/files";
import { maskComments } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import type { Theme, ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import type { NativeStack } from "../native";
import { andList } from "../../text";
import { collectFlutter } from "./extract";
import { flutterDoctor } from "./doctor";
import { flutterFonts } from "./fonts";
import { generateFlutter } from "./generate";
import { dartPaletteFile } from "./palette";
import { importFor, pathDependencies } from "./project";
import { dartIdentifier } from "../naming";
import { dartFix, dartReducedMotion, dartRole, scanDart } from "./rules";
import { discoverFlutterRoutes } from "./routes";
import { FLUTTER_VARIANT_HOW, flutterShotRefusal, flutterTimeLimit, MOTION_WIDTH, readShotInputs, shootFlutter } from "./shot";

/** What else a variant changes besides colours, in plain words. */
function otherChanges(base: Theme, variant: Theme): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const groups: [string, (t: Theme) => unknown][] = [
    ["spacing", (t) => t.space],
    ["corners", (t) => t.radius],
    ["shadows", (t) => t.shadows],
    ["type", (t) => t.fonts],
    ["motion", (t) => [t.durations, t.easings, t.springs]],
  ];
  return groups.filter(([, pick]) => !same(pick(base), pick(variant))).map(([name]) => name);
}

/** How to choose a design variant in the theme, for the wiring note; nothing when the guide has none. */
function variantWiring(set: ThemeSet): string {
  if (set.variants.length === 0 || !set.defaultId) return "";
  const id = (v: string) => `MotifVariant.${dartIdentifier(v)}`;
  const def = id(set.defaultId);
  return (
    ` Your guide has design variants (${andList([set.defaultLabel ?? set.defaultId, ...set.variants.map((v) => v.label)])}): ` +
    `MotifTheme.light(variant: ${def}) and MotifTheme.dark(variant: ${def}) choose one (${andList([def, ...set.variants.map((v) => id(v.id))])}; ${def} when you pass none). ` +
    "To switch at runtime, keep the chosen MotifVariant in your app's state (a provider or a ValueNotifier) and build MaterialApp's theme and darkTheme from it."
  );
}

/** True when the app's own Dart code (not Motif's file, and not a comment) uses MotifTheme. */
function usesTheme(root: string, app: AppInfo): boolean {
  return listDartFiles(root, app.path).some(
    (f) => !isMotifGenerated(f.path, f.text) && maskComments(f.text, "dart").includes("MotifTheme."),
  );
}

export const FLUTTER: NativeStack = {
  id: "flutter",
  extensions: [".dart"],
  stateFiles: { extension: ".dart", language: "Dart" },

  themeDir: (_root, app) => app.themeDir ?? prefixPath(app.path, "lib/design"),

  generate(set: ThemeSet, { root, app, themeDir }) {
    const fonts = flutterFonts(set.base, root, app, themeDir);
    const files = generateFlutter(set, { googleFonts: fonts.googleFonts }).map((f) => ({ path: `${themeDir}/${f.path}`, content: f.content }));
    const notes = [...fonts.notes];
    for (const v of set.variants) {
      const other = otherChanges(set.base, v.theme);
      if (other.length > 0) {
        notes.push(`The ${v.label} variant also changes ${andList(other)}. Flutter theme code gives each variant its own colours only, so it uses the default ${andList(other)}.`);
      }
    }
    return { files, copies: fonts.copies, notes };
  },

  wiring(root, app, file, set) {
    if (usesTheme(root, app)) return null;
    const target = importFor(root, file);
    const variants = set ? variantWiring(set) : "";
    if (target) return `Next: import ${target} and set theme: MotifTheme.light(), darkTheme: MotifTheme.dark() on your MaterialApp.${variants}`;
    return (
      `Next: import motif_theme.dart (${file}) in your app's code and set theme: MotifTheme.light(), darkTheme: MotifTheme.dark() on your MaterialApp.${variants} ` +
      "It can be imported as package: only from inside a package's lib/ folder (with a name: in its pubspec.yaml): if it isn't, set themeDir in design/motif.json to a folder under your app's lib/ and run motif tokens again."
    );
  },

  sourceFiles: (root, app, { ignore }) => listDartFiles(root, app.path, { ignore }),

  // The packages the app's pubspec.yaml takes from a folder (core: path: ../packages/core): their lib/ Dart files, one
  // level only. A folder outside the project isn't read.
  sharedFiles(root, app, { ignore }) {
    const top = resolve(root);
    const appDir = resolve(root, app.path);
    const files: SourceFile[] = [];
    const read: string[] = [];
    const notes: string[] = [];
    for (const dep of pathDependencies(appDir)) {
      const dir = resolve(appDir, dep.path);
      const rel = relative(top, dir);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        notes.push(`The ${dep.name} package (${dep.path}) is outside the project, so its theme code wasn't read.`);
        continue;
      }
      if (dir === appDir) continue;
      // Listed from the package's folder, so its own .gitignore and the generated-file patterns (lib/generated/) apply there.
      const pkg = rel.split(sep).join("/") || ".";
      const own = listDartFiles(root, pkg, { ignore, paths: [prefixPath(pkg, "lib")] });
      if (own.length === 0) continue;
      files.push(...own);
      read.push(`${dep.name} (${rel.split(sep).join("/")})`);
    }
    if (read.length > 0) notes.push(`The theme code of the shared ${read.length === 1 ? "package" : "packages"} ${andList(read)} was read too.`);
    return { files, notes };
  },
  scan: scanDart,
  // Motif's own file defines MotifMotion and reads disableAnimations: only the app's code says whether it respects reduce motion.
  appWide: (files) => dartReducedMotion(files),
  fix: dartFix,
  paletteFile: dartPaletteFile,
  role: dartRole,
  collect: collectFlutter,

  // Screens drawn by flutter test through Motif's harness (decision 0007). google_fonts families are looked for in the
  // shared packages' code too.
  shoot: (opts) =>
    shootFlutter(opts, {
      themeDir: FLUTTER.themeDir(opts.root, opts.app),
      sharedCode: () => FLUTTER.sharedFiles!(opts.root, opts.app, {}).files.map((f) => f.text),
    }),
  shotRefusal: (root, app, which) => flutterShotRefusal(resolve(root, app.path), app.path, which("flutter")),
  shotInputsProblem: (root, app, given) => {
    const read = readShotInputs(resolve(root), resolve(root, app.path), given);
    return "error" in read ? read.error : null;
  },
  motionSize: { width: MOTION_WIDTH, text: `the ${MOTION_WIDTH} px phone size` },
  shotTimeLimit: flutterTimeLimit,
  variantHow: FLUTTER_VARIANT_HOW,
  routes: discoverFlutterRoutes,
  doctor: flutterDoctor,
};
