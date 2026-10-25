import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { ANGULAR_COLOR_FIX, LEGACY_FIX } from "../src/stacks/angular/rules";
import { FIXTURES } from "./helpers";
import { NG_TEMPLATE } from "./ng-template";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");

/**
 * A copy of the angular-min fixture (`ng new --style=tailwind`, Angular 21.2) with a guide, its theme code written by motif
 * tokens, and the files given. The fixture's /audit and /calm pages, planted for motif shot --audit, are left out: their
 * colours would be findings, and /calm's matchMedia check would answer reduced motion for the whole app.
 */
async function ngApp(files: Record<string, string>): Promise<string> {
  const root = tempDir("motif-ng-check-");
  cpSync(join(FIXTURES, "angular-min"), root, { recursive: true, filter: (src) => !["node_modules", ".angular", "dist"].includes(basename(src)) });
  for (const page of ["audit", "calm"]) rmSync(join(root, "src/app", page), { recursive: true });
  const write = (rel: string, content: string) => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  write("design/tokens.json", TOKENS);
  expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  return root;
}

const check = (root: string, positionals: string[] = []) => runCheck(root, { positionals });
const violations = (r: any) => (r.data as any).violations as any[];
/** The findings in the files a test wrote, not in the fixture's own pages. */
const where = (r: any) => violations(r).filter((h) => !/^src\/app\/(?:home|settings)\//.test(h.file)).map((h) => `${h.rule} ${h.file}:${h.line}:${h.column}`);
const at = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle}`);
  return `${text.slice(0, i).split("\n").length}:${i - text.lastIndexOf("\n", i - 1)}`;
};

/** app.html: Review Focus 2's template, a colour a reasoned motif-ok allows, and Motif's own theme classes. */
const APP_HTML = [
  NG_TEMPLATE,
  "<!-- motif-ok: partner brand -->",
  '<p style="color: #ff00aa" class="bg-action-primary text-text-primary">Partner</p>',
  "<router-outlet />",
  "",
].join("\n");
const APP_CSS = ".row {\n  gap: 13px;\n}\n";

/** An inline component, with Motion in code, a colour allowed by // motif-ok and one by /* motif-ok *\/. */
const TOOLS_TS = [
  "import { Component } from '@angular/core';",
  "import { animate } from 'motion';",
  "",
  "@Component({",
  "  selector: 'app-tools',",
  "  template: `<div class=\"p-[13px]\" [style.padding.px]=\"13\" [ngStyle]=\"{ 'gap.px': 13 }\">{{ count > 13 }}</div>`,",
  "  styles: [`.row { gap: 13px }`],",
  "})",
  "export class Tools {",
  "  count = 0;",
  "  // motif-ok: the partner's chart colour",
  "  chart = '#ff00aa';",
  "  line = '#00ff00'; /* motif-ok: the partner's line colour */",
  "  show(el: Element) {",
  "    animate(el, { opacity: 1 }, { duration: 0.3 });",
  "  }",
  "}",
  "",
].join("\n");

describe("motif check on an Angular app", () => {
  test("a template, its stylesheet and an inline component: each finding at its line and column, nothing that only looks like one", async () => {
    const root = await ngApp({ "src/app/app.html": APP_HTML, "src/app/app.css": APP_CSS, "src/app/tools/tools.ts": TOOLS_TS });
    const r = await check(root);
    expect(r.exitCode).toBe(1);
    const html = (rule: string, needle: string, from = 0) => `${rule} src/app/app.html:${at(APP_HTML, needle, from)}`;
    const ts = (rule: string, needle: string, from = 0) => `${rule} src/app/tools/tools.ts:${at(TOOLS_TS, needle, from)}`;
    expect(where(r).sort()).toEqual(
      [
        html("tailwind-arbitrary", "p-[13px]"),
        html("off-scale", "13px", APP_HTML.indexOf('style="padding')),
        html("raw-color", "#333"),
        html("off-scale", "13", APP_HTML.indexOf("[style.padding.px]")),
        html("off-scale", "13", APP_HTML.indexOf("'gap.px'")),
        html("tailwind-arbitrary", "p-[13px]", APP_HTML.indexOf("[class.")),
        `off-scale src/app/app.css:${at(APP_CSS, "13px")}`,
        ts("tailwind-arbitrary", "p-[13px]"),
        ts("off-scale", "13", TOOLS_TS.indexOf("[style.padding.px]")),
        ts("off-scale", "13", TOOLS_TS.indexOf("'gap.px'")),
        ts("off-scale", "13px }"),
        ts("raw-motion", "duration: 0.3"),
        // Motion in code, and nothing that checks the setting.
        ts("reduced-motion", "from 'motion'"),
      ].sort(),
    );
    const exceptions = (r.data as any).exceptions as any[];
    expect(exceptions.map((e) => [e.file, e.reason])).toEqual([
      ["src/app/app.html", "partner brand"],
      ["src/app/tools/tools.ts", "the partner's chart colour"],
      ["src/app/tools/tools.ts", "the partner's line colour"],
    ]);
  });

  test("the fixes are in Angular's words: motion.ts relative to the file, colours in a binding, the deprecated package", async () => {
    const legacy = [
      "import { Component } from '@angular/core';",
      "import { animate, transition, trigger } from '@angular/animations';",
      "@Component({ selector: 'app-fade', template: '<p [style.color]=\"on ? \\'#333\\' : null\">x</p>', animations: [trigger('f', [transition(':enter', animate('300ms ease-out'))])] })",
      "export class Fade { on = true; }",
      "",
    ].join("\n");
    const root = await ngApp({ "src/app/tools/tools.ts": TOOLS_TS, "src/app/fade.ts": legacy });
    const r = await check(root);
    const fix = (file: string, text: string) => violations(r).find((h) => h.file === file && h.text === text)?.fix;
    expect(fix("src/app/tools/tools.ts", "duration: 0.3")).toBe(
      "Import { duration, easing, spring } from '../design/motion' and pass them to animate(): animate(el, keyframes, { duration: duration.base, ease: easing.standard }), or spring.<role> for a spring.",
    );
    expect(fix("src/app/fade.ts", "#333")).toBe(ANGULAR_COLOR_FIX);
    expect(fix("src/app/fade.ts", "300ms")).toBe(LEGACY_FIX);
    expect(fix("src/app/fade.ts", "ease-out")).toBe(LEGACY_FIX);
  });

  test("generated, built and test files are never read", async () => {
    const bad = ".x { gap: 13px; color: #123456; }\n";
    const root = await ngApp({
      ".angular/cache/x.css": bad,
      "dist/angular-min/browser/main.css": bad,
      "src/app/app.spec.ts": "const c = '#123456';\n",
      "src/app/app.html": "<p>hi</p>\n",
    });
    const r = await check(root);
    expect(where(r)).toEqual([]);
    expect((r.data as any).warnings).toEqual([]);
  });

  test("Tailwind 4: Motif's theme classes pass, arbitrary values in class, [class.x], [ngClass] and animate.enter are found once", async () => {
    const html = [
      '<p class="bg-action-primary p-4 text-text-primary rounded-md">a</p>',
      '<p [class.m-[9px]]="on" [ngClass]="{ \'gap-[7px]\': on }" [class]="\'rounded-[3px]\'">b</p>',
      '<p animate.enter="fade duration-[400ms]">c</p>',
      "",
    ].join("\n");
    const root = await ngApp({ "src/app/app.html": html, "src/app/app.css": ".fade { animation: fade var(--motif-duration-base) }\n" });
    const r = await check(root);
    const f = (rule: string, needle: string) => `${rule} src/app/app.html:${at(html, needle)}`;
    expect(where(r).sort()).toEqual([f("tailwind-arbitrary", "m-[9px]"), f("tailwind-arbitrary", "gap-[7px]"), f("tailwind-arbitrary", "rounded-[3px]"), f("raw-motion", "duration-[400ms]")].sort());
  });

  test("reduced motion: animate.enter and CSS animations are covered by motif.css's query; Motion needs a matchMedia check", async () => {
    const motion = "import { animate } from 'motion';\nexport const show = (el: Element) => animate(el, { opacity: 1 });\n";
    const css = { "src/app/app.html": '<p animate.enter="fade">a</p>\n', "src/app/app.css": ".fade { animation: fade 1s }\n" };
    // motif.css (written by motif tokens) has the query.
    expect(violations(await check(await ngApp(css))).filter((h) => h.rule === "reduced-motion")).toEqual([]);
    const without = await check(await ngApp({ ...css, "src/app/show.ts": motion }));
    expect(violations(without).filter((h) => h.rule === "reduced-motion").map((h) => `${h.file}:${h.line}:${h.column}`)).toEqual(["src/app/show.ts:1:20"]);
    const media = "export const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n";
    const withCheck = await check(await ngApp({ ...css, "src/app/show.ts": motion, "src/app/reduce.ts": media }));
    expect(violations(withCheck).filter((h) => h.rule === "reduced-motion")).toEqual([]);
  });

  test("paths that hold nothing it reads: the message names Angular's files once each", async () => {
    const root = await ngApp({ "public/robots.txt": "User-agent: *\n" });
    const r = await check(root, ["public"]);
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("(.ts, .html, .css, .scss, .tsx, .js, .jsx, …)");
  });
});
