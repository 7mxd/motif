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
    const vue = makeProject({ "design/motif.json": JSON.stringify({ apps: [{ path: ".", stack: "compose-multiplatform" }] }), "src/commonMain/kotlin/App.kt": "@Composable fun App() {}\n" });
    const e = await runExtract(vue, { positionals: [] });
    expect(e.exitCode).toBe(2);
    expect(e.text).toContain("React web apps, plain web sites, Vue / Nuxt apps, Svelte / SvelteKit apps and Angular apps");
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

describe("final review of Plan 2C: plain-site drafts never get worse than before", () => {
  const draftOf = async (css: string) => {
    const root = makeProject({ "index.html": `<style>${css}</style>` });
    await runExtract(root, { positionals: [] });
    return { tokens: read(root, "design/tokens.draft.json"), report: read(root, "design/extract-report.json") };
  };
  const base = ":root { --bg: #ffffff; --text: #111111; --accent: #2563eb; --surface: #f4f4f5; --gray: #e4e4e7; } body { background: var(--bg); color: var(--text); }";

  test("a reset that styles buttons with fields, a disabled state or a :not() isn't the main action; .btn-primary and a.btn are", async () => {
    const a = await draftOf(`${base} button, input, select, textarea { background: var(--surface); } .btn-primary { background: var(--accent); color: #ffffff; }`);
    expect(hex(a.tokens, "action-primary", "light")).toBe("#2563EB");
    const b = await draftOf(`${base} button:disabled { background: var(--gray); } .chip { background: var(--gray); } .tag { background: var(--gray); } .cta { color: var(--accent); }`);
    expect(hex(b.tokens, "action-primary", "light")).toBe("#2563EB");
    const c = await draftOf(`${base} input:not([type="submit"]) { background: var(--surface); } a.btn { background: var(--accent); }`);
    expect(hex(c.tokens, "action-primary", "light")).toBe("#2563EB");
    // Inside a media query, and a .btn--primary modifier, still count; a .btn-link doesn't.
    const d = await draftOf(`${base} @media (min-width: 600px) { .btn--primary { background: var(--accent); } } .btn-link { background: var(--surface); }`);
    expect(hex(d.tokens, "action-primary", "light")).toBe("#2563EB");
  });

  test("a near-white button fill never becomes the main action over a real colour", async () => {
    const r = await draftOf(`${base} button { background: var(--surface); } .badge { background: var(--accent); }`);
    expect(hex(r.tokens, "action-primary", "light")).toBe("#2563EB");
  });

  test("text roles only take a name used as text by that variable, never a background's name, and stay readable", async () => {
    const r = await draftOf(`${base} :root { --bg-muted: #f4f4f5; --secondary: #0d9488; --grey: #6b7280; } .hero { color: #f5f5f5; background: var(--bg-muted); }
      .a { color: var(--grey); } .b { color: var(--grey); } .c { color: var(--grey); } .d { color: var(--grey); } .e { color: var(--grey); } .f { color: var(--secondary); }`);
    // --grey (#6b7280) is the text colour, but it reads at 4.39:1 on the drafted surface (--surface, #f4f4f5), short of
    // validate's 4.5:1, so it's darkened a little and the notes say so (v0.5.0 sweep). Never --bg-muted's #f4f4f5.
    expect(hex(r.tokens, "text-secondary", "light")).toBe("#686F7D");
    expect(r.report.notes.join("\n")).toContain("Text colour #6b7280 (4.39:1 on the surface, needs 4.5:1) was darkened to #686f7d so it reads on every background; check it.");
  });

  test("var() with a fallback counts once", async () => {
    const r = await draftOf(":root { --muted: #6c6c70; --a: #222222; --b: #333333; } .x { color: var(--muted, #6c6c70); } .y { color: var(--a, var(--b)); }");
    const count = (h: string) => r.report.colors.find((c: any) => c.hex === h)?.count;
    // The declaration and one use each; the fallbacks don't add uses while the variable has a colour.
    expect([count("#6C6C70"), count("#222222"), count("#333333")]).toEqual([2, 2, 1]);
  });

  test("a dark secondary button gets light text", async () => {
    const r = await draftOf(`${base} button.secondary { background: #1e293b; } .x { background: #1e293b; }`);
    expect(hex(r.tokens, "action-secondary", "light")).toBe("#1E293B");
    expect(hex(r.tokens, "on-action-secondary", "light")).toBe("#FFFFFF");
  });

  test("names keep their case (custom properties are case-sensitive), and dark-mode blocks add no uses", async () => {
    const r = await draftOf(`:root { --page: #ffffff; --gray900: #101828; --textPrimary: var(--gray900); --c1: #6c6c70; --c2: #999999; }
      body { background: var(--page); color: var(--textPrimary); } .x { color: var(--textPrimary); } .y { color: var(--c1); }
      @media (prefers-color-scheme: dark) { .a { color: var(--c2); } .b { color: var(--c2); } .c { color: var(--c2); } }`);
    expect([hex(r.tokens, "text-primary", "light"), hex(r.tokens, "text-secondary", "light")]).toEqual(["#101828", "#6C6C70"]);
  });

  test("in a project with a plain site and another app, only the site's own names are read as hints", () => {
    const site: SourceFile = { path: "site/styles.css", abs: "", lang: "css", text: ":root { --ink: #111111; } body { color: var(--ink); }" };
    const app: SourceFile = { path: "app/src/globals.css", abs: "", lang: "css", text: ":root { --muted: #f5f5f5; } .x { color: #f5f5f5; }" };
    const occ = collectOccurrences([site, app], null, () => true, (f) => f === site);
    expect(occ.roleNames).toEqual(["--ink"]);
  });
});

describe("a stylesheet linked for dark mode only (backlog)", () => {
  test("its colours are the dark values", async () => {
    const root = makeProject({
      "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="dark.css" media="(prefers-color-scheme: dark)"><p>Hi</p>',
      "public/styles.css": ":root { --bg: #f2f2f7; --text: #111111 }\nbody { background: var(--bg); color: var(--text) }",
      "public/dark.css": ":root { --bg: #0a0a0a; --text: #fafafa }",
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "background", "light"), hex(tokens, "background", "dark")]).toEqual(["#F2F2F7", "#0A0A0A"]);
  });
});

describe("the review of batch C2", () => {
  const extracted = async (files: Record<string, string>) => {
    const root = makeProject(files);
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    return [hex(tokens, "background", "light"), hex(tokens, "background", "dark")];
  };

  test("body { background: var(--x) } makes --x's colour the page's, whatever cards use more", async () => {
    const cards = Array.from({ length: 6 }, (_, i) => `.card${i} { background: var(--c1); }`).join("\n");
    const [light] = await extracted({
      "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>',
      "public/styles.css": `:root { --c1: #ffffff; --c2: #f4f4f5; --c3: #111111 }\nbody { background: var(--c2); color: var(--c3) }\n${cards}`,
    });
    expect(light).toBe("#F4F4F5");
  });

  test("a dark stylesheet linked from the site's root (/dark.css?v=2) is dark", async () => {
    expect(await extracted({
      "public/index.html": '<!doctype html><link rel="stylesheet" href="/styles.css?v=2"><link rel="stylesheet" href="/dark.css?v=2" media="(prefers-color-scheme: dark)"><p>Hi</p>',
      "public/styles.css": ":root { --bg: #f2f2f7; --text: #111111 }\nbody { background: var(--bg); color: var(--text) }",
      "public/dark.css": ":root { --bg: #0a0a0a; --text: #fafafa }",
    })).toEqual(["#F2F2F7", "#0A0A0A"]);
  });

  test("a dark selector list keeps its colours dark, wherever it is in the file", async () => {
    for (const css of [
      ":root { --bg: #f2f2f7; --text: #111111 }\n.dark, .dark-mode { --bg: #0a0a0a; --text: #fafafa }\nbody { background: var(--bg); color: var(--text) }",
      ".dark, .dark-mode { --bg: #0a0a0a; --text: #fafafa }\n:root { --bg: #f2f2f7; --text: #111111 }\nbody { background: var(--bg); color: var(--text) }",
    ]) {
      expect(await extracted({ "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>', "public/styles.css": css })).toEqual(["#F2F2F7", "#0A0A0A"]);
    }
  });

  test("light-dark() gives a variable its light and dark values", async () => {
    expect(await extracted({
      "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>',
      "public/styles.css": ":root { --bg: light-dark(#f2f2f7, #0a0a0a); --text: light-dark(#111111, #fafafa) }\nbody { background: var(--bg); color: var(--text) }",
    })).toEqual(["#F2F2F7", "#0A0A0A"]);
  });

  test("an off-white page beside white cards keeps both colours when the CSS names each (v1.0 field trial)", async () => {
    const cards = Array.from({ length: 6 }, (_, i) => `.card${i} { background: var(--surface); }`).join("\n");
    const root = makeProject({
      "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>',
      "public/styles.css": `:root { --bg: light-dark(#f6f6f4, #111213); --surface: light-dark(#ffffff, #1b1c1e); --text: light-dark(#1b1c1e, #ececea) }\nbody { background: var(--bg); color: var(--text) }\n${cards}`,
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect([hex(tokens, "background", "light"), hex(tokens, "background", "dark")]).toEqual(["#F6F6F4", "#111213"]);
    expect([hex(tokens, "surface", "light"), hex(tokens, "surface", "dark")]).toEqual(["#FFFFFF", "#1B1C1E"]);
  });

  test("the text on the action colour is the one the CSS names after it: --accent-contrast, shadcn's --primary-foreground (v1.0 field trial)", async () => {
    for (const [fill, on] of [["--accent", "--accent-contrast"], ["--primary", "--primary-foreground"], ["--brand", "--on-brand"]]) {
      const buttons = Array.from({ length: 6 }, (_, i) => `button.b${i} { background: var(${fill}); color: var(${on}); }`).join("\n");
      const root = makeProject({
        "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>',
        "public/styles.css": `:root { --bg: light-dark(#f6f6f4, #111213); --text: light-dark(#1b1c1e, #ececea); ${fill}: light-dark(#1f5f5b, #6fc2b9); ${on}: light-dark(#fefefe, #0c1f1d) }\nbody { background: var(--bg); color: var(--text) }\n${buttons}`,
      });
      expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
      const tokens = read(root, "design/tokens.draft.json");
      expect([hex(tokens, "action-primary", "light"), hex(tokens, "on-action-primary", "light"), hex(tokens, "on-action-primary", "dark")]).toEqual(["#1F5F5B", "#FEFEFE", "#0C1F1D"]);
    }
  });

  test("light-dark(var(--a), var(--b)) is followed through both variables", async () => {
    expect(await extracted({
      "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>',
      "public/styles.css": ":root { --gray-50: #f2f2f7; --gray-950: #0a0a0a; --ink: #111111; --bg: light-dark(var(--gray-50), var(--gray-950)) }\nbody { background: var(--bg); color: var(--ink) }",
    })).toEqual(["#F2F2F7", "#0A0A0A"]);
  });

  test("a variable set from another one in a dark-mode block gets that one's colour as its dark value", async () => {
    for (const dark of ["@media (prefers-color-scheme: dark) { :root { --bg: var(--gray-950) } }", ".dark { --bg: var(--gray-950) }"]) {
      expect(await extracted({
        "public/index.html": '<!doctype html><link rel="stylesheet" href="styles.css"><p>Hi</p>',
        "public/styles.css": `:root { --gray-50: #f2f2f7; --gray-950: #0a0a0a; --bg: var(--gray-50) }\n${dark}\nbody { background: var(--bg); color: #111111 }`,
      })).toEqual(["#F2F2F7", "#0A0A0A"]);
    }
  });

  test("blocks that set a variant's colours become variants of the draft", async () => {
    const page = [
      "<!doctype html><style>",
      "  :root { --bg: #ffffff; --text: #111111; --accent: #c2410c; }",
      '  [data-gender="female"] { --accent: #be185d; --bg: #fdf2f8; }',
      '  [data-gender="male"] { --accent: #0e5c4d; }',
      '  @media (prefers-color-scheme: dark) { [data-gender="male"] { --accent: #5cc9b3; } }',
      "  body { background: var(--bg); color: var(--text); } button { background: var(--accent); }",
      "</style>",
    ].join("\n");
    const root = makeProject({ "public/index.html": page });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect(tokens.$extensions["dev.motif"].variants).toEqual([
      { id: "default", label: "Default", default: true },
      { id: "female", label: "Female" },
      { id: "male", label: "Male" },
    ]);
    const prim = (alias: string) => tokens.primitive.color[alias.match(/^\{primitive\.color\.(.+)\}$/)![1]!].$value.hex;
    const accent = tokens.color["action-primary"].$extensions["dev.motif"].variants;
    expect(Object.keys(accent)).toEqual(["female", "male"]);
    expect([prim(accent.female.value), prim(accent.female.dark)]).toEqual(["#BE185D", "#BE185D"]);
    expect([prim(accent.male.value), prim(accent.male.dark)]).toEqual(["#0E5C4D", "#5CC9B3"]);
    expect(prim(tokens.color.background.$extensions["dev.motif"].variants.female.value)).toBe("#FDF2F8");
    expect(tokens.color.background.$extensions["dev.motif"].variants.male).toBeUndefined();
    // The default palette is the :root one, untouched by the variants.
    expect(hex(tokens, "action-primary", "light")).toBe("#C2410C");
    const report = read(root, "design/extract-report.json");
    expect(report.designVariants).toEqual([{ id: "default", label: "Default" }, { id: "female", label: "Female" }, { id: "male", label: "Male" }]);
    expect(report.variables).toContainEqual({ name: "--accent", light: "#c2410c", role: "color.action-primary", variants: { female: { light: "#be185d" }, male: { light: "#0e5c4d", dark: "#5cc9b3" } } });
    expect(report.notes.join("\n")).toContain("3 design variants (default, female, male)");
  });

  test("a site with no variant blocks drafts without any variants", async () => {
    const root = makeProject({ "public/index.html": XBLOOM_LIKE });
    await runExtract(root, { positionals: [] });
    const tokens = read(root, "design/tokens.draft.json");
    expect(tokens.$extensions["dev.motif"].variants).toBeUndefined();
    expect(JSON.stringify(tokens)).not.toContain('"variants"');
    expect(read(root, "design/extract-report.json").designVariants).toBeUndefined();
  });
});
