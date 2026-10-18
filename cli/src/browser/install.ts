import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

/** The download, read piece by piece so a person can watch it arrive (total is 0 when the server doesn't say). */
async function download(res: Response, onProgress?: (got: number, total: number) => void): Promise<Uint8Array> {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const parts: Uint8Array[] = [];
  let got = 0;
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    parts.push(part);
    got += part.length;
    onProgress?.(got, Math.max(total, got));
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/** An archive entry with an absolute path or a drive letter (one that climbs out with ".." is caught where it's written). */
const outside = (name: string) => /^([\\/]|[A-Za-z]:)/.test(name);

export async function installBrowser(opts: {
  home: string;
  indexUrl?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  onProgress?: (got: number, total: number) => void;
}): Promise<{ version: string; path: string; bytes: number }> {
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
  const bytes = await download(zipRes, opts.onProgress);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("The downloaded browser archive is damaged. Try again.");
  }

  // Unpacked beside the install folder first, so a failure leaves the copy already installed as it was.
  const dir = join(browsersDir(opts.home), String(stable.version));
  const partial = `${dir}.motif-${process.pid}.partial`;
  const exeIn = (base: string) => join(base, `chrome-headless-shell-${plat}`, platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
  rmSync(partial, { recursive: true, force: true });
  try {
    const root = normalize(partial) + sep;
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith("/") || outside(name)) continue;
      const target = normalize(join(partial, name));
      if (!target.startsWith(root)) continue; // never write outside the install folder
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      if (platform !== "win32") chmodSync(target, 0o755);
    }
  } catch (e) {
    rmSync(partial, { recursive: true, force: true });
    throw new Error(`Couldn't unpack the browser (${e instanceof Error ? e.message : String(e)}). Nothing was changed; try again.`);
  }
  if (!existsSync(exeIn(partial))) {
    rmSync(partial, { recursive: true, force: true });
    throw new Error(`The downloaded archive doesn't contain the browser (${exeIn(dir)}).`);
  }
  try {
    rmSync(dir, { recursive: true, force: true });
    renameSync(partial, dir);
  } catch (e) {
    rmSync(partial, { recursive: true, force: true });
    throw new Error(`Couldn't replace the browser in ${dir} (${e instanceof Error ? e.message : String(e)}). If a preview or screenshot is running, stop it and try again.`);
  }
  const exe = exeIn(dir);
  writeFileSync(join(browsersDir(opts.home), "current.json"), JSON.stringify({ version: stable.version, path: exe }, null, 2) + "\n");
  return { version: String(stable.version), path: exe, bytes: bytes.length };
}
