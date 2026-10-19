import { isAbsolute, relative, resolve, sep } from "node:path";
import { FLUTTER_IGNORES, listSourceFiles, type SourceFile } from "../../check/files";
import { maskComments } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import type { Theme, ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import type { NativeStack } from "../native";
import { andList } from "../../text";
import { collectFlutter } from "./extract";
import { flutterFonts } from "./fonts";
import { generateFlutter } from "./generate";
import { importFor, pathDependencies } from "./project";
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

/** True when the app's own Dart code (not Motif's file, and not a comment) uses MotifTheme. */
function usesTheme(root: string, app: AppInfo): boolean {
  return listSourceFiles(root, app.path, { langs: { ".dart": "dart" }, extraIgnores: FLUTTER_IGNORES }).some(
    (f) => !isMotifGenerated(f.path, f.text) && maskComments(f.text, "dart").includes("MotifTheme."),
  );
}

export const FLUTTER: NativeStack = {
  id: "flutter",

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

  wiring(root, app, file) {
    if (usesTheme(root, app)) return null;
    const target = importFor(root, file);
    if (target) return `Next: import ${target} and set theme: MotifTheme.light(), darkTheme: MotifTheme.dark() on your MaterialApp.`;
    return (
      `Next: import motif_theme.dart (${file}) in your app's code and set theme: MotifTheme.light(), darkTheme: MotifTheme.dark() on your MaterialApp. ` +
      "It can be imported as package: only from inside a package's lib/ folder (with a name: in its pubspec.yaml): if it isn't, set themeDir in design/motif.json to a folder under your app's lib/ and run motif tokens again."
    );
  },

  sourceFiles: (root, app, { ignore }) => listSourceFiles(root, app.path, { ignore, langs: { ".dart": "dart" }, extraIgnores: FLUTTER_IGNORES }),

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
      const own = listSourceFiles(root, prefixPath(rel.split(sep).join("/") || ".", "lib"), { ignore, langs: { ".dart": "dart" }, extraIgnores: FLUTTER_IGNORES });
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
};
