import { describe, expect, test } from "bun:test";
import { launchBrowser, removeProfile, startFailureHint } from "../src/browser/cdp";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";

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
