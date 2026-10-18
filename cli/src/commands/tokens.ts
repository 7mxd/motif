import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { detectApps, siteDir, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { formatFindings, type Finding } from "../findings";
import { flatTokensFile, generateFallback } from "../generate/fallback";
import { isMotifGenerated, sameContent, type GeneratedFile } from "../generate/header";
import { PREVIEW_CSS_PATH, previewCss } from "../generate/preview-css";
import { buildTheme } from "../generate/theme";
import { themeFonts } from "../generate/theme-fonts";
import { appLabel, noSuchApp, prefixPath, selectApps } from "../project/apps";
import { readSettingsJson, writeSettings, type AppSetting, type MotifSettings } from "../project/settings";
import { chooseSrcDir, detectTailwind, generateReactWeb, motifCss } from "../stacks/react-web/generate";
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
    if ((a?.stack === "react-web" || a?.stack === "plain-web") && typeof a.srcDir !== "string" && srcDirs.has(a.path)) {
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

const CODE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs|html?)$/;

/** True when any file under dir (other than Motif's own) mentions name. Bounded to 2000 files. */
function isReferenced(dir: string, name: string): boolean {
  let seen = 0;
  const visit = (d: string): boolean => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e === "node_modules" || e.startsWith(".") || seen++ > 2000) continue;
      const p = join(d, e);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (visit(p)) return true;
      } else if (CODE_FILE.test(e)) {
        const text = readFileSync(p, "utf8");
        if (text.includes(name) && !isMotifGenerated(e, text)) return true;
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
    ? [...loadFindings, ...validateTokens(doc), ...checkRoles(doc)].filter((f) => f.severity === "error")
    : loadFindings;
  if (!doc || problems.length > 0) {
    return {
      command: "tokens",
      exitCode: 1,
      text: `✗ Your theme values have ${problems.length} ${problems.length === 1 ? "problem" : "problems"}, so no code was generated:\n${formatFindings(problems)}\nFix these first (motif validate shows details).`,
      data: { error: "invalid-contract", findings: problems },
    };
  }

  const stack = ctx.flags?.stack;
  if (typeof stack === "string") {
    if (stack !== "preview") {
      return { command: "tokens", exitCode: 2, text: `Unknown --stack "${stack}". The only one is "preview" (CSS for the preview kit).`, data: { error: "usage" } };
    }
    const [result] = writeGenerated(cwd, [{ path: PREVIEW_CSS_PATH, content: previewCss(buildTheme(doc)) }]);
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

  const detected = detectApps(cwd).apps;
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

  const theme = buildTheme(doc);
  const fonts = themeFonts(theme)
    .filter((f) => f.source !== "system")
    .map(({ family, weights }) => ({ family, weights }));
  const files: GeneratedFile[] = [];
  const notes: string[] = [];
  const srcDirs = new Map<string, string>();
  const entries: { dir: string; entry: string; path: string; tailwind: boolean; cssPath: string }[] = [];
  let needsFallback = false;
  let needsFlat = false;
  const links: { dir: string; path: string }[] = [];

  for (const app of apps) {
    const appDir = join(cwd, app.path);
    if (app.stack === "react-web") {
      const srcDir = app.srcDir ?? chooseSrcDir(appDir);
      const tailwind = detectTailwind(appDir);
      srcDirs.set(app.path, srcDir);
      if (tailwind === "v3") {
        notes.push(`${appLabel(app)}: Tailwind v3 found, so Motif wrote CSS variables only. Use them as bg-[var(--motif-color-action-primary)], or upgrade to Tailwind v4 for Motif's Tailwind theme.`);
      }
      for (const f of generateReactWeb(theme, { srcDir, tailwind })) files.push({ path: prefixPath(app.path, f.path), content: f.content });
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
      files.push({ path: cssPath, content: motifCss(theme) });
      links.push({ dir: join(appDir, site), path: cssPath });
      needsFlat = true;
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
  if (needsFallback) files.push(...generateFallback(theme));
  else if (needsFlat) files.push(flatTokensFile(theme));

  const results = writeGenerated(cwd, files);
  const settingsStatus = updateSettings(cwd, detected, srcDirs, notes);
  if (settingsStatus) results.push({ path: "design/motif.json", status: settingsStatus });

  const blockedPaths = new Set(results.filter((r) => r.status === "protected").map((r) => r.path));
  for (const e of entries) {
    if (blockedPaths.has(e.cssPath) || isReferenced(e.dir, e.entry)) continue;
    notes.push(e.tailwind
      ? `Next: in your main CSS file, add an @import for ${e.path} right after @import "tailwindcss" (write the path relative to that CSS file). Importing it before Tailwind undoes the theme.`
      : `Next: load ${e.path} once: @import it from your main CSS file, or import it in your app's entry file.`);
  }
  for (const l of links) {
    if (blockedPaths.has(l.path) || isReferenced(l.dir, "motif.css")) continue;
    notes.push(`Next: link ${l.path} in each page's <head>, before your own styles: <link rel="stylesheet" href="motif.css"> (write the path relative to the page).`);
  }

  const blocked = results.filter((r) => r.status === "protected");
  const allSame = results.length > 0 && results.every((r) => r.status === "unchanged");
  const lines = [
    blocked.length > 0 ? "✗ Some theme files couldn't be written:" : allSame ? "✓ Theme code is up to date." : "✓ Theme code is ready:",
    ...results.map((r) => `  ${r.status.padEnd(STATUS_WIDTH)} ${r.path}`),
    ...(fonts.length > 0
      ? [`Theme fonts: ${fonts.map((f) => `${f.family} ${f.weights.join(" · ")}`).join(", ")}. Your app needs to load them (your stack's Motif guide shows how).`]
      : []),
    ...blocked.map((b) => `${b.path} already exists and wasn't made by Motif, so it was left alone (and files that depend on it were skipped). Rename or remove it, then run motif tokens again.`),
    ...notes.map((n) => `• ${n}`),
  ];
  return {
    command: "tokens",
    exitCode: blocked.length > 0 ? 1 : 0,
    text: lines.join("\n"),
    data: { files: results, notes, fonts },
  };
}
