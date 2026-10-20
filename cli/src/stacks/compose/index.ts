import { join } from "node:path";
import { listKotlinFiles } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import { variantChanges, type ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import { andList } from "../../text";
import { kotlinIdentifier } from "../naming";
import type { NativeStack } from "../native";
import { composeDoctor } from "./doctor";
import { composeFonts } from "./fonts";
import { generateCompose, THEME_FILE } from "./generate";
import { composeModule, packageFolder } from "./project";

/** The Kotlin package of a folder inside a source folder (app/src/main/java/com/example/ui → com.example.ui), or null outside one. */
export function folderPackage(dir: string): string | null {
  const m = `/${dir.replace(/\\/g, "/").replace(/\/+$/, "")}`.match(/\/src\/[^/]+\/(?:java|kotlin)(?:\/(.*))?$/);
  return m ? (m[1] ?? "").split("/").filter(Boolean).join(".") : null;
}

/** The package the theme file declares: its folder's below the source folder, or the module's own ui.motif outside one. */
function themePackage(root: string, app: AppInfo, themeDir: string): string {
  const own = folderPackage(themeDir);
  if (own !== null) return own;
  const namespace = composeModule(join(root, app.path))?.namespace;
  return namespace ? `${namespace}.ui.motif` : "ui.motif";
}

/** How to choose a design variant, for the wiring note; nothing when the guide has none. */
function variantWiring(set: ThemeSet): string {
  if (set.variants.length === 0 || !set.defaultId) return "";
  const id = (v: string) => `MotifVariant.${kotlinIdentifier(v)}`;
  const def = id(set.defaultId);
  return (
    ` Your guide has design variants (${andList([set.defaultLabel ?? set.defaultId, ...set.variants.map((v) => v.label)])}): ` +
    `MotifTheme(variant = ${def}) chooses one (${andList([def, ...set.variants.map((v) => id(v.id))])}; ${def} when you pass none). ` +
    "To switch at runtime, keep the chosen MotifVariant in your app's state (rememberSaveable, or a ViewModel's StateFlow) and pass it to MotifTheme."
  );
}

/** True when the app's own Kotlin code (not Motif's file, and not a comment or a string) calls MotifTheme. */
function usesTheme(root: string, app: AppInfo): boolean {
  return listKotlinFiles(root, app.path).some(
    (f) => !isMotifGenerated(f.path, f.text) && /\bMotifTheme\s*[({]/.test(maskStrings(maskComments(f.text, "kotlin"), "kotlin")),
  );
}

export const COMPOSE: NativeStack = {
  id: "compose",
  extensions: [".kt"],

  // <module>/<sourceRoot>/<namespace path>/ui/motif, so the theme sits in the app's own package.
  themeDir(root, app) {
    if (app.themeDir) return app.themeDir;
    const mod = composeModule(join(root, app.path));
    const sourceRoot = mod?.sourceRoot ?? "src/main/java";
    const pkg = mod?.namespace ? `${packageFolder(mod.namespace)}/` : "";
    return prefixPath(app.path, `${sourceRoot}/${pkg}ui/motif`);
  },

  generate(set: ThemeSet, { root, app, themeDir }) {
    const mod = composeModule(join(root, app.path));
    const fonts = composeFonts(set.base, root, app);
    const packageName = themePackage(root, app, themeDir);
    const files = generateCompose(set, {
      packageName,
      rPackage: mod?.namespace ?? packageName,
      googleFonts: fonts.googleFonts,
      resFonts: fonts.resFonts,
    }).map((f) => ({ path: `${themeDir}/${f.path}`, content: f.content }));
    const notes = [...fonts.notes];
    if (folderPackage(themeDir) === null) {
      const sources = prefixPath(app.path, mod?.sourceRoot ?? "src/main/java");
      notes.push(
        `${themeDir} isn't inside a Kotlin source folder (like ${sources}), so Gradle won't compile ${THEME_FILE}. ` +
          `Set themeDir in design/motif.json to a folder under ${sources} and run motif tokens again.`,
      );
    }
    for (const v of set.variants) {
      const other = variantChanges(set.base, v.theme);
      if (other.length > 0) {
        notes.push(`The ${v.label} variant also changes ${andList(other)}. Compose theme code gives each variant its own colours only, so it uses the default ${andList(other)}.`);
      }
    }
    return { files: [...files, ...fonts.files], copies: fonts.copies, notes };
  },

  wiring(root, app, file, set) {
    if (!file.endsWith(`/${THEME_FILE}`) || usesTheme(root, app)) return null;
    const pkg = folderPackage(file.slice(0, -THEME_FILE.length - 1)) ?? themePackage(root, app, file);
    const target = pkg ? `${pkg}.MotifTheme` : "MotifTheme";
    return `Next: wrap your setContent in MotifTheme { … } (import ${target}) in place of the template's own theme.${set ? variantWiring(set) : ""}`;
  },

  sourceFiles: (root, app, { ignore }) => listKotlinFiles(root, app.path, { ignore }),
  doctor: composeDoctor,
};
