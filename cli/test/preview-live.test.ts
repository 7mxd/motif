import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runPreview } from "../src/commands/preview";
import { findBrowser } from "../src/detect/browser";
import { renderPngs } from "../src/preview/render";
import { FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const browser = findBrowser();
const FRAMES = [
  '<div class="mk-frame mk-browser"></div>', '<div class="mk-frame mk-browser"></div>', '<div class="mk-frame mk-tablet"></div>',
  '<div class="mk-frame mk-phone mk-ios"></div>', '<div class="mk-frame mk-phone mk-android"></div>',
].join("");
const MOCKUP = `<!doctype html><html><head><title>M</title></head><body><div class="mk-stage">${FRAMES}</div></body></html>`;

describe.skipIf(!browser)("live motif preview with a real browser", () => {
  test("saving PNGs next to the mockups doesn't reload the page being rendered", async () => {
    const root = makeProject({
      "design/tokens.json": readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8"),
      "design/previews/a.html": MOCKUP,
      "design/previews/b.html": MOCKUP,
      "design/previews/c.html": MOCKUP,
    });
    const r = await runPreview(root, { positionals: ["design/previews"], flags: { "no-open": true } }, {
      findBrowser: () => browser,
      render: renderPngs,
      openUrl: async () => true,
      waitForStop: () => Promise.resolve(),
    });
    await r.hold;
    expect(r.text).not.toContain("Couldn't make PNGs");
    expect(r.data.pngs).toHaveLength(30);
  }, 60_000);
});
