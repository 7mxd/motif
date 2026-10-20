import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CommandResult, RunContext } from "../cli/output";
import { checkApp, type ExceptionHit } from "../check/run";
import type { Hit } from "../check/types";
import { loadTokenDocument } from "../contract/load";
import { ADAPTERS_AVAILABLE, detectApps, STACK_LABELS } from "../detect/stacks";
import { buildThemeSet } from "../generate/theme";
import { appLabel, noSuchApp, selectApps } from "../project/apps";
import { readIgnorePatterns } from "../project/settings";
import { checkableNativeStacks, nativeStack } from "../stacks/native";
import { TOKENS_JSON } from "./validate";
import { andList, plural } from "../text";


/** Past this many problems, the text groups them; --json always lists each one and the groups. */
const GROUP_OVER = 25;
const MAX_GROUPS = 30;

interface Group {
  rule: string;
  kind?: string;
  text: string;
  count: number;
  files: number;
  message: string;
  fix: string;
  suggestion?: string;
  /** Where the first few are (file:line), each place once. */
  where: string[];
  /** How many places (file:line) it is at: a line with the same value twice is one place. */
  places: number;
}

const WHERE = 3;

/** Problems grouped by rule, kind and what was written (text-sm, #3b82f6), most frequent first. */
function groupHits(hits: Hit[]): Group[] {
  const groups = new Map<string, Hit[]>();
  for (const h of hits) {
    const key = `${h.rule}|${h.kind ?? ""}|${h.text}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  return [...groups.values()]
    .map((all) => {
      const first = all[0]!;
      const places = [...new Set(all.map((h) => `${h.file}:${h.line}`))];
      return {
        rule: first.rule,
        ...(first.kind ? { kind: first.kind } : {}),
        text: first.text,
        count: all.length,
        files: new Set(all.map((h) => h.file)).size,
        message: first.message,
        fix: first.fix,
        ...(first.suggestion ? { suggestion: first.suggestion } : {}),
        where: places.slice(0, WHERE),
        places: places.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

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
    const found = detectApps(cwd).apps;
    // extract can't read every stack yet; then the review mode is the way to a first guide.
    const unreadable = found.length > 0 && !found.some((a) => a.stack !== null && ADAPTERS_AVAILABLE.includes(a.stack));
    return {
      command: "check",
      exitCode: 2,
      text: unreadable
        ? "No design guide found in this folder (missing design/tokens.json).\nStart one with /design: Motif's review drafts a design guide from your app's code."
        : "No design guide found in this folder (missing design/tokens.json).\nDraft one from your code with motif extract, or start one with /design.",
      data: { error: "no-contract" },
    };
  }
  const { doc } = loadTokenDocument(TOKENS_JSON, readFileSync(tokensPath, "utf8"));
  if (!doc) {
    return { command: "check", exitCode: 2, text: "Your theme values file can't be read. Run motif validate to see why.", data: { error: "invalid-contract" } };
  }

  // A problem in design/motif.json (an app that isn't there) is a problem: check doesn't pass quietly without that app.
  const { apps: detected, findings: settingProblems } = detectApps(cwd);
  const apps = selectApps(detected, ctx.app);
  if (apps === null) {
    return { command: "check", exitCode: 2, text: noSuchApp(ctx.app, detected), data: { error: "no-such-app" } };
  }
  const supported = apps.filter((a) => a.stack !== null && (ADAPTERS_AVAILABLE.includes(a.stack) || nativeStack(a.stack)?.scan !== undefined));
  if (supported.length === 0) {
    const others = apps.filter((a) => a.stack).map((a) => `${appLabel(a)} (${STACK_LABELS[a.stack!]})`);
    const reads = [...checkableNativeStacks().map((s) => `${STACK_LABELS[s.id]} apps`), "React web apps", "plain web sites"];
    return {
      command: "check",
      exitCode: 2,
      text: `motif check works on ${andList(reads)} in this version.${others.length ? ` Found: ${others.join(", ")}.` : ` ${reads.length > 2 ? "None" : "Neither"} was found here.`} Support for more stacks is coming soon.`,
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

  const set = buildThemeSet(doc);
  const { base: theme, variants } = set;
  const ignore = readIgnorePatterns(cwd);
  // A file two apps share (a Flutter package both depend on) is checked once, with the first app.
  const seen = new Set<string>();
  const results = supported.map((a) => checkApp(cwd, a, theme, { paths, ignore, variants, set, seen }));
  if (paths.length > 0 && results.every((r) => r.files === 0)) {
    return {
      command: "check",
      exitCode: 2,
      text: `None of these paths contain files motif check reads (${supported.some((a) => nativeStack(a.stack)) ? ".dart, " : ""}.css, .ts, .tsx, .js, .jsx, .html, …), or they're ignored: ${ctx.positionals.join(", ")}.`,
      data: { error: "nothing-to-check" },
    };
  }
  const violations = results.flatMap((r) => r.violations);
  const exceptions: ExceptionHit[] = results.flatMap((r) => r.exceptions);
  // Two apps sharing a theme folder expect the same generated file: one warning for it, not one per app.
  const warnings = [...new Map(results.flatMap((r) => r.warnings).map((w) => [`${w.rule}|${w.file}`, w])).values()];
  const files = results.reduce((n, r) => n + r.files, 0);
  const filesWithProblems = new Set(violations.map((v) => v.file)).size;
  const allowed = exceptions.length ? ` (${exceptions.length} allowed with a reason)` : "";

  // The same problem many times (text-sm ×345 on a first check of a real app) is one line, with the closest role.
  const groups = groupHits(violations);
  const grouped = violations.length > GROUP_OVER;
  const where = (g: Group) => `At ${g.where.join(", ")}${g.places > g.where.length ? ` and ${g.places - g.where.length} more` : ""}.`;
  const groupLine = (g: Group) => `  ${g.count}× ${g.text}  ${g.message} ${g.suggestion ? `Closest: ${g.suggestion}.` : g.fix} ${where(g)}`;
  const rest = groups.slice(MAX_GROUPS);
  const restCount = rest.reduce((n, g) => n + g.count, 0);
  const lines: string[] = !violations.length
    ? [`✓ No design problems found in ${plural(files, "file", "files")}.${allowed}`]
    : grouped
      ? [
          `✗ ${plural(violations.length, "design problem", "design problems")} in ${plural(filesWithProblems, "file", "files")}, grouped (--json lists each one)${allowed}:`,
          ...groups.slice(0, MAX_GROUPS).map(groupLine),
          ...(rest.length ? [`  …and ${plural(rest.length, "more kind", "more kinds")} (${plural(restCount, "problem", "problems")}): motif check --json lists each one.`] : []),
        ]
      : [`✗ ${plural(violations.length, "design problem", "design problems")} in ${plural(filesWithProblems, "file", "files")}${allowed}:`,
         ...byFile(violations, (h) => `  ${h.line}:${h.column}  ${h.rule.padEnd(18)} ${h.message} ${h.fix}`)];
  if (exceptions.length) {
    lines.push("", "Allowed with a reason:", ...exceptions.map((e) => `  ${e.file}:${e.line}  ${e.rule}  ${e.text} — motif-ok: ${e.reason}`));
  }
  if (warnings.length) {
    lines.push("", "Warnings:", ...warnings.map((w) => `  ${w.file}${w.line ? `:${w.line}` : ""}  ${w.message} ${w.fix}`));
  }
  // An app's own palette is typed colours by nature: still flagged, with what to do once the app uses Motif's theme.
  const palettes = results.flatMap((r) => r.palettes ?? []);
  if (palettes.length) {
    lines.push("", ...palettes.map((p) => `• ${p} is your own theme's palette: once the app uses Motif's theme, remove it, or list its folder under "ignore" in design/motif.json.`));
  }
  const skipped = apps.filter((a) => !supported.includes(a)).map((a) => `${appLabel(a)}${a.stack ? ` (${STACK_LABELS[a.stack]})` : ""}`);
  if (skipped.length) lines.push("", `Skipped (not supported yet): ${skipped.join(", ")}.`);
  if (violations.length) lines.push("", 'Fix these, or ask your agent: "fix the motif check findings".');

  const settingsErrors = settingProblems.filter((f) => f.severity === "error");
  if (settingProblems.length) lines.unshift(...settingProblems.map((f) => `${f.severity === "error" ? "✗" : "•"} ${f.message}`), "");
  return {
    command: "check",
    exitCode: violations.length || settingsErrors.length ? 1 : 0,
    text: lines.join("\n"),
    data: {
      violations,
      settings: settingProblems,
      groups,
      exceptions,
      warnings,
      ...(palettes.length ? { palettes } : {}),
      summary: { files, violations: violations.length, exceptions: exceptions.length, warnings: warnings.length },
    },
  };
}
