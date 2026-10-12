import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { checkApp, type ExceptionHit } from "../check/run";
import type { Hit } from "../check/types";
import { loadTokenDocument } from "../contract/load";
import { detectApps, STACK_LABELS } from "../detect/stacks";
import { buildTheme } from "../generate/theme";
import { appLabel, selectApps } from "../project/apps";
import { readIgnorePatterns } from "../project/settings";
import { TOKENS_JSON } from "./validate";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function byFile(hits: Hit[], line: (h: Hit) => string): string[] {
  const out: string[] = [];
  let current = "";
  for (const h of hits) {
    if (h.file !== current) {
      current = h.file;
      out.push("", h.file);
    }
    out.push(line(h));
  }
  return out;
}

export async function runCheck(cwd: string, ctx: RunContext): Promise<CommandResult> {
  const tokensPath = join(cwd, "design", "tokens.json");
  if (!existsSync(tokensPath)) {
    return {
      command: "check",
      exitCode: 2,
      text: "No design guide found in this folder (missing design/tokens.json).\nDraft one from your code with motif extract, or start one with /design.",
      data: { error: "no-contract" },
    };
  }
  const { doc } = loadTokenDocument(TOKENS_JSON, readFileSync(tokensPath, "utf8"));
  if (!doc) {
    return { command: "check", exitCode: 2, text: "Your theme values file can't be read. Run motif validate to see why.", data: { error: "invalid-contract" } };
  }

  const detected = detectApps(cwd).apps;
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return { command: "check", exitCode: 2, text: `There's no app at "${ctx.app}". Apps here: ${detected.map((a) => a.path).join(", ") || "none"}.`, data: { error: "no-such-app" } };
  }
  const supported = apps.filter((a) => a.stack === "react-web");
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    return {
      command: "check",
      exitCode: 2,
      text: `motif check works on React web apps in this version.${others.length ? ` Found: ${others.join(", ")}.` : " No React web app was found here."} Support for more stacks is coming soon.`,
      data: { error: "unsupported-stack" },
    };
  }

  // Paths may be absolute or relative to the current folder; scan them relative to the project root.
  const paths: string[] = [];
  for (const p of ctx.positionals) {
    const abs = resolve(cwd, p);
    const rel = relative(cwd, abs).replace(/\\/g, "/");
    if (!existsSync(abs)) {
      return { command: "check", exitCode: 2, text: `"${p}" doesn't exist. Give paths relative to this folder, or absolute paths.`, data: { error: "no-such-path", path: p } };
    }
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return { command: "check", exitCode: 2, text: `"${p}" is outside this project (${cwd}).`, data: { error: "path-outside-project", path: p } };
    }
    if (rel === "") {
      paths.length = 0;
      break;
    }
    paths.push(rel);
  }

  const theme = buildTheme(doc);
  const ignore = readIgnorePatterns(cwd);
  const results = supported.map((a) => checkApp(cwd, a, theme, { paths, ignore }));
  if (paths.length > 0 && results.every((r) => r.files === 0)) {
    return {
      command: "check",
      exitCode: 2,
      text: `None of these paths contain files motif check reads (.css, .ts, .tsx, .js, .jsx, .html, …), or they're ignored: ${ctx.positionals.join(", ")}.`,
      data: { error: "nothing-to-check" },
    };
  }
  const violations = results.flatMap((r) => r.violations);
  const exceptions: ExceptionHit[] = results.flatMap((r) => r.exceptions);
  const warnings = results.flatMap((r) => r.warnings);
  const files = results.reduce((n, r) => n + r.files, 0);
  const filesWithProblems = new Set(violations.map((v) => v.file)).size;
  const allowed = exceptions.length ? ` (${exceptions.length} allowed with a reason)` : "";

  const lines: string[] = violations.length
    ? [`✗ ${plural(violations.length, "design problem", "design problems")} in ${plural(filesWithProblems, "file", "files")}${allowed}:`,
       ...byFile(violations, (h) => `  ${h.line}:${h.column}  ${h.rule.padEnd(18)} ${h.message} ${h.fix}`)]
    : [`✓ No design problems found in ${plural(files, "file", "files")}.${allowed}`];
  if (exceptions.length) {
    lines.push("", "Allowed with a reason:", ...exceptions.map((e) => `  ${e.file}:${e.line}  ${e.rule}  ${e.text} — motif-ok: ${e.reason}`));
  }
  if (warnings.length) {
    lines.push("", "Warnings:", ...warnings.map((w) => `  ${w.file}  ${w.message} ${w.fix}`));
  }
  const skipped = apps.filter((a) => a.stack !== "react-web").map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
  if (skipped.length) lines.push("", `Skipped (not supported yet): ${skipped.join(", ")}.`);
  if (violations.length) lines.push("", 'Fix these, or ask your agent: "fix the motif check findings".');

  return {
    command: "check",
    exitCode: violations.length ? 1 : 0,
    text: lines.join("\n"),
    data: {
      violations,
      exceptions,
      warnings,
      summary: { files, violations: violations.length, exceptions: exceptions.length, warnings: warnings.length },
    },
  };
}
