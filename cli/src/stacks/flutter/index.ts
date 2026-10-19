import { FLUTTER_IGNORES, listSourceFiles } from "../../check/files";
import { maskComments } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import type { Theme, ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import type { NativeStack } from "../native";
import { andList, flutterFonts } from "./fonts";
import { generateFlutter } from "./generate";
import { importFor } from "./project";

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
};
