// The Compose version a Compose app builds with, as its build files say: the Compose BOM, or a Compose UI version it
// pins. Motif's theme code needs Compose UI 1.9 (BOM 2025.08.00): MotifTheme.kt's shadows use Modifier.dropShadow.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { stripBom } from "../../text";

/** The oldest Compose BOM, and the oldest Compose UI, that Motif's theme code builds with (decision 0008). */
export const BOM_FLOOR = "2025.08.00";
export const UI_FLOOR = "1.9";

const BOM_MODULE = /^androidx\.compose:compose-bom(?:-alpha|-beta)?$/;
const UI_MODULE = "androidx.compose.ui:ui";
/** The [versions] keys a BOM's version goes by in Android Studio's catalogues and in common ones. */
const BOM_KEYS = ["composeBom", "compose-bom", "androidx-compose-bom", "composeBOM"];

type Read = (path: string) => string | null;

/** A file's text from the disk, or null when it can't be read. */
export const diskRead: Read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

/** The module's build file name and its text without comments. */
function buildFile(dir: string, read: Read): { name: string; text: string } | null {
  for (const name of ["build.gradle.kts", "build.gradle"]) {
    const text = read(join(dir, name));
    if (text !== null) return { name, text: stripBom(text).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1") };
  }
  return null;
}

interface Catalogue {
  versions: Map<string, string>;
  libraries: { module: string; version: string | null }[];
}

/** A TOML value's version: "1.2", or { strictly | require | prefer = "1.2" }. */
function versionValue(value: string): string | null {
  return /^\s*["']([^"']+)["']/.exec(value)?.[1] ?? /\b(?:strictly|require|prefer)\s*=\s*["']([^"']+)["']/.exec(value)?.[1] ?? null;
}

/** The version catalogue's [versions] and its [libraries] with their versions (read through version.ref). */
function readCatalogue(text: string): Catalogue {
  const versions = new Map<string, string>();
  const raw: { value: string }[] = [];
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*(#.*)?$/.exec(line);
    if (header) {
      section = header[1]!.trim();
      continue;
    }
    const entry = /^\s*["']?([A-Za-z0-9_.-]+)["']?\s*=\s*(.+)$/.exec(line);
    if (!entry) continue;
    const value = entry[2]!.replace(/#.*$/, "");
    if (section === "versions") {
      const v = versionValue(value);
      if (v) versions.set(entry[1]!, v);
    } else if (section === "libraries") raw.push({ value });
  }
  const libraries = raw.flatMap(({ value }) => {
    const plain = /^\s*["']([^:"']+):([^:"']+)(?::([^"']+))?["']/.exec(value);
    if (plain) return [{ module: `${plain[1]}:${plain[2]}`, version: plain[3] ?? null }];
    const module =
      /\bmodule\s*=\s*["']([^"']+)["']/.exec(value)?.[1] ??
      (() => {
        const group = /\bgroup\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
        const name = /\bname\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
        return group && name ? `${group}:${name}` : null;
      })();
    if (!module) return [];
    const ref = /\bversion\.ref\s*=\s*["']([^"']+)["']/.exec(value)?.[1];
    const version = ref ? (versions.get(ref) ?? null) : (/\bversion\s*=\s*(\{[^}]*\}|["'][^"']*["'])/.exec(value)?.[1] ?? null);
    return [{ module, version: version && !ref ? versionValue(version) : version }];
  });
  return { versions, libraries };
}

export interface ComposeVersions {
  /** The Compose BOM's version, and the file (project-relative) that says it. */
  bom: { version: string; file: string } | null;
  /** A Compose UI version the app pins itself, and the file that says it. */
  ui: { version: string; file: string } | null;
}

/** What the module's build file and the project's version catalogue (gradle/libs.versions.toml) say of its Compose version. */
export function composeVersions(projectDir: string, moduleDir: string, read: Read): ComposeVersions {
  const rel = (path: string) => relative(projectDir, path).split("\\").join("/");
  let bom: ComposeVersions["bom"] = null;
  let ui: ComposeVersions["ui"] = null;
  const build = buildFile(moduleDir, read);
  if (build) {
    const file = rel(join(moduleDir, build.name));
    const direct = /["']androidx\.compose:compose-bom(?:-alpha|-beta)?:([^"'$]+)["']/.exec(build.text)?.[1];
    if (direct) bom = { version: direct, file };
    const pinned = /["']androidx\.compose\.ui:ui:([^"'$]+)["']/.exec(build.text)?.[1];
    if (pinned) ui = { version: pinned, file };
  }
  const path = join(projectDir, "gradle", "libs.versions.toml");
  const text = read(path);
  if (text !== null) {
    const file = rel(path);
    const catalogue = readCatalogue(text);
    const bomLib = catalogue.libraries.find((l) => BOM_MODULE.test(l.module) && l.version);
    const bomKey = BOM_KEYS.map((k) => catalogue.versions.get(k)).find((v) => v);
    bom ??= bomLib?.version ? { version: bomLib.version, file } : bomKey ? { version: bomKey, file } : null;
    const uiLib = catalogue.libraries.find((l) => l.module === UI_MODULE && l.version);
    ui ??= uiLib?.version ? { version: uiLib.version, file } : null;
  }
  return { bom, ui };
}

/** -1, 0 or 1: 2024.09.00 against 2025.08.00, 1.7.5 against 1.9 (a part that isn't there is 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Why the app's Compose is too old for Motif's theme code, with what to do; null when it's new enough or Motif can't
 * tell (a BOM set in a convention plugin, say). A pinned Compose UI of 1.9 or later wins over an older BOM, as Gradle
 * takes the higher version; so does a BOM of 2025.08.00 or later over an older pinned UI.
 */
export function oldComposeProblem(label: string, versions: ComposeVersions): string | null {
  const { bom, ui } = versions;
  const bomOk = bom ? compareVersions(bom.version, BOM_FLOOR) >= 0 : null;
  const uiOk = ui ? compareVersions(ui.version, UI_FLOOR) >= 0 : null;
  if (bomOk === true || uiOk === true) return null;
  const needs = "which Motif's theme code needs: MotifTheme.kt's shadows use Modifier.dropShadow, so the app won't build with it";
  if (bom && bomOk === false) {
    return `${label} uses Compose BOM ${bom.version}, older than ${BOM_FLOOR} (Compose UI ${UI_FLOOR}), ${needs}. Update the BOM in ${bom.file} to ${BOM_FLOOR} or later, then build again.`;
  }
  if (ui && uiOk === false) {
    return `${label} uses Compose UI ${ui.version}, older than ${UI_FLOOR}, ${needs}. Update it in ${ui.file} to ${UI_FLOOR} or later (or use the Compose BOM ${BOM_FLOOR} or later), then build again.`;
  }
  return null;
}
