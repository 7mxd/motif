// What a SwiftUI app needs for the theme's fonts: project font files copied into the target's folder, and the lines that
// register them (UIAppFonts on iOS, ATSApplicationFontsPath on macOS). Google families have no package on Apple's
// platforms: the note says to bundle their files as project fonts.
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { AppInfo } from "../../detect/stacks";
import type { Theme } from "../../generate/theme";
import { themeFonts } from "../../generate/theme-fonts";
import { motifHome } from "../../home";
import { prefixPath } from "../../project/apps";
import { andList } from "../../text";
import { assetNames } from "../flutter/fonts";
import { buildsWholeFolder, type SwiftUIApp } from "./project";

/** Where project font files go inside the target's folder. */
export const FONTS_FOLDER = "Fonts";

const APPLE_FONT = /\.(ttf|otf)$/i;

const posix = (p: string) => p.replace(/\\/g, "/");
const inside = (dir: string, abs: string) => {
  const rel = relative(dir, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** What the app's Info.plist (in the target's folder or beside the project) already registers. */
function registered(appDir: string, sourceRoot: string): { uiAppFonts: string[]; fontsPath: boolean } {
  const out = { uiAppFonts: [] as string[], fontsPath: false };
  for (const plist of [join(appDir, sourceRoot, "Info.plist"), join(appDir, "Info.plist")]) {
    const text = read(plist) ?? "";
    const list = text.match(/<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? "";
    out.uiAppFonts.push(...[...list.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]!));
    if (/<key>ATSApplicationFontsPath<\/key>\s*<string>[^<]*<\/string>/.test(text)) out.fontsPath = true;
  }
  return out;
}

export interface SwiftUIFonts {
  /** Font files to copy into the app, root-relative. */
  copies: { from: string; to: string }[];
  notes: string[];
}

/** Letters and digits only, in lower case: how a file name is checked for its family's name. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The fonts list entry for a family Motif's screenshots cached, with the paths its files get in design/fonts/<Family>/. */
function cachedEntry(family: string, dir: string): string | null {
  let faces: unknown;
  try {
    faces = JSON.parse(readFileSync(join(dir, "files.json"), "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(faces)) return null;
  const files = (faces as { weight?: unknown; italic?: unknown; file?: unknown }[])
    .filter((f) => typeof f?.file === "string" && /^[A-Za-z0-9_-]+\.ttf$/.test(f.file) && Number.isInteger(f.weight))
    .map((f) => ({ path: `design/fonts/${family}/${f.file as string}`, weight: f.weight as number, style: f.italic === true ? "italic" : "normal" }));
  return files.length > 0 ? JSON.stringify({ family, files }, null, 2) : null;
}

/**
 * Project fonts copied into the target's Fonts folder, with how to register them; and, for families from Google Fonts,
 * how to bundle them (with Motif's own copies, when its screenshots downloaded them).
 */
export function swiftUIFonts(theme: Theme, root: string, app: AppInfo, swift: SwiftUIApp | null, home: string = motifHome()): SwiftUIFonts {
  const uses = themeFonts(theme);
  const copies: SwiftUIFonts["copies"] = [];
  const notes: string[] = [];
  const appDir = resolve(root, app.path);
  const sourceRoot = swift?.sourceRoot ?? ".";
  const srcDir = resolve(appDir, sourceRoot);
  const folder = prefixPath(app.path, sourceRoot === "." ? FONTS_FOLDER : `${sourceRoot}/${FONTS_FOLDER}`);
  const target = swift?.name ?? "app";

  // Files outside the target's folder are copied in. Xcode copies resources to the top of the app's bundle, so two
  // files that share a name get their folders' names in front, and a file whose name doesn't say its family
  // (regular.ttf) gets the family's.
  const outside = theme.projectFonts.flatMap((f) => f.files.map((file) => file.path)).filter((p) => APPLE_FONT.test(p) && !inside(srcDir, resolve(root, p)));
  const names = assetNames(outside);
  const bundled: string[] = [];
  const inPlace: string[] = [];
  for (const use of uses.filter((u) => u.source === "project")) {
    const font = theme.projectFonts.find((f) => f.family.toLowerCase() === use.family.toLowerCase());
    if (!font) continue;
    const files = font.files.filter((f) => APPLE_FONT.test(f.path));
    if (files.length === 0) {
      notes.push(`Apple's platforms can't use WOFF2: add a .ttf or .otf of ${font.family} to the guide's font files.`);
      continue;
    }
    for (const f of files) {
      if (inside(srcDir, resolve(root, f.path))) {
        bundled.push(basename(f.path));
        inPlace.push(posix(relative(root, resolve(root, f.path))));
        continue;
      }
      const asset = names.get(posix(f.path))!;
      const name = squash(asset).includes(squash(font.family)) ? asset : `${font.family.replace(/[^A-Za-z0-9-]+/g, "")}-${asset}`;
      if (!copies.some((c) => c.from === posix(f.path))) copies.push({ from: posix(f.path), to: `${folder}/${name}` });
      bundled.push(name);
    }
  }

  const unique = [...new Set(bundled)];
  if (unique.length > 0 && swift?.kind === "package") {
    notes.push(
      `A Swift package has no Info.plist for its fonts: add resources: [.copy("${FONTS_FOLDER}")] to the ${target} target in Package.swift, and register each font when the app starts, with CTFontManagerRegisterFontsForURL.`,
    );
  } else if (unique.length > 0) {
    const platforms = swift?.platforms ?? ["ios"];
    const has = registered(appDir, sourceRoot);
    const missing = unique.filter((n) => !has.uiAppFonts.includes(n));
    const lines: string[] = [];
    if (platforms.includes("ios") && missing.length > 0) lines.push("<key>UIAppFonts</key>", "<array>", ...missing.map((n) => `    <string>${n}</string>`), "</array>");
    // On macOS the fonts sit in the app's Resources folder, which the path is relative to.
    if (platforms.includes("macos") && !has.fontsPath) lines.push("<key>ATSApplicationFontsPath</key>", "<string>.</string>");
    const steps: string[] = [];
    if (lines.length > 0) {
      const key = lines[0] === "<key>UIAppFonts</key>" ? `"Fonts provided by application" (UIAppFonts) with these items` : `"Application fonts resource path" (ATSApplicationFontsPath)`;
      steps.push(`Register the theme's fonts: in Xcode, open the ${target} target's Info tab and add ${key}, or add these lines to its Info.plist:\n${lines.join("\n")}`);
    }
    const whole = swift !== null && buildsWholeFolder(appDir, swift);
    const addFiles = `(in Xcode: File › Add Files to "${target}"…, choose "Create groups" and tick the target)`;
    if (whole && copies.length > 0 && lines.length > 0) {
      steps.push(`Xcode already copies ${folder} into the app: ${sourceRoot} is a synchronized folder.`);
    } else if (!whole) {
      const then = () => (steps.length > 0 ? "Then add" : "Add");
      if (copies.length > 0) steps.push(`${then()} the ${folder} folder to the ${target} target ${addFiles}.`);
      if (inPlace.length > 0) steps.push(`${then()} ${andList(inPlace)} to the ${target} target too, unless ${inPlace.length === 1 ? "it's" : "they're"} in it already ${addFiles}.`);
    }
    if (steps.length > 0) notes.push(steps.join("\n"));
  }

  const google = uses.filter((u) => u.source === "google" || u.source === "bundled").map((u) => u.family);
  if (google.length > 0) {
    const one = google.length === 1;
    notes.push(
      `SwiftUI has no Google Fonts package, so the theme draws ${andList(google)} in the system font until the app bundles ${one ? "it" : "them"}. ` +
        `Download ${one ? "its" : "their"} .ttf files from fonts.google.com, add them to the guide's font files (the fonts list in design/tokens.json) and run motif tokens again: ` +
        `Motif then copies them into ${folder} and gives the lines that register them.`,
    );
    for (const family of google) {
      const dir = join(home, "fonts", "google", family);
      const entry = existsSync(join(dir, "files.json")) ? cachedEntry(family, dir) : null;
      if (!entry) continue;
      notes.push(
        `Motif already has ${family}'s .ttf files from its screenshots, in ${dir}. To bundle them, copy them into design/fonts/${family}/ and add this to the fonts list in design/tokens.json ($extensions › dev.motif › fonts):\n${entry}\n` +
          `As a project font, ${family} then loads from these files everywhere, the web stacks' theme and previews included, not from Google Fonts.`,
      );
    }
  }
  return { copies, notes };
}
