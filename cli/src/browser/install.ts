import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { unzipSync } from "fflate";

export const BROWSER_INDEX_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

/** Chrome for Testing's platform name for this system, or null when it has no build. */
export function cftPlatform(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string | null {
  if (platform === "win32") return arch === "ia32" ? "win32" : "win64";
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (platform === "linux") return arch === "arm64" ? "linux-arm64" : "linux64";
  return null;
}

const browsersDir = (home: string) => join(home, "browsers");

export function installedBrowser(home: string): string | null {
  try {
    const { path } = JSON.parse(readFileSync(join(browsersDir(home), "current.json"), "utf8"));
    return typeof path === "string" && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

export async function installBrowser(opts: { home: string; indexUrl?: string; platform?: NodeJS.Platform; arch?: string }): Promise<{ version: string; path: string; bytes: number }> {
  const platform = opts.platform ?? process.platform;
  const plat = cftPlatform(platform, opts.arch ?? process.arch);
  if (!plat) throw new Error(`Motif can't download a browser for this system (${platform}). Install Chrome or Chromium instead.`);

  const indexRes = await fetch(opts.indexUrl ?? BROWSER_INDEX_URL).catch(() => null);
  if (!indexRes?.ok) throw new Error(`Couldn't reach the Chrome for Testing download list${indexRes ? ` (HTTP ${indexRes.status})` : ""}. Check your internet connection and try again.`);
  const index = (await indexRes.json()) as any;
  const stable = index?.channels?.Stable;
  const url: string | undefined = stable?.downloads?.["chrome-headless-shell"]?.find((d: any) => d.platform === plat)?.url;
  if (!stable?.version || !url) throw new Error(`The Chrome for Testing download list has no headless browser for ${plat}.`);

  const zipRes = await fetch(url).catch(() => null);
  if (!zipRes?.ok) throw new Error(`Couldn't download the browser${zipRes ? ` (HTTP ${zipRes.status})` : ""}. Try again later.`);
  const bytes = new Uint8Array(await zipRes.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("The downloaded browser archive is damaged. Try again.");
  }

  const dir = join(browsersDir(opts.home), String(stable.version));
  rmSync(dir, { recursive: true, force: true });
  const root = normalize(dir) + sep;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue;
    const target = normalize(join(dir, name));
    if (!target.startsWith(root)) continue; // never write outside the install folder
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    if (platform !== "win32") chmodSync(target, 0o755);
  }
  const exe = join(dir, `chrome-headless-shell-${plat}`, platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
  if (!existsSync(exe)) throw new Error(`The downloaded archive doesn't contain the browser (${exe}).`);
  writeFileSync(join(browsersDir(opts.home), "current.json"), JSON.stringify({ version: stable.version, path: exe }, null, 2) + "\n");
  return { version: String(stable.version), path: exe, bytes: bytes.length };
}
