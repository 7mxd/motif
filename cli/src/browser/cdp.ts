import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  evaluate<T = unknown>(expression: string): Promise<T>;
  screenshot(clip?: Clip): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

interface Message {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: any;
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

function start(executable: string, args: string[], timeoutMs: number): Promise<{ proc: ChildProcess; wsUrl: string; profile: string }> {
  const profile = mkdtempSync(join(tmpdir(), "motif-browser-"));
  const cleanup = () => rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    proc.on("exit", (code) => fail(new StartError(`The browser at ${executable} stopped while starting (exit code ${code}).`, stderr)));
  });
}

export async function launchBrowser(executable: string, opts: { timeoutMs?: number } = {}): Promise<Browser> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
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

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error(`Couldn't connect to the browser at ${executable}.`)), { once: true });
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(m: Message) => void>();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data)) as Message;
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    } else {
      for (const l of listeners) l(msg);
    }
  });

  const send = (method: string, params: object = {}, sessionId?: string): Promise<any> => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
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
    async newPage(): Promise<Page> {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Page.enable", {}, sessionId);
      await send("Runtime.enable", {}, sessionId);
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
        async evaluate<T>(expression: string): Promise<T> {
          const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
          if (r.exceptionDetails) {
            throw new Error(`Script error in the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
          }
          return r.result.value as T;
        },
        async screenshot(clip) {
          const params = clip ? { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } } : { format: "png" };
          const r = await send("Page.captureScreenshot", params, sessionId);
          return new Uint8Array(Buffer.from(r.data, "base64"));
        },
        async close() {
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
      if (proc.exitCode === null) proc.kill();
      await new Promise((r) => (proc.exitCode !== null ? r(null) : proc.once("exit", r)));
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}
