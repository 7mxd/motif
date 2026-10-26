import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { claimProfile, closeTab, freeProfile, launchBrowser, openTab, removeProfile, removeProfileNow, startFailureHint } from "../src/browser/cdp";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { pixel } from "./png-pixels";

const browser = findBrowser();

describe.skipIf(!browser)("launchBrowser (needs Chrome, Edge or Chromium)", () => {
  test("viewport, emulated media, scripts and screenshots", async () => {
    const b = await launchBrowser(browser!.path);
    try {
      const page = await b.newPage();
      await page.setViewport(390, 844, 2, true);
      await page.emulateMedia([{ name: "prefers-color-scheme", value: "dark" }]);
      await page.goto("data:text/html," + encodeURIComponent('<body style="margin:0"><button style="height:44px">Tap</button></body>'));
      expect(await page.evaluate<boolean>("matchMedia('(prefers-color-scheme: dark)').matches")).toBe(true);
      expect(await page.evaluate<number>("document.querySelector('button').getBoundingClientRect().height")).toBe(44);
      expect(await page.evaluate<number>("new Promise((r) => setTimeout(() => r(42), 10))")).toBe(42);
      expect(pngSize(await page.screenshot())).toEqual({ width: 780, height: 1688 });
      expect(pngSize(await page.screenshot({ x: 0, y: 0, width: 100, height: 50 }))).toEqual({ width: 200, height: 100 });
      await page.close();
    } finally {
      await b.close();
    }
  }, 60_000);

  test("script errors and failed navigations are plain errors", async () => {
    const b = await launchBrowser(browser!.path);
    try {
      const page = await b.newPage();
      await expect(page.evaluate("throw new Error('boom')")).rejects.toThrow("boom");
      await expect(page.goto("http://127.0.0.1:1/", 10_000)).rejects.toThrow("Couldn't open");
    } finally {
      await b.close();
    }
  }, 60_000);
});

describe("launchBrowser failures", () => {
  test("a program that isn't a browser fails fast with a plain message", async () => {
    const notABrowser = process.platform === "win32" ? "C:\\Windows\\System32\\whoami.exe" : "/bin/false";
    await expect(launchBrowser(notABrowser, { timeoutMs: 5000 })).rejects.toThrow(notABrowser);
  }, 20_000);
  test("a missing program fails with a plain message", async () => {
    await expect(launchBrowser("/no/such/browser")).rejects.toThrow("Couldn't start the browser at /no/such/browser");
  });
});

describe("pngSize", () => {
  test("rejects anything that isn't a PNG", () => {
    expect(() => pngSize(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

describe("removeProfile", () => {
  test("retries while Chrome's helpers still hold the folder, then gives up quietly", async () => {
    let calls = 0;
    const busyTwice = () => {
      if (++calls < 3) throw Object.assign(new Error("resource busy or locked"), { code: "EBUSY" });
    };
    expect(await removeProfile("profile", busyTwice, 5, 1)).toBe(true);
    expect(calls).toBe(3);
    expect(await removeProfile("profile", () => { throw new Error("resource busy or locked"); }, 3, 1)).toBe(false);
  });
});

describe("removeProfileNow, at exit (macOS CI left a profile behind)", () => {
  test("a folder that a lingering helper writes into again is removed again", () => {
    let folder = true;
    let helperWrites = 1;
    const rm = () => void (folder = false);
    const exists = () => {
      if (!folder && helperWrites-- > 0) folder = true;
      return folder;
    };
    expect(removeProfileNow("profile", rm, exists, 5, 1)).toBe(true);
    expect(folder).toBe(false);
  });

  test("retries while the folder is held, then gives up quietly", () => {
    let calls = 0;
    let folder = true;
    const busyTwice = () => {
      if (++calls < 3) throw Object.assign(new Error("resource busy or locked"), { code: "EBUSY" });
      folder = false;
    };
    expect(removeProfileNow("profile", busyTwice, () => folder, 5, 1)).toBe(true);
    expect(calls).toBe(3);
    expect(removeProfileNow("profile", () => { throw new Error("resource busy or locked"); }, () => true, 3, 1)).toBe(false);
  });
});

describe("claimProfile (unique profile names filled the Windows atom table, and copy and paste broke)", () => {
  const withRoot = async (body: (root: string) => void | Promise<void>) => {
    const root = mkdtempSync(join(tmpdir(), "motif-slots-"));
    try {
      await body(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  test("one browser after another reuses the same folder name, emptied each time", () =>
    withRoot(async (root) => {
      const first = claimProfile(root, 3);
      expect(first.dir).toBe(join(root, "motif-browser-0"));
      writeFileSync(join(first.dir, "Cookies"), "x");
      // Given back without its folder removed (still held by the browser's helpers): the next claim empties it.
      first.release();
      const second = claimProfile(root, 3);
      expect(second.dir).toBe(first.dir);
      expect(readdirSync(second.dir)).toEqual([]);
      await freeProfile(second);
      expect(readdirSync(root)).toEqual([]);
    }));

  test("browsers running at once each get a slot of their own; with every slot taken, a random name", () =>
    withRoot((root) => {
      const [a, b, c] = [claimProfile(root, 2), claimProfile(root, 2), claimProfile(root, 2)];
      expect([basename(a!.dir), basename(b!.dir)]).toEqual(["motif-browser-0", "motif-browser-1"]);
      expect(basename(c!.dir)).toMatch(/^motif-browser-\w{6}$/);
      a!.release();
      expect(claimProfile(root, 2).dir).toBe(a!.dir);
    }));

  test("a slot left by a run that crashed is taken over; a live run's isn't", () =>
    withRoot((root) => {
      writeFileSync(join(root, "motif-browser-0.lock"), "111 crashed");
      writeFileSync(join(root, "motif-browser-1.lock"), "222 running");
      mkdirSync(join(root, "motif-browser-0"));
      writeFileSync(join(root, "motif-browser-0", "Cookies"), "x");
      const alive = (pid: number) => pid !== 111;
      const taken = claimProfile(root, 3, alive);
      expect(taken.dir).toBe(join(root, "motif-browser-0"));
      expect(readdirSync(taken.dir)).toEqual([]);
      expect(claimProfile(root, 3, alive).dir).toBe(join(root, "motif-browser-2"));
      expect(readdirSync(root).filter((n) => n.includes(".lock."))).toEqual([]);
    }));

  test("a lock is only given back by the browser that took it", () =>
    withRoot((root) => {
      const p = claimProfile(root, 1);
      writeFileSync(join(root, "motif-browser-0.lock"), "333 another-run");
      p.release();
      expect(existsSync(join(root, "motif-browser-0.lock"))).toBe(true);
    }));

  test("processes claiming at the same moment never share a slot", () =>
    withRoot(async (root) => {
      const src = join(import.meta.dir, "../src").replace(/\\/g, "/");
      const file = join(root, "claim.ts");
      writeFileSync(file, `
import { claimProfile } from "${src}/browser/cdp";
const p = claimProfile(${JSON.stringify(root)}, 8);
console.log(p.dir);
await Bun.sleep(1500);
p.release();
`);
      const procs = Array.from({ length: 6 }, () => Bun.spawn([process.execPath, file], { stdout: "pipe" }));
      const dirs = await Promise.all(procs.map(async (p) => (await new Response(p.stdout).text()).trim()));
      expect(new Set(dirs).size).toBe(6);
      expect(dirs.every((d) => /motif-browser-[0-7]$/.test(d))).toBe(true);
    }), 30_000);
});

describe.skipIf(!browser)("launchBrowser never hangs (needs Chrome, Edge or Chromium)", () => {
  test("a call the page never answers times out", async () => {
    const b = await launchBrowser(browser!.path, { callTimeoutMs: 3000 });
    try {
      const page = await b.newPage();
      await page.goto("data:text/html," + encodeURIComponent('<script>addEventListener("load", () => setTimeout(() => { for (;;) {} }, 0))</script>'));
      await expect(page.evaluate("1")).rejects.toThrow("didn't answer");
    } finally {
      await b.close();
    }
  }, 30_000);

  test("calls still waiting when the browser closes are rejected", async () => {
    const b = await launchBrowser(browser!.path);
    const page = await b.newPage();
    const waiting = page.evaluate("new Promise(() => {})").then(() => "answered", (e: Error) => e.message);
    await b.close();
    expect(await waiting).toContain("closed");
  }, 30_000);
});

describe("start failures say why", () => {
  test("the browser's own last message is part of the error", async () => {
    // Bun stands in for a broken browser: it prints an error and exits.
    await expect(launchBrowser(process.execPath, { timeoutMs: 10_000 })).rejects.toThrow("Script not found");
  }, 20_000);
  test("a missing Linux library is named, with what to do", () => {
    const stderr = "/home/u/.motif/browsers/1/chrome-headless-shell: error while loading shared libraries: libnss3.so: cannot open shared object file: No such file or directory\n";
    const hint = startFailureHint(stderr, "linux");
    expect(hint).toContain("libnss3.so");
    expect(hint).toContain("package manager");
  });
  test("otherwise the last line is repeated, and nothing is added when there was no output", () => {
    expect(startFailureHint("noise\n[1013/120000:ERROR:foo] something broke\n\n", "win32")).toBe(" The browser said: [1013/120000:ERROR:foo] something broke");
    expect(startFailureHint("", "win32")).toBe("");
  });
});

describe.skipIf(!browser)("waitForQuiet (backlog #30, needs a browser)", () => {
  test("waits for what the page fetches after it loads", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        if (new URL(req.url).pathname === "/late") {
          await Bun.sleep(1200);
          return new Response("late content");
        }
        return new Response('<p id="p">early</p><script>addEventListener("load", () => fetch("/late").then((r) => r.text()).then((t) => (document.getElementById("p").textContent = t)))</script>', { headers: { "content-type": "text/html" } });
      },
    });
    const b = await launchBrowser(browser!.path);
    try {
      const page = await b.newPage();
      await page.goto(`http://127.0.0.1:${server.port}/`);
      await page.waitForQuiet(300, 5000);
      expect(await page.evaluate<string>('document.getElementById("p").textContent')).toBe("late content");
    } finally {
      await b.close();
      server.stop(true);
    }
  }, 30_000);
});

describe.skipIf(!browser)("a page that loads too slowly (review of batch B)", () => {
  test("its timeout is one error, with nothing printed besides", () => {
    const SRC = join(import.meta.dir, "../src").replace(/\\/g, "/");
    const dir = mkdtempSync(join(tmpdir(), "motif-goto-"));
    const file = join(dir, "run.ts");
    writeFileSync(file, `
import { launchBrowser } from "${SRC}/browser/cdp";
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Promise((r) => setTimeout(() => r(new Response("<p>late</p>", { headers: { "content-type": "text/html" } })), 2500)) });
const b = await launchBrowser(${JSON.stringify(browser!.path)});
const page = await b.newPage();
const message = await page.goto("http://127.0.0.1:" + server.port + "/", 1000).then(() => "loaded", (e) => e.message);
console.log(message);
await Bun.sleep(3000);
await b.close();
server.stop(true);
`);
    const r = Bun.spawnSync([process.execPath, file]);
    rmSync(dir, { recursive: true, force: true });
    expect(r.stdout.toString().trim()).toBe("The page took too long to load.");
    expect(r.stderr.toString()).not.toContain("took too long");
  }, 30_000);
});

describe.skipIf(!browser)("whole-page shots at the desktop size, right to left (task 10b, needs a browser)", () => {
  // A red bar with a word, and a 300 px blue block at the start of the line (the right, right to left).
  const RED = [204, 0, 0, 255];
  const BLUE = [0, 0, 204, 255];
  const WHITE = [255, 255, 255, 255];
  const rtlPage = (tall: boolean) =>
    `<!doctype html><html dir="rtl"><body style="margin:0"><div style="background:#c00;height:60px">نص</div><div style="width:300px;height:40px;background:#00c"></div>${tall ? '<div style="height:2000px"></div>' : ""}</body></html>`;

  for (const tall of [false, true]) {
    test(`a ${tall ? "page taller than the screen" : "short page"} is drawn where it is laid out, not shifted to the right`, async () => {
      const b = await launchBrowser(browser!.path);
      try {
        const page = await b.newPage({ isolated: true });
        await page.setViewport(1440, 900, 1, false);
        await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(rtlPage(tall)));
        // As motif shot captures it: the whole page, from the top.
        const height = await page.evaluate<number>("document.documentElement.scrollHeight");
        const png = await page.screenshot({ x: 0, y: 0, width: 1440, height });
        expect(pngSize(png)).toEqual({ width: 1440, height: tall ? 2100 : 900 });
        // The bar reaches both ends (the start isn't blank), and the block's edge is 300 px in from the right.
        expect(pixel(png, 0, 50)).toEqual(RED);
        expect(pixel(png, 1439, 50)).toEqual(RED);
        expect(pixel(png, 1140, 80)).toEqual(BLUE);
        expect(pixel(png, 1139, 80)).toEqual(WHITE);
      } finally {
        await b.close();
      }
    }, 60_000);
  }

  test("a screen-sized shot of a scrolled page still starts at the top of the page", async () => {
    const b = await launchBrowser(browser!.path);
    try {
      const page = await b.newPage({ isolated: true });
      await page.setViewport(1440, 900, 1, false);
      await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(rtlPage(true).replace(' dir="rtl"', "")));
      await page.evaluate("scrollTo(0, 500), true");
      const png = await page.screenshot({ x: 0, y: 0, width: 1440, height: 900 });
      expect(pixel(png, 0, 50)).toEqual(RED);
      expect(pixel(png, 299, 80)).toEqual(BLUE);
      expect(pixel(png, 300, 80)).toEqual(WHITE);
    } finally {
      await b.close();
    }
  }, 60_000);
});

describe("tabs leave nothing behind (backlog)", () => {
  /** A stand-in for the browser's protocol: answers each method, or fails the one named. */
  function fakeSend(failing?: string) {
    const calls: string[] = [];
    const send = async (method: string) => {
      calls.push(method);
      if (method === failing) throw new Error(`${method} failed`);
      if (method === "Target.createBrowserContext") return { browserContextId: "ctx" };
      if (method === "Target.createTarget") return { targetId: "tab" };
      if (method === "Target.attachToTarget") return { sessionId: "s" };
      return {};
    };
    return { send, calls };
  }

  test("closing an isolated tab disposes its context even when closing the tab fails", async () => {
    const { send, calls } = fakeSend("Target.closeTarget");
    await expect(closeTab(send, "tab", "ctx")).rejects.toThrow("closeTarget failed");
    expect(calls).toEqual(["Target.closeTarget", "Target.disposeBrowserContext"]);
  });

  test("a tab that fails to open closes what was made: the tab, then its context", async () => {
    const { send, calls } = fakeSend("Page.enable");
    await expect(openTab(send, true)).rejects.toThrow("Page.enable failed");
    expect(calls).toEqual([
      "Target.createBrowserContext", "Target.createTarget", "Target.attachToTarget", "Page.enable", "Target.closeTarget", "Target.disposeBrowserContext",
    ]);
    // A browser that stops answering doesn't hold the original error up (review of batch A).
    const hung = async (method: string) => {
      if (method === "Target.createTarget") return { targetId: "tab" };
      if (method === "Target.attachToTarget") throw new Error("attach failed");
      if (method === "Target.createBrowserContext") return { browserContextId: "ctx" };
      return new Promise(() => {});
    };
    const started = Date.now();
    await expect(openTab(hung, true)).rejects.toThrow("attach failed");
    expect(Date.now() - started).toBeLessThan(5000);
    const early = fakeSend("Target.createTarget");
    await expect(openTab(early.send, true)).rejects.toThrow("createTarget failed");
    expect(early.calls).toEqual(["Target.createBrowserContext", "Target.createTarget", "Target.disposeBrowserContext"]);
  });
});
