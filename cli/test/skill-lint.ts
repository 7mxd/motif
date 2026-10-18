import { posix } from "node:path";

/** Files load one at a time, so each must stay short (spec §8.4; Agent Skills: SKILL.md under 500 lines). */
export function lineLimit(file: string): number {
  if (file === "SKILL.md") return 500;
  if (file.startsWith("knowledge/")) return 300;
  return 400;
}

/** Lines as an editor counts them: a final newline doesn't start another line. */
export function lineCount(text: string): number {
  return text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
}

/** The one file in skill/ that may name agents' tools: per-agent notes (Part 3 spec §5, core spec §5.5). */
export const AGENT_NOTES = "agents.md";

const NOT_PORTABLE: [RegExp, string, "tool" | "other"][] = [
  [/\b(?:AskUserQuestion|TodoWrite|SlashCommand|WebFetch|WebSearch|request_user_input|ask_user|AskQuestion|askQuestions)\b/, "a specific agent's tool name", "tool"],
  [/\b(?:Bash|Read|Write|Edit|Glob|Grep|Task|Skill) tool\b/, "a specific agent's tool name", "tool"],
  [/\bmcp__\w+/, "an agent-specific MCP tool name (name tools by their own names, e.g. refero_get_style)", "other"],
  [/\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/, "an agent-specific variable", "other"],
];
const AGENT_FRONTMATTER = /^(?:allowed-tools|context|hooks|argument-hint|disable-model-invocation|user-invocable|model|agent):/m;
const SKILL_KEYS = ["name", "description", "license", "compatibility", "metadata"];
const UX_SECTIONS = ["Goal", "Anatomy", "Required states", "Common mistakes", "Mobile and web"];
const SHELL_BLOCKS = new Set(["", "sh", "bash", "shell", "console", "powershell", "ps1", "pwsh", "cmd", "bat"]);
const NOT_PORTABLE_SHELL: [RegExp, string][] = [
  [/&&|\|\|/, "chains commands with && or || (Windows PowerShell 5 can't; put one command per line)"],
  [/\$\(/, "uses $(…), which only POSIX shells understand"],
  [/^\s*export\s+\w+=/m, "sets a variable with export, which only POSIX shells understand"],
  [/^\s*[A-Z_][A-Z0-9_]*=\S*\s+\S/m, "sets a variable for one command (NAME=value command), which only POSIX shells understand"],
];
// motif, or a path ending in motif / motif.cmd / motif.ps1 / motif.exe (quoted or not), then a command name.
const MOTIF_CALL = /(?:^|[\s"'(/\\&])motif(?:\.cmd|\.ps1|\.exe)?["']?[ \t]+([a-z][a-z-]*)/gm;
const LINK_PATTERNS = [/\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g, /^[ \t]*\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm];

/**
 * Fenced code blocks (with their language: the info string's first word) and inline code spans, plus the text with
 * the blocks taken out. Fences as Markdown reads them: a block closes with the same character, at least as long, at
 * any indent of up to three spaces.
 */
function split(text: string): { blocks: { lang: string; body: string }[]; inline: string[]; prose: string } {
  const blocks: { lang: string; body: string }[] = [];
  const prose: string[] = [];
  let open: { fence: string; lang: string; body: string[] } | null = null;
  for (const line of text.split("\n")) {
    if (open === null) {
      const m = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
      if (m && !(m[1]![0] === "`" && m[2]!.includes("`"))) {
        open = { fence: m[1]!, lang: m[2]!.trim().split(/\s+/)[0]!.toLowerCase(), body: [] };
      } else prose.push(line);
      continue;
    }
    const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)?.[1];
    if (close && close[0] === open.fence[0] && close.length >= open.fence.length) {
      blocks.push({ lang: open.lang, body: open.body.length > 0 ? `${open.body.join("\n")}\n` : "" });
      open = null;
    } else open.body.push(line);
  }
  if (open) blocks.push({ lang: open.lang, body: open.body.join("\n") });
  const rest = prose.join("\n");
  return { blocks, inline: [...rest.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!), prose: rest };
}

function frontmatter(text: string): string | null {
  return text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1] ?? null;
}

export function lintSkillMarkdown(file: string, raw: string, opts: { exists: (skillPath: string) => boolean; commands: string[] }): string[] {
  const text = raw.replace(/\r\n/g, "\n");
  const problems: string[] = [];
  const { blocks, inline, prose } = split(text);

  const lines = lineCount(text);
  if (lines > lineLimit(file)) problems.push(`${file} is ${lines} lines; the limit is ${lineLimit(file)}.`);

  for (const pattern of LINK_PATTERNS) {
    for (const m of prose.matchAll(pattern)) {
      const shown = m[1]!.replace(/^<|>$/g, "");
      const target = shown.split("#")[0]!;
      // A drive letter (C:/…) looks like a web address's scheme, but it's a path on one computer.
      if (/^[A-Za-z]:[\\/]/.test(target)) {
        problems.push(`${file} links to "${shown}", an absolute path on one computer (agents get only the skill folder).`);
        continue;
      }
      if (!target || /^[a-z][a-z+.-]*:/i.test(target)) continue;
      let decoded = target;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        // keep it as written
      }
      const resolved = posix.normalize(posix.join(posix.dirname(file), decoded)).replace(/\/$/, "");
      if (resolved === ".." || resolved.startsWith("../")) {
        problems.push(`${file} links to "${shown}", which is outside the skill folder (agents get only the skill folder).`);
      } else if (!opts.exists(resolved)) {
        problems.push(`${file} links to "${shown}", which doesn't exist.`);
      }
    }
  }

  for (const [pattern, what, kind] of NOT_PORTABLE) {
    if (kind === "tool" && file === AGENT_NOTES) continue;
    if (pattern.test(text)) problems.push(`${file} uses ${what}.`);
  }
  const fm = frontmatter(text);
  if (fm !== null && AGENT_FRONTMATTER.test(fm)) problems.push(`${file} uses agent-specific frontmatter.`);

  for (const code of [...inline, ...blocks.map((b) => b.body)]) {
    for (const m of code.matchAll(MOTIF_CALL)) {
      const command = m[1]!;
      if (command !== "help" && !opts.commands.includes(command)) problems.push(`${file} mentions "motif ${command}", which isn't a Motif command.`);
    }
  }
  for (const block of blocks.filter((b) => SHELL_BLOCKS.has(b.lang))) {
    for (const [pattern, what] of NOT_PORTABLE_SHELL) {
      if (pattern.test(block.body)) problems.push(`${file} has a shell example that ${what}.`);
    }
  }

  if (file === "SKILL.md") problems.push(...skillFrontmatter(fm));

  if (file.startsWith("knowledge/ux-patterns/")) {
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
    if (JSON.stringify(sections) !== JSON.stringify(UX_SECTIONS)) {
      problems.push(`${file} needs exactly these sections, in order: ${UX_SECTIONS.join(", ")} (has: ${sections.join(", ") || "none"}).`);
    }
  }
  return problems;
}

/** The Agent Skills rules for SKILL.md's frontmatter. */
function skillFrontmatter(fm: string | null): string[] {
  if (fm === null) return ["SKILL.md needs frontmatter (name and description between --- lines) at the very top."];
  const problems: string[] = [];
  for (const key of [...fm.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]!)) {
    if (!SKILL_KEYS.includes(key)) problems.push(`SKILL.md frontmatter has "${key}", which the Agent Skills format doesn't define (allowed: ${SKILL_KEYS.join(", ")}).`);
  }
  const field = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
    if (!m) return undefined;
    const value = m[1]!.trim();
    // A YAML block (description: > or |, then indented lines) is read whole: folded with spaces, or kept as lines.
    if (/^[>|][+-]?$/.test(value)) {
      const lines: string[] = [];
      for (const l of fm.slice(m.index! + m[0].length + 1).split("\n")) {
        if (!/^\s+\S/.test(l)) break;
        lines.push(l.trim());
      }
      return lines.join(value.startsWith(">") ? " " : "\n");
    }
    return value.replace(/^(["'])(.*)\1$/, "$2");
  };
  if (field("name") !== "motif") problems.push("SKILL.md frontmatter needs name: motif (it must match the folder the skill is installed in).");
  const description = field("description") ?? "";
  if (description.length < 1 || description.length > 1024) problems.push(`SKILL.md description must be 1–1024 characters (it has ${description.length}).`);
  const compatibility = field("compatibility");
  if (compatibility !== undefined && compatibility.length > 500) problems.push(`SKILL.md compatibility must be at most 500 characters (it has ${compatibility.length}).`);
  return problems;
}
