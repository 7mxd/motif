// Builds a working copy of an eval fixture: the contract app, plus the seeded overlay for the seeded app.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type FixtureName = "react-contract-app" | "react-seeded-app";

const FIXTURES = import.meta.dir;

/**
 * The files git keeps in a folder: tracked ones, plus new ones that aren't ignored. Local leftovers that git
 * ignores (node_modules, .next, screenshots, caches, env files) never reach an eval's copy.
 */
function keptFiles(dir: string): string[] {
  const r = Bun.spawnSync(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { cwd: dir });
  if (r.exitCode !== 0) throw new Error(`git ls-files failed in ${dir}: ${r.stderr.toString()}`);
  return [...new Set(r.stdout.toString().split("\0").filter(Boolean))].filter((f) => existsSync(join(dir, f)) && statSync(join(dir, f)).isFile());
}

function copyKept(from: string, dest: string): void {
  for (const file of keptFiles(from)) {
    mkdirSync(dirname(join(dest, file)), { recursive: true });
    copyFileSync(join(from, file), join(dest, file));
  }
}

export function assemble(fixture: FixtureName, dest: string): void {
  if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} isn't empty; a fixture is only assembled into an empty folder.`);
  mkdirSync(dest, { recursive: true });
  copyKept(join(FIXTURES, "react-contract-app"), dest);
  if (fixture === "react-seeded-app") {
    copyKept(join(FIXTURES, "react-seeded-app", "overlay"), dest);
    const list = JSON.parse(readFileSync(join(FIXTURES, "react-seeded-app", "seeded-issues.json"), "utf8"));
    for (const path of list.remove as string[]) rmSync(join(dest, path), { force: true });
  }
}

if (import.meta.main) {
  const [fixture, dest] = process.argv.slice(2);
  if ((fixture !== "react-contract-app" && fixture !== "react-seeded-app") || !dest) {
    console.error("Usage: bun tests/fixtures/assemble.ts <react-contract-app|react-seeded-app> <empty folder>");
    process.exit(2);
  }
  assemble(fixture, resolve(dest));
  console.log(`Assembled ${fixture} in ${resolve(dest)}`);
}
