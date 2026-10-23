import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isMotifGenerated } from "./header";

/** The files whose text can load a stylesheet or import a module. */
export const CODE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs|html?)$/;

/** True when any file under dir (other than Motif's own) mentions name. Bounded to 2000 files. */
export function isReferenced(dir: string, name: string, files: RegExp = CODE_FILE): boolean {
  let seen = 0;
  const visit = (d: string): boolean => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e === "node_modules" || e.startsWith(".") || seen++ > 2000) continue;
      const p = join(d, e);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (visit(p)) return true;
      } else if (files.test(e)) {
        const text = readFileSync(p, "utf8");
        if (text.includes(name) && !isMotifGenerated(e, text)) return true;
      }
    }
    return false;
  };
  return visit(dir);
}
