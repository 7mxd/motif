import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listSourceFiles } from "../check/files";
import type { CommandResult, RunContext } from "../cli/output";
import { detectApps, STACK_LABELS } from "../detect/stacks";
import { buildDraft, collectOccurrences } from "../extract/draft";
import { readTailwindDefaults } from "../extract/tailwind-theme";
import { isMotifGenerated } from "../generate/header";
import { appLabel, selectApps } from "../project/apps";
import { readIgnorePatterns } from "../project/settings";

export const DRAFT_PATH = "design/tokens.draft.json";
export const REPORT_PATH = "design/extract-report.json";
export const PREVIOUS_DRAFT_PATH = "design/tokens.draft.previous.json";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runExtract(cwd: string, ctx: RunContext): Promise<CommandResult> {
  const detected = detectApps(cwd).apps;
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return { command: "extract", exitCode: 2, text: `There's no app at "${ctx.app}". Apps here: ${detected.map((a) => a.path).join(", ") || "none"}.`, data: { error: "no-such-app" } };
  }
  const react = apps.filter((a) => a.stack === "react-web");
  if (react.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    return {
      command: "extract",
      exitCode: 2,
      text: `motif extract works on React web apps in this version.${others.length ? ` Found: ${others.join(", ")}.` : " No React web app was found here."} Support for more stacks is coming soon.`,
      data: { error: "unsupported-stack" },
    };
  }

  const ignore = readIgnorePatterns(cwd);
  const files = react
    .flatMap((a) => listSourceFiles(cwd, a.path, { ignore }))
    .filter((f) => !isMotifGenerated(f.path, f.text));
  const tw = readTailwindDefaults([...react.map((a) => join(cwd, a.path)), cwd]);
  const occ = collectOccurrences(files, tw);
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

  const skipped = apps.filter((a) => a.stack !== "react-web").map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
  if (skipped.length) notes.push(`Skipped (not supported yet): ${skipped.join(", ")}.`);
  if (existsSync(join(cwd, "design", "tokens.json"))) notes.push("You already have design/tokens.json; it wasn't changed. Compare it with the draft.");

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
    `✓ Draft theme values written to ${DRAFT_PATH} (from ${plural(files.length, "file", "files")}).`,
    `  Colours: ${summary.colors} found, grouped into ${summary.colorGroups}`,
    `  Spacing: ${plural(summary.spacing, "value", "values")}, ${summary.offScale} off a 4px scale`,
    `  Corners: ${plural(summary.radius, "size", "sizes")} · Text sizes: ${summary.textSizes} · Fonts: ${summary.fonts.join(", ") || "none found"} · Animation timings: ${summary.durations}`,
    ...notes.map((n) => `• ${n}`),
    `Next: review the draft (details in ${REPORT_PATH}). When it looks right, rename it to design/tokens.json and add a DESIGN.md (your agent can write it with /design), then run motif validate.`,
  ].join("\n");

  return { command: "extract", exitCode: 0, text, data: { files: files.length, draft: DRAFT_PATH, report: REPORT_PATH, summary, notes } };
}
