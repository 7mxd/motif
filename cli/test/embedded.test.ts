import { describe, expect, test } from "bun:test";
import { componentViews } from "../src/check/component-views";
import { stringRegions, withEmbedded } from "../src/check/embedded";
import type { SourceFile } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { ANGULAR_BINDINGS, ANGULAR_GRAMMAR } from "../src/stacks/angular/views";
import { docFrom, validTokens } from "./helpers";
import { expectExact, NG_TEMPLATE } from "./ng-template";

const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
const ANGULAR = { bindings: ANGULAR_BINDINGS, grammar: ANGULAR_GRAMMAR };
const KEYS = ["template", "styles"];
const views = (ts: string) => withEmbedded(ts, ANGULAR);
/** Line and column (1-based) of the first occurrence of needle. */
const at = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  return { line: text.slice(0, i).split("\n").length, column: i - text.lastIndexOf("\n", i - 1) };
};
const hitsOf = (path: string, v: { css: string; script: string; markup: string }) => {
  const file = (t: string, lang: SourceFile["lang"]): SourceFile => ({ path, abs: `/x/${path}`, text: t, lang });
  return [file(v.css, "css"), file(v.script, "script"), file(v.markup, "markup")].flatMap((f) => scanFile(f, scale)).map((h) => [h.rule, h.text, h.line, h.column] as [string, string, number, number]);
};

// Review Focus 2's template inline in a component, with styles beside it.
const TS = [
  "import { Component } from '@angular/core';",
  "",
  "// @Component({ template: '<p style=\"color: #fff\">' })",
  "@Component({",
  "  selector: 'app-tools',",
  "  template: `",
  NG_TEMPLATE,
  "`,",
  "  styles: [`.row { gap: 13px }`, '.a { color: #ff0000 }'],",
  "})",
  "export class Tools {",
  "  count = 0;",
  "  note = 'Call 555-0134';",
  "}",
].join("\n");

describe("stringRegions", () => {
  test("the content of the template and of each styles string in a @Component decorator, by key and kind", () => {
    const regions = stringRegions(TS, KEYS);
    expect(regions.map((r) => [r.key, r.kind, TS.slice(r.start, r.end)])).toEqual([
      ["template", "template", `\n${NG_TEMPLATE}\n`],
      ["styles", "style", ".row { gap: 13px }"],
      ["styles", "style", ".a { color: #ff0000 }"],
    ]);
  });

  test("one styles string; single- and double-quoted strings; the keys in any order; templateUrl and styleUrl aren't strings to read", () => {
    const ts = [
      "@Component({",
      "  styles: `.a { gap: 13px }`,",
      "  templateUrl: './a.html',",
      "  styleUrl: './a.css',",
      `  template: '<p style="gap: 13px">x</p>',`,
      "})",
      "export class A {}",
      '@Component({ selector: "b", template: "<b class=\'p-[13px]\'>b</b>", styles: [] })',
      "export class B {}",
    ].join("\n");
    expect(stringRegions(ts, KEYS).map((r) => [r.key, ts.slice(r.start, r.end)])).toEqual([
      ["styles", ".a { gap: 13px }"],
      ["template", '<p style="gap: 13px">x</p>'],
      ["template", "<b class='p-[13px]'>b</b>"],
    ]);
  });

  test("only the decorator's own keys: not a nested object's, a comment's, another call's or a string's", () => {
    const ts = [
      "const a = { template: '<p>a</p>' };",
      "/* @Component({ template: '<p>b</p>' }) */",
      "const s = \"@Component({ template: '<p>c</p>' })\";",
      "@Component({",
      "  host: { template: '<p>d</p>' },",
      "  providers: [{ provide: X, useValue: { styles: '.e {}' } }],",
      "  template: `<p>f</p>`,",
      "})",
      "export class A {}",
      "@Directive({ template: '<p>g</p>' })",
      "export class D {}",
    ].join("\n");
    expect(stringRegions(ts, KEYS).map((r) => ts.slice(r.start, r.end))).toEqual(["<p>f</p>"]);
  });

  test("quoted keys; a regular expression literal holding a quote earlier in the file starts no string", () => {
    const ts = [
      "const r = /'/;",
      "const q = /[\"`]/g;",
      "@Component({ 'template': '<p>a</p>', \"styles\": ['.a { gap: 13px }'] })",
      "export class A {}",
    ].join("\n");
    expect(stringRegions(ts, KEYS).map((r) => [r.key, ts.slice(r.start, r.end)])).toEqual([
      ["template", "<p>a</p>"],
      ["styles", ".a { gap: 13px }"],
    ]);
  });

  test("a template literal's ${…} parts are left out: each text part is a region", () => {
    const ts = "@Component({ template: `<p class=\"${cls}\" style=\"gap: 13px\">${label} {{ n }}</p>`, styles: [`.a { gap: ${g}px }`] })";
    expect(stringRegions(ts, KEYS).map((r) => [r.kind, ts.slice(r.start, r.end)])).toEqual([
      ["template", '<p class="'],
      ["template", '" style="gap: 13px">'],
      ["template", " {{ n }}</p>"],
      ["style", ".a { gap: "],
      ["style", "px }"],
    ]);
  });
});

describe("withEmbedded: a component's .ts file with its inline template and styles", () => {
  const v = views(TS);
  const offset = TS.indexOf(NG_TEMPLATE);

  test("every view is the file's length, each kept character the original's at its place, none read twice", () => {
    expectExact(TS, v);
  });

  test("the template reads as the same template in an .html file does, at its place in the .ts file", () => {
    const html = componentViews(NG_TEMPLATE, ANGULAR);
    for (const key of ["css", "script", "markup"] as const) expect({ key, view: v[key].slice(offset, offset + NG_TEMPLATE.length) }).toEqual({ key, view: html[key] });
    expect(v.spans).toEqual(html.spans.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset })));
  });

  test("the styles are CSS; the rest of the file is script, the strings' own quotes and the comment as they were", () => {
    expect(v.css.slice(TS.indexOf(".row"), TS.indexOf(".row") + 18)).toBe(".row { gap: 13px }");
    expect(v.css.slice(TS.indexOf(".a {"), TS.indexOf(".a {") + 21)).toBe(".a { color: #ff0000 }");
    for (const s of ["import { Component } from '@angular/core';", "selector: 'app-tools',", "  template: `", "`,\n  styles: [`", "`, '", "'],\n})", "note = 'Call 555-0134';", "// @Component({ template: '<p style=\"color: #fff\">' })"]) {
      expect({ s, script: v.script.slice(TS.indexOf(s), TS.indexOf(s) + s.length) }).toEqual({ s, script: s });
    }
    expect(v.script).not.toContain(".row");
    expect(v.markup.slice(0, offset).trim()).toBe("");
  });

  test("findings at their line and column in the .ts file, and nothing that only looks like a value", () => {
    const hits = hitsOf("src/app/tools.ts", v);
    for (const [rule, text, needle] of [["off-scale", "13px", "13px\""], ["raw-color", "#333", "#333"], ["tailwind-arbitrary", "p-[13px]", "p-[13px] "], ["tailwind-arbitrary", "p-[13px]", "p-[13px]]"], ["off-scale", "13px", "13px }"], ["raw-color", "#ff0000", "#ff0000"]] as const) {
      expect(hits).toContainEqual([rule, text, at(TS, needle).line, at(TS, needle).column]);
    }
    for (const [, t] of hits) expect(["13px", "#333", "p-[13px]", "#ff0000"]).toContain(t);
    expect(hits.length).toBe(6);
  });

  test("a template literal's ${…} stays script, around it the template reads as before", () => {
    const ts = "@Component({ template: `<p class=\"${cls}\" style=\"gap: 13px\">${label} {{ n }}</p>`, styles: [`.a { gap: ${g}px }`] })";
    const w = views(ts);
    expectExact(ts, w);
    for (const s of ["${cls}", "${label}", "${g}", " n "]) expect({ s, script: w.script.slice(ts.indexOf(s), ts.indexOf(s) + s.length) }).toEqual({ s, script: s });
    expect(w.css.slice(ts.indexOf("gap: 13px"), ts.indexOf("gap: 13px") + 9)).toBe("gap: 13px");
    expect(w.css.slice(ts.indexOf(".a {"), ts.indexOf(".a {") + 10)).toBe(".a { gap: ");
    expect(w.markup.slice(ts.indexOf("<p class"), ts.indexOf("<p class") + 10)).toBe('<p class="');
  });

  test("CRLF gives the same views as LF", () => {
    const crlf = views(TS.replace(/\n/g, "\r\n"));
    for (const key of ["css", "script", "markup"] as const) expect(crlf[key].replace(/\r/g, "")).toBe(v[key]);
    expectExact(TS.replace(/\n/g, "\r\n"), crlf);
  });

  test("escaped quotes in an inline template string: the tag reads as written, its values at their place", () => {
    const ts = '@Component({ template: "<p class=\\"p-[13px]\\" style=\\"gap: 13px\\">{{ n }}</p>" })';
    const w = views(ts);
    expectExact(ts, w);
    expect(w.css.slice(ts.indexOf("gap"), ts.indexOf("gap") + 9)).toBe("gap: 13px");
    expect(w.script.slice(ts.indexOf(" n "), ts.indexOf(" n ") + 3)).toBe(" n ");
    const hits = hitsOf("src/app/a.ts", w);
    expect(hits).toContainEqual(["tailwind-arbitrary", "p-[13px]", 1, at(ts, "p-[13px]").column]);
    expect(hits).toContainEqual(["off-scale", "13px", 1, at(ts, "13px\\").column]);
    expect(hits.length).toBe(2);
  });

  test("a file with no component is all script", () => {
    const ts = "export const a = { template: '<p style=\"gap: 13px\">' };";
    const w = views(ts);
    expect(w.script).toBe(ts);
    expect(w.css.trim()).toBe("");
    expect(w.markup.trim()).toBe("");
    expect(w.spans).toEqual([]);
  });
});
