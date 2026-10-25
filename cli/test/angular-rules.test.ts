import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { expandHtml } from "../src/check/html";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { ANGULAR } from "../src/stacks/angular";
import { ANGULAR_COLOR_FIX, angularReducedMotionHits, LEGACY_FIX } from "../src/stacks/angular/rules";
import { SVELTE } from "../src/stacks/svelte";
import { MOTION_FIX as SVELTE_MOTION_FIX, svelteFix } from "../src/stacks/svelte/rules";
import { VUE } from "../src/stacks/vue";
import { docFrom, validTokens } from "./helpers";
import { NG_TEMPLATE } from "./ng-template";
import { makeProject } from "./project";

const scale = buildScale(buildTheme(docFrom(validTokens())), "src");
scale.motionImport = "src/app/design/motion";

const langOf = (path: string): SourceFile["lang"] => (/\.(?:css|scss)$/.test(path) ? "css" : /\.html$/.test(path) ? "markup" : "script");
const source = (path: string, text: string): SourceFile => ({ path, abs: `/x/${path}`, text, lang: langOf(path) });
/** The app's files as motif check reads them: each through ANGULAR.views, given the others. */
const viewsOf = (files: Record<string, string>) => {
  const all = Object.entries(files).map(([p, t]) => source(p, t));
  return all.flatMap((f) => ANGULAR.views!(f, all));
};
/** The stack's rules and the web's together, as motif check runs them (a hit found twice counted once, the first kept). */
const everything = (files: Record<string, string>): Hit[] => {
  const found = viewsOf(files).flatMap((v) => [...ANGULAR.scan!(v, scale), ...scanFile(v, scale)]);
  return found.filter((h, i) => found.findIndex((g) => g.rule === h.rule && g.file === h.file && g.line === h.line && g.column === h.column && g.text === h.text) === i);
};
const violations = (files: Record<string, string>) => everything(files).filter((h) => h.violation);
/** Line:column (1-based) of the first occurrence of needle. */
const pos = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle}`);
  return `${text.slice(0, i).split("\n").length}:${i - text.lastIndexOf("\n", i - 1)}`;
};
const where = (hits: Hit[]) => hits.map((h) => `${h.rule} ${h.file}:${h.line}:${h.column} ${h.text}`).sort();

const COMPONENT_TS = (extra = "") =>
  [
    "import { Component } from '@angular/core';",
    "",
    "@Component({",
    "  selector: 'app-tools',",
    "  templateUrl: './tools.html',",
    "  styleUrl: './tools.css',",
    "})",
    `export class Tools {${extra}}`,
    "",
  ].join("\n");

/** Review Focus 2 inline: the template and styles in the decorator. */
const INLINE_TS = [
  "import { Component } from '@angular/core';",
  "",
  "@Component({",
  "  selector: 'app-tools',",
  "  template: `",
  NG_TEMPLATE,
  "`,",
  "  styles: [`.row { gap: 13px }`],",
  "})",
  "export class Tools {",
  "  count = 0;",
  "  note = 'Call 555-0134';",
  "}",
  "",
].join("\n");

/** What Review Focus 2 says is a value, as `rule needle-in-text from-needle`. */
const POSITIVES: [string, string, string?][] = [
  ["tailwind-arbitrary", "p-[13px]"],
  ["off-scale", "13px", 'style="padding'],
  ["raw-color", "#333"],
  ["off-scale", "13", "[style.padding.px]"],
  ["off-scale", "13", "'gap.px'"],
  ["tailwind-arbitrary", "p-[13px]", "[class."],
];

describe("Review Focus 2: what is a value in an Angular template, and what only looks like one", () => {
  test("a component's .html (named by templateUrl) and its .css: each finding at its line and column, nothing else", () => {
    const css = ".row {\n  gap: 13px;\n}\n";
    const found = violations({ "src/app/tools.ts": COMPONENT_TS(), "src/app/tools.html": NG_TEMPLATE, "src/app/tools.css": css });
    const expected = POSITIVES.map(([rule, needle, from]) => `${rule} src/app/tools.html:${pos(NG_TEMPLATE, needle, from ? NG_TEMPLATE.indexOf(from) : 0)} ${needle}`);
    expected.push(`off-scale src/app/tools.css:${pos(css, "13px")} 13px`);
    expect(where(found)).toEqual(expected.sort());
  });

  test("inline template: and styles: in the .ts: the same findings, at their place in the .ts file", () => {
    const found = violations({ "src/app/tools.ts": INLINE_TS });
    const base = INLINE_TS.indexOf(NG_TEMPLATE);
    const expected = POSITIVES.map(([rule, needle, from]) => `${rule} src/app/tools.ts:${pos(INLINE_TS, needle, from ? INLINE_TS.indexOf(from, base) : base)} ${needle}`);
    expected.push(`off-scale src/app/tools.ts:${pos(INLINE_TS, "13px }")} 13px`);
    expect(where(found)).toEqual(expected.sort());
  });

  test("a .scss beside the component, and a styles: string with one entry, are CSS", () => {
    const ts = "@Component({ selector: 'x', template: '<p>hi</p>', styles: `.a { padding: 7px }` })\nexport class X {}\n";
    const scss = "$gap: 4px;\n.row { gap: 13px; }\n";
    const found = violations({ "src/app/x.ts": ts, "src/app/x.scss": scss });
    expect(where(found)).toEqual([`off-scale src/app/x.scss:${pos(scss, "13px")} 13px`, `off-scale src/app/x.ts:${pos(ts, "7px")} 7px`].sort());
  });
});

describe("which files are templates", () => {
  const T = '<p class="p-[13px]">{{ a > 13 }}</p>';
  const markupOf = (files: Record<string, string>, path: string) => viewsOf(files).filter((v) => v.path === path);

  test("an .html beside a .ts with @Component of the same name, or named by any templateUrl, is a template; index.html is a page", () => {
    const files = {
      "src/app/card/card.component.ts": "@Component({ selector: 'c' })\nexport class Card {}\n",
      "src/app/card/card.component.html": T,
      "src/app/shared/x.ts": "@Component({ selector: 'x', templateUrl: '../views/x-view.html' })\nexport class X {}\n",
      "src/app/views/x-view.html": T,
      "src/index.html": "<!doctype html><html><body><app-root></app-root></body></html>",
      "src/app/lonely.html": T,
    };
    const all = Object.entries(files).map(([p, t]) => source(p, t));
    for (const p of ["src/app/card/card.component.html", "src/app/views/x-view.html"]) {
      expect(markupOf(files, p).map((v) => v.lang)).toEqual(["css", "script", "markup"]);
      // {{ a > 13 }} is script, with its own view.
      expect(markupOf(files, p)[1]!.text).toContain("a > 13");
    }
    for (const p of ["src/index.html", "src/app/lonely.html"]) {
      expect(ANGULAR.views!(all.find((f) => f.path === p)!, all)).toEqual(expandHtml([all.find((f) => f.path === p)!]));
    }
  });

  test("a .ts with @Component gives three views; another .ts, and a .css, are read as they are", () => {
    const comp = source("src/app/a.ts", "@Component({ template: '<p>x</p>' })\nexport class A {}\n");
    const plain = source("src/app/util.ts", "export const a = '#fff';\n// @Component(\n");
    const css = source("src/app/a.css", ".a { color: red }\n");
    expect(ANGULAR.views!(comp, [comp]).map((v) => v.lang)).toEqual(["css", "script", "markup"]);
    expect(ANGULAR.views!(plain, [plain])).toEqual([plain]);
    expect(ANGULAR.views!(css, [css])).toEqual([css]);
  });

  test("a .ts whose templateUrl names another file, or with an inline template:, doesn't make the .html of its name a template", () => {
    const files = {
      "src/app/a.ts": "@Component({ templateUrl: './other.html' })\nexport class A {}\n",
      "src/app/other.html": T,
      "src/app/a.html": T,
      "src/app/b.ts": "@Component({ template: '' })\nexport class B {}\n",
      "src/app/b.html": T,
    };
    const all = Object.entries(files).map(([p, t]) => source(p, t));
    expect(markupOf(files, "src/app/other.html").map((v) => v.lang)).toEqual(["css", "script", "markup"]);
    for (const p of ["src/app/a.html", "src/app/b.html"]) expect(ANGULAR.views!(all.find((f) => f.path === p)!, all)).toEqual(expandHtml([all.find((f) => f.path === p)!]));
  });

  test("without the other files, an .html is a page", () => {
    const html = source("src/app/tools.html", T);
    expect(ANGULAR.views!(html)).toEqual(expandHtml([html]));
  });
});

describe("bindings the stack reads", () => {
  const html = (template: string) => violations({ "src/app/a.ts": "@Component({ templateUrl: './a.html' })\nexport class A {}\n", "src/app/a.html": template });
  const f = "src/app/a.html";

  test("[style.prop.unit] numbers: spacing, text size and corners at the literal; on the scale, or another unit, or not a size, nothing", () => {
    const t = '<p [style.padding.px]="13" [style.font-size.px]="15" [style.border-radius.px]="7" [style.margin.rem]="0.3"></p>\n<p [style.padding.px]="16" [style.width.px]="13" [style.gap.%]="13" [style.padding.px]="on ? 13 : 8"></p>';
    expect(where(html(t)).filter((x) => !x.includes(":2:"))).toEqual(
      [
        `off-scale ${f}:${pos(t, "13")} 13`,
        `off-scale ${f}:${pos(t, "15")} 15`,
        `off-scale ${f}:${pos(t, '7"')} 7`,
        `off-scale ${f}:${pos(t, "0.3")} 0.3`,
      ].sort(),
    );
    const line2 = t.indexOf("\n");
    expect(where(html(t)).filter((x) => x.includes(":2:"))).toEqual([`off-scale ${f}:${pos(t, "13 :", line2)} 13`]);
    expect(html(t).find((h) => h.text === "15")).toMatchObject({ kind: "font-size", value: "15px" });
    expect(html(t).find((h) => h.text === "7")).toMatchObject({ kind: "radius", value: "7px" });
  });

  test("[style.prop.unit]: a number that is a whole branch (?:, ??, ||, parentheses, a minus sign) is a length; an operand of arithmetic isn't", () => {
    const t = '<p [style.margin-top.px]="index * 13" [style.top.px]="pos.y + 2" [style.left.px]="x - 6" [style.gap.px]="13 / n" [style.padding.px]="2 * 13 % 5"></p>';
    expect(html(t)).toEqual([]);
    const branches = '<p [style.padding.px]="on ? 13 : (big ? 16 : 5)" [style.margin.px]="m ?? 9" [style.gap.px]="g || \'7\'" [style.top.px]="-6" [style.left.px]="(on ? a + 2 : 4)"></p>';
    expect(where(html(branches))).toEqual(
      [
        `off-scale ${f}:${pos(branches, "13")} 13`,
        `off-scale ${f}:${pos(branches, "5)")} 5`,
        `off-scale ${f}:${pos(branches, "9")} 9`,
        `off-scale ${f}:${pos(branches, "7'")} 7`,
        `off-scale ${f}:${pos(branches, "-6")} -6`,
      ].sort(),
    );
  });

  test("[ngStyle] and [style] objects: unit keys, px strings, colours and fonts, each once at its value", () => {
    const t = `<p [ngStyle]="{ 'gap.px': 13, color: '#333', 'padding-top': '9px' }"></p>\n<p [style]="{ 'margin.px': 5, fontSize: '15px', 'font-family': 'Inter', width: 13 }"></p>`;
    const found = html(t);
    expect(where(found)).toEqual(
      [
        `off-scale ${f}:${pos(t, "13,")} 13`,
        `raw-color ${f}:${pos(t, "#333")} #333`,
        `off-scale ${f}:${pos(t, "9px")} 9px`,
        `off-scale ${f}:${pos(t, "5,")} 5`,
        `off-scale ${f}:${pos(t, "15px")} 15px`,
        `raw-font ${f}:${pos(t, "Inter")} Inter`,
      ].sort(),
    );
    expect(found.find((h) => h.rule === "raw-color")!.fix).toBe(ANGULAR_COLOR_FIX);
  });

  test("class names in [ngClass], [class] and [class.name] once each; animate.enter's classes are classes", () => {
    const t = `<p [ngClass]="{ 'p-[13px]': on, 'text-[#333]': off }"></p>\n<p [class]="'m-[7px] rounded-[3px]'"></p>\n<p [class.gap-[9px]]="on" animate.enter="fade duration-[400ms]" animate.leave="animate-out"></p>`;
    expect(where(html(t))).toEqual(
      [
        `tailwind-arbitrary ${f}:${pos(t, "p-[13px]")} p-[13px]`,
        `tailwind-arbitrary ${f}:${pos(t, "text-[#333]")} text-[#333]`,
        `tailwind-arbitrary ${f}:${pos(t, "m-[7px]")} m-[7px]`,
        `tailwind-arbitrary ${f}:${pos(t, "rounded-[3px]")} rounded-[3px]`,
        `tailwind-arbitrary ${f}:${pos(t, "gap-[9px]")} gap-[9px]`,
        `raw-motion ${f}:${pos(t, "duration-[400ms]")} duration-[400ms]`,
      ].sort(),
    );
  });

  test("[style.color] with a non-literal value: its colours, with Angular's fix", () => {
    const t = `<p [style.color]="on ? '#333' : 'inherit'" [style.padding]="on ? '13px' : '8px'"></p>`;
    const found = html(t);
    expect(where(found)).toEqual([`off-scale ${f}:${pos(t, "13px")} 13px`, `raw-color ${f}:${pos(t, "#333")} #333`].sort());
    expect(found.find((h) => h.rule === "raw-color")!.fix).toBe(ANGULAR_COLOR_FIX);
  });
});

describe("motion in script", () => {
  const ts = (lines: string[]) => lines.join("\n");

  test("@angular/animations: animate() timings and easings, in transition() blocks, at their place, with the deprecation fix", () => {
    const text = ts([
      "import { Component } from '@angular/core';",
      "import { animate, style, transition, trigger } from '@angular/animations';",
      "@Component({ selector: 'x', template: '<p @fade>hi</p>', animations: [",
      "  trigger('fade', [",
      "    transition(':enter', [style({ opacity: 0 }), animate('300ms 100ms ease-out', style({ opacity: 1 }))]),",
      "    transition(':leave', animate(250)),",
      "    transition('* => *', [animate('0.5s cubic-bezier(0.2, 0, 0, 1)')]),",
      "  ]),",
      "] })",
      "export class X {}",
    ]);
    const found = violations({ "src/app/x.ts": text });
    expect(where(found)).toEqual(
      [
        `raw-motion src/app/x.ts:${pos(text, "300ms")} 300ms`,
        `raw-motion src/app/x.ts:${pos(text, "100ms")} 100ms`,
        `raw-motion src/app/x.ts:${pos(text, "ease-out")} ease-out`,
        `raw-motion src/app/x.ts:${pos(text, "250")} 250`,
        `raw-motion src/app/x.ts:${pos(text, "0.5s")} 0.5s`,
        `raw-motion src/app/x.ts:${pos(text, "cubic-bezier")} cubic-bezier(0.2, 0, 0, 1)`,
      ].sort(),
    );
    expect(found.find((h) => h.text === "250")).toMatchObject({ kind: "duration", value: "250ms" });
    expect(found.find((h) => h.text === "0.5s")).toMatchObject({ kind: "duration", value: "500ms" });
    for (const h of found) expect(ANGULAR.fix!(h)).toBe(LEGACY_FIX);
  });

  test("an animate() not from @angular/animations is not the legacy rule: Motion's is judged as React web's", () => {
    const text = ts([
      "import { animate } from 'motion';",
      "export function show(el: Element) {",
      "  animate(el, { opacity: 1 }, { duration: 0.3, ease: 'easeOut' });",
      "  animate('300ms');",
      "  animate(el, { x: 100 }, { type: 'spring', stiffness: 300, damping: 20 });",
      "}",
    ]);
    const found = violations({ "src/app/show.ts": text });
    expect(found.map((h) => h.text)).toEqual(["duration: 0.3", "ease: 'easeOut'", "stiffness: 300", "damping: 20"]);
    expect(found.every((h) => h.fixKind === "motion")).toBe(true);
    expect(violations({ "src/app/plain.ts": "export const animate = (t: string) => t;\nanimate('300ms', 'standard');\n" })).toEqual([]);
  });

  test("an aliased import is followed", () => {
    const text = "import { animate as run, transition as when } from '@angular/animations';\nexport const t = when(':enter', run('200ms'));\n";
    expect(violations({ "src/app/t.ts": text }).map((h) => h.text)).toEqual(["200ms"]);
  });
});

describe("ANGULAR.fix", () => {
  const hit = (over: Partial<Hit>): Hit => ({ rule: "raw-motion", file: "src/app/home/home.ts", line: 1, column: 1, text: "", message: "", fix: "", violation: true, ...over });
  const ctx = { appDir: "/x", appPath: ".", motionImport: "src/app/design/motion" };

  test("Motion's fix names motion.ts relative to the file, and how to pass it to animate()", () => {
    const fix = ANGULAR.fix!(hit({ fixKind: "motion", fix: "Use the generated src/app/design/motion.ts: … transition={spring.smooth}." }), ctx);
    expect(fix).toBe("Import { duration, easing, spring } from '../design/motion' and pass them to animate(): animate(el, keyframes, { duration: duration.base, ease: easing.standard }), or spring.<role> for a spring.");
    expect(ANGULAR.fix!(hit({ fixKind: "motion", file: "src/app/app.ts" }), ctx)).toContain("from './design/motion'");
    expect(ANGULAR.fix!(hit({ fixKind: "motion", file: "web/src/app/app.ts" }), { appDir: "/x/web", appPath: "web", motionImport: "src/app/design/motion" })).toContain("from './design/motion'");
    expect(ANGULAR.fix!(hit({ fixKind: "motion" }))).toContain("from the generated motion.ts");
  });

  test("Tailwind's motion fix names motion.ts relative to the file; other fixes pass through", () => {
    const tw = 'Use duration-(--motif-duration-base) (or fast/slow), or import { duration } from "src/app/design/motion".';
    expect(ANGULAR.fix!(hit({ fix: tw }), ctx)).toBe('Use duration-(--motif-duration-base) (or fast/slow), or import { duration } from "../design/motion".');
    expect(ANGULAR.fix!(hit({ rule: "raw-color", fix: "Use a theme colour instead: …" }), ctx)).toBe("Use a theme colour instead: …");
    expect(ANGULAR.fix!(hit({ rule: "off-scale", fix: "Use var(--motif-space-<step>)." }), ctx)).toBe("Use var(--motif-space-<step>).");
  });

  test("colours in a component's template, inline template and styles, and stylesheet get Angular's fix; in other code and pages, the web's", () => {
    const files = {
      "src/app/a.ts": "@Component({ templateUrl: './a.html', styleUrl: './a.css' })\nexport class A {}\n",
      "src/app/a.html": '<p style="color: #111111">a</p>',
      "src/app/a.css": ".a { color: #222222 }",
      "src/app/b.ts": "@Component({ template: '<p style=\"color: #333333\">b</p>', styles: `.b { color: #444444 }` })\nexport class B {}\n",
      "src/app/colors.ts": "export const brand = '#555555';\n",
      "src/index.html": '<!doctype html><html><body style="background: #666666"><app-root></app-root></body></html>',
      "src/styles.css": "body { color: #777777 }",
    };
    const fixes = Object.fromEntries(violations(files).filter((h) => h.rule === "raw-color").map((h) => [h.text, ANGULAR.fix!(h) === ANGULAR_COLOR_FIX ? "angular" : "web"]));
    expect(fixes).toEqual({ "#111111": "angular", "#222222": "angular", "#333333": "angular", "#444444": "angular", "#555555": "web", "#666666": "web", "#777777": "web" });
  });
});

describe("fix kinds: Vue's and Svelte's texts from the kind, not the words", () => {
  const motionHit = (over: Partial<Hit> = {}): Hit => ({ rule: "raw-motion", kind: "duration", file: "src/App.svelte", line: 1, column: 1, text: "", message: "", violation: true, fix: "anything", fixKind: "motion", ...over });

  test("the web's Motion rule marks its hits", () => {
    const text = 'import { animate } from "motion";\nanimate(el, { opacity: 1 }, { duration: 0.3 });\n';
    const hits = scanFile(source("src/a.ts", text), scale).filter((h) => h.rule === "raw-motion");
    expect(hits.map((h) => h.fixKind)).toEqual(["motion"]);
  });

  test("Vue: the kind gives :transition's words, whatever the text", () => {
    expect(VUE.fix!(motionHit({ file: "a.vue" }))).toBe("Import { duration, easing, spring } from the generated motion.ts and pass spring.<role> to :transition.");
    expect(VUE.fix!(motionHit({ file: "a.vue", fixKind: undefined, fix: "e.g. transition={spring.smooth}." }))).toBe("e.g. transition={spring.smooth}.");
  });

  test("Svelte: the kind gives the directive's words; before Svelte 5, Motion's fix says the variables are milliseconds and Motion takes seconds", () => {
    const vite = makeProject({ "package.json": JSON.stringify({ devDependencies: { "@sveltejs/vite-plugin-svelte": "^6.0.0", svelte: "^5.0.0" } }) });
    expect(svelteFix(motionHit())).toBe(SVELTE_MOTION_FIX);
    expect(svelteFix(motionHit(), { appDir: vite, appPath: ".", motionImport: "src/lib/design/motion" })).toBe(SVELTE_MOTION_FIX.replace("$lib/design/motion", "./lib/design/motion"));
    const before5 = svelteFix(motionHit(), { appDir: vite, appPath: "." });
    expect(before5).toContain("--motif-duration-");
    expect(before5).toContain("seconds");
    expect(before5).toContain("/ 1000");
    expect(before5).not.toContain("design/motion");
    // Svelte's own transitions take milliseconds: their fix is as before.
    expect(svelteFix(motionHit({ fixKind: "transition" }), { appDir: vite, appPath: "." })).toBe(
      "Use var(--motif-duration-<role>) and var(--motif-easing-<role>) from motif.css: this app is before Svelte 5, so Motif writes no motion.ts.",
    );
    expect(SVELTE.views!(source("src/A.svelte", "<p transition:fade={{ duration: 300 }}>a</p>")).flatMap((v) => SVELTE.scan!(v, scale)).map((h) => h.fixKind)).toEqual(["transition"]);
  });
});

describe("reduced motion", () => {
  const run = (files: Record<string, string>, generated: Record<string, string> = {}) => angularReducedMotionHits(viewsOf(files), viewsOf(generated));
  const found = (hits: Hit[]) => hits.map((h) => `${h.file}:${h.line}:${h.column} ${h.text}`);
  const COMP = "@Component({ selector: 'a', templateUrl: './a.html' })\nexport class A {}\n";
  const QUERY = "@media (prefers-reduced-motion: reduce) { * { animation: none !important } }";

  test("animate.enter with a CSS animation, and nothing that respects the setting: one finding, at the first animation", () => {
    const html = '<p>x</p>\n<p animate.enter="fade-in">hi</p>';
    expect(found(run({ "src/app/a.ts": COMP, "src/app/a.html": html }))).toEqual(["src/app/a.html:2:4 animation"]);
    expect(found(run({ "src/app/a.ts": COMP, "src/app/a.html": "<p>x</p>", "src/app/a.css": ".x {}\n.fade-in { animation: fade 200ms }" }))).toEqual(["src/app/a.css:2:12 animation"]);
    expect(run({ "src/app/a.ts": COMP, "src/app/a.html": html }, { "src/styles/motif.css": QUERY })).toEqual([]);
    expect(found(run({ "src/app/a.ts": COMP, "src/app/a.html": '<p class="animate-spin">x</p>' }))).toEqual(["src/app/a.html:1:11 animation"]);
  });

  test("@angular/animations and Motion: respected by a matchMedia check; the legacy package also by the noop animations", () => {
    const legacy = "import { animate } from '@angular/animations';\nexport const a = animate(200);\n";
    const motion = "import { animate } from 'motion';\nexport const go = (el: Element) => animate(el, { x: 1 });\n";
    const media = "export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;\n";
    expect(found(run({ "src/app/a.ts": legacy }))).toEqual(["src/app/a.ts:1:20 motion"]);
    expect(found(run({ "src/app/go.ts": motion }))).toEqual(["src/app/go.ts:1:20 motion"]);
    expect(run({ "src/app/a.ts": legacy, "src/app/m.ts": media })).toEqual([]);
    expect(run({ "src/app/go.ts": motion, "src/app/m.ts": media })).toEqual([]);
    for (const noop of ["provideNoopAnimations()", "provideAnimationsAsync('noop')", 'provideAnimationsAsync("noop")']) {
      expect(run({ "src/app/a.ts": legacy, "src/app/app.config.ts": `export const appConfig = { providers: [${noop}] };\n` })).toEqual([]);
    }
    // The noop animations stop only the legacy package's.
    expect(run({ "src/app/go.ts": motion, "src/app/app.config.ts": "export const appConfig = { providers: [provideNoopAnimations()] };\n" })).toHaveLength(1);
    // A CSS query doesn't cover script animations.
    expect(run({ "src/app/go.ts": motion }, { "src/styles/motif.css": QUERY })).toHaveLength(1);
  });

  test("the fixes", () => {
    const [script] = run({ "src/app/a.ts": "import { animate } from '@angular/animations';\n" });
    expect(script!.fix).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    const [css] = run({ "src/app/a.css": ".a { transition: opacity 0.2s }" });
    expect(css!.fix).toContain("motif.css");
  });
});
