import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { validateTokens } from "../src/contract/tokens";
import { isDarkClassSelector } from "../src/stacks/angular/dark";
import { docFrom, FIXTURES } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const ctx = { positionals: [], flags: {} };
const NG_PKG = (extra: Record<string, string> = {}) =>
  JSON.stringify({
    name: "shop",
    scripts: { ng: "ng", start: "ng serve", build: "ng build" },
    dependencies: { "@angular/common": "~21.2.0", "@angular/core": "~21.2.0", "@angular/router": "~21.2.0", ...extra },
    devDependencies: { "@angular/build": "~21.2.0", "@angular/cli": "~21.2.0", typescript: "~5.9.2" },
  });
const NG_JSON = (style: string) =>
  JSON.stringify({
    version: 1,
    projects: {
      shop: {
        projectType: "application", root: "", sourceRoot: "src",
        architect: {
          build: { builder: "@angular/build:application", options: { browser: "src/main.ts", styles: [`src/styles.${style}`] } },
          serve: { builder: "@angular/build:dev-server" },
        },
      },
    },
  });
const APP_TS = `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
`;
const MAIN_TS = "import { bootstrapApplication } from '@angular/platform-browser';\nimport { App } from './app/app';\n\nbootstrapApplication(App).catch((err) => console.error(err));\n";
/** An `ng new` app (2025 file names) with the given style language and files; a file given as null is left out. */
const ngApp = (style: string, files: Record<string, string | null>, extraDeps: Record<string, string> = {}) =>
  makeProject(Object.fromEntries(Object.entries({
    "package.json": NG_PKG(extraDeps),
    "angular.json": NG_JSON(style),
    "src/index.html": '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Shop</title><base href="/"></head>\n<body>\n  <app-root></app-root>\n</body>\n</html>\n',
    "src/main.ts": MAIN_TS,
    "src/app/app.ts": APP_TS,
    "src/app/app.html": "<main class=\"page\"><h1>Shop</h1><router-outlet /></main>\n",
    "src/app/app.css": "",
    ...files,
  }).filter((e): e is [string, string] => e[1] !== null)));
const draftOf = (root: string): any => JSON.parse(readFileSync(join(root, "design/tokens.draft.json"), "utf8"));
const reportOf = (root: string): any => JSON.parse(readFileSync(join(root, "design/extract-report.json"), "utf8"));
const byName = (report: any) => Object.fromEntries(report.variables.map((v: any) => [v.name, v]));
const hexOf = (tokens: any, alias: string) => tokens.primitive.color[alias.slice("{primitive.color.".length, -1)].$value.hex;
const lightOf = (tokens: any, role: string) => hexOf(tokens, tokens.color[role].$value);
const pairOf = (tokens: any, role: string) => [lightOf(tokens, role), hexOf(tokens, tokens.color[role].$extensions["dev.motif"].modes.dark)];

/** Angular Material's M3 theme as `ng add @angular/material` writes it, with the app's own overrides and a dark class. */
const MATERIAL_SCSS = `// Include theming for Angular Material with \`mat.theme()\`.
@use '@angular/material' as mat;

html {
  color-scheme: light;
  @include mat.theme((
    color: (
      primary: mat.$azure-palette,
      tertiary: mat.$blue-palette,
    ),
    typography: Roboto,
    density: 0,
  ));
  @include mat.theme-overrides((
    primary: #6750a4,
    on-primary: #ffffff,
    surface: #fffbfe,
    on-surface: #1c1b1f,
    on-surface-variant: #49454f,
    error: #b3261e,
    outline-variant: #cac4d0,
    corner-medium: 12px,
  ));
}

.dark-theme {
  color-scheme: dark;
  @include mat.theme-overrides((
    primary: #d0bcff,
    on-primary: #381e72,
    surface: #141218,
    on-surface: #e6e1e5,
  ));
}

body { margin: 0; font-family: Roboto, "Helvetica Neue", sans-serif; }
`;

describe("motif extract on an ng new app", () => {
  test("the angular-min fixture (ng new --style=tailwind) is read, not refused", async () => {
    const root = tempDir("motif-ng-extract-");
    cpSync(join(FIXTURES, "angular-min"), root, { recursive: true, filter: (src) => !["node_modules", ".angular", "dist"].includes(basename(src)) });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(r.text).not.toContain("Skipped");
    expect(validateTokens(docFrom(draftOf(root)))).toEqual([]);
  });

  test("--style=css: src/styles.css and a component's own stylesheet give their values", async () => {
    const root = ngApp("css", {
      "src/styles.css": "/* You can add global styles to this file, and also import other style files */\n:root { --brand: #0f766e; --ink: #18181b; }\n@media (prefers-color-scheme: dark) { :root { --brand: #2dd4bf; --ink: #f4f4f5; } }\nbody { margin: 0; color: var(--ink); font-family: 'Newsreader', serif; }\n",
      "src/app/app.css": ".page { padding: 24px; border-radius: 12px; background: var(--brand); transition: opacity 200ms ease; }\n",
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const report = reportOf(root);
    expect(byName(report)["--brand"]).toMatchObject({ light: "#0f766e", dark: "#2dd4bf" });
    expect(report.spacing.map((s: any) => s.px)).toContain(24);
    expect(report.radius.map((s: any) => s.value)).toContain("12px");
    expect(report.durations.map((s: any) => s.value)).toContain("200ms");
    expect(report.fontFamilies.map((f: any) => f.value)).toContain("Newsreader");
    expect(validateTokens(docFrom(draftOf(root)))).toEqual([]);
  });

  test("--style=scss with the 2016 file names: the component's .scss is read", async () => {
    const root = ngApp("scss", {
      "src/styles.scss": "$gap: 8px;\nbody { margin: 0; }\n",
      "src/app/app.ts": null,
      "src/app/app.html": null,
      "src/app/app.css": null,
      "src/app/app.component.ts": "import { Component } from '@angular/core';\n\n@Component({ selector: 'app-root', templateUrl: './app.component.html', styleUrls: ['./app.component.scss'] })\nexport class AppComponent {}\n",
      "src/app/app.component.html": '<div class="card">Hi</div>\n',
      "src/app/app.component.scss": ".card { padding: 20px; background: #b45309; }\n",
    });
    await runExtract(root, ctx);
    const report = reportOf(root);
    expect(report.colors.map((c: any) => c.hex.toLowerCase())).toContain("#b45309");
    expect(report.spacing.map((s: any) => s.px)).toContain(20);
  });

  test("inline styles: are read, and a template's text that only looks like a value is not", async () => {
    const root = ngApp("css", {
      "src/styles.css": "",
      "src/app/app.ts": `import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  template: \`
    <!-- color: #fff -->
    <p>Call 555-0134, ticket #123</p>
    @if (count() > 13) { <img src="a.png" [width]="300" (click)="go(13)" /> }
    <div class="card">{{ count() }}</div>
  \`,
  styles: [\`
    .card { padding: 28px; background: #7c3aed; }
  \`],
})
export class App {
  count = signal(0);
  note = 'rgba is a function';
  go(n: number) {}
}
`,
    });
    await runExtract(root, ctx);
    const report = reportOf(root);
    expect(report.colors.map((c: any) => c.hex.toLowerCase())).toEqual(["#7c3aed"]);
    expect(report.spacing.map((s: any) => s.px)).toEqual([28]);
  });

  test("Tailwind 4: an @theme in src/styles.css gives its variables", async () => {
    const root = ngApp("css", {
      ".postcssrc.json": JSON.stringify({ plugins: { "@tailwindcss/postcss": {} } }),
      "src/styles.css": "@import 'tailwindcss';\n@theme { --color-paper: #f4f4f5; --color-ink: #111111; --color-card: #ffffff; }\n",
      "src/app/app.html": `<main class="bg-paper text-ink">${'<div class="bg-card text-ink p-4">x</div>'.repeat(8)}</main>\n`,
    }, { tailwindcss: "^4.3.3", "@tailwindcss/postcss": "^4.3.3" });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(byName(reportOf(root))["--color-paper"].light).toBe("#f4f4f5");
  });
});

describe("motif extract on an Angular Material app", () => {
  test("mat.theme's palettes are named in a note, not guessed; theme-overrides gives the roles their light and dark colours", async () => {
    const root = ngApp("scss", { "src/styles.scss": MATERIAL_SCSS }, { "@angular/material": "~21.2.0", "@angular/cdk": "~21.2.0" });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const report = reportOf(root);
    const notes = report.notes.join("\n");
    // The overrides set primary, so the note says where action-primary came from rather than to set it by hand.
    expect(notes).toContain(
      "Angular Material's mat.$azure-palette is a named palette; Motif can't read its colours from the code. action-primary came from your overrides (--mat-sys-primary) instead.",
    );
    expect(notes).not.toContain("Set action-primary in the guide by hand");
    expect(notes).toContain(
      "Angular Material's mat.$blue-palette (tertiary) is a named palette; Motif can't read its colours from the code. If your app shows its tertiary colours, set the matching role in design/tokens.json by hand; otherwise there's nothing to do.",
    );
    const tokens = draftOf(root);
    expect(pairOf(tokens, "action-primary")).toEqual(["#6750A4", "#D0BCFF"]);
    expect(pairOf(tokens, "surface")).toEqual(["#FFFBFE", "#141218"]);
    // Material 3's background is its surface.
    expect(pairOf(tokens, "background")).toEqual(["#FFFBFE", "#141218"]);
    expect(pairOf(tokens, "text-primary")).toEqual(["#1C1B1F", "#E6E1E5"]);
    expect(lightOf(tokens, "text-secondary")).toBe("#49454F");
    expect(lightOf(tokens, "danger")).toBe("#B3261E");
    expect(lightOf(tokens, "border")).toBe("#CAC4D0");
    expect(pairOf(tokens, "on-action-primary")).toEqual(["#FFFFFF", "#381E72"]);
    expect(report.radius.map((s: any) => s.value)).toContain("12px");
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });

  test("a palette only by name: no colour from it, and the note says to set action-primary by hand", async () => {
    const root = ngApp("scss", {
      "src/styles.scss": "@use '@angular/material' as mat;\n\nhtml {\n  color-scheme: light dark;\n  @include mat.theme((color: mat.$violet-palette, typography: Roboto, density: 0));\n}\n",
    }, { "@angular/material": "~21.2.0" });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const report = reportOf(root);
    expect(report.notes.join("\n")).toContain(
      "Angular Material's mat.$violet-palette is a named palette; Motif can't read its colours from the code. Set action-primary in the guide by hand.",
    );
    expect(report.colors).toEqual([]);
  });

  test("--mat-sys-* variables in CSS: roles, light-dark() and a dark media block, and the corners as radii", async () => {
    const root = ngApp("css", {
      "src/styles.css": `html {
  color-scheme: light dark;
  --mat-sys-surface: light-dark(#fdfcff, #1a1b1f);
  --mat-sys-on-surface: light-dark(#1a1b1f, #e3e2e6);
}
:root {
  --mat-sys-primary: #005cbb;
  --mat-sys-on-primary: #ffffff;
  --mat-sys-error: #ba1a1a;
  --mat-sys-outline-variant: #c4c6d0;
  --mat-sys-corner-small: 4px;
  --mat-sys-corner-large: 16px;
  --mat-sys-corner-full: 9999px;
}
@media (prefers-color-scheme: dark) {
  :root { --mat-sys-primary: #abc7ff; --mat-sys-on-primary: #002f65; }
}
.dark-theme { --mat-sys-error: #ffb4ab; }
`,
    }, { "@angular/material": "~21.2.0" });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    const tokens = draftOf(root);
    expect(pairOf(tokens, "action-primary")).toEqual(["#005CBB", "#ABC7FF"]);
    expect(pairOf(tokens, "surface")).toEqual(["#FDFCFF", "#1A1B1F"]);
    expect(pairOf(tokens, "text-primary")).toEqual(["#1A1B1F", "#E3E2E6"]);
    // A dark class Angular Material's guides use (.dark-theme) gives a dark value too.
    expect(pairOf(tokens, "danger")).toEqual(["#BA1A1A", "#FFB4AB"]);
    expect(lightOf(tokens, "border")).toBe("#C4C6D0");
    const radii = reportOf(root).radius.map((s: any) => s.value);
    expect(radii).toEqual(expect.arrayContaining(["4px", "16px", "9999px"]));
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });

  test("a .dark-theme block's other colours are dark values, not light ones: the same draft as with the web's .dark", async () => {
    const styles = (dark: string) => `@use '@angular/material' as mat;

html {
  @include mat.theme((color: mat.$azure-palette, typography: Roboto, density: 0));
  @include mat.theme-overrides((primary: #6750a4, surface: #fffbfe, on-surface: #1c1b1f, error: #b3261e));
}
${dark} {
  @include mat.theme-overrides((primary: #d0bcff, surface: #141218, on-surface: #e6e1e5));
}
.card { background: #fffbfe; border: 1px solid #cac4d0; color: #49454f; }
${dark} .card { background: #2b2930; border: 1px solid #49454f; color: #cac4d0; }
.ok { color: #1e8e3e; }
${dark} .ok { color: #81c995; }
`;
    const html = `<main>${'<div class="card"><p class="ok">Saved</p></div>'.repeat(4)}</main>\n`;
    const material = ngApp("scss", { "src/styles.scss": styles(".dark-theme"), "src/app/app.html": html }, { "@angular/material": "~21.2.0" });
    const web = ngApp("scss", { "src/styles.scss": styles(".dark"), "src/app/app.html": html }, { "@angular/material": "~21.2.0" });
    await runExtract(material, ctx);
    await runExtract(web, ctx);
    const tokens = draftOf(material);
    expect(lightOf(tokens, "border")).toBe("#CAC4D0");
    // success isn't the dark block's green (#81C995); the light one is too dark a text colour to be taken, so it's the default.
    expect(lightOf(tokens, "success")).not.toBe("#81C995");
    // text-secondary is a light text colour (the light green, darkened to read, as the web drafts it), never a dark block's.
    expect(["#CAC4D0", "#81C995", "#E6E1E5"]).not.toContain(lightOf(tokens, "text-secondary"));
    expect(pairOf(tokens, "action-primary")).toEqual(["#6750A4", "#D0BCFF"]);
    // No colour of the dark block is read as a light one.
    const lightHexes = reportOf(material).colors.map((c: any) => c.hex.toUpperCase());
    for (const hex of ["#2B2930", "#81C995", "#141218", "#E6E1E5", "#D0BCFF"]) expect(lightHexes).not.toContain(hex);
    expect(reportOf(material).notes.join("\n").toLowerCase()).not.toContain("#81c995");
    // .dark-theme reads as the web reads .dark.
    for (const role of ["border", "success", "text-secondary", "surface", "background", "text-primary"]) {
      expect(pairOf(tokens, role)).toEqual(pairOf(draftOf(web), role));
    }
    expect(validateTokens(docFrom(tokens))).toEqual([]);
  });

  test("dark classes are whole words: .dark-theme, .theme-dark, .dark-mode are dark; .not-dark and .darkened-card are not", () => {
    for (const s of [".dark", ".dark-theme", ".theme-dark", ".dark-mode", "body.dark-theme", '[data-theme="dark"]', "html.app-dark, .dark-theme"]) {
      expect([s, isDarkClassSelector(s)]).toEqual([s, true]);
    }
    for (const s of [".not-dark", ".darkened-card", ".card", ".no-dark-mode", ".dark-theme, .card"]) {
      expect([s, isDarkClassSelector(s)]).toEqual([s, false]);
    }
  });

  test(".not-dark and .darkened-card blocks give light values, and don't take a role's dark one", async () => {
    const root = ngApp("css", {
      "src/styles.css": ":root { --mat-sys-primary: #6750a4; }\n.not-dark { --mat-sys-primary: #111111; }\n.darkened-card { --mat-sys-primary: #222222; }\n.dark-theme { --mat-sys-primary: #d0bcff; }\n",
    }, { "@angular/material": "~21.2.0" });
    await runExtract(root, ctx);
    expect(pairOf(draftOf(root), "action-primary")).toEqual(["#6750A4", "#D0BCFF"]);
  });

  test("values Motif can't read (color-mix(), calc(), a Sass variable) are named in one note", async () => {
    const root = ngApp("scss", {
      "src/styles.scss": `@use '@angular/material' as mat;
$brand: #6750a4;
html {
  @include mat.theme((color: mat.$azure-palette));
  @include mat.theme-overrides((primary: $brand, corner-medium: calc(4px * 3), on-surface: #1c1b1f));
}
:root { --mat-sys-surface: color-mix(in srgb, #ffffff 90%, #6750a4); }
`,
    }, { "@angular/material": "~21.2.0" });
    await runExtract(root, ctx);
    const notes = reportOf(root).notes.join("\n");
    expect(notes).toContain(
      "Angular Material: Motif can't read the value of --mat-sys-corner-medium, --mat-sys-primary, --mat-sys-surface (a color-mix(), calc() or Sass expression), so the draft leaves them out. Set their roles in the guide by hand.",
    );
    // Primary wasn't read, so the palette note still says to set action-primary by hand.
    expect(notes).toContain("mat.$azure-palette is a named palette; Motif can't read its colours from the code. Set action-primary in the guide by hand.");
  });

  test("a colour written where mat.theme() takes a palette isn't read, and the note says where it goes", async () => {
    const root = ngApp("scss", {
      "src/styles.scss": "@use '@angular/material' as mat;\nhtml {\n  @include mat.theme((color: (primary: #6750a4, tertiary: #7d5260), typography: Roboto));\n}\n",
    }, { "@angular/material": "~21.2.0" });
    await runExtract(root, ctx);
    const report = reportOf(root);
    const notes = report.notes.join("\n");
    expect(notes).toContain(
      "Angular Material's mat.theme() takes a palette for primary, not a colour, so Motif doesn't read #6750a4 there. Set action-primary in the guide by hand, or set the colour with mat.theme-overrides((primary: …)).",
    );
    expect(notes).toContain("Angular Material's mat.theme() takes a palette for tertiary, not a colour, so Motif doesn't read #7d5260 there. If your app shows its tertiary colours");
    expect(report.variables.map((v: any) => v.name)).not.toContain("--mat-sys-primary");
  });
});

describe("motif extract on an Nx monorepo with Angular and Svelte", () => {
  test("both apps are drafted together, and neither is skipped", async () => {
    const root = makeProject({
      "package.json": "{}",
      "nx.json": "{}",
      "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { "@angular/core": "^21.2.0" } }),
      "apps/web/project.json": JSON.stringify({
        name: "web", projectType: "application", sourceRoot: "apps/web/src",
        targets: {
          build: { executor: "@angular/build:application", options: { browser: "apps/web/src/main.ts", styles: ["apps/web/src/styles.css"] } },
          serve: { executor: "@angular/build:dev-server" },
        },
      }),
      "apps/web/src/main.ts": MAIN_TS,
      "apps/web/src/styles.css": ":root { --accent: #b45309; }\n",
      "apps/web/src/app/app.ts": APP_TS,
      "apps/web/src/app/app.html": '<p class="b">x</p>\n',
      "apps/web/src/app/app.css": ".b { padding: 28px; }\n",
      "apps/site/package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.70.0", svelte: "^5.57.0", vite: "^8.0.0" } }),
      "apps/site/src/app.css": ":root { --brand: #0f766e; }\n",
      "apps/site/src/routes/+page.svelte": '<p class="a">x</p>\n<style>.a { padding: 20px; }</style>\n',
    });
    const r = await runExtract(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(r.text).not.toContain("Skipped");
    const report = reportOf(root);
    const vars = byName(report);
    expect([vars["--brand"].light, vars["--accent"].light]).toEqual(["#0f766e", "#b45309"]);
    expect(report.spacing.map((s: any) => s.px)).toEqual(expect.arrayContaining([20, 28]));
    expect(validateTokens(docFrom(draftOf(root)))).toEqual([]);
  });
});
