// A case's folder: a fresh copy of the fixture app with its packages installed (B, C), or an empty folder holding the brief (D),
// plus git's record of how it started (a plain site installs nothing). The record lives beside the app, not in it, so nothing the session does can change it.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "../fixtures/assemble";
import type { EvalCase } from "./cases";
import { tail, type Run } from "./tools";

export interface Workspace { dir: string; app: string; gitDir: string; baseline?: string }
export interface Change { status: "added" | "modified" | "deleted"; path: string }

const BRIEFS = join(import.meta.dir, "..", "fixtures", "briefs");

/** Deletes a folder; on Windows a program that just stopped can hold its files for a moment. */
export function removeDir(dir: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (attempt >= 30) throw e;
      Bun.sleepSync(200);
    }
  }
}

const git = (ws: { gitDir: string; app: string }, args: string[]) => [
  "git", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.quotePath=false",
  `--git-dir=${ws.gitDir}`, `--work-tree=${ws.app}`, ...args,
];

async function gitOut(ws: { gitDir: string; app: string }, run: Run, args: string[]): Promise<string> {
  const r = await run(git(ws, args), ws.app, 300_000);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${tail(r)}`);
  return r.stdout;
}

/** Records the app folder as it is now (the files git would keep); returns git's id for that state. */
export async function snapshot(ws: { gitDir: string; app: string }, run: Run): Promise<string> {
  if (!existsSync(ws.gitDir)) await gitOut(ws, run, ["init", "-q"]);
  await gitOut(ws, run, ["add", "-A"]);
  return (await gitOut(ws, run, ["write-tree"])).trim();
}

const STATUS: Record<string, Change["status"]> = { A: "added", D: "deleted" };

/** What changed since the snapshot. Ignored files (node_modules, .next) don't count. */
export async function changes(ws: Workspace, run: Run): Promise<Change[]> {
  if (!ws.baseline) return [];
  await gitOut(ws, run, ["add", "-A"]);
  const out = await gitOut(ws, run, ["diff", "--cached", "--name-status", "--no-renames", ws.baseline]);
  return out.split("\n").filter((l) => l.trim()).map((l) => {
    const [status, ...path] = l.split("\t");
    return { status: STATUS[status!.charAt(0)] ?? "modified", path: path.join("\t") };
  });
}

/** The diff since the snapshot, for the results folder; only for some paths if given. */
export async function patch(ws: Workspace, run: Run, paths: string[] = []): Promise<string> {
  if (!ws.baseline) return "";
  await gitOut(ws, run, ["add", "-A"]);
  return gitOut(ws, run, ["diff", "--cached", "--no-renames", ws.baseline, ...(paths.length ? ["--", ...paths] : [])]);
}

export async function prepareWorkspace(c: EvalCase, dir: string, run: Run): Promise<Workspace> {
  removeDir(dir);
  const ws: Workspace = { dir, app: join(dir, "app"), gitDir: join(dir, "baseline.git") };
  mkdirSync(ws.app, { recursive: true });
  if (c.brief) {
    copyFileSync(join(BRIEFS, `${c.brief}.md`), join(ws.app, "brief.md"));
    return ws;
  }
  assemble(c.fixture!, ws.app);
  // A plain web site has no packages to install.
  if (existsSync(join(ws.app, "package.json"))) {
    const install = await run(["npm", "ci", "--no-audit", "--no-fund"], ws.app, 900_000);
    if (install.code !== 0) throw new Error(`Installing the app's packages failed (npm ci):\n${tail(install)}`);
  }
  ws.baseline = await snapshot(ws, run);
  return ws;
}

/** Where test D's new app ended up: this folder, or the one folder inside it with a design guide. */
export function findApp(dir: string): string | null {
  if (existsSync(join(dir, "DESIGN.md"))) return dir;
  const withGuide = readdirSync(dir).filter(
    (n) => !n.startsWith(".") && n !== "node_modules" && statSync(join(dir, n)).isDirectory() && existsSync(join(dir, n, "DESIGN.md")),
  );
  if (withGuide.length === 1) return join(dir, withGuide[0]!);
  const apps = withGuide.filter((n) => existsSync(join(dir, n, "package.json")));
  return apps.length === 1 ? join(dir, apps[0]!) : null;
}
