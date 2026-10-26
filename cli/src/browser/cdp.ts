import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onExit } from "../cleanup";
import { killTree } from "../shot/devserver";

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Page {
  setViewport(width: number, height: number, scale?: number, mobile?: boolean): Promise<void>;
  emulateMedia(features: { name: string; value: string }[]): Promise<void>;
  /** Loads pages in this language (a BCP 47 tag): navigator.language, Accept-Language and Intl's formats follow it. */
  emulateLocale(locale: string): Promise<void>;
  goto(url: string, timeoutMs?: number): Promise<void>;
  /** With timeoutMs, a script still running after that long is stopped and the call fails. */
  evaluate<T = unknown>(expression: string, opts?: { timeoutMs?: number }): Promise<T>;
  screenshot(clip?: Clip): Promise<Uint8Array>;
  /**
   * Waits until nothing the page asked for has been loading for quietMs (what a page fetches after it loads: data,
   * images, fonts), or maxMs at most. Live connections (server-sent events, WebSockets) don't count.
   */
  waitForQuiet(quietMs: number, maxMs: number): Promise<void>;
  /** Uncaught errors the page threw since the last call (first line of each), then forgets them. */
  takeErrors(): string[];
  close(): Promise<void>;
}

export interface Browser {
  /** The browser's process id. */
  readonly pid: number;
  /**
   * With isolated, the tab gets a context of its own, like a private window: nothing other tabs stored
   * (cookies, local and session storage, caches) reaches it, and what it stores goes when it closes.
   */
  newPage(opts?: { isolated?: boolean }): Promise<Page>;
  close(): Promise<void>;
}

/** A page whose load event didn't come in time: what's there can still be captured. */
export class LoadTimeout extends Error {
  constructor() {
    super("The page took too long to load.");
  }
}

interface Message {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: any;
  params?: any;
  error?: { message: string };
}

const ARGS = [
  "--headless=new", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--mute-audio", "--disable-extensions", "--disable-background-networking", "--disable-sync",
  "--force-color-profile=srgb",
];

class StartError extends Error {
  constructor(message: string, readonly stderr: string) {
    super(message);
  }
}

/**
 * Removes the temporary profile. Chrome's helper processes can hold files in it for a moment after the browser
 * exits (EBUSY on Windows), so retry; then give up quietly, because a leftover temp folder is harmless.
 */
export async function removeProfile(
  dir: string,
  rm: (dir: string) => void = (d) => rmSync(d, { recursive: true, force: true }),
  attempts = 30,
  delayMs = 100,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      rm(dir);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

/**
 * Removes the profile at exit, when nothing can be awaited. The browser and its helpers were just killed, but they can
 * hold files for a moment (Windows) or finish a write into the folder (macOS), so it is checked again after a short wait.
 */
export function removeProfileNow(
  dir: string,
  rm: (dir: string) => void = (d) => rmSync(d, { recursive: true, force: true }),
  exists: (dir: string) => boolean = existsSync,
  attempts = 20,
  delayMs = 50,
): boolean {
  for (let i = 0; i < attempts; i++) {
    try {
      rm(dir);
    } catch {
      // Still held: try again.
    }
    Bun.sleepSync(delayMs);
    if (!exists(dir)) return true;
  }
  return false;
}

/** The most browsers that can run at once, each in a profile folder of its own (see claimProfile). */
export const PROFILE_SLOTS = 64;

export interface Profile {
  dir: string;
  /** Gives the folder's slot back to the next browser, once the folder is removed. */
  release(): void;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // Another user's process: alive, just not ours to signal.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Creates the lock file, or takes it over from a run that crashed (its process is gone). It holds the owner's process
 * id and a token of its own, so a lock is only ever given back by the browser that took it.
 */
function takeLock(lock: string, token: string, alive: (pid: number) => boolean): boolean {
  try {
    writeFileSync(lock, token, { flag: "wx" });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") return false;
  }
  let held: string;
  try {
    held = readFileSync(lock, "utf8");
  } catch {
    return false;
  }
  const pid = Number(held.split(" ")[0]);
  // An empty lock is one being written right now.
  if (!pid || alive(pid)) return false;
  // Moved aside rather than deleted: when two runs take over the same stale lock, the second one moves the first one's
  // new lock instead, sees it isn't the stale one and puts it back.
  const aside = `${lock}.${randomUUID()}`;
  try {
    renameSync(lock, aside);
    if (readFileSync(aside, "utf8") !== held) {
      renameSync(aside, lock);
      return false;
    }
    rmSync(aside, { force: true });
    writeFileSync(lock, token, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/**
 * A fresh, empty profile folder for one browser. On Windows, Chrome registers a global atom named after each profile
 * folder it runs in, and Windows keeps it until the user signs out; the table holds 16,384, and once it is full, copy
 * and paste stop working everywhere. So the folders aren't named at random: they are numbered slots (motif-browser-0,
 * -1, ...), each launch takes the lowest free one, and so reuses a name an earlier one registered. Windows then keeps
 * one atom per browser that ever ran at the same time as others, never one per launch. A live browser holds its slot
 * with a lock file beside the folder, so browsers running at once never share one. With every slot taken, the launch
 * fails rather than make a folder with a new name.
 */
export function claimProfile(root = tmpdir(), slots = PROFILE_SLOTS, alive: (pid: number) => boolean = isAlive): Profile {
  const token = `${process.pid} ${randomUUID()}`;
  for (let i = 0; i < slots; i++) {
    const lock = join(root, `motif-browser-${i}.lock`);
    if (!takeLock(lock, token, alive)) continue;
    const release = () => {
      try {
        if (readFileSync(lock, "utf8") === token) rmSync(lock);
      } catch {
        // Already gone.
      }
    };
    const dir = join(root, `motif-browser-${i}`);
    try {
      // What a run that crashed left in it goes first; a folder its browser still holds can't be used.
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { mode: 0o700 });
    } catch {
      release();
      continue;
    }
    return { dir, release };
  }
  throw new Error(`Couldn't make a profile folder for the browser in ${root}: all ${slots} of Motif's are in use. Close other Motif runs that use a browser, or check that this folder is writable, and try again.`);
}

/**
 * Removes the profile, then gives its slot back (even when the folder couldn't be removed: the next claim empties it).
 * A helper that is still stopping can write into the folder just after it goes (Linux CI), so it is checked again.
 */
export async function freeProfile(
  profile: Profile,
  remove = removeProfile,
  exists: (dir: string) => boolean = existsSync,
  attempts = 5,
  delayMs = 100,
): Promise<void> {
  for (let i = 0; i < attempts && (await remove(profile.dir)); i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    if (!exists(profile.dir)) break;
  }
  profile.release();
}

function start(executable: string, args: string[], timeoutMs: number): Promise<{ proc: ChildProcess; wsUrl: string; profile: Profile }> {
  const profile = claimProfile();
  const cleanup = () => void freeProfile(profile);
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (proc.exitCode === null) proc.kill();
      cleanup();
      reject(err);
    };
    const proc = spawn(executable, [...args, `--user-data-dir=${profile.dir}`, "about:blank"], {
      stdio: ["ignore", "ignore", "pipe"],
      // Its own process group, so its helpers can be stopped with it (Windows stops them with the browser).
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => fail(new StartError(`The browser at ${executable} didn't start within ${Math.round(timeoutMs / 1000)} s.`, stderr)), timeoutMs);
    proc.stderr!.on("data", (chunk) => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ proc, wsUrl: m[1]!, profile });
      }
    });
    proc.on("error", (e) => fail(new StartError(`Couldn't start the browser at ${executable}: ${e.message}`, stderr)));
    proc.on("exit", (code) => {
      // Let the rest of stderr arrive: it usually says why the browser stopped.
      const report = () => fail(new StartError(`The browser at ${executable} stopped while starting (exit code ${code}).${startFailureHint(stderr)}`, stderr));
      if (proc.stderr!.readableEnded) return report();
      const wait = setTimeout(report, 500);
      proc.stderr!.once("end", () => {
        clearTimeout(wait);
        report();
      });
    });
  });
}

/** What the browser said before it gave up, in plain words where Motif can tell. */
export function startFailureHint(stderr: string, platform: NodeJS.Platform = process.platform): string {
  const library = stderr.match(/error while loading shared libraries: ([^:\s]+)/)?.[1];
  if (platform === "linux" && library) {
    return ` It needs a system library that isn't installed (${library}). Install it with your package manager, or install Chromium the same way, which brings the libraries it needs.`;
  }
  const last = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  return last ? ` The browser said: ${last.slice(0, 300)}` : "";
}

/** A call to the browser's protocol. */
export type Send = (method: string, params?: object, sessionId?: string) => Promise<any>;

/**
 * Opens a tab, in a context of its own when isolated (like a private window). When a step fails, what was made is
 * closed again, so a failed tab never leaves a context behind.
 */
export async function openTab(send: Send, isolated: boolean): Promise<{ targetId: string; sessionId: string; browserContextId?: string }> {
  const browserContextId: string | undefined = isolated ? (await send("Target.createBrowserContext", {})).browserContextId : undefined;
  let targetId: string | undefined;
  try {
    ({ targetId } = await send("Target.createTarget", { url: "about:blank", ...(browserContextId ? { browserContextId } : {}) }));
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Network.enable", {}, sessionId);
    return { targetId: targetId!, sessionId, ...(browserContextId ? { browserContextId } : {}) };
  } catch (e) {
    // A browser that stopped answering mustn't hold the real error up: each clean-up step gets two seconds.
    const brief = (p: Promise<unknown>) => Promise.race([p.catch(() => undefined), Bun.sleep(2000)]);
    if (targetId) await brief(send("Target.closeTarget", { targetId }));
    if (browserContextId) await brief(send("Target.disposeBrowserContext", { browserContextId }));
    throw e;
  }
}

/** Closes a tab, and its own context even when closing the tab fails. */
export async function closeTab(send: Send, targetId: string, browserContextId?: string): Promise<void> {
  try {
    await send("Target.closeTarget", { targetId });
  } finally {
    if (browserContextId) await send("Target.disposeBrowserContext", { browserContextId }).catch(() => undefined);
  }
}

export async function launchBrowser(
  executable: string,
  opts: {
    timeoutMs?: number;
    callTimeoutMs?: number;
    /**
     * Certificates to accept though no browser trusts them, by the SHA-256 of their public key (base64): a local dev
     * server's own. Every other certificate is checked as usual.
     */
    trustedKeys?: string[];
  } = {},
): Promise<Browser> {
  const args = opts.trustedKeys?.length ? [...ARGS, `--ignore-certificate-errors-spki-list=${opts.trustedKeys.join(",")}`] : ARGS;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  // Every call to the browser gets an answer or an error: a page stuck in a loop must never hang Motif.
  const callTimeoutMs = opts.callTimeoutMs ?? 30_000;
  let started;
  try {
    started = await start(executable, args, timeoutMs);
  } catch (e) {
    // Some Linux setups block Chrome's sandbox for unprivileged users; retry once without it.
    if (process.platform === "linux" && e instanceof StartError && /sandbox/i.test(e.stderr)) {
      started = await start(executable, [...args, "--no-sandbox"], timeoutMs);
    } else {
      throw e;
    }
  }
  const { proc, wsUrl, profile } = started;
  // If Motif exits (or is stopped with Ctrl+C) before close(), the browser goes with it, and so does its profile.
  const cancelExitHook = onExit(() => {
    // The browser and every helper it started: a helper left running can write into the profile again (macOS).
    if (proc.pid) killTree(proc.pid, true);
    removeProfileNow(profile.dir);
    profile.release();
  });

  const ws = new WebSocket(wsUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = () => reject(new Error(`Couldn't connect to the browser at ${executable}.`));
      const timer = setTimeout(failed, timeoutMs);
      ws.addEventListener("open", () => (clearTimeout(timer), resolve()), { once: true });
      ws.addEventListener("error", () => (clearTimeout(timer), failed()), { once: true });
    });
  } catch (e) {
    cancelExitHook();
    ws.close();
    if (proc.exitCode === null) proc.kill();
    await freeProfile(profile);
    throw e;
  }

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<(m: Message) => void>();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data)) as Message;
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    } else {
      for (const l of listeners) l(msg);
    }
  });

  // Once the browser is gone, everything still waiting for it fails instead of waiting forever.
  let gone: Error | null = null;
  const failAll = () => {
    gone ??= new Error(`The browser at ${executable} closed.`);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(gone);
    }
    pending.clear();
  };
  ws.addEventListener("close", failAll);
  proc.once("exit", failAll);

  const send = (method: string, params: object = {}, sessionId?: string): Promise<any> => {
    if (gone) return Promise.reject(gone);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The browser didn't answer (${method}) within ${Math.round(callTimeoutMs / 1000)} s. The page may be stuck in a loop.`));
      }, callTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };

  const waitFor = (sessionId: string, method: string, timeoutMs: number) =>
    new Promise<void>((resolve, reject) => {
      const listener = (m: Message) => {
        if (m.sessionId === sessionId && m.method === method) {
          listeners.delete(listener);
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new LoadTimeout());
      }, timeoutMs);
      listeners.add(listener);
    });

  return {
    pid: proc.pid!,
    async newPage(opts: { isolated?: boolean } = {}): Promise<Page> {
      const { targetId, sessionId, browserContextId } = await openTab(send, opts.isolated ?? false);
      const errors: string[] = [];
      // What the page is still loading, and since when, so a screenshot can wait until it's done (live connections
      // never are).
      const loading = new Map<string, number>();
      let lastActivity = Date.now();
      const onError = (m: Message) => {
        if (m.sessionId !== sessionId) return;
        if (m.method === "Network.requestWillBeSent") {
          if (m.params?.type !== "EventSource" && m.params?.type !== "WebSocket") loading.set(String(m.params?.requestId), Date.now());
          lastActivity = Date.now();
          return;
        }
        if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") {
          loading.delete(String(m.params?.requestId));
          lastActivity = Date.now();
          return;
        }
        if (m.method === "Runtime.exceptionThrown") {
          const details = m.params?.exceptionDetails;
          errors.push(String(details?.exception?.description ?? details?.text ?? "Unknown error").split("\n")[0]!);
        } else if (m.method === "Page.javascriptDialogOpening") {
          // A dialog (alert, confirm, prompt) stops the page until it's answered: close it, and say so.
          errors.push(`The page opened a dialog ("${String(m.params?.message ?? "")}"); Motif closed it.`);
          send("Page.handleJavaScriptDialog", { accept: m.params?.type === "beforeunload" }, sessionId).catch(() => undefined);
        }
      };
      listeners.add(onError);
      let viewport: { width: number; height: number } | undefined;
      return {
        async setViewport(width, height, scale = 1, mobile = false) {
          await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile }, sessionId);
          viewport = { width, height };
          // Phones and tablets are touch screens: (pointer: coarse) and (hover: none) match, as on the real devices.
          await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, ...(mobile ? { maxTouchPoints: 5 } : {}) }, sessionId);
        },
        async emulateMedia(features) {
          await send("Emulation.setEmulatedMedia", { features }, sessionId);
        },
        async emulateLocale(locale) {
          // The browser's own user agent, unchanged: only the language it asks for (and navigator.language) changes.
          const { userAgent } = await send("Browser.getVersion");
          await send("Network.setUserAgentOverride", { userAgent, acceptLanguage: locale }, sessionId);
          // Intl's formats (dates, numbers). A language ICU doesn't know keeps the default formats; the rest still applies.
          await send("Emulation.setLocaleOverride", { locale }, sessionId).catch(() => undefined);
        },
        async goto(url, timeoutMs = 30_000) {
          const loaded = waitFor(sessionId, "Page.loadEventFired", timeoutMs);
          // Navigating can take longer than the load wait (a slow server): its rejection is handled below, not left
          // unhandled while Page.navigate is still answering.
          loaded.catch(() => {});
          const r = await send("Page.navigate", { url }, sessionId);
          if (r.errorText) {
            loaded.catch(() => {});
            throw new Error(`Couldn't open ${url}: ${r.errorText}`);
          }
          await loaded;
        },
        async evaluate<T>(expression: string, opts: { timeoutMs?: number } = {}): Promise<T> {
          const limit = opts.timeoutMs;
          const stopped = () => new Error(`it was still running after ${Math.round(limit! / 1000)} seconds`);
          let r: any;
          try {
            r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(limit ? { timeout: limit } : {}) }, sessionId);
          } catch (e) {
            if (limit && /terminat/i.test(e instanceof Error ? e.message : String(e))) throw stopped();
            throw e;
          }
          if (r.exceptionDetails) {
            const text = String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
            if (limit && /terminat/i.test(text)) throw stopped();
            throw new Error(`Script error in the page: ${text}`);
          }
          return r.result.value as T;
        },
        async screenshot(clip) {
          // A clip that is just what the screen shows (a page that fits it) is captured as shown. Capturing beyond the
          // viewport, Chrome first lays the page out 1 px wide (a scrollbar workaround in its page_handler.cc,
          // crbug.com/40727379): a right-to-left page overflows to the left there, and when the shot is the screen's
          // own size nothing lays it out again, so it came out shifted right by that overflow (task 10b). Any other
          // size is laid out again at that size, and drawn where it belongs.
          const onScreen =
            clip !== undefined &&
            viewport !== undefined &&
            clip.x === 0 &&
            clip.y === 0 &&
            clip.width === viewport.width &&
            clip.height === viewport.height &&
            (await send("Runtime.evaluate", { expression: "scrollX === 0 && scrollY === 0", returnByValue: true }, sessionId)).result?.value === true;
          const params = clip ? { format: "png", ...(onScreen ? {} : { captureBeyondViewport: true }), clip: { ...clip, scale: 1 } } : { format: "png" };
          const r = await send("Page.captureScreenshot", params, sessionId);
          return new Uint8Array(Buffer.from(r.data, "base64"));
        },
        async waitForQuiet(quietMs, maxMs) {
          const deadline = Date.now() + maxMs;
          while (Date.now() < deadline) {
            // A request open for more than two seconds is a live connection (a long poll, a streamed response): it
            // isn't waited for.
            const now = Date.now();
            const waiting = [...loading.values()].some((since) => now - since < 2000);
            if (!waiting && now - lastActivity >= quietMs) return;
            await Bun.sleep(Math.min(50, quietMs));
          }
        },
        takeErrors() {
          return errors.splice(0);
        },
        async close() {
          listeners.delete(onError);
          await closeTab(send, targetId, browserContextId);
        },
      };
    },
    async close() {
      try {
        await Promise.race([send("Browser.close"), new Promise((r) => setTimeout(r, 2000))]);
      } catch {
        // The browser may already be gone.
      }
      ws.close();
      const exited = () => proc.exitCode !== null || proc.signalCode !== null;
      if (!exited()) proc.kill();
      await new Promise((r) => (exited() ? r(null) : proc.once("exit", r)));
      // Helpers the browser left stopping go too, so none writes into the profile again (Windows stops them with it).
      if (proc.pid && process.platform !== "win32") killTree(proc.pid, true);
      await freeProfile(profile);
      cancelExitHook();
    },
  };
}
