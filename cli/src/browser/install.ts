import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { onExit } from "../cleanup";
import { basename, dirname, join, normalize, relative, sep } from "node:path";
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

/** The server's reply, or null when it didn't start answering within ms (its body then has its own idle limit). */
async function answered(url: string, ms: number): Promise<Response | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    return await fetch(url, { signal: stop.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The download, read piece by piece so a person can watch it arrive (total is 0 when the server doesn't say). One that
 * stops sending for idleMs gives up, instead of hanging until someone notices.
 */
async function download(res: Response, idleMs: number, onProgress?: (got: number, total: number) => void): Promise<Uint8Array> {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`The download stopped (nothing arrived for ${Math.round(idleMs / 1000)} s). Check your internet connection and try again.`)), idleMs);
    });
    let step: Awaited<ReturnType<typeof reader.read>>;
    try {
      step = await Promise.race([reader.read(), stalled]);
    } catch (e) {
      reader.cancel().catch(() => undefined);
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (step.done) break;
    parts.push(step.value);
    got += step.value.length;
    onProgress?.(got, total);
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

/** The folder (in the browsers folder) of the copy current.json names, if any. */
function currentFolder(home: string): string | null {
  const path = installedBrowser(home);
  return path ? relative(browsersDir(home), path).split(sep)[0] ?? null : null;
}

/**
 * Removes every folder in the browsers folder but the ones kept: older versions, an install stopped while unpacking, a
 * copy that was in use last time. A folder still in use stays, and a later install tries again.
 */
function removeLeftovers(dir: string, keep: (string | null)[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names.filter((n) => n !== "current.json" && !keep.includes(n))) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true });
    } catch {
      // Still in use: a later install tries again.
    }
  }
}

export async function installBrowser(opts: {
  home: string;
  indexUrl?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  onProgress?: (got: number, total: number) => void;
  /** Told when the download is done and unpacking starts (it takes a few seconds and prints nothing). */
  onStage?: (stage: "unpacking") => void;
  /** How long the download may send nothing before it gives up (60 s). */
  idleTimeoutMs?: number;
}): Promise<{ version: string; path: string; bytes: number }> {
  const platform = opts.platform ?? process.platform;
  const plat = cftPlatform(platform, opts.arch ?? process.arch);
  if (!plat) throw new Error(`Motif can't download a browser for this system (${platform}). Install Chrome or Chromium instead.`);

  const idleMs = opts.idleTimeoutMs ?? 60_000;
  const indexRes = await answered(opts.indexUrl ?? BROWSER_INDEX_URL, Math.min(idleMs, 30_000));
  if (!indexRes?.ok) throw new Error(`Couldn't reach the Chrome for Testing download list${indexRes ? ` (HTTP ${indexRes.status})` : ""}. Check your internet connection and try again.`);
  let index: any;
  try {
    index = JSON.parse(new TextDecoder().decode(await download(indexRes, Math.min(idleMs, 30_000))));
  } catch {
    throw new Error("Couldn't read the Chrome for Testing download list. Check your internet connection and try again.");
  }
  const stable = index?.channels?.Stable;
  const url: string | undefined = stable?.downloads?.["chrome-headless-shell"]?.find((d: any) => d.platform === plat)?.url;
  if (!stable?.version || !url) throw new Error(`The Chrome for Testing download list has no headless browser for ${plat}.`);

  const zipRes = await answered(url, idleMs);
  if (!zipRes) throw new Error(`Couldn't download the browser: the server didn't answer within ${Math.round(idleMs / 1000)} s. Check your internet connection and try again.`);
  if (!zipRes.ok) throw new Error(`Couldn't download the browser (HTTP ${zipRes.status}). Try again later.`);
  const bytes = await download(zipRes, idleMs, opts.onProgress);
  opts.onStage?.("unpacking");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("The downloaded browser archive is damaged. Try again.");
  }

  // Unpacked beside the install folder first, so a failure leaves the copy already installed as it was. What an
  // earlier install left (stopped while unpacking, or an old copy that was in use) goes now.
  const dir = join(browsersDir(opts.home), String(stable.version));
  const partial = `${dir}.motif-${process.pid}.partial`;
  const exeIn = (base: string) => join(base, `chrome-headless-shell-${plat}`, platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
  removeLeftovers(browsersDir(opts.home), [currentFolder(opts.home)]);
  const cancelExitHook = onExit(() => rmSync(partial, { recursive: true, force: true }));
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
    cancelExitHook();
    throw new Error(`Couldn't unpack the browser (${e instanceof Error ? e.message : String(e)}). Nothing was changed; try again.`);
  }
  if (!existsSync(exeIn(partial))) {
    rmSync(partial, { recursive: true, force: true });
    cancelExitHook();
    throw new Error(`The downloaded archive doesn't contain the browser (${exeIn(dir)}).`);
  }
  // A copy already there is never deleted in place (one that's running can't be deleted whole, and a half-deleted
  // copy wouldn't start): it's moved aside, or, when it's in use and can't be moved, the new copy gets a folder of its
  // own. current.json names the new one; what's left goes now if it can, or on the next install.
  let target = dir;
  try {
    if (existsSync(dir)) {
      try {
        renameSync(dir, `${dir}.old-${process.pid}`);
      } catch {
        target = `${dir}-${process.pid}`;
      }
    }
    renameSync(partial, target);
  } catch (e) {
    rmSync(partial, { recursive: true, force: true });
    cancelExitHook();
    throw new Error(`Couldn't put the browser in ${target} (${e instanceof Error ? e.message : String(e)}). Try again.`);
  }
  cancelExitHook();
  const exe = exeIn(target);
  writeFileSync(join(browsersDir(opts.home), "current.json"), JSON.stringify({ version: stable.version, path: exe }, null, 2) + "\n");
  removeLeftovers(browsersDir(opts.home), [basename(target)]);
  return { version: String(stable.version), path: exe, bytes: bytes.length };
}
