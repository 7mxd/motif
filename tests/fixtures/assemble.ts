// Builds a working copy of an eval fixture: the contract app, plus the seeded overlay for the seeded app.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export type FixtureName = "react-contract-app" | "react-seeded-app";

const FIXTURES = import.meta.dir;
const SKIP = new Set(["node_modules", ".next"]);

export function assemble(fixture: FixtureName, dest: string): void {
  if (existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} isn't empty; a fixture is only assembled into an empty folder.`);
  mkdirSync(dest, { recursive: true });
  const copy = (from: string) => cpSync(from, dest, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  copy(join(FIXTURES, "react-contract-app"));
  if (fixture === "react-seeded-app") {
    copy(join(FIXTURES, "react-seeded-app", "overlay"));
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
