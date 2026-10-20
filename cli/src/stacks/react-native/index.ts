import { readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { listRnFiles } from "../../check/files";
import { maskComments } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import type { ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import { andList, stripBom } from "../../text";
import { otherChanges } from "../flutter";
import type { NativeStack } from "../native";
import { rnDoctor } from "./doctor";
import { rnFonts } from "./fonts";
import { generateReactNative } from "./generate";
import { srcRoot } from "./project";

/** True when the app's own code (not Motif's file, and not a comment) uses MotifProvider. */
function usesTheme(root: string, app: AppInfo): boolean {
  return listRnFiles(root, app.path).some((f) => !isMotifGenerated(f.path, f.text) && maskComments(f.text, "script").includes("MotifProvider"));
}

/** Where the app's @/ alias points, relative to the app ("src" for "./src/*"), or null when tsconfig.json doesn't set one. */
function aliasBase(appDir: string): string | null {
  try {
    const tsconfig = JSON.parse(stripBom(readFileSync(join(appDir, "tsconfig.json"), "utf8")));
    const target = tsconfig?.compilerOptions?.paths?.["@/*"]?.[0];
    if (typeof target !== "string" || !target.endsWith("/*")) return null;
    return target.slice(0, -2).replace(/^\.\//, "").replace(/^\.$/, "");
  } catch {
    return null;
  }
}

/** How to import the theme file from the app's code: through the @/ alias when the app has one, else from the app's folder. */
function importPath(root: string, app: AppInfo, file: string): string {
  const appDir = resolve(root, app.path);
  const rel = relative(appDir, resolve(root, file)).replace(/\\/g, "/");
  const bare = rel.slice(0, rel.length - extname(rel).length);
  const base = aliasBase(appDir);
  if (base === null) return `./${bare}`;
  if (base === "") return `@/${bare}`;
  return bare.startsWith(`${base}/`) ? `@/${bare.slice(base.length + 1)}` : `./${bare}`;
}

/** How to choose a design variant in the provider, for the wiring note; nothing when the guide has none. */
function variantWiring(set: ThemeSet): string {
  if (set.variants.length === 0 || !set.defaultId) return "";
  const ids = [set.defaultId, ...set.variants.map((v) => v.id)].map((v) => JSON.stringify(v));
  const orList = ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} or ${ids[ids.length - 1]}`;
  return (
    ` Your guide has design variants (${andList([set.defaultLabel ?? set.defaultId, ...set.variants.map((v) => v.label)])}): ` +
    `<MotifProvider variant=${ids[0]}> chooses one (${orList}; ${ids[0]} when you pass none). ` +
    "To switch at runtime, keep the chosen variant in your app's state and pass it to MotifProvider."
  );
}

/** React Native with Expo. Its screenshots reuse the browser pipeline (Expo's web target); the parts later tasks add are not here yet. */
export const REACT_NATIVE: NativeStack = {
  id: "react-native",
  extensions: [".ts", ".tsx", ".js", ".jsx"],

  themeDir: (root, app) => app.themeDir ?? prefixPath(app.path, prefixPath(srcRoot(resolve(root, app.path)), "design")),

  generate(set, { root, app, themeDir }) {
    const fonts = rnFonts(set.base, root, app, themeDir);
    const files = generateReactNative(set, fonts).map((f) => ({ path: `${themeDir}/${f.path}`, content: f.content }));
    const notes = [...fonts.notes];
    for (const v of set.variants) {
      const other = otherChanges(set.base, v.theme);
      if (other.length > 0) {
        notes.push(`The ${v.label} variant also changes ${andList(other)}. React Native theme code gives each variant its own colours only, so it uses the default ${andList(other)}.`);
      }
    }
    return { files, copies: fonts.copies, notes };
  },

  wiring(root, app, file, set) {
    if (usesTheme(root, app)) return null;
    return (
      `Next: wrap your root layout in <MotifProvider> (import from ${importPath(root, app, file)}), ` +
      "load motifFonts with useFonts from expo-font before rendering, and read colours with useMotifTheme()." +
      (set ? variantWiring(set) : "")
    );
  },

  sourceFiles: (root, app, { ignore }) => listRnFiles(root, app.path, { ignore }),

  doctor: rnDoctor,
};
