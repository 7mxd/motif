import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { readProjectFonts } from "../contract/fonts";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { checkVariants } from "../contract/variants";
import { detectApps, siteDir, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { formatFindings, type Finding } from "../findings";
import { FALLBACK_DIR, FALLBACK_FILES, flatTokensFile, generateFallback } from "../generate/fallback";
import { isMotifGenerated, sameContent, type GeneratedFile } from "../generate/header";
import { usesTypeScript } from "../generate/javascript";
import { PREVIEW_CSS_PATH, previewCss } from "../generate/preview-css";
import { buildThemeSet, type ThemeSet } from "../generate/theme";
import { latinExample, skippedCompanions, themeFonts, type SkippedCompanion } from "../generate/theme-fonts";
import { appLabel, noSuchApp, prefixPath, selectApps } from "../project/apps";
import { ignoredByGit, ignoredNotes } from "../project/git";
import { readSettingsJson, writeSettings, type AppSetting, type MotifSettings } from "../project/settings";
import { motifCss } from "../generate/motif-css";
import { isReferenced } from "../generate/referenced";
import { nativeStack } from "../stacks/native";
import { webStack, type WebStack } from "../stacks/web";
import { chooseSrcDir, detectTailwind, generateReactWeb, tailwindV3Note, tailwindWiringNote } from "../stacks/react-web/generate";
import { andList } from "../text";
import { TOKENS_JSON } from "./validate";

export type FileStatus = "created" | "updated" | "unchanged" | "protected" | "skipped";

export function writeGenerated(root: string, files: GeneratedFile[]): { path: string; status: FileStatus }[] {
  const blocked = new Set<string>();
  return files.map((f) => {
    // motif.tailwind.css imports its sibling motif.css; if that file isn't Motif's, don't write the importer.
    const sibling = f.path.endsWith("/motif.tailwind.css") ? f.path.replace(/motif\.tailwind\.css$/, "motif.css") : null;
    if (sibling && blocked.has(sibling)) return { path: f.path, status: "skipped" as const };
    const abs = join(root, f.path);
    if (existsSync(abs)) {
      const current = readFileSync(abs, "utf8");
      if (!isMotifGenerated(f.path, current)) {
        blocked.add(f.path);
        return { path: f.path, status: "protected" as const };
      }
      if (sameContent(current, f.content)) return { path: f.path, status: "unchanged" as const };
      writeFileSync(abs, f.content);
      return { path: f.path, status: "updated" as const };
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
    return { path: f.path, status: "created" as const };
  });
}

/**
 * Copy files into the project (a native app's fonts). An identical file is left as it is; a different one is never
 * overwritten.
 */
function copyFiles(root: string, copies: { from: string; to: string }[]): { path: string; status: FileStatus }[] {
  return copies.map((c) => {
    const from = join(root, c.from);
    const to = join(root, c.to);
    if (!existsSync(from)) return { path: c.to, status: "skipped" as const };
    const bytes = readFileSync(from);
    if (existsSync(to)) return { path: c.to, status: readFileSync(to).equals(bytes) ? ("unchanged" as const) : ("protected" as const) };
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, bytes);
    return { path: c.to, status: "created" as const };
  });
}

/** Create design/motif.json from detection, or add missing srcDir values. Returns null when left alone. */
function updateSettings(root: string, detected: AppInfo[], srcDirs: Map<string, string>, notes: string[]): FileStatus | null {
  const exists = existsSync(join(root, "design", "motif.json"));
  const raw = readSettingsJson(root) as { apps?: unknown; ignore?: unknown } | null;
  if (exists && (raw === null || !Array.isArray(raw.apps))) {
    notes.push("design/motif.json couldn't be read, so Motif didn't update it.");
    return null;
  }
  if (!exists) {
    // Apps whose stack Motif couldn't tell are never recorded: that would switch detection off for good.
    const apps: AppSetting[] = detected
      .filter((a) => a.stack !== null)
      .map((a) => ({ path: a.path, stack: a.stack!, ...(srcDirs.has(a.path) ? { srcDir: srcDirs.get(a.path)! } : {}) }));
    if (apps.length === 0) return null;
    writeSettings(root, { motifContract: 1, apps, ignore: [] });
    return "created";
  }
  let changed = false;
  const apps = (raw!.apps as AppSetting[]).map((a) => {
    if ((a?.stack === "react-web" || a?.stack === "plain-web" || a?.stack === "vue") && typeof a.srcDir !== "string" && srcDirs.has(a.path)) {
      changed = true;
      return { ...a, srcDir: srcDirs.get(a.path)! };
    }
    return a;
  });
  if (!changed) return "unchanged";
  // Keep every other key as it was.
  writeSettings(root, { ...(raw as object), apps } as MotifSettings);
  return "updated";
}

/** A <link> to motif.css, or an @import of it (from a page's <style> or the site's own stylesheet). */
const LOADS_MOTIF_CSS = /<link\b[^>]*motif\.css|@import\s+(?:url\(\s*)?["']?[^"'\s;)]*motif\.css/i;
/** HTML and CSS comments: a link commented out loads nothing. */
const MARKUP_COMMENT = /<!--[\s\S]*?(?:-->|$)|\/\*[\s\S]*?(?:\*\/|$)/g;

/**
 * Whether a page of the site loads motif.css: only its pages and stylesheets count, not the design guide's mockups or
 * docs that mention it (a site at the project's root has design/ and docs/ inside it, and a site may have its own).
 */
function linkedFromPages(dir: string): boolean {
  let seen = 0;
  const visit = (d: string): boolean => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e === "node_modules" || e.startsWith(".") || e === "design" || e === "docs" || e === "motif.css" || seen++ > 2000) continue;
      const p = join(d, e);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (visit(p)) return true;
      } else if (/\.(?:html?|css)$/i.test(e) && LOADS_MOTIF_CSS.test(readFileSync(p, "utf8").replace(MARKUP_COMMENT, ""))) {
        return true;
      }
    }
    return false;
  };
  return visit(dir);
}

const STATUS_WIDTH = 10;

export async function runTokens(cwd: string, ctx: RunContext): Promise<CommandResult> {
  const tokensPath = join(cwd, "design", "tokens.json");
  if (!existsSync(tokensPath)) {
    return {
      command: "tokens",
      exitCode: 2,
      text: "No design guide found in this folder (missing design/tokens.json).\nStart one with /design, or draft one from your app with motif extract.",
      data: { error: "no-contract" },
    };
  }

  const { doc, findings: loadFindings } = loadTokenDocument(TOKENS_JSON, readFileSync(tokensPath, "utf8"));
  const problems: Finding[] = doc
    ? [...loadFindings, ...validateTokens(doc), ...checkRoles(doc), ...checkVariants(doc), ...readProjectFonts(doc).findings].filter((f) => f.severity === "error")
    : loadFindings;
  if (!doc || problems.length > 0) {
    return {
      command: "tokens",
      exitCode: 1,
      text: `✗ Your theme values have ${problems.length} ${problems.length === 1 ? "problem" : "problems"}, so no code was generated:\n${formatFindings(problems)}\nFix these first (motif validate shows details).`,
      data: { error: "invalid-contract", findings: problems },
    };
  }

  const set = buildThemeSet(doc);
  const stack = ctx.flags?.stack;
  if (typeof stack === "string") {
    if (stack !== "preview") {
      return { command: "tokens", exitCode: 2, text: `Unknown --stack "${stack}". The only one is "preview" (CSS for the preview kit).`, data: { error: "usage" } };
    }
    const [result] = writeGenerated(cwd, [{ path: PREVIEW_CSS_PATH, content: previewCss(set.base, undefined, set.variants) }]);
    const blocked = result!.status === "protected";
    return {
      command: "tokens",
      exitCode: blocked ? 1 : 0,
      text: blocked
        ? `✗ ${PREVIEW_CSS_PATH} already exists and wasn't made by Motif, so it was left alone.`
        : `✓ Preview theme ${result!.status}: ${PREVIEW_CSS_PATH}`,
      data: { files: [result], notes: [] },
    };
  }

  const settings = readSettingsJson(cwd) as { motifContract?: unknown } | null;
  if (typeof settings?.motifContract === "number" && settings.motifContract > 1) {
    return {
      command: "tokens",
      exitCode: 2,
      text: `design/motif.json was made by a newer version of Motif (format ${settings.motifContract}). Update Motif to use it.`,
      data: { error: "newer-format" },
    };
  }

  const { apps: detected, findings: settingProblems } = detectApps(cwd);
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return {
      command: "tokens",
      exitCode: 2,
      text: noSuchApp(ctx.app, detected),
      data: { error: "no-such-app" },
    };
  }
  if (apps.length === 0) {
    return {
      command: "tokens",
      exitCode: 2,
      text: "No app found in this folder. Run this inside your app's folder, or start a new app with /design.",
      data: { error: "no-app" },
    };
  }

  const theme = set.base;
  const fonts = themeFonts(theme)
    .filter((f) => f.source !== "system")
    .map(({ family, weights }) => ({ family, weights }));
  const files: GeneratedFile[] = [];
  const notes: string[] = settingProblems.map((f) => f.message);
  const srcDirs = new Map<string, string>();
  const entries: { dir: string; entry: string; path: string; tailwind: boolean; cssPath: string }[] = [];
  let needsFallback = false;
  let needsFlat = false;
  const links: { dir: string; path: string }[] = [];
  const copies: { from: string; to: string }[] = [];
  const webWiring: { app: AppInfo; files: GeneratedFile[]; wire: NonNullable<WebStack["wiring"]> }[] = [];
  const wiring: { app: AppInfo; path: string; note: (root: string, app: AppInfo, file: string, set: ThemeSet) => string | null }[] = [];
  /** The theme files of apps whose stack writes its own theme now and got design/generated before (Vue, until 0.5.0). */
  const ownThemes: string[] = [];
  /** Folders that aren't one app (an Nx workspace's root): nothing is written or recorded for them. */
  const refused = new Set<string>();

  for (const app of apps) {
    const appDir = join(cwd, app.path);
    const native = nativeStack(app.stack);
    if (native?.generate) {
      const out = native.generate(set, { root: cwd, app, themeDir: native.themeDir(cwd, app) });
      // Apps that share one theme folder write the theme once.
      for (const f of out.files) if (!files.some((g) => g.path === f.path)) files.push(f);
      for (const c of out.copies) if (!copies.some((d) => d.to === c.to)) copies.push(c);
      for (const n of out.notes) if (!notes.includes(n)) notes.push(n);
      const wire = native.wiring?.bind(native);
      if (wire) for (const f of out.files) wiring.push({ app, path: f.path, note: wire });
    } else if (app.stack === "react-web") {
      const srcDir = app.srcDir ?? chooseSrcDir(appDir);
      const tailwind = detectTailwind(appDir);
      srcDirs.set(app.path, srcDir);
      if (tailwind === "v3") {
        notes.push(tailwindV3Note(appLabel(app)));
      }
      for (const f of generateReactWeb(theme, { srcDir, tailwind, javascript: !usesTypeScript(appDir, cwd) }, set.variants)) files.push({ path: prefixPath(app.path, f.path), content: f.content });
      const entry = tailwind === "v4" ? "motif.tailwind.css" : "motif.css";
      entries.push({
        dir: join(appDir, srcDir),
        entry,
        path: prefixPath(app.path, `${srcDir}/styles/${entry}`),
        tailwind: tailwind === "v4",
        cssPath: prefixPath(app.path, `${srcDir}/styles/motif.css`),
      });
    } else if (app.stack === "plain-web") {
      const site = siteDir(cwd, app);
      srcDirs.set(app.path, site);
      const cssPath = prefixPath(app.path, site === "." ? "motif.css" : `${site}/motif.css`);
      files.push({ path: cssPath, content: motifCss(theme, set.variants) });
      links.push({ dir: join(appDir, site), path: cssPath });
      needsFlat = true;
    } else if (webStack(app.stack)?.notOneApp?.(appDir)) {
      // A workspace's root (Nx) isn't one app: nothing is written for it, and the note says how to name its apps.
      notes.push(webStack(app.stack)!.notOneApp!(appDir)!);
      refused.add(app.path);
    } else if (webStack(app.stack)?.generate) {
      const web = webStack(app.stack)!;
      const srcDir = app.srcDir ?? web.srcDir(appDir);
      srcDirs.set(app.path, srcDir);
      const out = web.generate!(set, { root: cwd, app, srcDir, tailwind: detectTailwind(appDir) });
      for (const f of out.files) if (!files.some((g) => g.path === f.path)) files.push(f);
      for (const n of out.notes) if (!notes.includes(n)) notes.push(n);
      if (web.wiring) webWiring.push({ app, files: out.files, wire: web.wiring.bind(web) });
      const entry = out.files.find((f) => f.path.endsWith("motif.tailwind.css")) ?? out.files.find((f) => f.path.endsWith("motif.css"));
      if (entry) ownThemes.push(entry.path);
    } else if (app.stack) {
      needsFallback = true;
      notes.push(`${appLabel(app)}: ${STACK_LABELS[app.stack]} support is coming soon. Motif wrote plain CSS variables and design/generated/tokens.flat.json to map by hand.`);
    } else {
      needsFallback = true;
      notes.push(app.source === "motif.json"
        ? `${appLabel(app)}: design/motif.json lists a stack Motif doesn't know. Motif wrote plain CSS variables and design/generated/tokens.flat.json to map by hand.`
        : `${appLabel(app)}: Motif couldn't tell which framework this app uses, so it wrote plain CSS variables and design/generated/tokens.flat.json. For full support, add the app and its stack to design/motif.json.`);
    }
  }
  // Native apps read only the start of a font list; on the web, CSS reads the whole list, so there's nothing to say.
  if (apps.some((a) => nativeStack(a.stack)?.generate)) {
    const latin = latinExample(theme, apps.find((a) => nativeStack(a.stack)?.generate)?.stack);
    for (const s of skippedCompanions(theme)) notes.push(skippedCompanionNote(s, latin));
  }
  if (needsFallback) files.push(...generateFallback(theme, set.variants));
  else if (needsFlat) files.push(flatTokensFile(theme, set.variants));
  if (ownThemes.length > 0) {
    const note = staleFallbackNote(cwd, files, ownThemes);
    if (note) notes.push(note);
  }
  // An app without TypeScript now gets motion.js: the motion.ts an earlier Motif wrote beside it is no longer updated.
  for (const f of files) {
    const old = f.path.replace(/\.js$/, ".ts");
    if (old === f.path || !/motion\.js$/.test(f.path) || !existsSync(join(cwd, old))) continue;
    if (isMotifGenerated(old, readFileSync(join(cwd, old), "utf8"))) notes.push(`This app has no TypeScript, so Motif now writes ${f.path}; delete ${old}, which an earlier run wrote. Imports without the extension need no change.`);
  }

  const results = writeGenerated(cwd, files);
  const copied = copyFiles(cwd, copies);
  results.push(...copied);
  const settingsStatus = updateSettings(cwd, detected.filter((a) => !refused.has(a.path)), srcDirs, notes);
  if (settingsStatus) results.push({ path: "design/motif.json", status: settingsStatus });

  const blockedPaths = new Set(results.filter((r) => r.status === "protected").map((r) => r.path));
  for (const e of entries) {
    if (blockedPaths.has(e.cssPath) || isReferenced(e.dir, e.entry)) continue;
    notes.push(e.tailwind
      ? tailwindWiringNote(e.path)
      : `Next: load ${e.path} once: @import it from your main CSS file, or import it in your app's entry file.`);
  }
  const leftAlone = new Set(results.filter((r) => r.status === "protected" || r.status === "skipped").map((r) => r.path));
  for (const w of webWiring) {
    // A theme stylesheet left alone (or skipped with it) isn't Motif's, so there is nothing to wire up. A motion.ts
    // left alone doesn't matter here: it's imported where it's used.
    if (w.files.some((f) => /(^|\/)motif(\.tailwind)?\.css$/.test(f.path) && leftAlone.has(f.path))) continue;
    const written = w.files.filter((f) => !leftAlone.has(f.path));
    const note = w.wire(cwd, w.app, written, set);
    if (note && !notes.includes(note)) notes.push(note);
  }
  for (const w of wiring) {
    if (blockedPaths.has(w.path)) continue;
    const note = w.note(cwd, w.app, w.path, set);
    if (note && !notes.includes(note)) notes.push(note);
  }
  for (const c of copied.filter((r) => r.status === "skipped")) {
    notes.push(`${copies.find((d) => d.to === c.path)!.from} doesn't exist, so it wasn't copied to ${c.path}. Add the file, or fix its path in design/tokens.json's fonts list.`);
  }
  for (const l of links) {
    if (blockedPaths.has(l.path) || linkedFromPages(l.dir)) continue;
    notes.push(`Next: link ${l.path} in each page's <head>, before your own styles: <link rel="stylesheet" href="motif.css"> (write the path relative to the page).`);
  }
  // The guide and the theme code belong in the repository: a .gitignore rule meant for something else would keep them out.
  const kept = ["design/tokens.json", ...(existsSync(join(cwd, "DESIGN.md")) ? ["DESIGN.md"] : []), ...results.filter((r) => r.status !== "skipped" && r.status !== "protected").map((r) => r.path)];
  notes.push(...ignoredNotes(ignoredByGit(cwd, [...new Set(kept)])));

  const blocked = results.filter((r) => r.status === "protected");
  const allSame = results.length > 0 && results.every((r) => r.status === "unchanged");
  const none = results.length === 0 && refused.size > 0;
  const lines = [
    none ? "✗ No theme code was written." : blocked.length > 0 ? "✗ Some theme files couldn't be written:" : allSame ? "✓ Theme code is up to date." : "✓ Theme code is ready:",
    ...results.map((r) => `  ${r.status.padEnd(STATUS_WIDTH)} ${r.path}`),
    ...(fonts.length > 0
      ? [`Theme fonts: ${fonts.map((f) => `${f.family} ${f.weights.join(" · ")}`).join(", ")}. Your app needs to load them (your stack's Motif guide shows how).`]
      : []),
    ...blocked.map((b) => {
      const copy = copies.find((c) => c.to === b.path);
      return copy
        ? `${b.path} already exists and differs from ${copy.from}, so it was left alone. Replace it with ${copy.from} if the guide's file is the one to use.`
        : `${b.path} already exists and wasn't made by Motif, so it was left alone (and files that depend on it were skipped). Rename or remove it, then run motif tokens again.`;
    }),
    ...notes.map((n) => `• ${n}`),
  ];
  return {
    command: "tokens",
    exitCode: blocked.length > 0 || none ? 1 : 0,
    text: lines.join("\n"),
    data: { files: results, notes, fonts },
  };
}

/**
 * An earlier Motif wrote design/generated/ for a stack that now has its own theme files, and the app may still import
 * it. Names the files this run left as they were, the file to use instead, and what to delete; null when there are none.
 */
function staleFallbackNote(root: string, written: GeneratedFile[], themes: string[]): string | null {
  const stale = FALLBACK_FILES.filter((p) => !written.some((f) => f.path === p))
    .filter((p) => {
      try {
        return isMotifGenerated(p, readFileSync(join(root, p), "utf8"));
      } catch {
        return false;
      }
    });
  if (stale.length === 0) return null;
  let others: string[] = [];
  try {
    others = readdirSync(join(root, FALLBACK_DIR)).filter((e) => !stale.includes(`${FALLBACK_DIR}/${e}`));
  } catch {}
  const del = others.length === 0 ? `${FALLBACK_DIR}/` : andList(stale);
  return `${andList(stale)} ${stale.length === 1 ? "is" : "are"} from an earlier version of Motif and ${stale.length === 1 ? "is" : "are"} no longer updated: import ${andList(themes)} instead, then delete ${del}.`;
}

/** What native apps do with a family a font list hides from them, and how to write the list to use it. */
function skippedCompanionNote(s: SkippedCompanion, latin: string): string {
  const roles = s.roles.length === 1 ? `the ${s.roles[0]} role's font list` : `the font lists of the ${andList(s.roles)} roles`;
  const them = s.roles.length === 1 ? "the role" : "these roles";
  return s.kind === "after-generics"
    ? `${s.family} comes after more than one generic family in ${roles}, so native apps never use it. If it's meant for Arabic text, start the list with one: "system-ui, ${s.family}".`
    : `${s.family} comes after ${s.after} in ${roles}. Motif can't tell whether a project font covers Arabic, so native apps draw ${them} in the system font and skip ${s.family}. To use it for Arabic text, name a Latin font first, as in "${latin}, ${s.family}".`;
}
