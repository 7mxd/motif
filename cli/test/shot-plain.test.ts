import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { runShot, type ShotDeps } from "../src/commands/shot";
import type { CaptureOptions } from "../src/shot/capture";
import { startStaticServer } from "../src/shot/static-server";
import { discoverPlainRoutes } from "../src/stacks/plain-web/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

/** Status (and Location) for a raw request: fetch tidies paths and won't let tests set Host. */
function raw(port: number, path: string, host = `127.0.0.1:${port}`): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    let data = "";
    const socket = connect(port, "127.0.0.1", () => socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
    socket.on("data", (d) => (data += d.toString()));
    socket.on("end", () => resolve({ status: Number(data.split(" ")[1]), location: data.match(/\r\nlocation: ([^\r\n]+)/i)?.[1] }));
    socket.on("error", reject);
  });
}

const SITE = {
  "secret.txt": "outside the site",
  "public/index.html": "<h1>Home</h1>",
  "public/about.html": "<h1>About</h1>",
  "public/blog/index.html": "<h1>Blog</h1>",
  "public/blog/post.html": "<h1>Post</h1>",
  "public/style.css": "body{}",
  "public/.env": "SECRET=1",
  "public/.git/config": "[core]",
};

describe("the static server for plain sites", () => {
  test("serves the site's files and folders' index pages", async () => {
    const root = makeProject(SITE);
    const s = startStaticServer(join(root, "public"));
    try {
      const page = await fetch(`${s.url}/`);
      expect([page.status, await page.text()]).toEqual([200, "<h1>Home</h1>"]);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect((await fetch(`${s.url}/about.html`)).status).toBe(200);
      expect(await (await fetch(`${s.url}/blog/`)).text()).toBe("<h1>Blog</h1>");
      expect((await fetch(`${s.url}/style.css`)).headers.get("content-type")).toContain("text/css");
      const port = Number(new URL(s.url).port);
      expect(await raw(port, "/blog")).toEqual({ status: 301, location: "/blog/" });
      expect((await raw(port, "/missing.html")).status).toBe(404);
    } finally {
      s.stop();
    }
  });

  test("never serves hidden files, anything outside the site folder, or another Host", async () => {
    const root = makeProject(SITE);
    const s = startStaticServer(join(root, "public"));
    try {
      const port = Number(new URL(s.url).port);
      for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/.env", "/.git/config"]) expect((await raw(port, path)).status).toBe(404);
      expect((await raw(port, "/", "evil.example:80")).status).toBe(403);
      expect((await raw(port, "/", `localhost:${port}`)).status).toBe(200);
      expect(s.url).toStartWith("http://127.0.0.1:");
    } finally {
      s.stop();
    }
  });
});

describe("the static server, after the final review", () => {
  test("never serves a hidden file by its Windows short name, or a file outside the site through a link", async () => {
    const root = makeProject({ ...SITE, "outside/secret.txt": "outside the site" });
    symlinkSync(join(root, "outside"), join(root, "public/linked"), "junction");
    const s = startStaticServer(join(root, "public"));
    try {
      const port = Number(new URL(s.url).port);
      expect((await raw(port, "/linked/secret.txt")).status).toBe(404);
      expect((await raw(port, "/linked/")).status).toBe(404);
      if (existsSync(join(root, "public/ENV~1"))) expect((await raw(port, "/ENV~1")).status).toBe(404);
      if (existsSync(join(root, "public/GIT~1"))) expect((await raw(port, "/GIT~1/config")).status).toBe(404);
      expect((await raw(port, "/about.html")).status).toBe(200);
    } finally {
      s.stop();
    }
  });

  test("serves .htm pages and .mjs modules with their types", async () => {
    const root = makeProject({ "public/index.html": "", "public/old.htm": "<h1>Old</h1>", "public/app.mjs": "export {};", "public/icon.ico": "x" });
    const s = startStaticServer(join(root, "public"));
    try {
      expect((await fetch(`${s.url}/old.htm`)).headers.get("content-type")).toContain("text/html");
      expect((await fetch(`${s.url}/app.mjs`)).headers.get("content-type")).toContain("text/javascript");
      expect((await fetch(`${s.url}/icon.ico`)).headers.get("content-type")).toBe("image/x-icon");
    } finally {
      s.stop();
    }
  });
});

describe("a plain site's pages", () => {
  test("every .html file, index pages as their folder, leaving out hidden folders, packages, build output and design/", () => {
    const root = makeProject({
      "index.html": "", "about.html": "", "blog/index.html": "", "blog/post.html": "", "OLD.HTM": "",
      ".hidden/x.html": "", "node_modules/x/index.html": "", "dist/index.html": "", "design/previews/home.html": "",
    });
    expect(discoverPlainRoutes(root)).toEqual({ routes: ["/", "/OLD.HTM", "/about.html", "/blog/", "/blog/post.html"], skipped: [] });
  });
});

describe("motif shot on a plain site", () => {
  const deps = () => {
    const calls = { served: [] as string[], stopped: 0, captured: [] as CaptureOptions[] };
    const fail = () => {
      throw new Error("a dev server shouldn't be started for a plain site");
    };
    const d: ShotDeps = {
      findBrowser: () => ({ name: "Chrome", path: "/fake/chrome" }),
      devCommand: fail,
      startDevServer: fail,
      serveStatic: (root) => {
        calls.served.push(root);
        return { url: "http://127.0.0.1:5555", stop: () => void calls.stopped++ };
      },
      capture: async (o) => {
        calls.captured.push(o);
        const routes = o.routes.map((route) => ({ route, url: `${o.baseUrl}${route}`, status: 200, shots: [join(o.outDir, `${route === "/" ? "index" : "about"}.mobile.png`)] }));
        for (const shot of routes.flatMap((r) => r.shots)) {
          mkdirSync(dirname(shot), { recursive: true });
          writeFileSync(shot, "png");
        }
        return { routes, issues: [] };
      },
      compare: async () => [],
      today: () => "2026-10-15",
    };
    return { d, calls };
  };

  test("serves the site folder itself, captures its pages, and stops the server", async () => {
    const root = makeProject({ "public/index.html": "", "public/about.html": "" });
    const { d, calls } = deps();
    const r = await runShot(root, { positionals: [], flags: {} }, d);
    expect(r.exitCode).toBe(0);
    expect(calls.served).toEqual([join(root, "public")]);
    expect(calls.captured[0]).toMatchObject({ baseUrl: "http://127.0.0.1:5555", routes: ["/", "/about.html"] });
    expect(calls.stopped).toBe(1);
  });

  test("with --url, uses the running site and still finds the pages from its files", async () => {
    const root = makeProject({ "public/index.html": "", "public/about.html": "" });
    const { d, calls } = deps();
    await runShot(root, { positionals: [], flags: { url: "http://localhost:3000" } }, d);
    expect(calls.served).toEqual([]);
    expect(calls.captured[0]).toMatchObject({ baseUrl: "http://localhost:3000", routes: ["/", "/about.html"] });
  });
});
