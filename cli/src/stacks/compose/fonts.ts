// What a Compose app needs for the theme's fonts: project font files copied into res/font, and Google's downloadable fonts.
import { readFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { AppInfo } from "../../detect/stacks";
import { XML_HEADER, type GeneratedFile } from "../../generate/header";
import type { Theme } from "../../generate/theme";
import { themeFonts } from "../../generate/theme-fonts";
import { prefixPath } from "../../project/apps";
import { andList, stripBom } from "../../text";
import { assetNames } from "../flutter/fonts";
import { gradleRoot, moduleBuild } from "./project";

const ANDROID_FONT = /\.(ttf|otf)$/i;
/** The library Compose's downloadable fonts (GoogleFont) come from. */
export const GOOGLE_FONTS_MODULE = "androidx.compose.ui:ui-text-google-fonts";
const CATALOGUE_ALIAS = "androidx-compose-ui-text-google-fonts";
const CATALOGUE_LINE = `${CATALOGUE_ALIAS} = { group = "androidx.compose.ui", name = "ui-text-google-fonts" }`;
/** Where the certificates go, inside the module. */
export const CERTS_FILE = "src/main/res/values/motif_font_certs.xml";
/** Where project fonts go, inside the module. */
export const FONT_RES = "src/main/res/font";

/** Words Java won't take as a name: R.font.<name> must compile. */
const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default",
  "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import",
  "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return",
  "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try",
  "void", "volatile", "while", "true", "false", "null",
]);

/** A font file's Android resource name: lower case, letters, digits and underscores, starting with a letter. */
export function resourceName(file: string): string {
  let name = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(name)) name = name ? `font_${name}` : "font";
  return JAVA_KEYWORDS.has(name) ? `${name}_font` : name;
}

/**
 * Google Play services' certificates for downloadable fonts, as Android's documentation publishes them. Copied from
 * android/compose-samples (JetLagged/app/src/main/res/values-v23/font_certs.xml, the same in Jetchat).
 */
export function fontCertsXml(): string {
  return [
    XML_HEADER,
    "<!-- Google Play services' certificates for downloadable fonts, as Android's documentation publishes them",
    "     (copied from android/compose-samples: JetLagged/app/src/main/res/values-v23/font_certs.xml). -->",
    "<resources>",
    '    <array name="com_google_android_gms_fonts_certs">',
    "        <item>@array/com_google_android_gms_fonts_certs_dev</item>",
    "        <item>@array/com_google_android_gms_fonts_certs_prod</item>",
    "    </array>",
    '    <string-array name="com_google_android_gms_fonts_certs_dev">',
    "        <item>",
    "            MIIEqDCCA5CgAwIBAgIJANWFuGx90071MA0GCSqGSIb3DQEBBAUAMIGUMQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNTW91bnRhaW4gVmlldzEQMA4GA1UEChMHQW5kcm9pZDEQMA4GA1UECxMHQW5kcm9pZDEQMA4GA1UEAxMHQW5kcm9pZDEiMCAGCSqGSIb3DQEJARYTYW5kcm9pZEBhbmRyb2lkLmNvbTAeFw0wODA0MTUyMzM2NTZaFw0zNTA5MDEyMzM2NTZaMIGUMQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNTW91bnRhaW4gVmlldzEQMA4GA1UEChMHQW5kcm9pZDEQMA4GA1UECxMHQW5kcm9pZDEQMA4GA1UEAxMHQW5kcm9pZDEiMCAGCSqGSIb3DQEJARYTYW5kcm9pZEBhbmRyb2lkLmNvbTCCASAwDQYJKoZIhvcNAQEBBQADggENADCCAQgCggEBANbOLggKv+IxTdGNs8/TGFy0PTP6DHThvbbR24kT9ixcOd9W+EaBPWW+wPPKQmsHxajtWjmQwWfna8mZuSeJS48LIgAZlKkpFeVyxW0qMBujb8X8ETrWy550NaFtI6t9+u7hZeTfHwqNvacKhp1RbE6dBRGWynwMVX8XW8N1+UjFaq6GCJukT4qmpN2afb8sCjUigq0GuMwYXrFVee74bQgLHWGJwPmvmLHC69EH6kWr22ijx4OKXlSIx2xT1AsSHee70w5iDBiK4aph27yH3TxkXy9V89TDdexAcKk/cVHYNnDBapcavl7y0RiQ4biu8ymM8Ga/nmzhRKya6G0cGw8CAQOjgfwwgfkwHQYDVR0OBBYEFI0cxb6VTEM8YYY6FbBMvAPyT+CyMIHJBgNVHSMEgcEwgb6AFI0cxb6VTEM8YYY6FbBMvAPyT+CyoYGapIGXMIGUMQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNTW91bnRhaW4gVmlldzEQMA4GA1UEChMHQW5kcm9pZDEQMA4GA1UECxMHQW5kcm9pZDEQMA4GA1UEAxMHQW5kcm9pZDEiMCAGCSqGSIb3DQEJARYTYW5kcm9pZEBhbmRyb2lkLmNvbYIJANWFuGx90071MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQEEBQADggEBABnTDPEF+3iSP0wNfdIjIz1AlnrPzgAIHVvXxunW7SBrDhEglQZBbKJEk5kT0mtKoOD1JMrSu1xuTKEBahWRbqHsXclaXjoBADb0kkjVEJu/Lh5hgYZnOjvlba8Ld7HCKePCVePoTJBdI4fvugnL8TsgK05aIskyY0hKI9L8KfqfGTl1lzOv2KoWD0KWwtAWPoGChZxmQ+nBli+gwYMzM1vAkP+aayLe0a1EQimlOalO762r0GXO0ks+UeXde2Z4e+8S/pf7pITEI/tP+MxJTALw9QUWEv9lKTk+jkbqxbsh8nfBUapfKqYn0eidpwq2AzVp3juYl7//fKnaPhJD9gs=",
    "        </item>",
    "    </string-array>",
    '    <string-array name="com_google_android_gms_fonts_certs_prod">',
    "        <item>",
    "            MIIEQzCCAyugAwIBAgIJAMLgh0ZkSjCNMA0GCSqGSIb3DQEBBAUAMHQxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRYwFAYDVQQHEw1Nb3VudGFpbiBWaWV3MRQwEgYDVQQKEwtHb29nbGUgSW5jLjEQMA4GA1UECxMHQW5kcm9pZDEQMA4GA1UEAxMHQW5kcm9pZDAeFw0wODA4MjEyMzEzMzRaFw0zNjAxMDcyMzEzMzRaMHQxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRYwFAYDVQQHEw1Nb3VudGFpbiBWaWV3MRQwEgYDVQQKEwtHb29nbGUgSW5jLjEQMA4GA1UECxMHQW5kcm9pZDEQMA4GA1UEAxMHQW5kcm9pZDCCASAwDQYJKoZIhvcNAQEBBQADggENADCCAQgCggEBAKtWLgDYO6IIrgqWbxJOKdoR8qtW0I9Y4sypEwPpt1TTcvZApxsdyxMJZ2JORland2qSGT2y5b+3JKkedxiLDmpHpDsz2WCbdxgxRczfey5YZnTJ4VZbH0xqWVW/8lGmPav5xVwnIiJS6HXk+BVKZF+JcWjAsb/GEuq/eFdpuzSqeYTcfi6idkyugwfYwXFU1+5fZKUaRKYCwkkFQVfcAs1fXA5V+++FGfvjJ/CxURaSxaBvGdGDhfXE28LWuT9ozCl5xw4Yq5OGazvV24mZVSoOO0yZ31j7kYvtwYK6NeADwbSxDdJEqO4k//0zOHKrUiGYXtqw/A0LFFtqoZKFjnkCAQOjgdkwgdYwHQYDVR0OBBYEFMd9jMIhF1Ylmn/Tgt9r45jk14alMIGmBgNVHSMEgZ4wgZuAFMd9jMIhF1Ylmn/Tgt9r45jk14aloXikdjB0MQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZvcm5pYTEWMBQGA1UEBxMNTW91bnRhaW4gVmlldzEUMBIGA1UEChMLR29vZ2xlIEluYy4xEDAOBgNVBAsTB0FuZHJvaWQxEDAOBgNVBAMTB0FuZHJvaWSCCQDC4IdGZEowjTAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBBAUAA4IBAQBt0lLO74UwLDYKqs6Tm8/yzKkEu116FmH4rkaymUIE0P9KaMftGlMexFlaYjzmB2OxZyl6euNXEsQH8gjwyxCUKRJNexBiGcCEyj6z+a1fuHHvkiaai+KL8W1EyNmgjmyy8AW7P+LLlkR+ho5zEHatRbM/YAnqGcFh5iZBqpknHf1SKMXFh4dd239FJ1jWYfbMDMy3NS5CTMQ2XFI1MvcyUTdZPErjQfTbQe3aDQsQcafEQPD+nqActifKZ0Np0IS9L9kR/wbNvyz6ENwPiTrjV2KRkEjH78ZMcUQXg0L3BYHJ3lc69Vs5Ddf9uUGGMYldX3WfMBEmh/9iFBDAaTCK",
    "        </item>",
    "    </string-array>",
    "</resources>",
    "",
  ].join("\n");
}

function read(path: string): string | null {
  try {
    return stripBom(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The [libraries] aliases of a version catalogue whose library is ui-text-google-fonts. */
function catalogueAliases(text: string): string[] {
  const aliases: string[] = [];
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(#.*)?$/);
    if (header) {
      section = header[1]!.trim();
      continue;
    }
    if (section !== "libraries") continue;
    const entry = line.match(/^\s*["']?([A-Za-z0-9_.-]+)["']?\s*=\s*(.+)$/);
    if (!entry) continue;
    const value = entry[2]!.replace(/#.*$/, "");
    const byModule = new RegExp(`["']${escapeRe(GOOGLE_FONTS_MODULE)}(:[^"']*)?["']`).test(value);
    const byName = /\bgroup\s*=\s*["']androidx\.compose\.ui["']/.test(value) && /\bname\s*=\s*["']ui-text-google-fonts["']/.test(value);
    if (byModule || byName) aliases.push(entry[1]!);
  }
  return aliases;
}

/** A catalogue alias as Gradle's accessor names it: androidx-compose-ui-text-google-fonts is libs.androidx.compose.ui.text.google.fonts. */
const accessor = (alias: string) => `libs.${alias.replace(/[-_.]/g, ".")}`;

export interface ComposeFonts {
  /** Font files to copy into the app, root-relative. */
  copies: { from: string; to: string }[];
  notes: string[];
  /** Whether the theme code may use Google's downloadable fonts. */
  googleFonts: boolean;
  /** Each project font's resource names (family in lower case), in the order of its .ttf and .otf files. */
  resFonts: Map<string, string[]>;
  /** The resource files Motif writes (the certificates, when the code downloads fonts), root-relative. */
  files: GeneratedFile[];
}

const posix = (p: string) => p.replace(/\\/g, "/");
const inside = (dir: string, abs: string) => {
  const rel = relative(dir, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** Project fonts copied into the module's res/font, and whether Google's downloadable fonts can load the rest. */
export function composeFonts(theme: Theme, root: string, app: AppInfo): ComposeFonts {
  const uses = themeFonts(theme);
  const moduleDir = resolve(root, app.path);
  const fontDir = resolve(moduleDir, FONT_RES);
  const copies: ComposeFonts["copies"] = [];
  const notes: string[] = [];
  const resFonts = new Map<string, string[]>();

  // Files outside the module's res/font are copied in; two that share a name get their folders' names in front.
  const outside = theme.projectFonts.flatMap((f) => f.files.map((file) => file.path)).filter((p) => ANDROID_FONT.test(p) && !inside(fontDir, resolve(root, p)));
  const asset = assetNames(outside);
  const taken = new Set<string>();
  const unique = (name: string) => {
    let n = name;
    for (let i = 2; taken.has(n); i++) n = `${name}_${i}`;
    taken.add(n);
    return n;
  };

  for (const use of uses.filter((u) => u.source === "project")) {
    const font = theme.projectFonts.find((f) => f.family.toLowerCase() === use.family.toLowerCase());
    if (!font) continue;
    const files = font.files.filter((f) => ANDROID_FONT.test(f.path));
    if (files.length === 0) {
      notes.push(`Android can't use WOFF2: add a .ttf or .otf of ${font.family} to the guide's font files.`);
      continue;
    }
    const names = files.map((f) => {
      const abs = resolve(root, f.path);
      if (inside(fontDir, abs) && resourceName(f.path) === basename(f.path, extname(f.path))) return unique(resourceName(f.path));
      const name = unique(resourceName(asset.get(posix(f.path)) ?? f.path));
      const to = prefixPath(app.path, `${FONT_RES}/${name}${extname(f.path).toLowerCase()}`);
      if (!copies.some((c) => c.to === to)) copies.push({ from: posix(f.path), to });
      return name;
    });
    resFonts.set(font.family.toLowerCase(), names);
  }

  const google = uses.filter((u) => u.source === "google" || u.source === "bundled").map((u) => u.family);
  const files: GeneratedFile[] = [];
  if (google.length === 0) return { copies, notes, googleFonts: true, resFonts, files };

  const build = moduleBuild(moduleDir);
  const catalogueFile = join(gradleRoot(moduleDir, root), "gradle", "libs.versions.toml");
  const catalogue = read(catalogueFile)?.trim() ? read(catalogueFile)! : null;
  const aliases = catalogue ? catalogueAliases(catalogue) : [];
  const used = (alias: string) => new RegExp(`${escapeRe(accessor(alias))}(?![\\w.])`).test(build?.text ?? "");
  const googleFonts = !!build && (build.text.includes(GOOGLE_FONTS_MODULE) || aliases.some(used));
  if (googleFonts) {
    files.push({ path: prefixPath(app.path, CERTS_FILE), content: fontCertsXml() });
    return { copies, notes, googleFonts, resFonts, files };
  }

  const who = app.path === "." ? "Your app" : app.path;
  const buildPath = prefixPath(app.path, build?.name ?? "build.gradle.kts");
  const families = andList(google);
  const steps = catalogue
    ? aliases.length > 0
      ? `Add this line to ${buildPath}, under dependencies:\nimplementation(${accessor(aliases[0]!)})`
      : `Add this line to ${posix(relative(root, catalogueFile))}, under [libraries]:\n${CATALOGUE_LINE}\nand this one to ${buildPath}, under dependencies:\nimplementation(${accessor(CATALOGUE_ALIAS)})`
    : `Add this line to ${buildPath}, under dependencies (the Compose BOM sets its version):\nimplementation("${GOOGLE_FONTS_MODULE}")`;
  notes.push(
    `${who} uses ${families} from Google Fonts, which needs Compose's downloadable fonts. ${steps}\nThen run motif tokens again. Until then, the theme uses the system font for ${families}.`,
  );
  return { copies, notes, googleFonts, resFonts, files };
}
