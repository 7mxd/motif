// What a React Native (Expo) app needs for the theme's fonts: project font files copied in, the Google font packages,
// and the other packages the theme file imports.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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

/**
 * The face names an @expo-google-fonts package exports, read from the copy Node would find from the app's folder
 * upward (a workspace hoists it to the repo root). "missing" when no copy is there; "unknown" when the copy's file
 * doesn't list faces in a form Motif reads.
 */
function exportedFaces(appDir: string, pkg: string): Set<string> | "missing" | "unknown" {
  for (let dir = resolve(appDir); ; dir = dirname(dir)) {
    try {
      const text = readFileSync(join(dir, "node_modules", pkg, "index.d.ts"), "utf8");
      const faces = new Set([...text.matchAll(/export\s+(?:declare\s+)?const\s+(\w+)/g)].map((m) => m[1]!));
      return faces.size > 0 ? faces : "unknown";
    } catch {
      // not here: look in the parent folder
    }
    if (dirname(dir) === dir) return "missing";
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
  const unresolved = new Set<string>();
  const unreadable = new Set<string>();
  const missing: string[] = [];
  for (const use of uses.filter((u) => u.source === "google" || u.source === "bundled")) {
    const pkg = googlePackage(use.family);
    if (declared(appDir, pkg) === null) {
      if (!missing.includes(pkg)) missing.push(pkg);
      continue;
    }
    googlePackages.set(use.family, pkg);
    const have = exportedFaces(appDir, pkg);
    const prefix = use.family.replace(/[^A-Za-z0-9]/g, "");
    if (have === "missing") unresolved.add(pkg);
    else if (have === "unknown" || ![...have].some((f) => f.startsWith(`${prefix}_`))) {
      unresolved.add(pkg);
      unreadable.add(pkg);
    } else faces.set(pkg, have);
  }

  const noReanimated = declared(appDir, "react-native-reanimated") === null;
  const needed = [
    ...(declared(appDir, "expo-font") === null ? ["expo-font"] : []),
    ...missing,
    ...(noReanimated ? ["react-native-reanimated"] : []),
    // Reanimated 4 (Expo SDK 54 and later) takes its worklets from a package of their own.
    ...(noReanimated && (expoSdk(appDir) ?? 0) >= 54 && declared(appDir, "react-native-worklets") === null ? ["react-native-worklets"] : []),
  ];
  if (needed.length > 0) {
    notes.push(`Your app needs packages it doesn't list yet (useFonts comes from expo-font, and the theme file imports the rest). Install them, then run motif tokens again:
npx expo install ${needed.join(" ")}`);
  }
  for (const pkg of unresolved) {
    if (unreadable.has(pkg)) {
      notes.push(`Motif couldn't read which weights ${pkg} has, so its roles use the regular face. Reinstall it, then run motif tokens again.`);
      continue;
    }
    notes.push(`${pkg} is in package.json but isn't installed, so the theme file uses only its regular (400) face. Install it and run motif tokens again to use its other weights.`);
  }
  return { copies, notes, googlePackages, projectFonts, faces, unresolved };
}
