import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTheme } from "../src/generate/theme";
import { injectKit, resolveInside, startPreviewServer } from "../src/preview/server";
import { docFrom, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const MOCKUP = '<!doctype html><html><head><title>A</title></head><body><div class="mk-stage"><div class="mk-frame mk-phone mk-ios">Hello</div></div></body></html>';
const theme = buildTheme(docFrom(validTokens()));

function withServer(fn: (base: string, root: string) => Promise<void>) {
  return async () => {
    const project = makeProject({ "secret.txt": "outside", "app/design/previews/a.html": MOCKUP, "app/design/previews/b.html": MOCKUP, "app/logo.svg": "<svg/>" });
    const root = join(project, "app");
    const server = startPreviewServer({ root, theme, watch: ["design/previews/a.html"] });
    try {
      await fn(server.url, root);
    } finally {
      server.stop();
    }
  };
}

describe("injectKit", () => {
  test("adds the theme, kit styles, Motion and kit script before </head>", () => {
    const out = injectKit("<html><head><title>x</title></head><body></body></html>", "/__motif/theme.css");
    expect(out).toMatch(/theme\.css">\n<link rel="stylesheet" href="\/__motif\/kit\/kit\.css">\n<script src="\/__motif\/kit\/vendor\/motion\.js"><\/script>\n<script src="\/__motif\/kit\/kit\.js"><\/script>\n<\/head>/);
  });
  test("works without a <head>", () => {
    expect(injectKit("<p>hi</p>", "/t.css")).toStartWith('<link rel="stylesheet" href="/t.css">');
  });
});

describe("resolveInside", () => {
  test("keeps requests inside the project folder", () => {
    const root = makeProject({});
    expect(resolveInside(root, "/design/previews/a.html")).toBe(join(root, "design", "previews", "a.html"));
    expect(resolveInside(root, "/../secret.txt")).toBeNull();
    expect(resolveInside(root, "/..%2fsecret.txt")).toBeNull();
    expect(resolveInside(root, "/%2e%2e%2fsecret.txt")).toBeNull();
    expect(resolveInside(root, "/%E0%A4%A")).toBeNull();
    expect(resolveInside(root, "/..notes.txt")).toBe(join(root, "..notes.txt"));
  });
});

describe("startPreviewServer", () => {
  test("listens on 127.0.0.1 only", withServer(async (base) => {
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  }));

  test("serves mockups with the theme and kit injected", withServer(async (base) => {
    const res = await fetch(`${base}/design/previews/a.html`);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    const html = await res.text();
    expect(html).toContain("Hello");
    expect(html).toContain('href="/__motif/theme.css"');
  }));

  test("serves the theme CSS, a preset's theme, the kit, and other files", withServer(async (base) => {
    expect(await (await fetch(`${base}/__motif/theme.css`)).text()).toContain("--motif-spring-smooth-duration");
    expect(await (await fetch(`${base}/__motif/theme.css?preset=warm`)).text()).toContain("#FBF6EF");
    expect((await fetch(`${base}/__motif/kit/kit.css`)).status).toBe(200);
    expect((await fetch(`${base}/__motif/kit/nope.css`)).status).toBe(404);
    expect((await fetch(`${base}/__motif/kit/constructor`)).status).toBe(404);
    expect((await fetch(`${base}/logo.svg`)).headers.get("content-type")).toBe("image/svg+xml");
  }));

  test("never serves files outside the project folder", withServer(async (base) => {
    for (const path of ["/..%2fsecret.txt", "/%2e%2e%2fsecret.txt", "/../secret.txt", "/..%5csecret.txt", "/design/..%2f..%2fsecret.txt?x=1"]) {
      const res = await fetch(`${base}${path}`);
      expect(await res.text()).not.toContain("outside");
    }
  }));

  test("gallery, preset samples and compare pages", withServer(async (base) => {
    const gallery = await (await fetch(`${base}/__motif/gallery`)).text();
    expect(gallery.match(/<iframe /g)).toHaveLength(8);
    expect(gallery).toContain("/__motif/preset/dark-tech/sample.html");
    expect(gallery).toContain("Dark Tech");
    const sample = await (await fetch(`${base}/__motif/preset/minimal/sample.html`)).text();
    expect(sample).toContain('href="/__motif/theme.css?preset=minimal"');
    expect((await fetch(`${base}/__motif/preset/nope/sample.html`)).status).toBe(404);
    const compare = await (await fetch(`${base}/__motif/compare?f=design/previews/a.html&f=design/previews/b.html`)).text();
    expect(compare).toContain('src="/design/previews/a.html"');
    expect(compare).toContain('src="/design/previews/b.html"');
  }));

  test("tells open pages to reload when a watched mockup changes", withServer(async (base, root) => {
    const res = await fetch(`${base}/__motif/events`);
    const reader = res.body!.getReader();
    await reader.read(); // the ": connected" comment
    setTimeout(() => writeFileSync(join(root, "design/previews/a.html"), MOCKUP.replace("Hello", "Hi")), 200);
    const decoder = new TextDecoder();
    let received = "";
    const deadline = Date.now() + 5000;
    while (!received.includes("event: reload") && Date.now() < deadline) {
      const { value, done } = await Promise.race([reader.read(), new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 5000))]);
      if (done) break;
      received += decoder.decode(value);
    }
    await reader.cancel();
    expect(received).toContain("event: reload");
    expect(readFileSync(join(root, "design/previews/a.html"), "utf8")).toContain("Hi");
  }));
});
