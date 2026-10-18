import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "../check/files";
import { expandHtml } from "../check/html";
import { appSourceFiles } from "../check/run";
import type { CommandResult, RunContext } from "../cli/output";
import { ADAPTERS_AVAILABLE, detectApps, STACK_LABELS } from "../detect/stacks";
import { buildDraft, collectOccurrences } from "../extract/draft";
import { readTailwindDefaults } from "../extract/tailwind-theme";
import { isMotifGenerated } from "../generate/header";
import { appLabel, noSuchApp, selectApps } from "../project/apps";
import { readIgnorePatterns } from "../project/settings";
import { plural } from "../text";

export const DRAFT_PATH = "design/tokens.draft.json";
export const REPORT_PATH = "design/extract-report.json";
export const PREVIOUS_DRAFT_PATH = "design/tokens.draft.previous.json";


export async function runExtract(cwd: string, ctx: RunContext): Promise<CommandResult> {
  const detected = detectApps(cwd).apps;
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return { command: "extract", exitCode: 2, text: noSuchApp(ctx.app, detected), data: { error: "no-such-app" } };
  }
  const supported = apps.filter((a) => a.stack !== null && ADAPTERS_AVAILABLE.includes(a.stack));
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    return {
      command: "extract",
      exitCode: 2,
      text: `motif extract works on React web apps and plain web sites in this version.${others.length ? ` Found: ${others.join(", ")}.` : " Neither was found here."} Meanwhile, Motif's review can draft a design guide from your app's code by hand: ask your agent for a design review.`,
      data: { error: "unsupported-stack" },
    };
  }

  const ignore = readIgnorePatterns(cwd);
  const noTailwind = new Set<SourceFile>();
  const files = supported.flatMap((a) => {
    const own = expandHtml(appSourceFiles(cwd, a, { ignore }).filter((f) => !isMotifGenerated(f.path, f.text)));
    if (a.stack === "plain-web") for (const f of own) noTailwind.add(f);
    return own;
  });
  const react = supported.filter((a) => a.stack === "react-web");
  const tw = readTailwindDefaults([...react.map((a) => join(cwd, a.path)), cwd]);
  // Plain web sites have no utility classes, and their own variables are read the way a person would.
  const occ = collectOccurrences(files, tw, (f) => !noTailwind.has(f), (f) => noTailwind.has(f));
  const { tokens, report } = buildDraft(occ);

  const notes = [...report.notes];
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
