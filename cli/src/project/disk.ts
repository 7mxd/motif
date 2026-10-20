import { existsSync, readdirSync, readFileSync } from "node:fs";

/** The few disk reads a toolchain check makes, so tests can give a fake. */
export interface DoctorFiles {
  exists: (path: string) => boolean;
  /** A file's text, or null when it can't be read. */
  read: (path: string) => string | null;
  /** The names inside a folder (none when it isn't one). */
  list: (path: string) => string[];
}

export const diskFiles: DoctorFiles = {
  exists: (p) => existsSync(p),
  read: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  list: (p) => {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  },
};
