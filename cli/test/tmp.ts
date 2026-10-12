import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const made: string[] = [];

/** A fresh temp folder that cleanupTempDirs() removes; bootstrap tests put ~100 MB binaries in these. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}
