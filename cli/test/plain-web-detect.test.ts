import { afterAll, describe, expect, test } from "bun:test";
import { runDoctor, type DoctorDeps, type DoctorItem } from "../src/commands/doctor";
import { detectApps, detectStack, siteDir, siteFolder, STACK_LABELS } from "../src/detect/stacks";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (deps: Record<string, string>, extra: object = {}) => JSON.stringify({ dependencies: deps, ...extra });

describe("plain web sites", () => {
  test("a folder with an index.html and no framework, in each site folder", () => {
    for (const folder of [".", "public", "src", "site", "www"]) {
      const root = makeProject({ [folder === "." ? "index.html" : `${folder}/index.html`]: "<!doctype html>" });
      expect(detectStack(root)).toBe("plain-web");
      expect(siteFolder(root)).toBe(folder);
      expect(detectApps(root).apps).toEqual([{ path: ".", stack: "plain-web", source: "detected", srcDir: folder }]);
    }
    expect(STACK_LABELS["plain-web"]).toBe("Plain web (HTML and CSS)");
  });

  test("a small server, or Vite without a framework, is still plain web", () => {
    expect(detectStack(makeProject({ "package.json": JSON.stringify({ scripts: { start: "node server.js" } }), "server.js": "", "public/index.html": "" }))).toBe("plain-web");
    expect(detectStack(makeProject({ "package.json": JSON.stringify({ devDependencies: { vite: "^6" } }), "index.html": "" }))).toBe("plain-web");
  });

  test("other stacks, React without known tooling, and pages that aren't a site aren't plain web", () => {
    expect(detectStack(makeProject({ "package.json": pkg({ react: "^19", "react-dom": "^19", "react-scripts": "5" }), "public/index.html": "" }))).toBe("react-web");
    expect(detectStack(makeProject({ "package.json": pkg({ vue: "^3" }), "index.html": "" }))).toBe("vue");
    expect(detectStack(makeProject({ "package.json": pkg({ react: "^19" }), "index.html": "" }))).toBeNull();
    expect(detectStack(makeProject({ "docs/index.html": "", "design/previews/home.html": "", "templates/index.html": "" }))).toBeNull();
  });

  test("docs, design, templates and report folders inside a project aren't found as sites", () => {
    const root = makeProject({
      "docs/index.html": "", "design/index.html": "", "templates/index.html": "", "coverage/index.html": "", "out/index.html": "",
      "storybook-static/index.html": "", "apps/docs/index.html": "", "apps/site/index.html": "",
    });
    expect(detectApps(root).apps).toEqual([{ path: "apps/site", stack: "plain-web", source: "detected", srcDir: "." }]);
    // Other stacks in such folders are still found, as before.
    expect(detectApps(makeProject({ "docs/package.json": pkg({ react: "19", next: "15" }) })).apps).toEqual([{ path: "docs", stack: "react-web", source: "detected" }]);
  });

  test("found in apps/ like other stacks; design/motif.json can name it and its folder", () => {
    const root = makeProject({ "apps/site/public/index.html": "", "apps/web/package.json": pkg({ next: "15", react: "19" }) });
    expect(detectApps(root).apps).toEqual([
      { path: "apps/site", stack: "plain-web", source: "detected", srcDir: "public" },
      { path: "apps/web", stack: "react-web", source: "detected" },
    ]);
    const named = makeProject({ "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "plain-web", srcDir: "pages" }] }), "pages/home.html": "" });
    const app = detectApps(named).apps[0]!;
    expect(app).toEqual({ path: ".", stack: "plain-web", source: "motif.json", srcDir: "pages" });
    expect(siteDir(named, app)).toBe("pages");
    expect(siteDir(makeProject({ "public/index.html": "" }), { path: ".", stack: "plain-web", source: "motif.json" })).toBe("public");
  });
});

describe("doctor", () => {
  const deps = (): DoctorDeps => ({ platform: "linux", arch: "x64", home: tempDir("motif-home-"), findBrowser: () => null, which: () => null });

  test("reports a plain web site as fully supported, with its site folder, and doesn't ask for Node.js", async () => {
    const items = (await runDoctor(makeProject({ "public/index.html": "<!doctype html>" }), deps())).data.items as DoctorItem[];
    expect(items.find((i) => i.id === "app:.")).toMatchObject({ status: "ok", detail: "Full support for Plain web (HTML and CSS); its pages are in public/." });
    expect(items.find((i) => i.id === "node")).toBeUndefined();
    const atRoot = (await runDoctor(makeProject({ "index.html": "" }), deps())).data.items as DoctorItem[];
    expect(atRoot.find((i) => i.id === "app:.")!.detail).toContain("its pages are in this folder");
  });
});

describe("plain web next to other apps, and look-alikes (final review)", () => {
  test("a React app in a subfolder is still found when the root also has pages", () => {
    const express = makeProject({
      "package.json": pkg({ express: "^5" }), "server.js": "", "public/index.html": "",
      "client/package.json": pkg({ react: "^19", "react-dom": "^19", vite: "^6" }),
    });
    expect(detectApps(express).apps).toEqual([{ path: "client", stack: "react-web", source: "detected" }]);
    const mono = makeProject({ "index.html": "", "apps/web/package.json": pkg({ next: "15", react: "19" }) });
    expect(detectApps(mono).apps).toEqual([{ path: "apps/web", stack: "react-web", source: "detected" }]);
    // Pages alone, or with only more pages below them, are still one plain web app at the root.
    expect(detectApps(makeProject({ "public/index.html": "", "public/blog/index.html": "", "www/index.html": "" })).apps)
      .toEqual([{ path: ".", stack: "plain-web", source: "detected", srcDir: "public" }]);
  });

  test("other UI libraries, static-site generators and test pages aren't plain web", () => {
    for (const dep of ["preact", "solid-js", "lit", "@builder.io/qwik", "@stencil/core", "ember-source", "astro", "@11ty/eleventy"]) {
      expect(detectStack(makeProject({ "package.json": pkg({ [dep]: "1", vite: "6" }), "index.html": "" }))).toBeNull();
    }
    for (const marker of ["mkdocs.yml", "_config.yml", "hugo.toml", "hugo.yaml", "eleventy.config.js", ".eleventy.js"]) {
      expect(detectStack(makeProject({ [marker]: "", "public/index.html": "", "site/index.html": "", "index.html": "" }))).toBeNull();
    }
    expect(detectApps(makeProject({ "test/index.html": "", "tests/index.html": "" })).apps).toEqual([]);
  });
});
