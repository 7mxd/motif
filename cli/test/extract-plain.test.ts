import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runExtract } from "../src/commands/extract";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const XBLOOM_LIKE = [
  "<!doctype html><style>",
  "  :root { --bg: #f2f2f7; --surface: #ffffff; --text: #000000; --accent: #2959ae; }",
  "  @media (prefers-color-scheme: dark) {",
  "    :root:not([data-theme=light]) { --bg: #000000; --surface: #1c1c1e; --text: #ffffff; --accent: #90b2df; }",
  "  }",
  "  :root[data-theme=dark] { --bg: #000000; --surface: #1c1c1e; --text: #ffffff; --accent: #90b2df; }",
  "  body { background: var(--bg); color: var(--text); }",
  "</style>",
].join("\n");

const read = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));
/** A role's hex in light or dark mode, through its primitive. */
const hex = (tokens: any, role: string, mode: "light" | "dark") => {
  const t = tokens.color[role];
  const alias: string = mode === "dark" ? t.$extensions["dev.motif"].modes.dark : t.$value;
  return tokens.primitive.color[alias.match(/^\{primitive\.color\.(.+)\}$/)![1]!].$value.hex;
};

describe("motif extract on a plain web site", () => {
  test("drafts a guide from the CSS in the page, with dark values from its dark-mode blocks", async () => {
    const root = makeProject({ "public/index.html": XBLOOM_LIKE });
    const r = await runExtract(root, { positionals: [] });
    expect(r.exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "background", "light"), hex(tokens, "background", "dark")]).toEqual(["#F2F2F7", "#000000"]);
    expect([hex(tokens, "surface", "light"), hex(tokens, "surface", "dark")]).toEqual(["#FFFFFF", "#1C1C1E"]);
    expect(hex(tokens, "text-primary", "dark")).toBe("#FFFFFF");
    expect(hex(tokens, "action-primary", "dark")).toBe("#90B2DF");
    const report = read(root, "design/extract-report.json");
    expect(report.variables).toContainEqual({ name: "--bg", light: "#f2f2f7", dark: "#000000", role: "color.background" });
    expect(report.variables).toContainEqual({ name: "--accent", light: "#2959ae", dark: "#90b2df", role: "color.action-primary" });
    expect(report.notes.join("\n")).toMatch(/came from your CSS for .*background/);
  });

  test("React apps get real dark values too (a .dark block)", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { next: "15", react: "19" } }),
      "src/app/globals.css": ":root { --background: #ffffff; --foreground: #09090b; }\n.dark { --background: #09090b; --foreground: #fafafa; }\n",
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "background", "light"), hex(tokens, "background", "dark")]).toEqual(["#FFFFFF", "#09090B"]);
  });

  test("with no dark-mode blocks, dark copies light and says so", async () => {
    const root = makeProject({ "index.html": "<style>body { background: #fafafa; color: #111111; }</style>" });
    await runExtract(root, { positionals: [] });
    expect(read(root, "design/extract-report.json").notes.join("\n")).toContain("Dark-mode colours were copied from light mode");
  });

  test("on a stack it can't read yet, extract and check point at the review instead of a dead end", async () => {
    const vue = makeProject({ "package.json": JSON.stringify({ dependencies: { vue: "^3" } }), "src/App.vue": "" });
    const e = await runExtract(vue, { positionals: [] });
    expect(e.exitCode).toBe(2);
    expect(e.text).toContain("React web apps and plain web sites");
    expect(e.text).toContain("review");
    const c = await runCheck(vue, { positionals: [] });
    expect(c.text).toContain("Start one with /design");
    expect(c.text).not.toContain("motif extract");
    const plain = await runCheck(makeProject({ "index.html": "" }), { positionals: [] });
    expect(plain.text).toContain("motif extract");
  });
});

describe("variables that aren't one solid colour (final review)", () => {
  test("translucent and mixed values don't take a role or give it a dark value", async () => {
    const root = makeProject({
      "public/index.html": [
        "<style>",
        "  :root { --shadow: rgba(0,0,0,.15); --hairline: rgba(0,0,0,.1); --ink: color-mix(in srgb, var(--card), #000 24%); --text: #000000; --bg: #ffffff; }",
        "  @media (prefers-color-scheme: dark) { :root { --shadow: rgba(0,0,0,.6); --text: #ffffff; --bg: #000000; } }",
        "  body { background: var(--bg); color: var(--text); }",
        "</style>",
      ].join("\n"),
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "text-primary", "light"), hex(tokens, "text-primary", "dark")]).toEqual(["#000000", "#FFFFFF"]);
    expect(hex(tokens, "background", "dark")).toBe("#000000");
    const variables = read(root, "design/extract-report.json").variables as { name: string; role?: string }[];
    expect(variables.find((v) => v.name === "--shadow")?.role).toBeUndefined();
    expect(variables.find((v) => v.name === "--hairline")?.role).toBeUndefined();
    expect(variables.map((v) => v.name)).not.toContain("--ink");
    expect(variables.find((v) => v.name === "--text")?.role).toBe("color.text-primary");
  });
});

describe("what motif extract reads on a plain web site (xBloom re-check)", () => {
  test("only the site folder, not server code beside it", async () => {
    const root = makeProject({ "public/index.html": XBLOOM_LIKE, "lib/xbloom.js": 'export const DEFAULT_CARD = "#C9D5B8";' });
    const r = await runExtract(root, { positionals: [] });
    expect((r.data as { files: number }).files).toBe(1);
    const examples = read(root, "design/extract-report.json").colors.flatMap((c: any) => c.members.flatMap((m: any) => m.examples));
    expect(examples.filter((e: string) => e.startsWith("lib/"))).toEqual([]);
  });
});
