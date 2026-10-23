// Clearing a case's Claude Code project data. Claude Code from 2.1.30x has `claude purge`; older ones don't, so the runner
// removes the project's transcript folder itself, the way purge would.
import { lstatSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** What `claude purge --help` says first, in the versions that have it. */
export const PURGE_HELP = "Delete all Claude Code state for a project";

export const supportsPurge = (helpOutput: string): boolean => helpOutput.includes(PURGE_HELP);

export const NO_PURGE_NOTE =
  "This Claude Code has no `claude purge`, so Motif removes each case's saved transcripts itself (from ~/.claude/projects). Update Claude Code (claude update) to use purge.";

/** Claude Code's folder for a project: every character that isn't a letter or digit (path separators, the colon, dots) becomes "-". */
export const projectFolderName = (cwd: string): string => cwd.replace(/[^a-zA-Z0-9]/g, "-");

/** The path with its links resolved, or null when it can't be (it's gone): macOS's /tmp is /private/tmp. */
function realPath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * Removes the transcript folder for `cwd` under `<home>/.claude/projects`, named from the path as given and from its real
 * path (Claude Code may have saved it under either: /tmp/x or /private/tmp/x on macOS), and only those: each folder's name
 * must equal the computed name exactly and sit directly under the projects folder, and must be a real folder (not a
 * link). Returns why one wasn't removed, or nothing (also when there was nothing to remove).
 */
export function removeProjectData(home: string, cwd: string, real: (path: string) => string | null = realPath): string | void {
  let resolved: string | null = null;
  try {
    resolved = real(cwd);
  } catch {
    resolved = null;
  }
  const paths = [...new Set([cwd, ...(resolved && projectFolderName(resolved).replace(/-/g, "") ? [resolved] : [])])];
  // Each is tried; the first reason one was left alone is what's said.
  const why = paths.map((path) => removeOne(home, path)).find((w) => w);
  if (why) return why;
}

function removeOne(home: string, cwd: string): string | void {
  const projects = join(home, ".claude", "projects");
  const name = projectFolderName(cwd);
  const target = join(projects, name);
  if (!name || name === "." || name === ".." || basename(target) !== name || dirname(target) !== projects) {
    return `the folder name ${JSON.stringify(name)} isn't a single folder under ${projects}`;
  }
  const st = lstatOrNull(target);
  if (!st) return;
  if (!st.isDirectory() || st.isSymbolicLink()) return `${target} isn't a plain folder, so it was left alone`;
  try {
    rmSync(target, { recursive: true, force: true });
  } catch (e) {
    return (e as Error).message;
  }
}

function lstatOrNull(p: string) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}
