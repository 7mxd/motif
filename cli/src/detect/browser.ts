import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { installedBrowser } from "../browser/install";
import { motifHome } from "../home";

export interface BrowserInfo {
  name: "Chrome" | "Edge" | "Chromium" | "Custom" | "Motif";
  path: string;
}

export interface BrowserEnv {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
  exists: (path: string) => boolean;
  which: (cmd: string) => string | null;
  /** The browser installed by motif browser install, if any. */
  installed?: () => string | null;
}

export function defaultBrowserEnv(): BrowserEnv {
  return {
    platform: process.platform,
    env: process.env,
    home: homedir(),
    exists: existsSync,
    which: (c) => Bun.which(c),
    installed: () => installedBrowser(motifHome()),
  };
}

export function browserCandidates(e: BrowserEnv): BrowserInfo[] {
  if (e.platform === "win32") {
    const j = win32.join;
    const pf = e.env["ProgramFiles"] ?? "C:\\Program Files";
    const pf86 = e.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const local = e.env["LOCALAPPDATA"] ?? j(e.home, "AppData", "Local");
    return [
      { name: "Chrome", path: j(pf, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Chrome", path: j(pf86, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Chrome", path: j(local, "Google", "Chrome", "Application", "chrome.exe") },
      { name: "Edge", path: j(pf86, "Microsoft", "Edge", "Application", "msedge.exe") },
      { name: "Edge", path: j(pf, "Microsoft", "Edge", "Application", "msedge.exe") },
    ];
  }
  if (e.platform === "darwin") {
    const j = posix.join;
    return ["/Applications", j(e.home, "Applications")].flatMap((dir): BrowserInfo[] => [
      { name: "Chrome", path: j(dir, "Google Chrome.app", "Contents", "MacOS", "Google Chrome") },
      { name: "Edge", path: j(dir, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge") },
      { name: "Chromium", path: j(dir, "Chromium.app", "Contents", "MacOS", "Chromium") },
    ]);
  }
  const commands: [BrowserInfo["name"], string][] = [
    ["Chrome", "google-chrome"], ["Chrome", "google-chrome-stable"],
    ["Chromium", "chromium"], ["Chromium", "chromium-browser"],
    ["Edge", "microsoft-edge"], ["Edge", "microsoft-edge-stable"],
  ];
  return commands.flatMap(([name, cmd]): BrowserInfo[] => {
    const path = e.which(cmd);
    return path ? [{ name, path }] : [];
  });
}

/** MOTIF_BROWSER=none: previews and screenshots make no images (for machines that must never start a browser). */
export const browserOff = (env: Record<string, string | undefined> = process.env) => env.MOTIF_BROWSER === "none";
export const BROWSER_OFF = "MOTIF_BROWSER=none turns the browser off";

export function findBrowser(e: BrowserEnv = defaultBrowserEnv()): BrowserInfo | null {
  const override = e.env.MOTIF_BROWSER;
  if (override === "none") return null;
  if (override && e.exists(override)) return { name: "Custom", path: override };
  const system = browserCandidates(e).find((b) => e.exists(b.path));
  if (system) return system;
  const installed = e.installed?.();
  return installed ? { name: "Motif", path: installed } : null;
}
