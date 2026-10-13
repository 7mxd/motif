import { posix } from "node:path";

/** Files load one at a time, so each must stay short (spec §8.4; Agent Skills: SKILL.md under 500 lines). */
export function lineLimit(file: string): number {
  if (file === "SKILL.md") return 500;
  if (file.startsWith("knowledge/")) return 300;
  return 400;
}

const NOT_PORTABLE: [RegExp, string][] = [
  [/\b(?:AskUserQuestion|TodoWrite|SlashCommand|WebFetch|WebSearch)\b/, "a specific agent's tool name"],
  [/\b(?:Bash|Read|Write|Edit|Glob|Grep|Task|Skill) tool\b/, "a specific agent's tool name"],
  [/\bmcp__\w+/, "an agent-specific MCP tool name (name tools by their own names, e.g. refero_get_style)"],
  [/^(?:allowed-tools|context|hooks|argument-hint|disable-model-invocation):/m, "agent-specific frontmatter"],
  [/\$ARGUMENTS|\$\{CLAUDE_[A-Z_]+\}/, "an agent-specific variable"],
];

const UX_SECTIONS = ["Goal", "Anatomy", "Required states", "Common mistakes", "Mobile and web"];

export function lintSkillMarkdown(file: string, raw: string, opts: { exists: (skillPath: string) => boolean; commands: string[] }): string[] {
  const text = raw.replace(/\r\n/g, "\n");
  const problems: string[] = [];

  const lines = text.split("\n").length;
  if (lines > lineLimit(file)) problems.push(`${file} is ${lines} lines; the limit is ${lineLimit(file)}.`);

  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1]!.split("#")[0]!;
    if (!target || /^[a-z][a-z+.-]*:/i.test(target)) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(file), target));
    if (!opts.exists(resolved)) problems.push(`${file} links to "${m[1]}", which doesn't exist.`);
  }

  for (const [pattern, what] of NOT_PORTABLE) {
    if (pattern.test(text)) problems.push(`${file} uses ${what}.`);
  }

  for (const m of text.matchAll(/(?:^|`)[ \t]*motif ([a-z][a-z-]*)/gm)) {
    if (!opts.commands.includes(m[1]!)) problems.push(`${file} mentions "motif ${m[1]}", which isn't a Motif command.`);
  }

  if (file.startsWith("knowledge/ux-patterns/")) {
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
    if (JSON.stringify(sections) !== JSON.stringify(UX_SECTIONS)) {
      problems.push(`${file} needs exactly these sections, in order: ${UX_SECTIONS.join(", ")} (has: ${sections.join(", ") || "none"}).`);
    }
  }
  return problems;
}
