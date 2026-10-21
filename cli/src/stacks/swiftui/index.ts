import { basename, join, relative, resolve } from "node:path";
import { listAssetCatalogFiles, listSwiftFiles } from "../../check/files";
import { maskComments } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import { variantChanges, type ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import { andList } from "../../text";
import { swiftIdentifier } from "../naming";
import type { NativeStack } from "../native";
import { swiftUIDoctor } from "./doctor";
import { collectSwiftUI } from "./extract";
import { scanSwift, swiftUIFix, swiftUIReducedMotion, swiftUIRole } from "./rules";
import { swiftUIFonts } from "./fonts";
import { generateSwiftUI, THEME_FILE } from "./generate";
import { swiftUIPaletteFile } from "./palette";
import { appEntryFile, buildsWholeFolder, swiftUIApp } from "./project";
import { shootSwiftUI, SWIFTUI_VARIANT_HOW, swiftUIInputsProblem, swiftUIRoutes, swiftUIShotRefusal, swiftUIShotSizes, swiftUITimeLimit } from "./shot";

/** The app target's folder, root-relative. */
const targetFolder = (app: AppInfo, sourceRoot: string) => prefixPath(app.path, sourceRoot);

/** True when the root-relative path is inside the root-relative folder. */
function within(folder: string, path: string): boolean {
  const rel = relative(resolve("/", folder), resolve("/", path));
  return rel !== "" && !rel.startsWith("..");
}

/** How to choose a design variant, for the wiring note; nothing when the guide has none. */
function variantWiring(set: ThemeSet): string {
  if (set.variants.length === 0 || !set.defaultId) return "";
  const id = (v: string) => `.${swiftIdentifier(v)}`;
  const def = id(set.defaultId);
  return (
    ` Your guide has design variants (${andList([set.defaultLabel ?? set.defaultId, ...set.variants.map((v) => v.label)])}): ` +
    `.motifTheme(variant: ${def}) chooses one (${andList([def, ...set.variants.map((v) => id(v.id))])}; ${def} when you pass none). ` +
    `To switch at runtime, keep the variant's rawValue in @AppStorage and pass MotifVariant(rawValue: stored) ?? ${def} to .motifTheme(variant:).`
  );
}

/** True when the app's own Swift code (not Motif's file, and not a comment) applies .motifTheme(. */
function usesTheme(root: string, app: AppInfo): boolean {
  return listSwiftFiles(root, app.path).some((f) => !isMotifGenerated(f.path, f.text) && /\.motifTheme\s*\(/.test(maskComments(f.text, "swift")));
}

/** SwiftUI: apps in Xcode projects and Swift packages. Each area is added as it is built. */
export const SWIFTUI: NativeStack = {
  id: "swiftui",
  extensions: [".swift"],

  doctor: swiftUIDoctor,

  // The theme sits in the app target's own folder, which an Xcode 16 synchronized group or a package target compiles as it is.
  themeDir(root, app) {
    if (app.themeDir) return app.themeDir;
    const sourceRoot = swiftUIApp(join(root, app.path))?.sourceRoot;
    return prefixPath(app.path, `${sourceRoot && sourceRoot !== "." ? `${sourceRoot}/` : ""}Design`);
  },

  generate(set: ThemeSet, { root, app, themeDir }) {
    const swift = swiftUIApp(join(root, app.path));
    const fonts = swiftUIFonts(set.base, root, app, swift);
    const files = generateSwiftUI(set).map((f) => ({ path: `${themeDir}/${f.path}`, content: f.content }));
    const notes = [...fonts.notes];
    if (swift?.kind === "package" && !within(targetFolder(app, swift.sourceRoot), files[0]!.path)) {
      const folder = targetFolder(app, swift.sourceRoot);
      notes.push(
        `${themeDir} isn't inside the ${swift.name} target's folder (${folder}), so Swift Package Manager won't build ${THEME_FILE}. ` +
          `Set themeDir in design/motif.json to a folder under ${folder} and run motif tokens again.`,
      );
    }
    for (const v of set.variants) {
      const other = variantChanges(set.base, v.theme);
      if (other.length > 0) {
        notes.push(`The ${v.label} variant also changes ${andList(other)}. SwiftUI theme code gives each variant its own colours only, so it uses the default ${andList(other)}.`);
      }
    }
    return { files, copies: fonts.copies, notes };
  },

  wiring(root, app, file, set) {
    if (!file.endsWith(`/${THEME_FILE}`) && file !== THEME_FILE) return null;
    if (usesTheme(root, app)) return null;
    const appDir = join(root, app.path);
    const swift = swiftUIApp(appDir);
    const entry = swift ? appEntryFile(appDir, swift) : null;
    const entryName = entry ? basename(entry) : `${swift?.name ?? "Your"}App.swift`;
    const use =
      `apply .motifTheme() to your root view in ${entryName} (WindowGroup { ContentView().motifTheme() }), ` +
      "then read colours in your views with @Environment(\\.motifColors) private var colors, type with .motifFont(.body) and sizes with MotifSpace.";
    const variants = set ? variantWiring(set) : "";
    const inTarget = swift !== null && within(targetFolder(app, swift.sourceRoot), file);
    if (swift?.kind === "package") {
      // Outside the target's folder, generate's note says to move it.
      return `Next: ${use}${inTarget ? ` Swift Package Manager already builds ${file} into the ${swift.name} target.` : ""}${variants}`;
    }
    if (swift && inTarget && buildsWholeFolder(appDir, swift)) {
      return `Next: ${use} Xcode already builds ${file} into the ${swift.name} target: ${swift.sourceRoot} is a synchronized folder.${variants}`;
    }
    const target = swift?.name ?? "app";
    return `Next: add ${file} to the ${target} target (in Xcode: File › Add Files to "${target}"…), then ${use}${variants}`;
  },

  sourceFiles: (root, app, { ignore }) => listSwiftFiles(root, app.path, { ignore }),
  extractFiles: (root, app, { ignore }) => listAssetCatalogFiles(root, app.path, { ignore }),
  collect: collectSwiftUI,
  scan: scanSwift,
  // Motif's own file defines MotifMotion: only the app's code says whether it respects Reduce Motion.
  appWide: (files) => swiftUIReducedMotion(files),
  fix: swiftUIFix,
  paletteFile: swiftUIPaletteFile,
  role: swiftUIRole,

  // Screens drawn in an iOS simulator by a test Motif adds to a copy of the app (decision 0010).
  stateFiles: { extension: ".swift", language: "Swift" },
  shoot: (opts) => shootSwiftUI(opts, { themeDir: SWIFTUI.themeDir(opts.root, opts.app) }),
  shotRefusal: (root, app, _which, doctor, sizes) => (doctor ? swiftUIShotRefusal(root, app, doctor, sizes) : null),
  shotInputsProblem: swiftUIInputsProblem,
  shotSizes: swiftUIShotSizes,
  shotTimeLimit: swiftUITimeLimit,
  variantHow: SWIFTUI_VARIANT_HOW,
  routes: swiftUIRoutes,
};
