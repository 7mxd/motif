import { afterAll, describe, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { runPreview, type PreviewDeps } from "../src/commands/preview";
import { runValidate } from "../src/commands/validate";
import type { RenderTarget } from "../src/preview/render";
import { startPreviewServer, themeHrefFor } from "../src/preview/server";
import { validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const MOCKUP = '<!doctype html><html><head><title>A</title></head><body><div class="mk-stage"><div class="mk-frame mk-phone mk-ios">Hi</div></div></body></html>';

/** The fixture's theme values with the background role pointed elsewhere, so each direction is recognisable. */
function direction(background: string) {
  const tokens = validTokens();
  tokens.color.background.$value = background;
  return JSON.stringify(tokens);
}

const twoDirections = (extra: Record<string, string> = {}) =>
  makeProject({
    "design/directions/calm/tokens.json": direction("{primitive.color.gray.50}"),
    "design/directions/calm/home.html": MOCKUP,
    "design/directions/bold/tokens.json": direction("{primitive.color.white}"),
    "design/directions/bold/home.html": MOCKUP,
    ...extra,
  });

function fakeDeps() {
  const calls: { targets: RenderTarget[]; outDir: string }[] = [];
  const deps: PreviewDeps = {
    findBrowser: () => ({ name: "Chrome", path: "/fake/chrome" }),
    render: async (o) => {
      calls.push({ targets: o.targets, outDir: o.outDir });
      return { files: o.targets.map((t) => join(t.outDir ?? o.outDir, `${t.name}.png`)), missingFonts: [] };
    },
    openUrl: async () => true,
    waitForStop: () => new Promise(() => {}),
  };
  return { deps, calls };
}
const ctx = (positionals: string[], flags: Record<string, string | boolean> = {}) => ({ positionals, flags });

describe("themeHrefFor", () => {
  test("a mockup next to a tokens.json uses it; others use the design guide", () => {
    const root = twoDirections({ "design/tokens.json": JSON.stringify(validTokens()), "design/previews/home.html": MOCKUP, "design/x.html": MOCKUP });
    expect(themeHrefFor(root, join(root, "design/directions/calm/home.html"))).toBe("/__motif/theme.css?tokens=design%2Fdirections%2Fcalm%2Ftokens.json");
    expect(themeHrefFor(root, join(root, "design/previews/home.html"))).toBe("/__motif/theme.css");
    expect(themeHrefFor(root, join(root, "design/x.html"))).toBe("/__motif/theme.css");
  });
});

describe("the preview server and directions", () => {
  test("serves each direction's own theme, and only real tokens.json files inside the project", async () => {
    const root = twoDirections({ "design/directions/calm/notes.json": "{}" });
    const server = startPreviewServer({ root, theme: null });
    try {
      const page = await (await fetch(`${server.url}/design/directions/bold/home.html`)).text();
      expect(page).toContain("theme.css?tokens=design%2Fdirections%2Fbold%2Ftokens.json");
      const css = async (q: string) => (await fetch(`${server.url}/__motif/theme.css?tokens=${encodeURIComponent(q)}`)).text();
      expect(await css("design/directions/bold/tokens.json")).toContain("--motif-color-background: #FFFFFF;");
      expect(await css("design/directions/calm/tokens.json")).toContain("--motif-color-background: #F9FAFB;");
      expect(await css("design/directions/calm/notes.json")).toStartWith("/*");
      expect(await css("../outside/tokens.json")).toStartWith("/*");
    } finally {
      server.stop();
    }
  });
});

describe("the preview server reached through a link", () => {
  // macOS temp folders are under /var, really /private/var; Windows may name a folder by its short name. The theme link
  // must still be the path inside the project.
  test("links a direction's own theme by its path inside the project", async () => {
    const root = twoDirections();
    const linked = join(tempDir("motif-link-"), "project");
    symlinkSync(root, linked, "junction");
    const server = startPreviewServer({ root: linked, theme: null });
    try {
      const page = await (await fetch(`${server.url}/design/directions/bold/home.html`)).text();
      expect(page).toContain("theme.css?tokens=design%2Fdirections%2Fbold%2Ftokens.json");
    } finally {
      server.stop();
    }
  });
});

describe("motif preview with directions", () => {
  test("compares directions before there's a design guide, each with its own theme and fonts", async () => {
    const root = twoDirections();
    const { deps, calls } = fakeDeps();
    const r = await runPreview(root, ctx(["design/directions/calm/home.html", "design/directions/bold/home.html"], { "png-only": true }), deps);
    expect(r.exitCode).toBe(0);
    const targets = calls[0]!.targets;
    expect(targets.map((t) => t.outDir)).toEqual([join(root, "design/directions/calm"), join(root, "design/directions/bold")]);
    expect(targets.map((t) => t.name)).toEqual(["home", "home"]);
    expect(targets.every((t) => t.fonts?.includes("Inter"))).toBe(true);
    expect(r.data.pngs).toEqual(["design/directions/calm/home.png", "design/directions/bold/home.png"]);
  });

  test("a direction with mistakes is refused, by name, before anything renders", async () => {
    const root = twoDirections({ "design/directions/bold/tokens.json": '{ "color": {} }' });
    const { deps, calls } = fakeDeps();
    const r = await runPreview(root, ctx(["design/directions/calm/home.html", "design/directions/bold/home.html"], { "png-only": true }), deps);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("design/directions/bold/tokens.json");
    expect(r.text).toContain("motif validate --tokens design/directions/bold/tokens.json");
    expect(r.data.error).toBe("invalid-direction");
    expect(calls).toHaveLength(0);
  });

  test("a mockup without its own theme still needs the design guide", async () => {
    const root = twoDirections({ "design/previews/home.html": MOCKUP });
    const r = await runPreview(root, ctx(["design/directions/calm/home.html", "design/previews/home.html"], { "png-only": true }), fakeDeps().deps);
    expect(r.exitCode).toBe(2);
    expect(r.data.error).toBe("no-contract");
  });

  test("--out still puts every PNG in one folder", async () => {
    const root = twoDirections();
    const { deps, calls } = fakeDeps();
    await runPreview(root, ctx(["design/directions/calm/home.html", "design/directions/bold/home.html"], { "png-only": true, out: "pictures" }), deps);
    expect(calls[0]!.targets.map((t) => t.outDir)).toEqual([join(root, "pictures"), join(root, "pictures")]);
    expect(calls[0]!.targets.map((t) => t.name)).toEqual(["design-directions-calm-home", "design-directions-bold-home"]);
  });
});

describe("motif validate --tokens", () => {
  test("checks one theme values file on its own, readability included", async () => {
    const root = twoDirections();
    const ok = await runValidate(root, { tokens: "design/directions/calm/tokens.json" });
    expect(ok.exitCode).toBe(0);
    expect(ok.text).toContain("design/directions/calm/tokens.json");
    expect(ok.data.summary).toMatchObject({ errors: 0 });

    const low = validTokens();
    low.color["text-secondary"].$value = "{primitive.color.gray.200}";
    const bad = makeProject({ "d/tokens.json": JSON.stringify(low) });
    const r = await runValidate(bad, { tokens: "d/tokens.json" });
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(r.data.findings)).toContain("contrast");

    expect((await runValidate(root, { tokens: "nope/tokens.json" })).exitCode).toBe(2);
  });
});
