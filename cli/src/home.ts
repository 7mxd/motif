import { homedir } from "node:os";
import { join } from "node:path";

/** Where Motif keeps its own files (cached tool versions, an installed browser). */
export function motifHome(env: Record<string, string | undefined> = process.env): string {
  return env.MOTIF_HOME ?? join(homedir(), ".motif");
}
