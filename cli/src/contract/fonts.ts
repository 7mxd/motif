import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Finding } from "../findings";
import { cssFontFamily } from "../generate/css-values";
import { stackFamilies } from "../generate/theme-fonts";
import { resolveToken } from "./resolve";
import { MOTIF_EXT, type TokenDocument } from "./types";

export interface ProjectFontFile {
  path: string;
  weight: number;
  style: "normal" | "italic";
}

export interface ProjectFont {
  family: string;
  files: ProjectFontFile[];
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
/** The font formats a project may bundle: WOFF2 and WOFF for the web, TTF and OTF for every stack. */
const FONT_FILE = /\.(woff2|woff|ttf|otf)$/i;
/** A path that starts at a root or a drive, on any system. */
const isAbsolutePath = (p: string) => isAbsolute(p) || /^([a-zA-Z]:|[\/])/.test(p);

/** The fonts the project bundles itself, as the guide declares them. */
export function readProjectFonts(doc: TokenDocument): { fonts: ProjectFont[]; findings: Finding[] } {
  const ext = doc.rootExtensions?.[MOTIF_EXT];
  const list = isObj(ext) ? ext.fonts : undefined;
  const fonts: ProjectFont[] = [];
  const findings: Finding[] = [];
  const bad = (message: string) => findings.push({ code: "bad-project-font", severity: "error", message, file: doc.file });
  if (list === undefined) return { fonts, findings };
  if (!Array.isArray(list)) {
    bad('"fonts" must be a list of fonts, like [ { "family": "Brand Sans", "files": [ … ] } ].');
    return { fonts, findings };
  }

  list.forEach((raw, i) => {
    const entry = isObj(raw) ? raw : {};
    const family = typeof entry.family === "string" ? entry.family.trim() : "";
    const name = family ? `The font "${family}"` : `Font ${i + 1}`;
    if (!family) bad(`Font ${i + 1} has no family name.`);
    const rawFiles = Array.isArray(entry.files) ? entry.files : [];
    if (rawFiles.length === 0) bad(`${name} lists no files.`);

    const files: ProjectFontFile[] = [];
    for (const f of rawFiles) {
      const file = isObj(f) ? f : {};
      const path = typeof file.path === "string" ? file.path : "";
      const weight = file.weight;
      const style = file.style;
      let ok = true;
      const fail = (message: string) => { bad(message); ok = false; };
      if (!path) fail(`${name} has a file with no path.`);
      else if (isAbsolutePath(path)) fail(`${name}: "${path}" must be a path inside the project, like "assets/fonts/Name.woff2".`);
      else if (!FONT_FILE.test(path)) fail(`${name}: "${path}" must be a .woff2, .woff, .ttf or .otf file.`);
      if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 100 || weight > 900) {
        fail(`${name}${path ? ` (${path})` : ""} needs a weight from 100 to 900.`);
      }
      if (style !== "normal" && style !== "italic") fail(`${name}${path ? ` (${path})` : ""} needs a style of "normal" or "italic".`);
      if (ok) files.push({ path, weight: weight as number, style: style as "normal" | "italic" });
    }
    if (family && files.length > 0) fonts.push({ family, files });
  });
  return { fonts, findings };
}

/** Every family a typography role names, first or companion. */
function usedFamilies(doc: TokenDocument): Set<string> {
  const used = new Set<string>();
  for (const tok of doc.tokens.values()) {
    if (!tok.path.startsWith("font.")) continue;
    const r = resolveToken(doc, tok.path);
    if (!r.ok || !isObj(r.value)) continue;
    const family = r.value.fontFamily;
    if (typeof family !== "string" && !Array.isArray(family)) continue;
    for (const f of stackFamilies(cssFontFamily(family as string | string[]))) if (f !== null) used.add(f.toLowerCase());
  }
  return used;
}

/** Font files exist inside the project, and each family is used. Paths are relative to `root`, the folder that holds design/. */
export function checkProjectFontFiles(root: string, fonts: ProjectFont[], doc?: TokenDocument): Finding[] {
  const findings: Finding[] = [];
  const file = doc?.file ?? "design/tokens.json";
  const base = resolve(root);
  const within = (from: string, abs: string) => {
    const rel = relative(from, abs);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  for (const font of fonts) {
    for (const f of font.files) {
      const abs = resolve(base, f.path);
      // A link that leads out of the project counts as outside too.
      const outside = !within(base, abs) || (existsSync(abs) && !within(existsSync(base) ? realpathSync(base) : base, realpathSync(abs)));
      if (outside) {
        findings.push({ code: "font-outside-project", severity: "error", file, message: `The font file "${f.path}" is outside the project. Fonts are served only from inside it.` });
      } else if (!existsSync(abs)) {
        findings.push({ code: "missing-font-file", severity: "error", file, message: `The font file "${f.path}" (${font.family}) doesn't exist.` });
      }
    }
  }
  if (doc) {
    const used = usedFamilies(doc);
    for (const font of fonts) {
      if (!used.has(font.family.toLowerCase())) {
        findings.push({ code: "font-not-used", severity: "warning", file, message: `The font "${font.family}" is bundled but no type role uses it.` });
      }
    }
  }
  return findings;
}
