// Zips the built Claude Code plugin for a release: files in a fixed order with a fixed date, so the same build gives the
// same zip, and Unix modes kept (the bootstrap executable, everything else 644).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { zipSync, type Zippable } from "fflate";

const REPO = resolve(import.meta.dir, "../..");
export const ZIP_NAME = "motif-claude-code.zip";
const EXECUTABLE = new Set(["skills/motif/bin/motif"]);

/** Every file under dir, as forward-slash paths, sorted. */
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** The plugin folder as a zip. Refuses a build whose plugin.json version isn't the expected one. */
export function zipPlugin(pluginDir: string, expectedVersion: string): Uint8Array {
  const manifest = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(`The plugin's version is ${manifest.version}, not ${expectedVersion}: rebuild it with "bun run plugin".`);
  }
  // Zips store local time, so the date is built from local parts when zipping: 2000-01-01 00:00 in every time zone.
  const date = new Date(2000, 0, 1);
  const entries: Zippable = {};
  for (const path of files(pluginDir)) {
    const data = readFileSync(join(pluginDir, path));
    if (EXECUTABLE.has(path) && data.includes(13)) {
      throw new Error(`${path} has Windows line endings, which sh can't run: check it out with LF endings (see .gitattributes) and rebuild with "bun run plugin".`);
    }
    const mode = EXECUTABLE.has(path) ? 0o100755 : 0o100644;
    entries[path] = [data, { os: 3, attrs: (mode << 16) >>> 0, mtime: date }];
  }
  return zipSync(entries, { level: 9 });
}

if (import.meta.main) {
  const pluginDir = resolve(process.argv[2] ?? join(REPO, "dist", "claude-code"));
  const out = resolve(process.argv[3] ?? join(REPO, "dist", ZIP_NAME));
  const version = readFileSync(join(REPO, "skill", "VERSION"), "utf8").trim();
  writeFileSync(out, zipPlugin(pluginDir, version));
  console.log(`Zipped the Claude Code plugin ${version} into ${out}`);
}
