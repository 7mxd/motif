import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runExtract } from "../src/commands/extract";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";
import type { SourceFile } from "../src/check/files";
import { collectOccurrences } from "../src/extract/draft";

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

// The real page's shape: its own variables, used through var(); black pill buttons; card colours listed in a script.
const XBLOOM_PAGE = `<!doctype html><html><head><style>
  :root {
    --bg: #f2f2f7; --surface: #fff; --surface-2: #e5e5ea; --text: #000; --muted: #6c6c70;
    --danger: #d70015; --hairline: rgba(0,0,0,.1); --accent: #2959ae; --card: #C9D5B8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme=light]) {
      --bg: #000; --surface: #1c1c1e; --surface-2: #2c2c2e; --text: #fff; --muted: #8e8e93;
      --danger: #ff6961; --hairline: rgba(255,255,255,.12); --accent: #90b2df;
    }
  }
  body { background: var(--bg); color: var(--text); }
  .lede { color: var(--muted); }
  h2 { color: var(--muted); }
  .meta { color: var(--muted); }
  .note { color: var(--muted); }
  button { background: var(--text); color: var(--bg); }
  button.secondary { background: var(--surface-2); color: var(--text); }
  .details { background: var(--surface); }
  .details tr + tr td { border-top: 1px solid var(--surface-2); }
  .details .grind { border-bottom: 1px solid var(--surface-2); }
  details.advanced { border-top: 1px solid var(--surface-2); }
  .card { background: var(--card); box-shadow: inset 0 0 0 1px var(--hairline); }
  .msg.error { color: var(--danger); }
  footer a { color: var(--accent); }
  input[type=range]::-webkit-slider-thumb { border: 3px solid #fff; }
  input[type=range]::-moz-range-thumb { border: 3px solid #fff; }
</style></head><body><main></main>
<script>
  const PRESETS = ["#E3C3A8", "#D9302C", "#B48AC9", "#4A90F0", "#2E8B57", "#F2C14E", "#C9D5B8"];
</script></body></html>`;

describe("motif extract follows a site's own variables (xBloom re-check)", () => {
  test("uses through var(), names and buttons pick the roles; a script's list of colours isn't the theme", async () => {
    const root = makeProject({ "public/index.html": XBLOOM_PAGE });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    const both = (role: string) => [role, hex(tokens, role, "light"), hex(tokens, role, "dark")];
    expect(["background", "surface", "text-primary", "text-secondary", "border", "action-primary", "action-secondary", "danger"].map(both)).toEqual([
      ["background", "#F2F2F7", "#000000"],
      ["surface", "#FFFFFF", "#1C1C1E"],
      ["text-primary", "#000000", "#FFFFFF"],
      ["text-secondary", "#6C6C70", "#8E8E93"],
      ["border", "#E5E5EA", "#2C2C2E"],
      ["action-primary", "#000000", "#FFFFFF"],
      ["action-secondary", "#E5E5EA", "#2C2C2E"],
      ["danger", "#D70015", "#FF6961"],
    ]);
    // The card colours people pick from aren't the site's success and warning colours.
    expect(hex(tokens, "success", "light")).not.toBe("#2E8B57");
    expect(hex(tokens, "warning", "light")).not.toBe("#F2C14E");
    const roles = Object.fromEntries(read(root, "design/extract-report.json").variables.map((v: any) => [v.name, v.role]));
    expect([roles["--bg"], roles["--surface"], roles["--text"], roles["--muted"]]).toEqual(["color.background", "color.surface", "color.text-primary", "color.text-secondary"]);
  });
});

describe("role names set through another variable, and React apps (Plan 2C)", () => {
  test("on a plain site, --text-primary: var(--gray-900) names the role even when another grey is used more", async () => {
    const root = makeProject({
      "index.html": `<style>
        :root { --gray-900: #101828; --gray-500: #667085; --white: #ffffff;
                --text-primary: var(--gray-900); --text-secondary: var(--gray-500); --background: var(--white); }
        body { background: var(--background); color: var(--text-primary); }
        .a, .b, .c { color: var(--text-secondary); }
        .d { color: var(--text-secondary); }
        .e { color: var(--text-secondary); }
      </style>`,
    });
    await runExtract(root, { positionals: [] });
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "text-primary", "light"), hex(tokens, "text-secondary", "light"), hex(tokens, "background", "light")]).toEqual(["#101828", "#667085", "#FFFFFF"]);
  });

  test("React apps keep the drafts they had: their variables aren't followed yet", () => {
    const css: SourceFile = { path: "src/app/globals.css", abs: "", lang: "css", text: ":root { --muted: #6c6c70; } .a { color: var(--muted); } button { background: var(--muted); }" };
    const occ = collectOccurrences([css], null);
    expect(occ.followVariables).toBeUndefined();
    expect(occ.colors.map((c) => [c.value, c.count, c.contexts])).toEqual([["#6c6c70", 1, { other: 1 }]]);
  });
});
