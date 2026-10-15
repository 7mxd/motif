import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { findBrowser } from "../src/detect/browser";
import { captureScreens, shotName, VIEWPORTS } from "../src/shot/capture";
import { pairWithMockup } from "../src/shot/compare";
import { startStaticServer } from "../src/shot/static-server";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

describe("screenshot sizes", () => {
  test("three phones, a tablet and a desktop, each named apart in the screenshots", () => {
    expect(VIEWPORTS.map((v) => [v.file ?? v.name, v.width])).toEqual([["mobile-360", 360], ["mobile", 390], ["mobile-430", 430], ["tablet", 768], ["desktop", 1440]]);
    // Phones and the tablet are touch screens: the audit's 44 px tap-target check applies to them.
    expect(VIEWPORTS.filter((v) => v.mobile).map((v) => v.name)).toEqual(["mobile", "mobile", "mobile", "mobile"]);
    expect(shotName("index", "mobile-360", "dark")).toBe("index.mobile-360.dark.png");
  });

  test("a phone mockup still pairs with the 390 px phone, never another size", () => {
    const frame = join(tempDir("motif-sizes-"), "home.png");
    const header = new Uint8Array(24);
    header.set([137, 80, 78, 71, 13, 10, 26, 10]);
    new DataView(header.buffer).setUint32(16, 780);
    new DataView(header.buffer).setUint32(20, 1688);
    writeFileSync(frame, header);
    const shots = ["s/index.mobile-360.png", "s/index.mobile.png", "s/index.mobile-430.png", "s/index.tablet.png", "s/index.desktop.png"];
    expect(pairWithMockup([frame], shots, "cmp").map((p) => p.after)).toEqual(["s/index.mobile.png"]);
  });

  const browser = findBrowser();
  test.skipIf(!browser)("captures each size at its own width (needs Chrome, Edge or Chromium)", async () => {
    const root = makeProject({ "index.html": '<!doctype html><meta name="viewport" content="width=device-width"><p>Hi</p>' });
    const site = startStaticServer(root);
    try {
      const outDir = join(root, "shots");
      const r = await captureScreens({ browserPath: browser!.path, baseUrl: site.url, routes: ["/"], outDir, settleMs: 50 });
      expect(r.routes[0]!.shots.map((s) => s.split(/[\\/]/).pop())).toEqual([
        "index.mobile-360.png", "index.mobile-360.dark.png", "index.mobile.png", "index.mobile.dark.png", "index.mobile-430.png",
        "index.mobile-430.dark.png", "index.tablet.png", "index.tablet.dark.png", "index.desktop.png", "index.desktop.dark.png",
      ]);
      const width = (name: string) => pngSize(new Uint8Array(readFileSync(join(outDir, name)))).width;
      expect(["index.mobile-360.png", "index.mobile.png", "index.mobile-430.png", "index.tablet.png", "index.desktop.png"].map(width)).toEqual([720, 780, 860, 1536, 1440]);
    } finally {
      site.stop();
    }
  }, 120_000);
});
