import { describe, expect, test } from "bun:test";
import { launchBrowser, removeProfile } from "../src/browser/cdp";
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
