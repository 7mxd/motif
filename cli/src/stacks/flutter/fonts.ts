// What a Flutter app needs for the theme's fonts: project font files copied in, the pubspec block, google_fonts.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AppInfo } from "../../detect/stacks";
import type { Theme } from "../../generate/theme";
import { themeFonts } from "../../generate/theme-fonts";
import { prefixPath } from "../../project/apps";
import { stripBom } from "../../text";
import { dependsOn } from "./project";

/** Where project font files go inside an app, when they aren't in it already. */
export const FONT_ASSETS = "assets/fonts";

const FLUTTER_FONT = /\.(ttf|otf)$/i;

export interface FlutterFonts {
  /** Font files to copy into the app, root-relative. */
  copies: { from: string; to: string }[];
  notes: string[];
  /** Whether the theme code may load fonts with google_fonts. */
  googleFonts: boolean;
}

const posix = (p: string) => p.replace(/\\/g, "/");
const inside = (dir: string, abs: string) => {
  const rel = relative(dir, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The folder of the package that holds the theme folder (its nearest pubspec.yaml), root-relative; the app's otherwise. */
export function packageOf(root: string, app: AppInfo, themeDir: string): string {
  const top = resolve(root);
  for (let dir = resolve(root, themeDir); inside(top, dir) || dir === top; dir = dirname(dir)) {
    if (existsSync(join(dir, "pubspec.yaml"))) return posix(relative(top, dir)) || ".";
    if (dir === top) break;
  }
  return app.path;
}

function pubspecText(dir: string): string {
  try {
    return stripBom(readFileSync(join(dir, "pubspec.yaml"), "utf8"));
  } catch {
    return "";
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Project fonts copied into the app with the pubspec block to add, and whether google_fonts can load the rest. */
export function flutterFonts(theme: Theme, root: string, app: AppInfo, themeDir: string): FlutterFonts {
  const uses = themeFonts(theme);
  const copies: FlutterFonts["copies"] = [];
  const notes: string[] = [];
  const appDir = resolve(root, app.path);
  const pubspec = pubspecText(appDir);
  const blocks: string[] = [];

  for (const use of uses.filter((u) => u.source === "project")) {
    const font = theme.projectFonts.find((f) => f.family.toLowerCase() === use.family.toLowerCase());
    if (!font) continue;
    const files = font.files.filter((f) => FLUTTER_FONT.test(f.path));
    if (files.length === 0) {
      notes.push(`Flutter can't use WOFF2: add a .ttf or .otf of ${font.family} to the guide's font files.`);
      continue;
    }
    const assets = files.map((f) => {
      const abs = resolve(root, f.path);
      if (inside(appDir, abs)) return { ...f, asset: posix(relative(appDir, abs)) };
      const asset = `${FONT_ASSETS}/${basename(f.path)}`;
      copies.push({ from: posix(f.path), to: prefixPath(app.path, asset) });
      return { ...f, asset };
    });
    // Already registered in pubspec.yaml: nothing to add.
    if (new RegExp(`^\\s*-\\s*family:\\s*["']?${escapeRe(font.family)}["']?\\s*$`, "m").test(pubspec)) continue;
    blocks.push(
      `    - family: ${font.family}`,
      "      fonts:",
      ...assets.flatMap((a) => [
        `        - asset: ${a.asset}`,
        ...(a.weight !== 400 ? [`          weight: ${a.weight}`] : []),
        ...(a.style === "italic" ? ["          style: italic"] : []),
      ]),
    );
  }
  if (blocks.length > 0) {
    const where = prefixPath(app.path, "pubspec.yaml");
    notes.push(`Add the theme's fonts to ${where}, in its flutter: section, then run flutter pub get:\nflutter:\n  fonts:\n${blocks.join("\n")}`);
  }

  const google = uses.filter((u) => u.source === "google" || u.source === "bundled").map((u) => u.family);
  const pkg = packageOf(root, app, themeDir);
  const googleFonts = google.length === 0 || dependsOn(join(root, pkg), "google_fonts");
  if (!googleFonts) {
    const where = pkg === "." ? "" : `${pkg}: `;
    notes.push(`${where}Add google_fonts (flutter pub add google_fonts) and run motif tokens again, or bundle ${andList(google)} as project fonts.`);
  }
  return { copies, notes, googleFonts };
}
