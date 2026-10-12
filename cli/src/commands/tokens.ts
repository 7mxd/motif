import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { detectApps, STACK_LABELS, type AppInfo } from "../detect/stacks";
import { formatFindings, type Finding } from "../findings";
import { generateFallback } from "../generate/fallback";
import { isMotifGenerated, sameContent, type GeneratedFile } from "../generate/header";
import { buildTheme } from "../generate/theme";
import { appLabel, prefixPath, selectApps } from "../project/apps";
import { readSettingsJson, writeSettings, type AppSetting } from "../project/settings";
import { chooseSrcDir, detectTailwind, generateReactWeb } from "../stacks/react-web/generate";
import { TOKENS_JSON } from "./validate";

export type FileStatus = "created" | "updated" | "unchanged" | "protected";

export function writeGenerated(root: string, files: GeneratedFile[]): { path: string; status: FileStatus }[] {
  return files.map((f) => {
    const abs = join(root, f.path);
    if (existsSync(abs)) {
      const current = readFileSync(abs, "utf8");
      if (!isMotifGenerated(f.path, current)) return { path: f.path, status: "protected" as const };
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
    const apps: AppSetting[] = detected
      .filter((a) => a.stack !== null)
      .map((a) => ({ path: a.path, stack: a.stack!, ...(srcDirs.has(a.path) ? { srcDir: srcDirs.get(a.path)! } : {}) }));
    writeSettings(root, { motifContract: 1, apps, ignore: [] });
    return "created";
  }
  let changed = false;
  const apps = (raw!.apps as AppSetting[]).map((a) => {
    if (a?.stack === "react-web" && typeof a.srcDir !== "string" && srcDirs.has(a.path)) {
      changed = true;
      return { ...a, srcDir: srcDirs.get(a.path)! };
    }
    return a;
  });
  if (!changed) return "unchanged";
  const ignore = Array.isArray(raw!.ignore) ? (raw!.ignore as string[]) : [];
  writeSettings(root, { motifContract: 1, apps, ignore });
  return "updated";
}

const CODE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs)$/;

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

  const detected = detectApps(cwd).apps;
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return {
      command: "tokens",
      exitCode: 2,
      text: `There's no app at "${ctx.app}". Apps here: ${detected.map((a) => a.path).join(", ") || "none"}.`,
      data: { error: "no-such-app" },
    };
  }
  if (apps.length === 0) {
    return { command: "tokens", exitCode: 2, text: "No app found in this folder. Start one with /design first.", data: { error: "no-app" } };
  }

  const theme = buildTheme(doc);
  const files: GeneratedFile[] = [];
  const notes: string[] = [];
  const srcDirs = new Map<string, string>();
  const entries: { dir: string; entry: string; label: string }[] = [];
  let needsFallback = false;

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
      entries.push({ dir: join(appDir, srcDir), entry: tailwind === "v4" ? "motif.tailwind.css" : "motif.css", label: appLabel(app) });
    } else if (app.stack) {
      needsFallback = true;
      notes.push(`${appLabel(app)}: ${STACK_LABELS[app.stack]} support is coming soon. Motif wrote plain CSS variables and design/generated/tokens.flat.json to map by hand.`);
    } else {
      notes.push(`${appLabel(app)}: Motif couldn't tell which framework this app uses, so it was skipped. Add it to design/motif.json.`);
    }
  }
  if (needsFallback) files.push(...generateFallback(theme));

  const results = writeGenerated(cwd, files);
  const settingsStatus = updateSettings(cwd, detected, srcDirs, notes);
  if (settingsStatus) results.push({ path: "design/motif.json", status: settingsStatus });

  for (const e of entries) {
    if (!isReferenced(e.dir, e.entry)) notes.push(`Next: import "./styles/${e.entry}" once in ${e.label === "Your app" ? "your app" : e.label}'s main CSS file.`);
  }

  const blocked = results.filter((r) => r.status === "protected");
  const allSame = results.every((r) => r.status === "unchanged");
  const lines = [
    blocked.length > 0 ? "✗ Some theme files couldn't be written:" : allSame ? "✓ Theme code is up to date." : "✓ Theme code is ready:",
    ...results.map((r) => `  ${r.status.padEnd(STATUS_WIDTH)} ${r.path}`),
    ...blocked.map((b) => `${b.path} already exists and wasn't made by Motif, so it was left alone. Rename or remove it, then run motif tokens again.`),
    ...notes.map((n) => `• ${n}`),
  ];
  return {
    command: "tokens",
    exitCode: blocked.length > 0 ? 1 : 0,
    text: lines.join("\n"),
    data: { files: results, notes },
  };
}
