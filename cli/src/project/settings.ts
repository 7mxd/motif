import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripBom } from "../text";

export const SETTINGS_PATH = "design/motif.json";

export interface AppSetting {
  path: string;
  stack: string;
  srcDir?: string;
  /** Where the theme code goes, relative to the project root. */
  themeDir?: string;
}

export interface MotifSettings {
  motifContract: 1;
  apps: AppSetting[];
  ignore: string[];
}

/** The parsed design/motif.json, or null when it's missing or not valid JSON (detectApps reports problems). */
export function readSettingsJson(root: string): unknown | null {
  try {
    return JSON.parse(stripBom(readFileSync(join(root, "design", "motif.json"), "utf8")));
  } catch {
    return null;
  }
}

export function readIgnorePatterns(root: string): string[] {
  const settings = readSettingsJson(root) as { ignore?: unknown } | null;
  return Array.isArray(settings?.ignore) ? settings.ignore.filter((p): p is string => typeof p === "string") : [];
}

export function writeSettings(root: string, settings: MotifSettings): void {
  mkdirSync(join(root, "design"), { recursive: true });
  writeFileSync(join(root, "design", "motif.json"), JSON.stringify(settings, null, 2) + "\n");
}
