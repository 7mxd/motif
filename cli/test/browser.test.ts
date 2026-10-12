import { describe, expect, test } from "bun:test";
import { findBrowser, type BrowserEnv } from "../src/detect/browser";

const env = (over: Partial<BrowserEnv> & { present?: string[] }): BrowserEnv => ({
  platform: "linux",
  env: {},
  home: "/home/u",
  which: () => null,
  ...over,
  exists: (p) => (over.present ?? []).includes(p),
});

describe("findBrowser", () => {
  test("Windows: finds Chrome under Program Files", () => {
    const path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    expect(findBrowser(env({ platform: "win32", env: { ProgramFiles: "C:\\Program Files" }, present: [path] })))
      .toEqual({ name: "Chrome", path });
  });

  test("Windows: falls back to Edge", () => {
    const path = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    expect(findBrowser(env({ platform: "win32", env: { "ProgramFiles(x86)": "C:\\Program Files (x86)" }, present: [path] })))
      .toEqual({ name: "Edge", path });
  });

  test("macOS: finds Chrome in the user's Applications folder", () => {
    const path = "/Users/u/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    expect(findBrowser(env({ platform: "darwin", home: "/Users/u", present: [path] }))).toEqual({ name: "Chrome", path });
  });

  test("Linux: uses whichever browser command exists", () => {
    const e = env({ which: (c) => (c === "chromium" ? "/usr/bin/chromium" : null), present: ["/usr/bin/chromium"] });
    expect(findBrowser(e)).toEqual({ name: "Chromium", path: "/usr/bin/chromium" });
  });

  test("MOTIF_BROWSER wins when it exists", () => {
    expect(findBrowser(env({ env: { MOTIF_BROWSER: "/opt/b" }, present: ["/opt/b"] }))).toEqual({ name: "Custom", path: "/opt/b" });
  });

  test("returns null when nothing is installed", () => {
    expect(findBrowser(env({}))).toBeNull();
  });
});
