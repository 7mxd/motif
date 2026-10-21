// The screens of a SwiftUI app, for motif shot: its root view ("/") and its #Preview blocks, read from the app target's
// Swift sources. The harness finds previews by "<File>.swift:<line of #Preview>" (decision 0010, §4), which is computed
// here from the source: the module part of a preview's id is only known to xcodebuild.
import { basename } from "node:path";
import { listSwiftFiles } from "../../check/files";
import { maskComments, maskStrings } from "../../check/mask";
import { isMotifGenerated } from "../../generate/header";
import { andList } from "../../text";
import type { RouteDiscovery } from "../react-web/routes";
import { swiftUIApp } from "./project";

export interface SwiftUIPreview {
  /** What --screen calls it: the #Preview's title, or <File>-<n> for one without; a PreviewProvider's type name less _Previews. */
  name: string;
  /** Its screenshot's file name part: the name in lower-case words joined by dashes, unique in the app. */
  slug: string;
  /** What a SwiftUIShot's `screen` holds: "<File>.swift:<line>" (no folders, no module). */
  screen: string;
  /** Relative to the app's folder. */
  file: string;
  /** The line of #Preview (or of the PreviewProvider type). */
  line: number;
  /** Why Motif can't draw it, for the ones that are listed but not drawn. */
  reason?: string;
}

export interface SwiftUIScreens extends RouteDiscovery {
  /** The #Preview blocks Motif draws. */
  previews: SwiftUIPreview[];
  /** Previews it lists but doesn't draw (PreviewProviders), each with its reason. */
  skippedPreviews: SwiftUIPreview[];
}

const PROVIDER_REASON = "It is a PreviewProvider, which Motif doesn't draw yet. Put its view in a #Preview block to screenshot it.";

/** HomeScreen → home-screen, "Home, dark" → home-dark (as Compose slugs a preview's name). */
export function previewSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** The inside of the bracket at open (as a range) and the position after its match. */
function balanced(s: string, open: number): { inner: [number, number]; end: number } {
  const o = s[open]!;
  const c = o === "(" ? ")" : "}";
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === o) depth++;
    else if (s[j] === c && --depth === 0) return { inner: [open + 1, j], end: j + 1 };
  }
  return { inner: [open + 1, s.length], end: s.length };
}

/** Where the first argument ends in masked text (strings blanked): at the first comma that isn't inside brackets. */
function firstArgumentEnd(masked: string, from: number, to: number): number {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const c = masked[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) return i;
  }
  return to;
}

/** A plain string literal's text, or null for anything else (a name, an interpolation, a title that is empty). */
function plainTitle(arg: string): string | null {
  const m = /^\s*"((?:[^"\\]|\\.)*)"\s*$/s.exec(arg);
  if (!m || m[1] === "" || m[1]!.includes("\\(")) return null;
  return m[1]!.replace(/\\(["\\])/g, "$1").replace(/\\n/g, " ");
}

const lineAt = (s: string, index: number) => s.slice(0, index).split("\n").length;

interface Found {
  preview: SwiftUIPreview;
  provider: boolean;
}

/** The #Preview blocks and PreviewProvider types of one file, in source order. */
function previewsIn(file: string, text: string): Found[] {
  const code = maskComments(text, "swift");
  const s = maskStrings(code, "swift");
  const stem = basename(file).replace(/\.swift$/, "");
  const screenOf = (line: number) => `${basename(file)}:${line}`;
  const out: (Found & { at: number })[] = [];
  let unnamed = 0;
  for (const m of s.matchAll(/#Preview(?![A-Za-z0-9_])/g)) {
    let i = m.index + m[0].length;
    while (/\s/.test(s[i] ?? "")) i++;
    if (s[i] !== "(" && s[i] !== "{") continue;
    let title: string | null = null;
    if (s[i] === "(") {
      const close = balanced(s, i).inner[1];
      title = plainTitle(code.slice(i + 1, firstArgumentEnd(s, i + 1, close)));
    }
    const line = lineAt(s, m.index);
    out.push({ at: m.index, provider: false, preview: { name: title ?? `${stem}-${++unnamed}`, slug: "", screen: screenOf(line), file, line } });
  }
  const typeRe = /\b(?:struct|class|enum)\s+([A-Za-z_]\w*)\s*(?:<[^>{]*>)?\s*:\s*([^{]*)\{/g;
  for (const m of s.matchAll(typeRe)) {
    if (!/\bPreviewProvider\b/.test(m[2]!)) continue;
    const line = lineAt(s, m.index);
    const trimmed = m[1]!.replace(/_?Previews?$/, "");
    out.push({ at: m.index, provider: true, preview: { name: trimmed || m[1]!, slug: "", screen: screenOf(line), file, line, reason: PROVIDER_REASON } });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The app target's own Swift files: not tests, build output, Motif's theme file or the harness's folder. */
function targetSources(appDir: string): { path: string; text: string }[] {
  const app = swiftUIApp(appDir);
  if (!app) return [];
  const prefix = app.sourceRoot === "." ? "" : `${app.sourceRoot}/`;
  return listSwiftFiles(appDir, ".")
    .filter((f) => f.path.startsWith(prefix) && !f.path.split("/").includes("MotifShots") && !isMotifGenerated(f.path, f.text))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The SwiftUI app's screens: "/" (its root view), and its previews. A navigation destination can't be opened by an
 * address in SwiftUI, so the routes are "/" only. A PreviewProvider is listed in skippedPreviews, with its reason.
 */
export function discoverSwiftUIScreens(appDir: string): SwiftUIScreens {
  const drawn: SwiftUIPreview[] = [];
  const providers: SwiftUIPreview[] = [];
  for (const f of targetSources(appDir)) {
    for (const { preview, provider } of previewsIn(f.path, f.text)) {
      (provider ? providers : drawn).push(preview);
    }
  }
  nameApart(drawn);
  // The harness sees only <File>.swift:<line>, so two previews on one line of same-named files can't be told apart.
  const byScreen = new Map<string, SwiftUIPreview[]>();
  for (const p of drawn) byScreen.set(p.screen, [...(byScreen.get(p.screen) ?? []), p]);
  const previews: SwiftUIPreview[] = [];
  const clashing: SwiftUIPreview[] = [];
  for (const p of drawn) {
    if (byScreen.get(p.screen)!.length > 1) clashing.push({ ...p, reason: sameLineReason(p) });
    else previews.push(p);
  }
  const skippedPreviews = [...providers, ...clashing].sort(bySource);
  // Slugs, unique in the app, in source order.
  const used = new Set<string>();
  const slugged = new Map<SwiftUIPreview, string>();
  for (const p of [...previews, ...skippedPreviews].sort(bySource)) {
    const base = previewSlug(p.name) || "preview";
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    slugged.set(p, slug);
  }
  const done = (list: SwiftUIPreview[]) => list.map((p) => ({ ...p, slug: slugged.get(p)! }));
  const notes: string[] = [];
  if (providers.length > 0) {
    const one = providers.length === 1;
    notes.push(
      `${andList(providers.map((p) => p.name))} ${one ? "is a PreviewProvider" : "are PreviewProviders"}, which Motif doesn't draw yet, so ${one ? "it was" : "they were"} left out. Put ${
        one ? "its view in a #Preview block" : "their views in #Preview blocks"
      } to screenshot ${one ? "it" : "them"}.`,
    );
  }
  if (clashing.length > 0) {
    const files = andList([...new Set(clashing.map((p) => basename(p.file)))]);
    notes.push(
      `${andList(clashing.map((p) => p.name))} are on the same line of files both named ${files}, which the simulator can't tell apart, so they were left out. Move one of the previews, or rename one of the files.`,
    );
  }
  return { routes: ["/"], skipped: [], previews: done(previews), skippedPreviews: done(skippedPreviews), ...(notes.length > 0 ? { notes } : {}) };
}

const bySource = (a: SwiftUIPreview, b: SwiftUIPreview) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line);

const sameLineReason = (p: SwiftUIPreview) =>
  `Another file named ${basename(p.file)} has a preview on the same line, and the simulator can't tell them apart: move one of the previews, or rename one of the files.`;

/**
 * Gives previews whose names collide across files a folder in front (Screens/Home-1), with as much of the path as it takes
 * to tell the files apart. Files in one folder (A.swift and B.swift) keep their names: --screen takes File.swift:line.
 */
function nameApart(list: SwiftUIPreview[]): void {
  const groups = new Map<string, SwiftUIPreview[]>();
  for (const p of list) groups.set(p.name, [...(groups.get(p.name) ?? []), p]);
  for (const group of groups.values()) {
    const files = [...new Set(group.map((p) => p.file))];
    if (files.length < 2) continue;
    const prefix = (file: string, depth: number) => file.split("/").slice(0, -1).slice(-depth).join("/");
    const deepest = Math.max(...files.map((f) => f.split("/").length - 1));
    for (let depth = 1; depth <= deepest; depth++) {
      if (new Set(files.map((f) => prefix(f, depth))).size < files.length) continue;
      for (const p of group) {
        const pre = prefix(p.file, depth);
        if (pre) p.name = `${pre}/${p.name}`;
      }
      break;
    }
  }
}

/** A preview as a run names it: its name, or <File>.swift:<line> when two previews share the name. */
export function swiftUIRunName(previews: SwiftUIPreview[], p: SwiftUIPreview): string {
  return previews.filter((q) => q.name === p.name).length > 1 ? p.screen : p.name;
}

/**
 * Why a --screen value can't be used, or null when each names a #Preview the app has: by its title (or <File>-<n>), or
 * as <File>.swift:<line> (with the module in front, as the harness reports it, it works too).
 */
export function swiftUIScreenProblem(appDir: string, screens: string[]): string | null {
  if (screens.length === 0) return null;
  const { previews, skippedPreviews } = discoverSwiftUIScreens(appDir);
  const found = previews.length > 0;
  const list = found ? ` Previews found: ${andList(previews.map((p) => p.name))}.` : " No #Preview blocks were found.";
  for (const screen of screens) {
    const hit = (p: SwiftUIPreview) => p.name === screen || p.screen === screen || screen.endsWith(`/${p.screen}`);
    const matches = previews.filter(hit);
    if (matches.length === 1) continue;
    if (matches.length > 1) {
      return `--screen ${screen} is the name of ${matches.length} previews (${andList(matches.map((p) => p.screen))}). Use File.swift:line for one.`;
    }
    const skipped = skippedPreviews.filter(hit);
    if (skipped.length > 0) {
      if (skipped.every((p) => p.reason === PROVIDER_REASON)) {
        return `--screen ${screen} is a PreviewProvider, which Motif doesn't draw yet.${list} Put its view in a #Preview block${found ? ", or name one of those" : ""}.`;
      }
      return `--screen ${screen} can't be drawn. ${skipped[0]!.reason}`;
    }
    return `--screen ${screen} isn't a #Preview Motif found in this app.${list}${found ? " Name one of those." : ""}`;
  }
  return null;
}
