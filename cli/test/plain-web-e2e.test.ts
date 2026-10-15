import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble } from "../../tests/fixtures/assemble";
import { findBrowser } from "../src/detect/browser";
import { validDesignMd, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO_ROOT = join(import.meta.dir, "../..");
const browser = findBrowser();
let bin = "";

const PAGE = [
  "<!doctype html>",
  '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="motif.css">',
  "<style>",
  "  :root { --page: var(--motif-color-background); --ink: var(--motif-color-text-primary); }",
  "  body { margin: 0; padding: var(--motif-space-6); background: var(--page); color: var(--ink); }",
  "  .badge { color: #c0ffee; }",
  "  #panel { display: none; }",
  "  #panel.open { display: block; min-height: 400px; }",
  "</style></head>",
  '<body><h1>Sample</h1><div id="panel">Opened</div><a href="about.html">About</a></body></html>',
].join("\n");

const site = () =>
  makeProject({
    "DESIGN.md": validDesignMd(),
    "design/tokens.json": JSON.stringify(validTokens()),
    "public/index.html": PAGE,
    "public/about.html": '<!doctype html><link rel="stylesheet" href="motif.css"><h1>About</h1>',
    "design/states/open.js": 'document.getElementById("panel").classList.add("open");',
    "design/states/broken.js": 'throw new Error("no such button");',
  });

const run = (cwd: string, args: string[]) => {
  const r = Bun.spawnSync([bin, ...args, "--json"], { cwd, env: { ...process.env, NO_COLOR: "1" } });
  const out = r.stdout.toString().trim().split("\n").pop() ?? "";
  return { code: r.exitCode, json: JSON.parse(out) };
};

describe("the compiled tool on a plain web site", () => {
  beforeAll(() => {
    bin = join(tempDir("motif-build-"), process.platform === "win32" ? "motif.exe" : "motif");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", join(REPO_ROOT, "cli/src/main.ts"), "--outfile", bin]);
    if (build.exitCode !== 0) throw new Error(build.stderr.toString());
  });

  test("doctor, tokens, check and extract", () => {
    const root = site();
    const doctor = run(root, ["doctor"]);
    expect(doctor.json.items.find((i: any) => i.id === "app:.")).toMatchObject({ status: "ok", detail: expect.stringContaining("public/") });

    const tokens = run(root, ["tokens"]);
    expect(tokens.code).toBe(0);
    expect(tokens.json.files).toContainEqual({ path: "public/motif.css", status: "created" });
    expect(tokens.json.notes.join("\n")).not.toContain("Next:");

    const check = run(root, ["check"]);
    expect(check.code).toBe(1);
    expect(check.json.violations.map((v: any) => [v.rule, v.text, v.file, v.line])).toEqual([["raw-color", "#c0ffee", "public/index.html", 6]]);

    const extract = run(root, ["extract"]);
    expect(extract.code).toBe(0);
    expect(existsSync(join(root, "design/tokens.draft.json"))).toBe(true);
  });

  test.skipIf(!browser)("shot serves the site, finds its pages, and captures states (needs Chrome, Edge or Chromium)", () => {
    const root = site();
    run(root, ["tokens"]);
    const shot = run(root, ["shot", "--audit", "--state", "design/states/open.js", "--state", "design/states/broken.js"]);
    expect(shot.json.routes.map((r: any) => r.route)).toEqual(["/", "/about.html"]);
    expect(shot.json.states).toEqual(["open", "broken"]);
    const shots: string[] = shot.json.shots;
    for (const name of ["index.mobile.png", "index@open.mobile.png", "index@open.desktop.dark.png", "about-html@broken.mobile.png"]) {
      expect(shots).toContain(`design/shots/${name}`);
    }
    const plain = readFileSync(join(root, "design/shots/index.mobile.png"));
    const opened = readFileSync(join(root, "design/shots/index@open.mobile.png"));
    expect(Buffer.compare(plain, opened)).not.toBe(0);
    const home = shot.json.routes.find((r: any) => r.route === "/");
    expect(home.pageErrors.join("\n")).toContain('State "broken"');
    expect(home.pageErrors.join("\n")).toContain("no such button");
  }, 300_000);

  test("on the plain fixtures: doctor, tokens and check on Kitepost; check and extract on the seeded site", () => {
    const site = join(tempDir("motif-fixture-"), "site");
    assemble("plain-contract-site", site);
    expect(run(site, ["doctor"]).json.items.find((i: any) => i.id === "app:.")).toMatchObject({ status: "ok", detail: expect.stringContaining("this folder") });
    const tokens = run(site, ["tokens"]);
    expect(tokens.code).toBe(0);
    expect(tokens.json.files.filter((f: any) => f.status !== "unchanged")).toEqual([]);
    expect(run(site, ["check"]).code).toBe(0);
    const seeded = join(tempDir("motif-fixture-"), "site");
    assemble("plain-seeded-site", seeded);
    expect(run(seeded, ["check"]).json.summary).toMatchObject({ violations: 7, warnings: 1 });
    expect(run(seeded, ["extract"]).code).toBe(0);
    const report = JSON.parse(readFileSync(join(seeded, "design/extract-report.json"), "utf8"));
    // The site's one typed colour is listed with its value (as a background, the only one the draft found).
    expect(report.variables.find((v: { name: string }) => v.name === "--paper")).toEqual({ name: "--paper", light: "#FFF8EC", role: "color.background" });
  });

  test.skipIf(!browser)("shot --audit with Kitepost's state scripts finds nothing (needs Chrome, Edge or Chromium)", () => {
    const site = join(tempDir("motif-fixture-"), "site");
    assemble("plain-contract-site", site);
    const shot = run(site, ["shot", "--audit", "--state", "design/states/sent.js", "--state", "design/states/errors.js", "--state", "design/states/empty.js"]);
    expect(shot.json.states).toEqual(["sent", "errors", "empty"]);
    expect(shot.json.findings).toEqual([]);
    expect(shot.code).toBe(0);
  }, 300_000);
});
