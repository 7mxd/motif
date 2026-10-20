// What a React Native (Expo) app needs for the theme's fonts: project font files copied in, the Google font packages,
// and the other packages the theme file imports.
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { AppInfo } from "../../detect/stacks";
import type { Theme } from "../../generate/theme";
import { themeFonts } from "../../generate/theme-fonts";
import { prefixPath } from "../../project/apps";
import { assetNames, FONT_ASSETS } from "../flutter/fonts";
import { declared, expoSdk } from "./project";
import type { RnOptions } from "./generate";

const RN_FONT = /\.(ttf|otf)$/i;

export interface RnFonts extends RnOptions {
  /** Font files to copy into the app, root-relative. */
  copies: { from: string; to: string }[];
  notes: string[];
}

const posix = (p: string) => p.replace(/\\/g, "/");
const inside = (dir: string, abs: string) => {
  const rel = relative(dir, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** The @expo-google-fonts package for a family: Readex Pro → @expo-google-fonts/readex-pro. */
export function googlePackage(family: string): string {
  return `@expo-google-fonts/${family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** The face names an installed @expo-google-fonts package exports, or null when it isn't installed. */
function exportedFaces(appDir: string, pkg: string): Set<string> | null {
  try {
    const text = readFileSync(join(appDir, "node_modules", pkg, "index.d.ts"), "utf8");
    return new Set([...text.matchAll(/export const (\w+):/g)].map((m) => m[1]!));
  } catch {
    return null;
  }
}

/** The path to require a file with, from the theme folder: relative, and starting with ./ or ../ . */
function requirePath(fromDir: string, file: string): string {
  const rel = posix(relative(fromDir, file));
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Fonts for the theme file: the Google packages the app has, project fonts copied in, and notes for what's missing. */
export function rnFonts(theme: Theme, root: string, app: AppInfo, themeDir: string): RnFonts {
  const uses = themeFonts(theme);
  const appDir = resolve(root, app.path);
  const fromDir = resolve(root, themeDir);
  const copies: RnFonts["copies"] = [];
  const notes: string[] = [];
  const projectFonts: RnFonts["projectFonts"] = [];

  const outside = theme.projectFonts.flatMap((f) => f.files.map((file) => file.path)).filter((p) => RN_FONT.test(p) && !inside(appDir, resolve(root, p)));
  const names = assetNames(outside);
  for (const use of uses.filter((u) => u.source === "project")) {
    const font = theme.projectFonts.find((f) => f.family.toLowerCase() === use.family.toLowerCase());
    if (!font) continue;
    const files = font.files.filter((f) => RN_FONT.test(f.path));
    if (files.length === 0) {
      notes.push(`React Native can't use WOFF2: add a .ttf or .otf of ${font.family} to the guide's font files.`);
      continue;
    }
    for (const f of files) {
      const abs = resolve(root, f.path);
      let target = abs;
      if (!inside(appDir, abs)) {
        const asset = `${FONT_ASSETS}/${names.get(posix(f.path))}`;
        target = resolve(appDir, asset);
        if (!copies.some((c) => c.from === posix(f.path))) copies.push({ from: posix(f.path), to: prefixPath(app.path, asset) });
      }
      projectFonts.push({ family: font.family, weight: f.weight, style: f.style, asset: requirePath(fromDir, target) });
    }
  }

  const googlePackages = new Map<string, string>();
  const faces = new Map<string, Set<string>>();
  const missing: string[] = [];
  for (const use of uses.filter((u) => u.source === "google" || u.source === "bundled")) {
    const pkg = googlePackage(use.family);
    if (declared(appDir, pkg) === null) {
      if (!missing.includes(pkg)) missing.push(pkg);
      continue;
    }
    googlePackages.set(use.family, pkg);
    const have = exportedFaces(appDir, pkg);
    if (have) faces.set(pkg, have);
  }

  const needed = [
    ...(declared(appDir, "expo-font") === null ? ["expo-font"] : []),
    ...missing,
    ...(declared(appDir, "react-native-reanimated") === null ? ["react-native-reanimated"] : []),
    // Reanimated 4 (Expo SDK 54 and later) takes its worklets from a package of their own.
    ...((expoSdk(appDir) ?? 0) >= 54 && declared(appDir, "react-native-worklets") === null ? ["react-native-worklets"] : []),
  ];
  if (needed.length > 0) {
    notes.push(`The theme file imports packages your app doesn't list yet. Install them, then run motif tokens again:\nnpx expo install ${needed.join(" ")}`);
  }
  return { copies, notes, googlePackages, projectFonts, faces };
}
