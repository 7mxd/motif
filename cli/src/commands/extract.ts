import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { SourceFile } from "../check/files";
import { expandHtml } from "../check/html";
import { appSourceFiles } from "../check/run";
import type { CommandResult, RunContext } from "../cli/output";
import { detectApps, siteDir, STACK_LABELS, WEB_STACKS, type AppInfo } from "../detect/stacks";
import { buildDraft, collectOccurrences, mergeOccurrences, type Occurrences } from "../extract/draft";
import { ownSpacingPx, readTailwindDefaults } from "../extract/tailwind-theme";
import { isMotifGenerated } from "../generate/header";
import { appLabel, noSuchApp, prefixPath, selectApps } from "../project/apps";
import { readIgnorePatterns } from "../project/settings";
import { nativeStack, nativeStacks, type NativeStack } from "../stacks/native";
import { andList, plural } from "../text";

/**
 * Stylesheets a page links for dark mode only (<link media="(prefers-color-scheme: dark)">): all their colours are dark.
 * A link from the site's root (/dark.css) is looked for in each of `roots`.
 */
function darkLinked(files: SourceFile[], roots: string[]): SourceFile[] {
  const dark = new Set<string>();
  for (const page of files.filter((f) => /\.html?$/i.test(f.path))) {
    for (const tag of page.text.matchAll(/<link\b[^>]*>/gi)) {
      if (!/\bmedia\s*=\s*["']?[^"'>]*prefers-color-scheme\s*:\s*dark/i.test(tag[0])) continue;
      const href = tag[0].match(/\bhref\s*=\s*["']?([^"'\s>]+)/i)?.[1];
      if (!href || /^[a-z]+:|^\/\//i.test(href)) continue;
      const path = href.split(/[?#]/)[0]!;
      const targets = path.startsWith("/") ? roots.map((r) => posix.join(r, path)) : [posix.join(posix.dirname(page.path), path)];
      for (const t of targets) dark.add(posix.normalize(t));
    }
  }
  return files.map((f) => (f.lang === "css" && dark.has(f.path) ? { ...f, dark: [[0, f.text.length]] as [number, number][] } : f));
}

export const DRAFT_PATH = "design/tokens.draft.json";
export const REPORT_PATH = "design/extract-report.json";
export const PREVIOUS_DRAFT_PATH = "design/tokens.draft.previous.json";


export async function runExtract(cwd: string, ctx: RunContext): Promise<CommandResult> {
  const { apps: detected, findings: settingProblems } = detectApps(cwd);
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return { command: "extract", exitCode: 2, text: noSuchApp(ctx.app, detected), data: { error: "no-such-app" } };
  }
  const isWeb = (a: AppInfo) => a.stack !== null && WEB_STACKS.includes(a.stack);
  /** A native stack (Flutter) whose code motif extract reads. */
  const native = (a: AppInfo) => (isWeb(a) ? null : nativeStack(a.stack)?.collect ? nativeStack(a.stack) : null);
  const supported = apps.filter((a) => isWeb(a) || native(a) !== null);
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    const drafted = nativeStacks().filter((s) => s.collect).map((s) => `${STACK_LABELS[s.id]} apps`);
    return {
      command: "extract",
      exitCode: 2,
      text: `motif extract works on React web apps and plain web sites${drafted.length > 0 ? `, and on ${andList(drafted)}` : ""}, in this version.${others.length ? ` Found: ${others.join(", ")}.` : " None of them was found here."} Meanwhile, Motif's review can draft a design guide from your app's code by hand: ask your agent for a design review.`,
      data: { error: "unsupported-stack" },
    };
  }

  const ignore = readIgnorePatterns(cwd);
  const noTailwind = new Set<SourceFile>();
  const web = supported.filter(isWeb);
  const webFiles = web.flatMap((a) => {
    // The site's root: a plain site's folder, or a React app's public/ (or the app itself).
    const roots = a.stack === "plain-web" ? [prefixPath(a.path, siteDir(cwd, a))] : [prefixPath(a.path, "public"), a.path];
    const own = expandHtml(darkLinked(appSourceFiles(cwd, a, { ignore }).filter((f) => !isMotifGenerated(f.path, f.text)), roots));
    if (a.stack === "plain-web") for (const f of own) noTailwind.add(f);
    return own;
  });
  const parts: Occurrences[] = [];
  if (web.length > 0) {
    const react = web.filter((a) => a.stack === "react-web");
    const defaults = readTailwindDefaults([...react.map((a) => join(cwd, a.path)), cwd]);
    // The app's own spacing step (@theme { --spacing }) wins over Tailwind's default.
    const ownSpacing = ownSpacingPx(webFiles.filter((f) => f.lang === "css" && !noTailwind.has(f)).map((f) => f.text));
    const tw = defaults && ownSpacing !== null ? { ...defaults, spacingPx: ownSpacing } : defaults;
    // Plain web sites have no utility classes. Every app's own variables are read the way a person would; colour lists in
    // a plain site's scripts are data, but a React app's theme objects (MUI's createTheme) are its theme.
    parts.push(collectOccurrences(webFiles, tw, (f) => !noTailwind.has(f), () => true, (f) => noTailwind.has(f)));
  }
  // Native apps (Flutter): each stack reads all its apps' own files (not Motif's) together. With a web app as well, the
  // values found in both are put together into one draft.
  // Their shared packages (a Flutter path: dependency) add their theme code, not their widgets.
  const nativeFiles = new Map<NativeStack, { own: SourceFile[]; shared: Map<string, SourceFile>; notes: string[] }>();
  for (const a of supported) {
    const stack = native(a);
    if (!stack) continue;
    const entry = nativeFiles.get(stack) ?? { own: [] as SourceFile[], shared: new Map<string, SourceFile>(), notes: [] as string[] };
    entry.own.push(...(stack.sourceFiles?.(cwd, a, { ignore }) ?? []).filter((f) => !isMotifGenerated(f.path, f.text)));
    const shared = stack.sharedFiles?.(cwd, a, { ignore });
    for (const f of shared?.files ?? []) if (!isMotifGenerated(f.path, f.text)) entry.shared.set(f.path, f);
    for (const n of shared?.notes ?? []) if (!entry.notes.includes(n)) entry.notes.push(n);
    nativeFiles.set(stack, entry);
  }
  for (const [stack, { own, shared, notes }] of nativeFiles) {
    const occ = stack.collect!(own, [...shared.values()]);
    parts.push(notes.length > 0 ? { ...occ, notes: [...notes, ...(occ.notes ?? [])] } : occ);
  }
  const files = [...webFiles, ...[...nativeFiles.values()].flatMap((e) => [...e.own, ...e.shared.values()])];
  const occ = mergeOccurrences(parts);
  const { tokens, report } = buildDraft(occ);

  const notes = [...settingProblems.map((f) => f.message), ...report.notes];
  mkdirSync(join(cwd, "design"), { recursive: true });
  // The draft is meant to be edited; keep the last one rather than silently replacing someone's edits.
  if (existsSync(join(cwd, DRAFT_PATH))) {
    renameSync(join(cwd, DRAFT_PATH), join(cwd, PREVIOUS_DRAFT_PATH));
    notes.push(`Your previous draft was kept as ${PREVIOUS_DRAFT_PATH}.`);
  }
  writeFileSync(join(cwd, DRAFT_PATH), JSON.stringify(tokens, null, 2) + "\n");
  writeFileSync(join(cwd, REPORT_PATH), JSON.stringify(report, null, 2) + "\n");

  const skipped = apps.filter((a) => !supported.includes(a)).map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
  if (skipped.length) notes.push(`Skipped (not supported yet): ${skipped.join(", ")}.`);
  if (existsSync(join(cwd, "design", "tokens.json"))) notes.push("You already have design/tokens.json; it wasn't changed. Compare it with the draft.");

  // An HTML page is read as two views (its CSS and the rest); count it once.
  const fileCount = new Set(files.map((f) => f.path)).size;
  const summary = {
    colors: occ.colors.length,
    colorGroups: (report.colors as unknown[]).length,
    spacing: occ.space.length,
    offScale: (report.spacing as { onScale: boolean }[]).filter((s) => !s.onScale).length,
    radius: occ.radius.length,
    textSizes: occ.fontSize.length,
    fonts: occ.fontFamily.map((f) => f.value),
    durations: occ.duration.length,
    unresolved: report.unresolved.length,
  };
  const text = [
    `✓ Draft theme values written to ${DRAFT_PATH} (from ${plural(fileCount, "file", "files")}).`,
    `  Colours: ${summary.colors} found, grouped into ${summary.colorGroups}`,
    `  Spacing: ${plural(summary.spacing, "value", "values")}, ${summary.offScale} off a 4px scale`,
    `  Corners: ${plural(summary.radius, "size", "sizes")} · Text sizes: ${summary.textSizes} · Fonts: ${summary.fonts.join(", ") || "none found"} · Animation timings: ${summary.durations}`,
    ...notes.map((n) => `• ${n}`),
    `Next: review the draft (details in ${REPORT_PATH}). When it looks right, rename it to design/tokens.json and add a DESIGN.md (your agent can write it with /design), then run motif validate.`,
  ].join("\n");

  return { command: "extract", exitCode: 0, text, data: { files: fileCount, draft: DRAFT_PATH, report: REPORT_PATH, summary, notes } };
}
