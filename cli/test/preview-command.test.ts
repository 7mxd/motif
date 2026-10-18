import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPreview, type PreviewDeps } from "../src/commands/preview";
import { openCommand } from "../src/preview/open";
import type { RenderTarget } from "../src/preview/render";
import { validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const MOCKUP = '<!doctype html><html><head><title>A</title></head><body><div class="mk-stage"><div class="mk-frame mk-phone mk-ios">Hi</div></div></body></html>';
const CHROME = { name: "Chrome" as const, path: "/fake/chrome" };

/** Stand-ins for the browser, the PNG renderer, the default browser and Ctrl+C. */
function fakes(over: Partial<PreviewDeps> = {}, missingFonts: string[] = []) {
  const calls = { render: [] as { targets: RenderTarget[]; outDir: string; browserPath: string }[], opened: [] as string[] };
  let stop!: () => void;
  const stopped = new Promise<void>((r) => (stop = r));
  const deps: PreviewDeps = {
    findBrowser: () => CHROME,
    render: async (o) => {
      calls.render.push({ targets: o.targets, outDir: o.outDir, browserPath: o.browserPath });
      const files = o.targets.flatMap((t) => [join(t.outDir ?? o.outDir, `${t.name}.png`), join(t.outDir ?? o.outDir, `${t.name}.dark.png`)]);
      return { files, missingFonts };
    },
    openUrl: async (url) => {
      calls.opened.push(url);
      return true;
    },
    waitForStop: () => stopped,
    ...over,
  };
  return { deps, calls, stop };
}

const project = (extra: Record<string, string> = {}) =>
  makeProject({
    "design/tokens.json": JSON.stringify(validTokens()),
    "design/previews/home.html": MOCKUP,
    "design/previews/settings.html": MOCKUP,
    ...extra,
  });
const ctx = (positionals: string[], flags: Record<string, string | boolean> = {}) => ({ positionals, flags });

describe("motif preview: what it needs", () => {
  test("mockup names, or --gallery", async () => {
    const r = await runPreview(project(), ctx([]), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motif preview --gallery");
    expect((await runPreview(project(), ctx(["design/previews/home.html"], { gallery: true }), fakes().deps)).exitCode).toBe(2);
  });

  test("files that are missing, outside the project, or not mockups", async () => {
    const root = project({ "notes.txt": "x" });
    const cases: [string, string][] = [
      ["nope.html", "Couldn't find nope.html"],
      ["../x.html", "outside this folder"],
      ["notes.txt", "isn't an .html mockup"],
      ["design", "has no .html mockups"],
    ];
    for (const [arg, message] of cases) {
      const r = await runPreview(root, ctx([arg]), fakes().deps);
      expect(r.exitCode).toBe(2);
      expect(r.text).toContain(message);
    }
  });

  test("a design guide, or a starting style", async () => {
    const bare = makeProject({ "home.html": MOCKUP });
    const none = await runPreview(bare, ctx(["home.html"]), fakes().deps);
    expect(none.exitCode).toBe(2);
    expect(none.text).toContain("--preset");
    const unknown = await runPreview(bare, ctx(["home.html"], { preset: "nope" }), fakes().deps);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.text).toContain("minimal, soft, playful, editorial, bold, dark-tech, warm, trust");
  });

  test("a broken design guide is reported instead of previewed", async () => {
    const r = await runPreview(project({ "design/tokens.json": "{" }), ctx(["design/previews/home.html"]), fakes().deps);
    expect(r.exitCode).toBe(1);
    expect(r.data.error).toBe("invalid-contract");
  });

  test("--compare needs two mockups", async () => {
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { compare: true }), fakes().deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("at least two");
  });
});

describe("motif preview --png-only", () => {
  test("renders every mockup in a folder into design/previews, then stops the server", async () => {
    const root = project();
    const { deps, calls } = fakes();
    const r = await runPreview(root, ctx(["design/previews"], { "png-only": true }), deps);
    expect(r.exitCode).toBe(0);
    expect(r.hold).toBeUndefined();
    expect(calls.opened).toEqual([]);
    const call = calls.render[0]!;
    expect(call.browserPath).toBe("/fake/chrome");
    expect(call.outDir).toBe(join(root, "design", "previews"));
    expect(call.targets.map((t) => t.name)).toEqual(["home", "settings"]);
    expect(call.targets[0]!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/design\/previews\/home\.html$/);
    expect(r.data.pngs).toEqual(["design/previews/home.png", "design/previews/home.dark.png", "design/previews/settings.png", "design/previews/settings.dark.png"]);
    expect(r.text).toContain("design/previews/home.dark.png");
    await expect(fetch(call.targets[0]!.url)).rejects.toThrow();
  });

  test("--out, and mockups that share a file name", async () => {
    const root = project({ "design/previews/a/home.html": MOCKUP, "design/previews/b/home.html": MOCKUP });
    const { deps, calls } = fakes();
    const r = await runPreview(root, ctx(["design/previews/a/home.html", "design/previews/b/home.html"], { "png-only": true, out: "shots" }), deps);
    expect(r.exitCode).toBe(0);
    expect(calls.render[0]!.outDir).toBe(join(root, "shots"));
    expect(calls.render[0]!.targets.map((t) => t.name)).toEqual(["design-previews-a-home", "design-previews-b-home"]);
  });

  test("--preset gives the page that starting style's theme", async () => {
    let css = "";
    const { deps } = fakes({
      render: async (o) => {
        css = await (await fetch(new URL("/__motif/theme.css", o.targets[0]!.url))).text();
        return { files: [], missingFonts: [] };
      },
    });
    const r = await runPreview(makeProject({ "home.html": MOCKUP }), ctx(["home.html"], { "png-only": true, preset: "warm" }), deps);
    expect(r.exitCode).toBe(0);
    expect(css).toContain("#FBF6EF");
  });

  test("--gallery renders the 8 starting styles, with or without a design guide", async () => {
    const { deps, calls } = fakes();
    const r = await runPreview(makeProject({}), ctx([], { gallery: true, "png-only": true }), deps);
    expect(r.exitCode).toBe(0);
    const targets = calls.render[0]!.targets;
    expect(targets.map((t) => t.name)).toEqual(["minimal", "soft", "playful", "editorial", "bold", "dark-tech", "warm", "trust"].map((id) => `preset-${id}`));
    expect(targets[5]!.url).toEndWith("/__motif/preset/dark-tech/sample.html");
  });

  test("no browser: exit 2 with the one command that fixes it", async () => {
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), fakes({ findBrowser: () => null }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("motif browser install");
    expect(r.data.status).toBe("needs_browser");
  });

  test("a browser that fails is a plain error naming it", async () => {
    const { deps } = fakes({ render: async () => { throw new Error("The browser at /fake/chrome didn't start within 20 s."); } });
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("/fake/chrome");
  });
});

describe("motif preview (live)", () => {
  test("serves the mockup with the kit, opens it, saves PNGs, and runs until stopped", async () => {
    const { deps, calls, stop } = fakes();
    const r = await runPreview(project(), ctx(["design/previews/home.html", "design/previews/settings.html"]), deps);
    try {
      expect(r.exitCode).toBe(0);
      const url = r.data.url as string;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/design\/previews\/home\.html$/);
      expect(calls.opened).toEqual([url]);
      expect(await (await fetch(url)).text()).toContain("/__motif/kit/kit.css");
      expect(r.data.pngs).toHaveLength(4);
      expect(r.text).toContain("settings.html");
      expect(r.text).toContain("Ctrl+C");
    } finally {
      stop();
      await r.hold;
    }
    await expect(fetch(r.data.url as string)).rejects.toThrow();
  });

  test("--compare opens the side-by-side page", async () => {
    const { deps, calls, stop } = fakes();
    const r = await runPreview(project(), ctx(["design/previews"], { compare: true }), deps);
    try {
      expect(calls.opened[0]).toContain("/__motif/compare?f=design%2Fpreviews%2Fhome.html&f=design%2Fpreviews%2Fsettings.html");
      expect(await (await fetch(calls.opened[0]!)).text()).toContain('src="/design/previews/settings.html"');
    } finally {
      stop();
      await r.hold;
    }
  });

  test("--gallery opens the gallery; --no-open opens nothing", async () => {
    const gallery = fakes();
    const g = await runPreview(makeProject({}), ctx([], { gallery: true }), gallery.deps);
    gallery.stop();
    await g.hold;
    expect(gallery.calls.opened[0]).toEndWith("/__motif/gallery");

    const quiet = fakes();
    const q = await runPreview(project(), ctx(["design/previews/home.html"], { "no-open": true }), quiet.deps);
    quiet.stop();
    await q.hold;
    expect(quiet.calls.opened).toEqual([]);
    expect(q.data.url).toBeString();
  });

  test("open pages reload when a mockup is saved after the PNGs are made", async () => {
    const root = project();
    const { deps, stop } = fakes();
    const r = await runPreview(root, ctx(["design/previews/home.html"], { "no-open": true }), deps);
    try {
      const events = await fetch(new URL("/__motif/events", r.data.url as string));
      const reader = events.body!.getReader();
      await reader.read(); // the ": connected" comment
      // Write before waiting, so nothing is left running if a stray early event (macOS file watching) ends the wait first.
      await Bun.sleep(200);
      writeFileSync(join(root, "design/previews/home.html"), MOCKUP.replace("Hi", "Hello"));
      const decoder = new TextDecoder();
      let received = "";
      const deadline = Date.now() + 5000;
      while (!received.includes("event: reload") && Date.now() < deadline) {
        const next = await Promise.race([reader.read(), new Promise<{ done: true; value: undefined }>((res) => setTimeout(() => res({ done: true, value: undefined }), 5000))]);
        if (next.done) break;
        received += decoder.decode(next.value);
      }
      await reader.cancel();
      expect(received).toContain("event: reload");
    } finally {
      stop();
      await r.hold;
    }
  });

  test("without a browser it still serves and opens, and says how to get PNGs", async () => {
    const { deps, calls, stop } = fakes({ findBrowser: () => null });
    const r = await runPreview(project(), ctx(["design/previews/home.html"]), deps);
    try {
      expect(r.exitCode).toBe(0);
      expect(r.data.status).toBe("needs_browser");
      expect(r.data.pngs).toEqual([]);
      expect(calls.render).toEqual([]);
      expect(calls.opened).toHaveLength(1);
      expect(r.text).toContain("motif browser install");
    } finally {
      stop();
      await r.hold;
    }
  });

  test("when the default browser can't be opened, it prints the address", async () => {
    const { deps, stop } = fakes({ openUrl: async () => false });
    const r = await runPreview(project(), ctx(["design/previews/home.html"]), deps);
    stop();
    await r.hold;
    expect(r.text).toContain(`Open ${r.data.url} yourself`);
  });
});

describe("openCommand", () => {
  const url = "http://127.0.0.1:5000/__motif/compare?f=a.html&f=b.html";
  test("uses each system's own opener, passing the address as one argument", () => {
    expect(openCommand(url, "win32", { SystemRoot: "C:\\Windows" })).toEqual(["C:\\Windows\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler", url]]);
    expect(openCommand(url, "darwin")).toEqual(["open", [url]]);
    expect(openCommand(url, "linux")).toEqual(["xdg-open", [url]]);
  });
});

describe("motif preview: fonts", () => {
  test("each target lists the theme fonts to check", async () => {
    const { deps, calls } = fakes();
    await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), deps);
    expect(calls.render[0]!.targets[0]!.fonts).toEqual(["Inter"]);
  });

  test("a font that didn't load is named, with why", async () => {
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), fakes({}, ["Plus Jakarta Sans"]).deps);
    expect(r.exitCode).toBe(0);
    expect(r.data.missingFonts).toEqual(["Plus Jakarta Sans"]);
    expect(r.text).toContain("Shown with a fallback font: Plus Jakarta Sans");
  });

  test("--json carries the same explanation (backlog)", async () => {
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), fakes({}, ["Plus Jakarta Sans"]).deps);
    expect(r.data.notes).toEqual([expect.stringContaining("Shown with a fallback font: Plus Jakarta Sans")]);
  });
});

describe("motif preview: from the backlog", () => {
  test("in live preview, saving a mockup makes its PNGs again; Motif's own PNGs don't", async () => {
    const root = project();
    const { deps, calls, stop } = fakes();
    const r = await runPreview(root, ctx(["design/previews"], { "no-open": true }), deps);
    try {
      expect(calls.render.length).toBe(1);
      await Bun.sleep(300);
      writeFileSync(join(root, "design/previews/home.png"), "a PNG Motif wrote");
      writeFileSync(join(root, "design/previews/home.html"), MOCKUP.replace("Hi", "Hello"));
      const deadline = Date.now() + 5000;
      while (calls.render.length < 2 && Date.now() < deadline) await Bun.sleep(50);
      await Bun.sleep(800);
      expect(calls.render.map((c) => c.targets.map((t) => t.name))).toEqual([["home", "settings"], ["home"]]);
    } finally {
      stop();
      await r.hold;
    }
  });

  test("says it's making PNGs before it starts, for a person watching", async () => {
    const lines: string[] = [];
    await runPreview(project(), { positionals: ["design/previews"], flags: { "png-only": true }, progress: (l: string) => lines.push(l) }, fakes().deps);
    expect(lines).toEqual(["Making PNGs of 2 mockups, in light and dark…"]);
  });

  test("MOTIF_BROWSER=none is named as the reason there are no PNGs", async () => {
    const r = await runPreview(project(), ctx(["design/previews/home.html"], { "png-only": true }), fakes({ findBrowser: () => null, browserOff: () => true }).deps);
    expect(r.exitCode).toBe(2);
    expect(r.text).toStartWith("MOTIF_BROWSER=none turns the browser off, so Motif can't make PNGs.");
  });
});
