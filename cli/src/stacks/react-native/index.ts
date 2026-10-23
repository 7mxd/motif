import { existsSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { listRnFiles } from "../../check/files";
import { maskComments } from "../../check/mask";
import type { AppInfo } from "../../detect/stacks";
import { isMotifGenerated } from "../../generate/header";
import type { RawIssue } from "../../shot/audit";
import { variantChanges, type ThemeSet } from "../../generate/theme";
import { prefixPath } from "../../project/apps";
import { andList } from "../../text";
import type { NativeStack } from "../native";
import { rnDoctor } from "./doctor";
import { collectReactNative } from "./extract";
import { rnFonts } from "./fonts";
import { generateReactNative } from "./generate";
import { aliasBase, declared, srcRoot, usesExpoRouter } from "./project";
import { discoverExpoRoutes } from "./routes";
import { rnFix, rnPaletteFile, rnReducedMotion, rnRole, scanReactNative } from "./rules";

/** True when the app's own code (not Motif's file, and not a comment) uses MotifProvider. */
function usesTheme(root: string, app: AppInfo): boolean {
  return listRnFiles(root, app.path).some((f) => !isMotifGenerated(f.path, f.text) && maskComments(f.text, "script").includes("MotifProvider"));
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

/** What to wrap in MotifProvider: Expo Router's root layout, or the component an app without it registers (App.tsx). */
function rootComponent(appDir: string): string {
  if (usesExpoRouter(appDir)) return "your root layout";
  const app = [".tsx", ".jsx", ".ts", ".js"].map((ext) => `App${ext}`).find((f) => existsSync(join(appDir, f)) || existsSync(join(appDir, "src", f)));
  return app ? `your root component (${existsSync(join(appDir, app)) ? app : `src/${app}`})` : "your root component";
}

/** How a design variant is set in Expo apps, for the note when a variant looks the same as the default. */
export const RN_VARIANT_HOW = "MotifProvider, which follows data-variant on the web";
/** Expo apps are drawn at phone sizes only, so the reduced-motion check runs at a phone. */
export const RN_MOTION_SIZE = { width: 390, text: "the 390 px phone size" };
/** Expo's first web bundle can take a minute or more, so its server gets longer to start than a web app's (ms). */
export const RN_START_TIMEOUT_MS = 300_000;
/** What to do about each audit problem in a React Native app, in its own terms (the web's fixes name CSS and ARIA). */
export const RN_FIXES: Partial<Record<RawIssue["rule"], string>> = {
  "target-size": "Make it at least 24×24 px: padding, a larger size, or hitSlop (which widens the area that counts as a tap without changing how it looks).",
  "target-mobile": "Give it at least 44×44 px: a minimum width and height, padding, or hitSlop (which widens the tap area without changing how it looks).",
  motion: "Check useReducedMotion() (or useMotifTheme().reducedMotion) and keep Reanimated's ReduceMotion.System; for core Animated, check AccessibilityInfo.isReduceMotionEnabled.",
  name: "Give it an accessibilityLabel (or visible text).",
};
/** What the first run says about its screenshots. */
export const RN_WEB_NOTE = "React Native screenshots are of Expo's web target in Chrome: close to the app, but native-only components and platform fonts can differ.";

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
      const other = variantChanges(set.base, v.theme);
      if (other.length > 0) {
        notes.push(`The ${v.label} variant also changes ${andList(other)}. React Native theme code gives each variant its own colours only, so it uses the default ${andList(other)}.`);
      }
    }
    return { files, copies: fonts.copies, notes };
  },

  wiring(root, app, file, set) {
    if (usesTheme(root, app)) return null;
    return (
      `Next: wrap ${rootComponent(resolve(root, app.path))} in <MotifProvider> (import from ${importPath(root, app, file)}), ` +
      "load motifFonts with useFonts from expo-font before rendering, and read colours with useMotifTheme()." +
      (set ? variantWiring(set) : "")
    );
  },

  sourceFiles: (root, app, { ignore }) => listRnFiles(root, app.path, { ignore }),

  // Tailwind classes are read only when the app uses nativewind.
  scan: (file, scale, ctx) => scanReactNative(file, scale, { nativewind: ctx !== undefined && declared(resolve(ctx.root, ctx.app.path), "nativewind") !== null }),
  // Motif's own file reads the reduce-motion setting itself: only the app's code says whether it respects it.
  appWide: (files) => rnReducedMotion(files),
  fix: rnFix,
  paletteFile: rnPaletteFile,
  role: rnRole,

  collect: collectReactNative,

  routes: discoverExpoRoutes,

  variantHow: RN_VARIANT_HOW,
  motionSize: RN_MOTION_SIZE,

  doctor: rnDoctor,
};
