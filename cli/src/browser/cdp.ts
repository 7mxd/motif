import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onExit } from "../cleanup";

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Page {
  setViewport(width: number, height: number, scale?: number, mobile?: boolean): Promise<void>;
  emulateMedia(features: { name: string; value: string }[]): Promise<void>;
  goto(url: string, timeoutMs?: number): Promise<void>;
  /** With timeoutMs, a script still running after that long is stopped and the call fails. */
  evaluate<T = unknown>(expression: string, opts?: { timeoutMs?: number }): Promise<T>;
  screenshot(clip?: Clip): Promise<Uint8Array>;
  /** Uncaught errors the page threw since the last call (first line of each), then forgets them. */
  takeErrors(): string[];
  close(): Promise<void>;
}

export interface Browser {
  /** The browser's process id. */
  readonly pid: number;
  newPage(): Promise<Page>;
  close(): Promise<void>;
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

function start(executable: string, args: string[], timeoutMs: number): Promise<{ proc: ChildProcess; wsUrl: string; profile: string }> {
  const profile = mkdtempSync(join(tmpdir(), "motif-browser-"));
  const cleanup = () => void removeProfile(profile);
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
    const proc = spawn(executable, [...args, `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
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

export async function launchBrowser(executable: string, opts: { timeoutMs?: number; callTimeoutMs?: number } = {}): Promise<Browser> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  // Every call to the browser gets an answer or an error: a page stuck in a loop must never hang Motif.
  const callTimeoutMs = opts.callTimeoutMs ?? 30_000;
  let started;
  try {
    started = await start(executable, ARGS, timeoutMs);
  } catch (e) {
    // Some Linux setups block Chrome's sandbox for unprivileged users; retry once without it.
    if (process.platform === "linux" && e instanceof StartError && /sandbox/i.test(e.stderr)) {
      started = await start(executable, [...ARGS, "--no-sandbox"], timeoutMs);
    } else {
      throw e;
    }
  }
  const { proc, wsUrl, profile } = started;
  // If Motif exits (or is stopped with Ctrl+C) before close(), the browser goes with it.
  const cancelExitHook = onExit(() => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
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
    await removeProfile(profile);
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
        reject(new Error("The page took too long to load."));
      }, timeoutMs);
      listeners.add(listener);
    });

  return {
    pid: proc.pid!,
    async newPage(): Promise<Page> {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Page.enable", {}, sessionId);
      await send("Runtime.enable", {}, sessionId);
      const errors: string[] = [];
      const onError = (m: Message) => {
        if (m.sessionId !== sessionId) return;
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
      return {
        async setViewport(width, height, scale = 1, mobile = false) {
          await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile }, sessionId);
        },
        async emulateMedia(features) {
          await send("Emulation.setEmulatedMedia", { features }, sessionId);
        },
        async goto(url, timeoutMs = 30_000) {
          const loaded = waitFor(sessionId, "Page.loadEventFired", timeoutMs);
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
          const params = clip ? { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } } : { format: "png" };
          const r = await send("Page.captureScreenshot", params, sessionId);
          return new Uint8Array(Buffer.from(r.data, "base64"));
        },
        takeErrors() {
          return errors.splice(0);
        },
        async close() {
          listeners.delete(onError);
          await send("Target.closeTarget", { targetId });
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
      await removeProfile(profile);
      cancelExitHook();
    },
  };
}
