// Builds a working copy of an eval fixture: a contract app or site, plus the seeded overlay for a seeded one.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const FIXTURE_NAMES = [
  "react-contract-app", "react-seeded-app", "plain-contract-site", "plain-seeded-site", "flutter-contract-app", "flutter-seeded-app",
  "compose-contract-app", "compose-seeded-app",
  "rn-contract-app", "rn-seeded-app",
  "swiftui-contract-app", "swiftui-seeded-app",
  "vue-contract-app", "vue-seeded-app",
  "svelte-contract-app", "svelte-seeded-app",
  // Not an app with a design guide: the project Xcode's iOS App template makes, which test D's d-masar starts from.
  "swiftui-starter-masar",
] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

/** Each seeded fixture is its base fixture plus an overlay. */
const BASES: Partial<Record<FixtureName, FixtureName>> = {
  "react-seeded-app": "react-contract-app",
  "plain-seeded-site": "plain-contract-site",
  "flutter-seeded-app": "flutter-contract-app",
  "compose-seeded-app": "compose-contract-app",
  "rn-seeded-app": "rn-contract-app",
  "swiftui-seeded-app": "swiftui-contract-app",
  "vue-seeded-app": "vue-contract-app",
  "svelte-seeded-app": "svelte-contract-app",
};

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

/** `into`: copy beside what the folder already holds (a test D brief), never over it. */
export function assemble(fixture: FixtureName, dest: string, opts: { into?: boolean } = {}): void {
  if (!opts.into && existsSync(dest) && readdirSync(dest).length > 0) throw new Error(`${dest} isn't empty; a fixture is only assembled into an empty folder.`);
  if (opts.into) {
    const clash = keptFiles(join(FIXTURES, fixture)).find((f) => existsSync(join(dest, f)));
    if (clash) throw new Error(`${join(dest, clash)} is there already; ${fixture} is only copied beside other files, never over them.`);
  }
  mkdirSync(dest, { recursive: true });
  const base = BASES[fixture];
  copyKept(join(FIXTURES, base ?? fixture), dest);
  if (base) {
    copyKept(join(FIXTURES, fixture, "overlay"), dest);
    const list = JSON.parse(readFileSync(join(FIXTURES, fixture, "seeded-issues.json"), "utf8"));
    for (const path of list.remove as string[]) {
      rmSync(join(dest, path), { force: true });
      // A folder the removal leaves empty goes too, so nothing hints at what was there.
      for (let dir = dirname(join(dest, path)); dir !== dest && existsSync(dir) && readdirSync(dir).length === 0; dir = dirname(dir)) rmSync(dir, { recursive: true });
    }
  }
}

if (import.meta.main) {
  const [fixture, dest] = process.argv.slice(2);
  if (!(FIXTURE_NAMES as readonly string[]).includes(fixture ?? "") || !dest) {
    console.error(`Usage: bun tests/fixtures/assemble.ts <${FIXTURE_NAMES.join("|")}> <empty folder>`);
    process.exit(2);
  }
  assemble(fixture as FixtureName, resolve(dest));
  console.log(`Assembled ${fixture} in ${resolve(dest)}`);
}
