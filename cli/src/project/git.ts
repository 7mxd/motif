// Whether git ignores files Motif writes or reads (the guide, the generated theme): a .gitignore rule meant for something
// else (design/ for Figma exports) would keep them out of every commit.
import { basename } from "node:path";
import { andList } from "../text";

/** Runs a program: its exit code and output (a missing program gives a non-zero code). */
export type Runner = (cmd: string[]) => { code: number; stdout: string };

export const spawnRunner: Runner = (cmd) => {
  try {
    const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "ignore" });
    return { code: r.exitCode ?? 1, stdout: r.stdout.toString() };
  } catch {
    return { code: 127, stdout: "" };
  }
};

export interface IgnoredPath {
  path: string;
  /** The ignore file (as git names it), the rule's line in it, and the rule. */
  source: string;
  line: number;
  pattern: string;
}

/**
 * The paths (relative to root) git would leave out of a commit, each with the rule that ignores it. A file git already
 * tracks isn't ignored. None without git, or outside a repository.
 */
export function ignoredByGit(root: string, paths: string[], run: Runner = spawnRunner): IgnoredPath[] {
  if (paths.length === 0) return [];
  const r = run(["git", "-C", root, "check-ignore", "--verbose", "--", ...paths]);
  if (r.code !== 0) return [];
  const out: IgnoredPath[] = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^(.*):(\d+):(.*)\t(.*)$/);
    // A rule starting with ! matched the path but keeps it.
    if (!m || m[3]!.startsWith("!")) continue;
    out.push({ source: m[1]!, line: Number(m[2]), pattern: m[3]!, path: m[4]!.replace(/^"|"$/g, "") });
  }
  return out;
}

/** One line per rule: what it ignores, where it is, and how to let the files in. */
export function ignoredNotes(found: IgnoredPath[]): string[] {
  const rules = new Map<string, IgnoredPath[]>();
  for (const f of found) {
    const key = `${f.source}|${f.line}|${f.pattern}`;
    rules.set(key, [...(rules.get(key) ?? []), f]);
  }
  return [...rules.values()].map((all) => {
    const { source, line, pattern } = all[0]!;
    const paths = all.map((f) => f.path);
    const who = basename(source) === ".gitignore" ? `Your ${basename(source)} ignores` : "Git ignores";
    // A folder that is ignored can't have files let back in one by one: the rule itself is negated.
    const negate = /[*?[]/.test(pattern) ? andList(paths.map((p) => `!${p}`)) : `!${pattern}`;
    return `${who} ${pattern} (line ${line} of ${source}), so ${andList(paths)} won't be committed. Add ${negate} on a line below it, or narrow the rule.`;
  });
}
