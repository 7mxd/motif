import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tempDir } from "./tmp";

/** A temp project with the given files (paths relative to the project root). Removed by cleanupTempDirs(). */
export function makeProject(files: Record<string, string>): string {
  const root = tempDir("motif-proj-");
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}
