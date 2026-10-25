import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { componentViews, type Binding } from "../src/check/component-views";
import type { SourceFile } from "../src/check/files";
import { expandHtml, htmlViews } from "../src/check/html";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { ANGULAR_BINDINGS, ANGULAR_GRAMMAR } from "../src/stacks/angular/views";
import { SVELTE, SVELTE_BINDINGS, SVELTE_GRAMMAR } from "../src/stacks/svelte";
import { VUE, VUE_BINDINGS, VUE_BLOCKS } from "../src/stacks/vue";
import { docFrom, validTokens } from "./helpers";
import { expectExact, NG_TEMPLATE } from "./ng-template";

const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
const vueViews = (text: string) => componentViews(text, { bindings: VUE_BINDINGS, blocks: VUE_BLOCKS });
/** Line and column (1-based) of the first occurrence of needle. */
const at = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  return { line: text.slice(0, i).split("\n").length, column: i - text.lastIndexOf("\n", i - 1) };
};
/** Whether a view holds the original's text at needle's place (and so reads it there). */
const holds = (view: string, text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle} in the text`);
  return view.slice(i, i + needle.length) === needle;
};
const isBlank = (s: string) => /^\s*$/.test(s);

// Review Focus 2: what only looks like a value, and what is one, in a .vue file.
const SFC = [
  "<template>",
  `  <div class="p-[13px] card" style="color:#333" :style="{ padding: '13px' }">`,
  '    <!-- <p style="color: #fff">color: #fff</p> -->',
  "    <p>Call 555-0134, ticket #123</p>",
  '    <template v-if="count > 13">',
  '      <img src="a.png" :width="300" @click="open(() => a > b)" />',
  "    </template>",
  `    <span :class="{ 'p-[7px]': active }" v-for="item in items" :key="item.id">{{ item.name }}</span>`,
  "  </div>",
  "</template>",
  "",
  '<script setup lang="ts">',
  'const note = "rgba is a function";',
  'const tag = "<style>";',
  "const count = ref(0);",
  "</script>",
  "",
  "<style scoped>",
  ".row { gap: 13px; color: var(--motif-color-text-primary); }",
  "</style>",
  "",
  '<style lang="stylus">',
  ".old",
  "  color #00ff00",
  "</style>",
].join("\n");

describe("componentViews: a .vue file as three views", () => {
  const views = vueViews(SFC);

  test("every view is the file's length, with its line breaks where they were", () => {
    for (const view of [views.css, views.script, views.markup]) {
      expect(view.length).toBe(SFC.length);
      for (let i = 0; i < SFC.length; i++) if (SFC[i] === "\n") expect(view[i]).toBe("\n");
    }
  });

  test("each character a view keeps is the original's at its place (a style attribute's quotes read as ';')", () => {
    for (const [name, view] of Object.entries({ css: views.css, script: views.script, markup: views.markup })) {
      for (let i = 0; i < SFC.length; i++) {
        if (view[i] === " " || view[i] === SFC[i]) continue;
        expect({ name, i, char: view[i] }).toEqual({ name, i, char: name === "css" && /["']/.test(SFC[i]!) ? ";" : SFC[i]! });
      }
    }
  });

  test("no character is read in two views, so nothing is reported twice", () => {
    for (let i = 0; i < SFC.length; i++) {
      const readers = [views.css, views.script, views.markup].filter((v) => v[i] === SFC[i] && !/\s/.test(SFC[i]!));
      expect({ i, readers: readers.length }).toEqual({ i, readers: Math.min(readers.length, 1) });
    }
  });

  test("CSS: the style block and the static style attribute, not the stylus block, the comment or a script's string", () => {
    expect(holds(views.css, SFC, ".row { gap: 13px; color: var(--motif-color-text-primary); }")).toBe(true);
    expect(holds(views.css, SFC, "color:#333")).toBe(true);
    for (const absent of ["#00ff00", "#fff", "<style>", "13px' }", "Call"]) expect(views.css).not.toContain(absent);
  });

  test("script: the script block and every bound value, at its place with its quotes blank", () => {
    expect(holds(views.script, SFC, 'const note = "rgba is a function";')).toBe(true);
    expect(holds(views.script, SFC, 'const tag = "<style>";')).toBe(true);
    for (const expr of ["{ padding: '13px' }", "count > 13", "300", "open(() => a > b)", "item in items", "item.id"]) {
      expect(holds(views.script, SFC, expr)).toBe(true);
      expect(holds(views.markup, SFC, expr)).toBe(false);
    }
    const style = SFC.indexOf(":style=");
    expect(views.script.slice(style, style + 28)).toBe(`${" ".repeat(8)}{ padding: '13px' } `);
    expect(views.script).not.toContain("<script");
  });

  test("markup: tags, text and class attributes (:class too, in the markup view only)", () => {
    expect(holds(views.markup, SFC, 'class="p-[13px] card"')).toBe(true);
    expect(holds(views.markup, SFC, "{ 'p-[7px]': active }")).toBe(true);
    expect(holds(views.script, SFC, "{ 'p-[7px]': active }")).toBe(false);
    expect(holds(views.markup, SFC, "Call 555-0134, ticket #123")).toBe(true);
    expect(holds(views.markup, SFC, '<template v-if="')).toBe(true);
    expect(holds(views.markup, SFC, '<script setup lang="ts">')).toBe(true);
    for (const absent of [".row", "color:#333", "#00ff00", "rgba is", "#fff"]) expect(views.markup).not.toContain(absent);
  });

  test("a comment is blank in every view", () => {
    const start = SFC.indexOf("<!--");
    const end = SFC.indexOf("-->") + 3;
    for (const view of [views.css, views.script, views.markup]) expect(isBlank(view.slice(start, end))).toBe(true);
  });

  test("the existing rules find what's there, at the .vue file's lines and columns, and nothing that only looks like a value", () => {
    const file = (text: string, lang: SourceFile["lang"]): SourceFile => ({ path: "src/App.vue", abs: "/x/src/App.vue", text, lang });
    const hits = [file(views.css, "css"), file(views.script, "script"), file(views.markup, "markup")].flatMap((f) => scanFile(f, scale));
    const found = hits.map((h) => [h.rule, h.text, h.line, h.column]);
    expect(found).toContainEqual(["raw-color", "#333", at(SFC, "#333").line, at(SFC, "#333").column]);
    expect(found).toContainEqual(["off-scale", "13px", at(SFC, "13px;").line, at(SFC, "13px;").column]);
    expect(found).toContainEqual(["tailwind-arbitrary", "p-[13px]", at(SFC, "p-[13px]").line, at(SFC, "p-[13px]").column]);
    expect(found).toContainEqual(["tailwind-arbitrary", "p-[7px]", at(SFC, "p-[7px]").line, at(SFC, "p-[7px]").column]);
    const texts = hits.map((h) => h.text);
    for (const absent of ["#123", "#fff", "#00ff00", "300", "13", "rgba"]) expect(texts).not.toContain(absent);
    expect(hits.filter((h) => h.rule === "primitive-use")).toEqual([]);
    expect(new Set(hits.map((h) => `${h.rule}|${h.line}|${h.column}`)).size).toBe(hits.length);
  });
});

describe("componentViews: regions", () => {
  test("a <script> holding \"<style>\" or \"<!--\" in a string starts nothing", () => {
    const text = '<script>const a = "<style>.x { color: #ff0000 }</style>"; const b = "<!--";</script><style>.y { color: #00ff00 }</style>';
    const v = vueViews(text);
    expect(v.css).not.toContain("#ff0000");
    expect(holds(v.css, text, ".y { color: #00ff00 }")).toBe(true);
    expect(holds(v.script, text, 'const b = "<!--";')).toBe(true);
  });

  test("a <template> nested in the template is markup, its directives expressions", () => {
    const text = '<template>\n  <template v-if="show"><template #item="{ row }"><b>{{ row }}</b></template></template>\n</template>';
    const v = vueViews(text);
    expect(holds(v.markup, text, '<template v-if="')).toBe(true);
    expect(holds(v.script, text, "show")).toBe(true);
    expect(holds(v.script, text, "{ row }")).toBe(true);
    expect(holds(v.markup, text, "<b>{{ row }}</b>")).toBe(true);
    expect(v.script.trim()).toBe(`show${" ".repeat(text.indexOf("{ row }") - text.indexOf("show") - 4)}{ row }`);
  });

  test("style blocks in css, scss, sass and less are read, with any attributes; another language is left out of every view", () => {
    for (const lang of ['lang="scss"', "lang='less'", "lang=sass", 'lang="css"', "scoped", "module", 'module="classes" lang="SCSS"']) {
      const text = `<style ${lang}>.a { color: #ff0000 }</style>`;
      expect(holds(vueViews(text).css, text, ".a { color: #ff0000 }")).toBe(true);
    }
    for (const lang of ['lang="stylus"', "lang='styl'", 'scoped lang="postcss-unknown"']) {
      const text = `<style ${lang}>.a { color: #ff0000 }</style>`;
      const v = vueViews(text);
      for (const view of [v.css, v.script, v.markup]) expect(view).not.toContain("#ff0000");
    }
  });

  test("a <style lang=\"postcss\"> block (Tailwind 3's @apply) is read as CSS", () => {
    const text = '<style scoped lang="postcss">\n.row { @apply p-[13px]; gap: 13px }\n</style>';
    const v = vueViews(text);
    expect(holds(v.css, text, ".row { @apply p-[13px]; gap: 13px }")).toBe(true);
    const hits = scanFile({ path: "src/App.vue", abs: "/x/src/App.vue", text: v.css, lang: "css" }, scale).map((h) => [h.rule, h.text, h.line, h.column]);
    expect(hits).toContainEqual(["tailwind-arbitrary", "p-[13px]", 2, at(text, "p-[13px]").column]);
    expect(hits).toContainEqual(["off-scale", "13px", 2, at(text, "13px }").column]);
  });

  test("a top-level custom block (<i18n>, <docs>) is blank in every view; the template's own elements aren't", () => {
    const text = [
      "<i18n>",
      '{ "en": { "accent": "#ffffff" } }',
      "</i18n>",
      "<docs>",
      '<p style="color: #00ff00">Use <style>.x { color: #0000ff }</style> and <script>x()</script></p>',
      "</docs>",
      "<!-- <docs> in a comment </docs> -->",
      '<template><docs-panel :size="2" style="gap: 8px"><i18n-t keypath="a" /></docs-panel></template>',
      '<script setup lang="ts">const a = "</docs>";</script>',
      "<style>.a { color: #111111 }</style>",
    ].join("\n");
    const v = vueViews(text);
    const blockEnd = text.indexOf("</docs>") + 7;
    for (const view of [v.css, v.script, v.markup]) {
      expect(isBlank(view.slice(0, blockEnd))).toBe(true);
      expect(view).not.toMatch(/#ffffff|#00ff00|#0000ff|x\(\)/);
    }
    expect(holds(v.markup, text, "<docs-panel")).toBe(true);
    expect(holds(v.markup, text, '<i18n-t keypath="a" />')).toBe(true);
    expect(holds(v.css, text, "gap: 8px")).toBe(true);
    expect(holds(v.script, text, "2")).toBe(true);
    expect(holds(v.script, text, 'const a = "</docs>";')).toBe(true);
    expect(holds(v.css, text, ".a { color: #111111 }")).toBe(true);
    const file = (t: string, lang: SourceFile["lang"]): SourceFile => ({ path: "src/App.vue", abs: "/x/src/App.vue", text: t, lang });
    const hits = [file(v.css, "css"), file(v.script, "script"), file(v.markup, "markup")].flatMap((f) => scanFile(f, scale)).map((h) => h.text);
    for (const hit of hits) expect(["#111111", "8px"]).toContain(hit);
    expect(hits).toContain("#111111");
  });

  test("custom blocks are left as they are without the blocks option (a Svelte file's top level is its markup)", () => {
    const text = '<section style="color: #00ff00"></section>';
    expect(holds(componentViews(text, { bindings: [] }).css, text, "color: #00ff00")).toBe(true);
  });

  test("a self-closing <script src> or <style src> block is empty: it doesn't read on into the next block", () => {
    const a = '<script src="./x.ts" />\n<style scoped>.a { gap: 13px }</style>\n<template><p :width="300">Hi</p></template>';
    const va = vueViews(a);
    expect(holds(va.css, a, ".a { gap: 13px }")).toBe(true);
    expect(va.script).not.toContain("gap");
    expect(holds(va.script, a, "300")).toBe(true);
    expect(holds(va.markup, a, '<p :width="')).toBe(true);
    const b = '<style src="./a.css" />\n<template><p :width="300">Hi</p></template>\n<script setup>const n = 1;</script>';
    const vb = vueViews(b);
    expect(isBlank(vb.css)).toBe(true);
    expect(holds(vb.script, b, "300")).toBe(true);
    expect(holds(vb.script, b, "const n = 1;")).toBe(true);
    expect(holds(vb.markup, b, "<p ")).toBe(true);
  });

  test("HTML keeps its own rule: a self-closing <script /> reads on to </script>", () => {
    const html = '<script src="x.js" />\n<p>const a = 1;</p>\n</script><p style="color: red"></p>';
    expect(htmlViews(html).rest).toContain("const a = 1;");
    expect(htmlViews(html).css).toContain("color: red");
  });

  test("a binding whose value holds \">\" ends where its quotes do", () => {
    const text = `<template><p :title="a > b ? 'x' : 'y'" @click='n => n > 1' class="p-2">Hi</p></template>`;
    const v = vueViews(text);
    expect(holds(v.script, text, "a > b ? 'x' : 'y'")).toBe(true);
    expect(holds(v.script, text, "n => n > 1")).toBe(true);
    expect(holds(v.markup, text, 'class="p-2">Hi</p>')).toBe(true);
    expect(v.markup).not.toContain("b ?");
  });

  test("a <script> tag's own \">\" in a quoted attribute (Vue's generic) doesn't start its content", () => {
    const text = '<script setup lang="ts" generic="T extends Record<string, number>">\nconst x = 1;\n</script>';
    const v = vueViews(text);
    expect(v.script.trim()).toBe("const x = 1;");
    expect(holds(v.markup, text, 'generic="T extends Record<string, number>">')).toBe(true);
  });

  test("unquoted values, valueless directives and every Vue binding form", () => {
    const text = '<template><input :value=amount v-model.trim="name" v-bind="attrs" v-on:keyup.enter="go" v-else :[key]="v" #default="p" v-show="open" disabled></template>';
    const v = vueViews(text);
    for (const expr of ["=amount", '"name"', '"attrs"', '"go"', '"v"', '"p"', '"open"']) expect(holds(v.script, text, expr.slice(1, expr.endsWith('"') ? -1 : undefined), text.indexOf(expr) + 1)).toBe(true);
    expect(holds(v.markup, text, "v-else")).toBe(true);
    expect(holds(v.markup, text, "disabled>")).toBe(true);
  });

  test("dark style blocks as htmlViews finds them", () => {
    const text = '<style media="(prefers-color-scheme: dark)">.a { color: #111111 }</style>';
    expect(vueViews(text).dark).toEqual([[text.indexOf(".a"), text.indexOf("</style>")]]);
  });

  test("unclosed blocks and tags read to the end without failing", () => {
    for (const text of ["<template><p :a=\"x", "<script setup>const a = 1", "<style scoped>.a { color: red", "<!-- open", "<p class='x"]) {
      const v = vueViews(text);
      expect([v.css.length, v.script.length, v.markup.length]).toEqual([text.length, text.length, text.length]);
    }
  });
});

describe("componentViews: bindings read as CSS", () => {
  const bindings: Binding[] = [{ attr: /^style:([\w-]+)(?:\|important)?$/, as: "css" }];

  test("are rewritten in place to prop: value; so the CSS rules read them at their place", () => {
    const text = '<p style:color="#333" style:padding=13px>\n<i style:margin|important="7px"></i>';
    const v = componentViews(text, { bindings });
    // The character before each property and the closing quote (or the end of an unquoted value) become ";", "=" becomes ":".
    expect(v.css).toBe(`${" ".repeat(8)};color: #333;${" ".repeat(6)};padding:13px;\n${" ".repeat(8)};margin${" ".repeat(10)}: 7px;${" ".repeat(5)}`);
    const hits = scanFile({ path: "a.svelte", abs: "/a.svelte", text: v.css, lang: "css" }, scale).map((h) => [h.text, h.line, h.column]);
    expect(hits).toContainEqual(["#333", 1, at(text, "#333").column]);
    expect(hits).toContainEqual(["13px", 1, at(text, "13px").column]);
    expect(hits).toContainEqual(["7px", 2, at(text, "7px").column]);
    expect(v.markup).not.toMatch(/#333|13px|7px|color|padding|margin/);
  });

  test("a binding at a line's end still ends its declaration: the separator moves past the line break", () => {
    for (const eol of ["\n", "\r\n"]) {
      const text = ["<p", "  style:padding=13px", ">", "<style>.row { gap: 7px }</style>"].join(eol);
      const css = componentViews(text, { bindings }).css;
      // The tag's ">" reads as ";": without it, "padding:13px" would run on into the style block's ".row".
      expect(css.split(eol)).toEqual(["  ", "       ;padding:13px", ";", "       .row { gap: 7px }        "]);
    }
    // A binding named by its whole name (no group) at a line's start: its separator is the line before's last free character.
    const whole: Binding[] = [{ attr: /^--[\w-]+$/, as: "css" }];
    const text = '<Slider class="x"\n--rail=13px\n  --gap="7px" />';
    expect(componentViews(text, { bindings: whole }).css.split("\n")).toEqual([`${" ".repeat(16)};`, "--rail:13px", ";;--gap: 7px;   "]);
  });
});

describe("componentViews on HTML gives htmlViews' views", () => {
  const PAGES = [
    [
      "<!doctype html>",
      '<meta name="theme-color" content="#000000">',
      '<STYLE media="screen">',
      "  :root { --bg: #f2f2f7; }",
      "  .card { padding: 13px; color: var(--text); }",
      "  /* .old { color: #123456; } */",
      "</STYLE>",
      '<p style="color: #d70015; margin: 7px">Hi</p>',
      '<!-- <p style="color: #abcdef">old</p> -->',
      `<div data-style="x" data-label="Room #101" title="a > b" style='background: rgb(1 2 3)'></div>`,
      "<script>",
      '  const accent = "#2959ae";',
      "  const markup = 'style=\"color: #aaaaaa\"';",
      "</script>",
      '<p class="p-7 text-gray-500">Plain class names</p>',
    ].join("\n"),
    '<p style="a:b">\n<i>',
    "<style>\na { color: red",
    '<script>const s = "<!-- not a comment"; const t = \'<style>\';</script><style>.a { color: #ff0000 }</style><style-guide tone="x"></style-guide><style><!-- .b { color: #00ff00 } --></style>',
    '<div style="font-family: &quot;Comic Sans&quot;"></div><link rel="mask-icon" href="x.svg" color="#5bbad5">',
    '<style media="(width >= 600px) and (prefers-color-scheme: dark)">.a { color: #111111 }</style>',
    '<style media="not all and (prefers-color-scheme: dark)">.a { color: #111111 }</style>',
    '<script-loader src="x.js"></script-loader><div style="color: #ff0000"></div>',
    '<svg><style><![CDATA[ .a { fill: #ffffff } ]]></style><text><![CDATA[ a <!-- b ]]></text></svg><div style="color: #00ff00"></div>',
    '<div style="font-family: &#x27;Comic Sans&#x27;"></div><div style="font-family: &QUOT;Comic Sans&QUOT;"></div>',
    "<p>\r\n<script>\r\nlet a = 1;\r\n</script>\r\n</p>",
  ];

  test("the same CSS and dark blocks, and its script and markup together are htmlViews' rest", () => {
    for (const html of PAGES) {
      const before = htmlViews(html);
      const after = componentViews(html, { bindings: [] });
      expect(after.css).toBe(before.css);
      expect(after.dark).toEqual(before.dark);
      const merged = [...after.markup].map((c, i) => (after.script[i] !== " " ? after.script[i] : c)).join("");
      expect(merged).toBe(before.rest);
    }
  });
});

describe("VUE.views", () => {
  const file = (path: string, text: string, lang: SourceFile["lang"]): SourceFile => ({ path, abs: `/x/${path}`, text, lang });

  test("a .vue file becomes three files with its path: its CSS, script and markup", () => {
    const text = '<template><p :a="b">x</p></template>\n<script setup>const b = 1;</script>\n<style media="(prefers-color-scheme: dark)">.a { color: #111111 }</style>';
    const views = VUE.views!(file("src/App.vue", text, "markup"));
    expect(views.map((f) => [f.path, f.abs, f.lang])).toEqual([
      ["src/App.vue", "/x/src/App.vue", "css"],
      ["src/App.vue", "/x/src/App.vue", "script"],
      ["src/App.vue", "/x/src/App.vue", "markup"],
    ]);
    const expected = vueViews(text);
    expect(views.map((f) => f.text)).toEqual([expected.css, expected.script, expected.markup]);
    expect(views[0]!.dark).toEqual(expected.dark);
    expect("dark" in views[1]!).toBe(false);
  });

  test("other files as they are, HTML as expandHtml reads it", () => {
    const ts = file("src/main.ts", "import './a.css'", "script");
    const css = file("src/a.css", "a { color: red }", "css");
    const html = file("index.html", '<p style="color: red">x</p>', "markup");
    expect(VUE.views!(ts)).toEqual([ts]);
    expect(VUE.views!(css)).toEqual([css]);
    expect(VUE.views!(html)).toEqual(expandHtml([html]));
  });
});

describe("componentViews: the shared tag grammar", () => {
  test("unclosed blocks and tags read to the end, each in the view it would be in", () => {
    const cases: [string, { css?: string; script?: string; markup?: string }][] = [
      // A tag whose quote never closes isn't a tag: its text is markup.
      ['<template><p :a="x', { markup: '<template><p :a="x' }],
      ["<script setup>const a = 1", { script: "const a = 1", markup: "<script setup>" }],
      ["<style scoped>.a { color: red", { css: ".a { color: red", markup: "<style scoped>" }],
      ["<!-- open", {}],
      ["<p class='x", { markup: "<p class='x" }],
    ];
    for (const [text, expected] of cases) {
      const v = vueViews(text);
      expect({ text, css: v.css.trim(), script: v.script.trim(), markup: v.markup.trim() }).toEqual({ text, css: "", script: "", markup: "", ...expected });
    }
  });

  test("a { that never closes in a Svelte file (mid-edit) is markup text: the tags after it are still read", () => {
    for (const first of ["<p>Use { to open</p>", '<p title="a { b">x</p>', "<p title=a{b>x</p>", "<p title={a>x</p>", "<p {a>x</p>"]) {
      const text = `${first}\n<p style="gap: 13px" class="p-[13px]">{n}</p>`;
      const v = svelteViews(text);
      expect({ first, css: v.css.trim() }).toEqual({ first, css: ";gap: 13px;" });
      expect({ first, script: v.script.trim() }).toEqual({ first, script: "n" });
      expect({ first, markup: holds(v.markup, text, first) }).toEqual({ first, markup: true });
      expect(holds(v.markup, text, 'class="p-[13px]">{')).toBe(true);
      const file = (t: string, lang: SourceFile["lang"]): SourceFile => ({ path: "src/App.svelte", abs: "/x/src/App.svelte", text: t, lang });
      const hits = [file(v.css, "css"), file(v.script, "script"), file(v.markup, "markup")].flatMap((f) => scanFile(f, scale)).map((h) => [h.rule, h.text, h.line, h.column]);
      expect(hits).toContainEqual(["off-scale", "13px", 2, at(text, "13px").column]);
      expect(hits).toContainEqual(["tailwind-arbitrary", "p-[13px]", 2, at(text, "p-[13px]").column]);
    }
  });

  test("CRLF line endings give the same views as LF, the \\r kept where it was", () => {
    const sfc = SFC.replace(/\n/g, "\r\n");
    const lf = vueViews(SFC);
    const crlf = vueViews(sfc);
    for (const key of ["css", "script", "markup"] as const) {
      expect(crlf[key].length).toBe(sfc.length);
      expect(crlf[key].replace(/\r/g, "")).toBe(lf[key]);
    }
    expect(crlf.spans.map((s) => sfc.slice(s.start, s.end))).toEqual(lf.spans.map((s) => SFC.slice(s.start, s.end)));
    const svelte = SVELTE_FILE.replace(/\n/g, "\r\n");
    const slf = svelteViews(SVELTE_FILE);
    const scrlf = svelteViews(svelte);
    for (const key of ["css", "script", "markup"] as const) expect(scrlf[key].replace(/\r/g, "")).toBe(slf[key]);
  });

  test("a self-closing <script /> or <style /> is empty in a .svelte file too: Svelte has no such block, and the markup after it is read", () => {
    const text = '<style />\n<script lang="ts" />\n<p style="gap: 13px" onclick={go}>Hi</p>';
    const v = svelteViews(text);
    expect(holds(v.css, text, "gap: 13px")).toBe(true);
    expect(holds(v.script, text, "go")).toBe(true);
    expect(holds(v.markup, text, ">Hi</p>")).toBe(true);
  });

  test('a template in another language than HTML (<template lang="pug">) is left out of every view, as a style block in one is', () => {
    const text = '<template lang="pug">\ndiv(style="color: #ff0000" :width="300") {{ x }}\n</template>\n<script setup>const a = 1;</script>\n<style>.a { gap: 13px }</style>';
    const v = vueViews(text);
    for (const view of [v.css, v.script, v.markup]) expect(view).not.toMatch(/#ff0000|300|div/);
    expect(holds(v.markup, text, '<template lang="pug">')).toBe(true);
    expect(holds(v.markup, text, "</template>")).toBe(true);
    expect(holds(v.script, text, "const a = 1;")).toBe(true);
    expect(holds(v.css, text, ".a { gap: 13px }")).toBe(true);
    const html = '<template lang="html"><p :width="300">Hi</p></template>';
    expect(holds(vueViews(html).script, html, "300")).toBe(true);
    // An empty lang is HTML, as no lang is.
    const empty = '<template lang=""><p :width="300">Hi</p></template>';
    expect(holds(vueViews(empty).script, empty, "300")).toBe(true);
    expect(holds(vueViews(empty).markup, empty, ">Hi</p>")).toBe(true);
  });

  test("an attribute's value is read by the one grammar: a style= in another attribute's quoted value is text, in HTML too", () => {
    const html = `<div title="a style='color: #ff0000'" style="gap: 13px"></div>`;
    expect(htmlViews(html).css).not.toContain("#ff0000");
    expect(holds(htmlViews(html).css, html, "gap: 13px")).toBe(true);
  });

  test("a media= in another attribute's quoted value doesn't make a style block dark-only", () => {
    const html = `<style title="a media='(prefers-color-scheme: dark)'">.a { color: #111111 }</style>`;
    expect(htmlViews(html).dark).toEqual([]);
    expect(holds(htmlViews(html).css, html, ".a { color: #111111 }")).toBe(true);
  });

  test("a lang= in another attribute's quoted value doesn't change a .vue style block's language", () => {
    const text = `<style title="a lang='stylus'">.a { color: #ff0000 }</style>`;
    expect(holds(vueViews(text).css, text, ".a { color: #ff0000 }")).toBe(true);
  });
});

// Review Focus 3: plan 2I's Vue fixtures give the same views (CSS, script, markup, dark blocks and spans) as before
// Svelte's {…} reading, with LF and with CRLF line endings: a digest of each, taken before the change.
const VUE_VIEW_DIGESTS: Record<string, [string, string]> = {
  "tests/fixtures/vue-contract-app/src/App.vue": ["d28d051c8be8c354", "ac4ab8cd3bda8a0c"],
  "tests/fixtures/vue-contract-app/src/components/AppButton.vue": ["b6030f760651d6fd", "764d62f886c2ea2f"],
  "tests/fixtures/vue-contract-app/src/components/AppIcon.vue": ["f8a95bf077666916", "bb7de4003def7352"],
  "tests/fixtures/vue-contract-app/src/components/BookingNote.vue": ["1b9032e5c80deb57", "f04ec211b4841a24"],
  "tests/fixtures/vue-contract-app/src/components/EmptyState.vue": ["2a3373fa31997d58", "4ba3ed9a3ff99bce"],
  "tests/fixtures/vue-contract-app/src/components/IconButton.vue": ["3117ab5227015c71", "e924cb31f58e0767"],
  "tests/fixtures/vue-contract-app/src/components/PlotCard.vue": ["99f482ca38ecea7d", "5a6e1abec9851220"],
  "tests/fixtures/vue-contract-app/src/components/StatusBadge.vue": ["4e9683c4d9a5a7d3", "7da3f8a883fe28de"],
  "tests/fixtures/vue-contract-app/src/components/TextField.vue": ["c2e27c22b2bf8d1e", "1707ffeda36502d7"],
  "tests/fixtures/vue-contract-app/src/components/TopBar.vue": ["6a083830d779857b", "c26ca410030e4822"],
  "tests/fixtures/vue-contract-app/src/views/HarvestView.vue": ["faa1aaf930a8a76a", "f16f4d22a72b90c4"],
  "tests/fixtures/vue-contract-app/src/views/NotFoundView.vue": ["3152ee35d665554c", "5c766d3fe864d493"],
  "tests/fixtures/vue-contract-app/src/views/PlotView.vue": ["44c83300794e3304", "e78775a2852ad6bf"],
  "tests/fixtures/vue-contract-app/src/views/PlotsView.vue": ["e23acc44a110d386", "8390685cfc06d39e"],
  "tests/fixtures/vue-contract-app/src/views/SignInView.vue": ["c76bee81cd5a6d98", "30b86a628a6cc56c"],
  "tests/fixtures/vue-seeded-app/overlay/src/components/AppButton.vue": ["fd7bf42a784c4a9e", "b94bb8f24496f990"],
  "tests/fixtures/vue-seeded-app/overlay/src/components/PlotCard.vue": ["8aeebac5121f7890", "5327943d349707a2"],
  "tests/fixtures/vue-seeded-app/overlay/src/components/StatusBadge.vue": ["f18368700c38cd6e", "d4f20df48702bbc3"],
  "tests/fixtures/vue-seeded-app/overlay/src/components/TopBar.vue": ["3bd282c1faa4b0b5", "887e77d44347c174"],
  "tests/fixtures/vue-seeded-app/overlay/src/views/HarvestView.vue": ["fd3081dda004b976", "24d175855b5fbb80"],
  "tests/fixtures/vue-seeded-app/overlay/src/views/PlotView.vue": ["9c178330b3c0f8e9", "f202f0862fee2813"],
  "tests/fixtures/vue-seeded-app/overlay/src/views/SignInView.vue": ["d2304896a26024f7", "84726284e566304e"],
  "cli/test/fixtures/vue-min/src/App.vue": ["03ca66bc45b2768f", "464d2a56f7b6d8f2"],
  "cli/test/fixtures/vue-min/src/views/AuditView.vue": ["eaf83b0ba17d22ad", "11f63760b11aa732"],
  "cli/test/fixtures/vue-min/src/views/CalmView.vue": ["75b5d2c33b69058d", "9f6c6f9a1d418988"],
  "cli/test/fixtures/vue-min/src/views/HomeView.vue": ["d7185612adc2fd7a", "b23278c4b7e5ce96"],
  "cli/test/fixtures/vue-min/src/views/SettingsView.vue": ["6dadd9a08e5d8aec", "e6ce751f8be0f200"],
  "cli/test/fixtures/nuxt-min/app/app.vue": ["e2b0e77689672529", "ba2e5129e1e2d5f4"],
  "cli/test/fixtures/nuxt-min/app/pages/index.vue": ["7b79d2e2456549dd", "9968f178d87414ed"],
  "cli/test/fixtures/nuxt-min/app/pages/settings.vue": ["f387631b8b26a425", "fc5ef6a69606034b"],
};

describe("componentViews: Vue's views are unchanged", () => {
  const repo = join(import.meta.dir, "..", "..");
  const vueFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      if (e === "node_modules") return [];
      return statSync(p).isDirectory() ? vueFiles(p) : /\.vue$/.test(e) ? [relative(repo, p).split("\\").join("/")] : [];
    });
  const digest = (text: string) => createHash("sha256").update(JSON.stringify(vueViews(text))).digest("hex").slice(0, 16);

  test("every .vue file of plan 2I's fixtures gives the views it gave before, with LF and with CRLF", () => {
    const files = ["tests/fixtures/vue-contract-app", "tests/fixtures/vue-seeded-app/overlay", "cli/test/fixtures/vue-min", "cli/test/fixtures/nuxt-min"].flatMap((d) => vueFiles(join(repo, d)));
    expect(files.sort()).toEqual(Object.keys(VUE_VIEW_DIGESTS).sort());
    for (const file of files) {
      const lf = readFileSync(join(repo, file), "utf8").replace(/\r\n/g, "\n");
      expect({ file, digests: [digest(lf), digest(lf.replace(/\n/g, "\r\n"))] }).toEqual({ file, digests: VUE_VIEW_DIGESTS[file]! });
    }
  });
});

// Review Focus 3 (plan 2K): plan 2J's Svelte fixtures give the same views as before the expression grammar replaced
// `braces`, with LF and with CRLF line endings: a digest of each, taken before the change.
const SVELTE_VIEW_DIGESTS: Record<string, [string, string]> = {
  "cli/test/fixtures/kit3-min/src/routes/+layout.svelte": ["55c5490087f05e74", "4491ef8a9970fd7d"],
  "cli/test/fixtures/kit3-min/src/routes/+page.svelte": ["f67e69deae908e6d", "15de25194b24c894"],
  "cli/test/fixtures/kit3-min/src/routes/settings/+page.svelte": ["b499726585217208", "4cdeb4a5f83e5036"],
  "cli/test/fixtures/svelte-kit-demo/src/routes/+layout.svelte": ["99accecb9348312f", "13b9fb4ec58d34e3"],
  "cli/test/fixtures/svelte-min/src/routes/+layout.svelte": ["74fbc57d8fca14a9", "85d3533781487b1c"],
  "cli/test/fixtures/svelte-min/src/routes/+page.svelte": ["e734db4be5391714", "b0411e5ade7d08d1"],
  "cli/test/fixtures/svelte-min/src/routes/audit/+page.svelte": ["4c688108d5e4f804", "8e2a490243027473"],
  "cli/test/fixtures/svelte-min/src/routes/calm/+page.svelte": ["3d22fc5b0eea9963", "b90255ac3edeee45"],
  "cli/test/fixtures/svelte-min/src/routes/settings/+page.svelte": ["b2e37d2f7ef063a1", "72140b1764260550"],
  "cli/test/fixtures/svelte-vite-min/src/App.svelte": ["f0ee4bfb62f46ddf", "289f05dbe075501b"],
  "tests/fixtures/svelte-contract-app/src/lib/components/Button.svelte": ["6ea7434537c1fa8a", "e71b9b4f3740513e"],
  "tests/fixtures/svelte-contract-app/src/lib/components/EmptyState.svelte": ["b29bea60489c581b", "162ebd754aa071bf"],
  "tests/fixtures/svelte-contract-app/src/lib/components/Icon.svelte": ["153ecca2feacd502", "cd27c22ffd742bcf"],
  "tests/fixtures/svelte-contract-app/src/lib/components/IconButton.svelte": ["44f1686f3fa9be0b", "59be1fe89dac3c05"],
  "tests/fixtures/svelte-contract-app/src/lib/components/LoanNote.svelte": ["98b3bd129da083ae", "832676f12738bd3a"],
  "tests/fixtures/svelte-contract-app/src/lib/components/StatusBadge.svelte": ["5b3229484ab53ad9", "a1c5eb1490307754"],
  "tests/fixtures/svelte-contract-app/src/lib/components/TextField.svelte": ["6d7460bfeb591d9a", "557eac0b1be88e06"],
  "tests/fixtures/svelte-contract-app/src/lib/components/ToolCard.svelte": ["ac968fa82705372d", "d3039f438b119539"],
  "tests/fixtures/svelte-contract-app/src/lib/components/TopBar.svelte": ["ccc014da4f2b4661", "fa089097527b3580"],
  "tests/fixtures/svelte-contract-app/src/routes/+error.svelte": ["4e0e2dcf7f54d3da", "0c81d2165dcfc6ef"],
  "tests/fixtures/svelte-contract-app/src/routes/+layout.svelte": ["2c8ea404b74bf98a", "25f49a46d549c70f"],
  "tests/fixtures/svelte-contract-app/src/routes/+page.svelte": ["e529ff17ad6ea71f", "26581f7aa8a021d9"],
  "tests/fixtures/svelte-contract-app/src/routes/loans/+page.svelte": ["3581b09a171e8c23", "faa64dd374e7ee0c"],
  "tests/fixtures/svelte-contract-app/src/routes/sign-in/+page.svelte": ["06e6d73d6a0c8f06", "c87c1bffac05858d"],
  "tests/fixtures/svelte-contract-app/src/routes/tools/[id]/+page.svelte": ["57427fe6008f3579", "c39d75197ec4ef8a"],
  "tests/fixtures/svelte-seeded-app/overlay/src/lib/components/LoanNote.svelte": ["f3173ff0c8efd1a2", "03d9c8e75af02467"],
  "tests/fixtures/svelte-seeded-app/overlay/src/lib/components/StatusBadge.svelte": ["21a33400303b1424", "cb9bc4e968f660c2"],
  "tests/fixtures/svelte-seeded-app/overlay/src/lib/components/ToolCard.svelte": ["4a3a4e62284ca77d", "164c8716d7dcda51"],
  "tests/fixtures/svelte-seeded-app/overlay/src/lib/components/TopBar.svelte": ["fd24ac0c711e28cf", "e8ce24a3d9ebef76"],
  "tests/fixtures/svelte-seeded-app/overlay/src/routes/+page.svelte": ["8462fc71df9b2f89", "5e31102b2099d5a5"],
  "tests/fixtures/svelte-seeded-app/overlay/src/routes/loans/+page.svelte": ["2c481e4b046c04ba", "4beb8670777bbfa0"],
  "tests/fixtures/svelte-seeded-app/overlay/src/routes/sign-in/+page.svelte": ["e0ecf1c880e18c3d", "03e5cc67b849c431"],
  "tests/fixtures/svelte-seeded-app/overlay/src/routes/tools/[id]/+page.svelte": ["7c8ab533d82d38d7", "3e2c27386f1cee0a"],
};
/** The same for this file's Svelte example (SVELTE_FILE, below). */
const SVELTE_FILE_DIGEST = "01b4603ff7d9384b";

describe("componentViews: Svelte's views are unchanged", () => {
  const repo = join(import.meta.dir, "..", "..");
  const svelteFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      if (e === "node_modules" || e === ".svelte-kit") return [];
      return statSync(p).isDirectory() ? svelteFiles(p) : /\.svelte$/.test(e) ? [relative(repo, p).split("\\").join("/")] : [];
    });
  const digest = (text: string) => createHash("sha256").update(JSON.stringify(svelteViews(text))).digest("hex").slice(0, 16);

  test("every .svelte file of plan 2J's fixtures gives the views it gave before, with LF and with CRLF", () => {
    const dirs = ["tests/fixtures/svelte-contract-app", "tests/fixtures/svelte-seeded-app/overlay", "cli/test/fixtures/svelte-min", "cli/test/fixtures/kit3-min", "cli/test/fixtures/svelte-kit-demo", "cli/test/fixtures/svelte-vite-min"];
    const files = dirs.flatMap((d) => svelteFiles(join(repo, d)));
    expect(files.sort()).toEqual(Object.keys(SVELTE_VIEW_DIGESTS).sort());
    for (const file of files) {
      const lf = readFileSync(join(repo, file), "utf8").replace(/\r\n/g, "\n");
      expect({ file, digests: [digest(lf), digest(lf.replace(/\n/g, "\r\n"))] }).toEqual({ file, digests: SVELTE_VIEW_DIGESTS[file]! });
    }
  });

  test("this file's Svelte example gives the views it gave before", () => {
    expect(digest(SVELTE_FILE)).toBe(SVELTE_FILE_DIGEST);
  });
});

const svelteViews = (text: string) => componentViews(text, { bindings: SVELTE_BINDINGS, grammar: SVELTE_GRAMMAR });

// Review Focus 2: what only looks like a value, and what is one, in a .svelte file.
const SVELTE_FILE = [
  "<script>",
  "  let count = $state(0);",
  '  const note = "rgba is a function";',
  "</script>",
  "",
  "<svelte:head><title>Count {count}</title></svelte:head>",
  '<svelte:window onkeydown={(e) => e.key > "a"} />',
  "",
  '<!-- <p style="color: #fff">color: #fff</p> -->',
  "<p>Call 555-0134, ticket #123</p>",
  "<p>{count > 13}</p>",
  "{#if count > 13}",
  '  <img src="a.png" width={300} onclick={() => a > b} />',
  "{:else if count > 7}",
  "  <input bind:value={name} {disabled} {...rest} />",
  "{:else}",
  "  {@html markup}",
  "{/if}",
  `<div class="p-[13px] card {active ? 'on' : ''}" class:p-[13px]={on} style:color="#333" style="padding: 13px; color: {c}" transition:fly={{ y: 8, duration: 300 }}>`,
  "  {#each items as item, i (item.id)}<span>{item.name}</span>{/each}",
  "</div>",
  "",
  "<style>",
  "  .row { gap: 13px }",
  "  :global(.x) { color: var(--motif-color-text-primary); }",
  "</style>",
].join("\n");

describe("componentViews: a .svelte file as three views", () => {
  const text = SVELTE_FILE;
  const views = svelteViews(text);
  const after = (needle: string) => text.indexOf(needle);

  test("every view is the file's length, with its line breaks where they were", () => {
    for (const view of [views.css, views.script, views.markup]) {
      expect(view.length).toBe(text.length);
      for (let i = 0; i < text.length; i++) if (text[i] === "\n") expect(view[i]).toBe("\n");
    }
  });

  test("each character a view keeps is the original's at its place (the CSS view's separators and colons aside)", () => {
    for (const [name, view] of Object.entries({ css: views.css, script: views.script, markup: views.markup })) {
      for (let i = 0; i < text.length; i++) {
        if (view[i] === " " || view[i] === text[i] || (name === "css" && (view[i] === ";" || view[i] === ":"))) continue;
        expect({ name, i, char: view[i] }).toEqual({ name, i, char: text[i]! });
      }
    }
  });

  test("no character is read in two views, so nothing is reported twice", () => {
    for (let i = 0; i < text.length; i++) {
      const readers = [views.css, views.script, views.markup].filter((v) => v[i] === text[i] && !/\s/.test(text[i]!));
      expect({ i, readers: readers.length }).toEqual({ i, readers: Math.min(readers.length, 1) });
    }
  });

  test("CSS: the style block (:global too), style: directives and the style attribute's text, not its {…} part", () => {
    expect(holds(views.css, text, ".row { gap: 13px }")).toBe(true);
    expect(holds(views.css, text, ":global(.x) { color: var(--motif-color-text-primary); }")).toBe(true);
    const style = after('style="padding');
    expect(views.css.slice(style, style + 33)).toBe(`      ;padding: 13px; color:    ;`);
    const directive = after("style:color");
    expect(views.css.slice(directive, directive + 19)).toBe("     ;color: #333; ");
    for (const absent of ["#fff", "rgba", "300", "{"]) expect(views.css.slice(0, after("<style>"))).not.toContain(absent);
  });

  test("script: the script block, every {…} value and part, and the text's {…} after its keyword", () => {
    expect(holds(views.script, text, "let count = $state(0);")).toBe(true);
    expect(holds(views.script, text, 'const note = "rgba is a function";')).toBe(true);
    const exprs: [string, number][] = [
      ["count", after("Count {") + 7],
      ['(e) => e.key > "a"', 0],
      ["count > 13", after("<p>{count")],
      ["count > 13", after("{#if")],
      ["300", 0],
      ["() => a > b", 0],
      ["count > 7", 0],
      ["name", after("bind:value")],
      ["disabled", 0],
      ["...rest", 0],
      ["markup", after("{@html")],
      ["active ?", 0],
      ["on", after("class:p-[13px]={")],
      ["c", after("color: {") + 8],
      ["{ y: 8, duration: 300 }", 0],
      ["items as item, i (item.id)", 0],
      ["item.name", 0],
    ];
    for (const [expr, from] of exprs) {
      expect({ expr, script: holds(views.script, text, expr, from) }).toEqual({ expr, script: true });
      expect({ expr, markup: holds(views.markup, text, expr, from) }).toEqual({ expr, markup: false });
    }
    expect(views.script).not.toMatch(/#if|:else|\/if|@html|#each|\/each|<svelte|class=|'on'/);
  });

  test("markup: tags (svelte:head, svelte:window), text, block keywords, class names and the class: directive's name", () => {
    for (const kept of ["<svelte:head><title>Count {", '<svelte:window onkeydown={', "Call 555-0134, ticket #123", "{#if", "{:else if", "{:else}", "{@html", "{/if}", "{#each", "{/each}", 'class="p-[13px] card {', "'on'", "''}\"", "class:p-[13px]={", "transition:fly={"]) {
      expect({ kept, markup: holds(views.markup, text, kept) }).toEqual({ kept, markup: true });
    }
    for (const absent of ["count >", "300", "a > b", "#333", "13px;", ".row", "rgba", "#fff", "duration"]) expect(views.markup).not.toContain(absent);
  });

  test("a comment is blank in every view", () => {
    const start = text.indexOf("<!--");
    const end = text.indexOf("-->") + 3;
    for (const view of [views.css, views.script, views.markup]) expect(isBlank(view.slice(start, end))).toBe(true);
  });

  test("the existing rules find what's there, at the .svelte file's lines and columns, and nothing that only looks like a value", () => {
    const file = (t: string, lang: SourceFile["lang"]): SourceFile => ({ path: "src/App.svelte", abs: "/x/src/App.svelte", text: t, lang });
    const hits = [file(views.css, "css"), file(views.script, "script"), file(views.markup, "markup")].flatMap((f) => scanFile(f, scale));
    const found = hits.map((h) => [h.rule, h.text, h.line, h.column]);
    expect(found).toContainEqual(["raw-color", "#333", at(text, "#333").line, at(text, "#333").column]);
    expect(found).toContainEqual(["off-scale", "13px", at(text, "13px;").line, at(text, "13px;").column]);
    expect(found).toContainEqual(["off-scale", "13px", at(text, "13px }").line, at(text, "13px }").column]);
    expect(found).toContainEqual(["tailwind-arbitrary", "p-[13px]", at(text, "p-[13px]").line, at(text, "p-[13px]").column]);
    const texts = hits.map((h) => h.text);
    for (const absent of ["#123", "#fff", "300", "13", "7", "rgba", "555-0134"]) expect(texts).not.toContain(absent);
    expect(new Set(hits.map((h) => `${h.rule}|${h.line}|${h.column}`)).size).toBe(hits.length);
  });

  test("spans: each {…} value or part with its attribute and element", () => {
    const span = (attr: string) => views.spans.find((s) => s.attr === attr);
    expect(span("transition:fly")).toEqual({ attr: "transition:fly", tag: "div", start: after("{ y: 8"), end: after("{ y: 8") + 23 });
    expect(span("onkeydown")?.tag).toBe("svelte:window");
    expect(span("style")).toEqual({ attr: "style", tag: "div", start: after("color: {c}") + 8, end: after("color: {c}") + 9 });
    expect(views.spans.map((s) => s.attr)).toEqual(["onkeydown", "width", "onclick", "bind:value", "disabled", "...rest", "class", "class:p-[13px]", "style", "transition:fly"]);
  });
});

describe("componentViews: Svelte's {…}", () => {
  test("a {…} value may hold \">\", \"=\", quotes, nested braces, a template literal with ${…} and comments", () => {
    const text = [
      "<p title={a > b ? `x=${ {k: \"}\"}.k }` : '}' /* } */} data-x=\"y\" onclick={() => {",
      "  // a } in a comment",
      "  go({ a: 1 });",
      "}}>Hi {`}${'{'}`}</p>",
    ].join("\n");
    const v = svelteViews(text);
    expect(holds(v.script, text, "a > b ? `x=${ {k: \"}\"}.k }` : '}' /* } */")).toBe(true);
    expect(holds(v.script, text, "() => {\n  // a } in a comment\n  go({ a: 1 });\n}")).toBe(true);
    expect(holds(v.script, text, "`}${'{'}`")).toBe(true);
    expect(holds(v.markup, text, ' data-x="y" onclick={')).toBe(true);
    expect(holds(v.markup, text, "}>Hi {", text.indexOf("}}>Hi") + 1)).toBe(true);
    expect(v.script[text.indexOf("}}>Hi")]).toBe("}");
    expect(holds(v.markup, text, "}</p>")).toBe(true);
  });

  test('a quoted value may hold {…} parts, quotes inside them too: title="{a ? "x" : "y"} and more"', () => {
    const text = '<p title="{a ? "x" : "y"} and more" src=/img/{id}.png>Hi</p>';
    const v = svelteViews(text);
    expect(holds(v.script, text, 'a ? "x" : "y"')).toBe(true);
    expect(holds(v.script, text, "id")).toBe(true);
    expect(holds(v.markup, text, " and more\" src=/img/{")).toBe(true);
    expect(holds(v.markup, text, "}.png>Hi</p>")).toBe(true);
  });

  test("each block and tag keeps its keyword in the markup; what follows it is script", () => {
    const blocks: [string, string][] = [
      ["{#each items as item, i (item.id)}", "items as item, i (item.id)"],
      ["{#await promise}", "promise"],
      ["{:then value}", "value"],
      ["{:catch error}", "error"],
      ["{/await}", ""],
      ["{#key id}", "id"],
      ["{#snippet row(item)}", "row(item)"],
      ["{/snippet}", ""],
      ["{@const total = a + b}", "total = a + b"],
      ["{@render row(x)}", "row(x)"],
      ["{@debug x, y}", "x, y"],
      ["{:else if a}", "a"],
      ["{:else}", ""],
    ];
    for (const [block, expr] of blocks) {
      const v = svelteViews(block);
      expect({ block, script: v.script.trim(), markup: v.markup.replace(/\s+/g, "") }).toEqual({ block, script: expr, markup: block.replace(expr, "").replace(/\s+/g, "") });
    }
  });

  test("<script>, <script module> and <script context=\"module\"> are script; <svelte:options>, <svelte:element> are markup", () => {
    const text = [
      '<svelte:options runes />',
      '<script module>export const a = "#ff0000";</script>',
      '<script context="module">export const b = 1;</script>',
      '<script lang="ts">let c = $props();</script>',
      "<svelte:element this={tag} class:on>x</svelte:element>",
    ].join("\n");
    const v = svelteViews(text);
    for (const s of ['export const a = "#ff0000";', "export const b = 1;", "let c = $props();", "tag"]) expect(holds(v.script, text, s)).toBe(true);
    for (const m of ["<svelte:options runes />", "<script module>", '<script context="module">', "<svelte:element this={", "} class:on>x</svelte:element>"]) expect(holds(v.markup, text, m)).toBe(true);
  });

  test("directives: their {…} values are script, style: values CSS (a {…} one script), class: names markup", () => {
    const text = [
      "<button",
      "  on:click|preventDefault={go}",
      "  bind:value",
      "  use:tooltip={{ text: 'Hi' }}",
      "  in:fade",
      "  out:fly={{ x: 10 }}",
      "  animate:flip={{ duration: 200 }}",
      "  transition:slide|global={{ duration: 150 }}",
      "  style:--gap={gap}",
      '  style:color|important="red"',
      "  class:active",
      ">x</button>",
    ].join("\n");
    const v = svelteViews(text);
    for (const s of ["go", "{ text: 'Hi' }", "{ x: 10 }", "{ duration: 200 }", "{ duration: 150 }", "gap"]) expect(holds(v.script, text, s, text.indexOf(`{${s}`) + 1)).toBe(true);
    expect(holds(v.css, text, "color")).toBe(true);
    expect(holds(v.css, text, "red")).toBe(true);
    expect(v.css).not.toContain("gap");
    for (const m of ["on:click|preventDefault={", "bind:value", "in:fade", "class:active", "style:--gap={"]) expect(holds(v.markup, text, m)).toBe(true);
    expect(v.spans.map((s) => s.attr)).toEqual(["on:click|preventDefault", "use:tooltip", "out:fly", "animate:flip", "transition:slide|global", "style:--gap"]);
  });

  test("class={…}: the quoted class names stay in the markup, the rest is script", () => {
    const text = `<p class={["p-2", active && 'p-[13px]', \`m-1 \${size}\`]}>x</p>`;
    const v = svelteViews(text);
    for (const m of ['"p-2"', "'p-[13px]'", "`m-1 "]) expect(holds(v.markup, text, m)).toBe(true);
    for (const s of ["active &&", "size"]) expect(holds(v.script, text, s)).toBe(true);
    expect(v.script).not.toContain("p-");
  });

  test("a / is never a regular expression: {/if} followed by tags on its line reads as before plan 2K (views pinned from 1fbb954)", () => {
    const pinned: [string, { css: string; script: string; markup: string; spans: { attr: string; tag: string; start: number; end: number }[] }][] = [
      [
        "<td>{#if a}<b>A</b>{/if}</td><td>{#if b}<i>B</i>{/if}</td>",
        { css: " ".repeat(58), script: "         a                            b                   ", markup: "<td>{#if  }<b>A</b>{/if}</td><td>{#if  }<i>B</i>{/if}</td>", spans: [] },
      ],
      [
        '{#if a}x{/if}</p>{#if b}<a href="/{slug}" class="p-[13px]">{t}</a>{/if}',
        { css: " ".repeat(71), script: "     a                b            slug                     t          ", markup: '{#if  }x{/if}</p>{#if  }<a href="/{    }" class="p-[13px]">{ }</a>{/if}', spans: [{ attr: "href", tag: "a", start: 35, end: 39 }] },
      ],
      ['<p>{i++ / 2}</p><a href="/x">{q}</a>', { css: " ".repeat(36), script: "    i++ / 2                   q     ", markup: '<p>{       }</p><a href="/x">{ }</a>', spans: [] }],
    ];
    for (const [text, expected] of pinned) {
      const v = svelteViews(text);
      expect({ text, css: v.css, script: v.script, markup: v.markup, spans: v.spans }).toEqual({ text, ...expected });
    }
    const text = pinned[1]![0];
    const hits = hitsOf("src/App.svelte", svelteViews(text));
    expect(hits).toContainEqual(["tailwind-arbitrary", "p-[13px]", 1, at(text, "p-[13px]").column]);
  });

  test("without braces (Vue) a {…} is text and a {…} attribute isn't one", () => {
    const text = '<template><p title={a} {b}>{{ c }} {d}</p></template>';
    const v = vueViews(text);
    expect(isBlank(v.script)).toBe(true);
    expect(holds(v.markup, text, "<p title={a} {b}>{{ c }} {d}</p>")).toBe(true);
  });
});

describe("SVELTE.views", () => {
  const file = (path: string, text: string, lang: SourceFile["lang"]): SourceFile => ({ path, abs: `/x/${path}`, text, lang });

  test("a .svelte file becomes three files with its path: its CSS, script and markup", () => {
    const text = '<script>let b = 1;</script>\n<p title={b}>x</p>\n<style media="(prefers-color-scheme: dark)">.a { color: #111111 }</style>';
    const views = SVELTE.views!(file("src/App.svelte", text, "markup"));
    expect(views.map((f) => [f.path, f.abs, f.lang])).toEqual([
      ["src/App.svelte", "/x/src/App.svelte", "css"],
      ["src/App.svelte", "/x/src/App.svelte", "script"],
      ["src/App.svelte", "/x/src/App.svelte", "markup"],
    ]);
    const expected = svelteViews(text);
    expect(views.map((f) => f.text)).toEqual([expected.css, expected.script, expected.markup]);
    expect(views[0]!.dark).toEqual(expected.dark);
    expect(views[1]!.spans).toEqual(expected.spans);
  });

  test("other files as they are, HTML as expandHtml reads it", () => {
    const ts = file("src/main.ts", "import './app.css'", "script");
    const html = file("src/app.html", '<p style="color: red">%sveltekit.body%</p>', "markup");
    expect(SVELTE.views!(ts)).toEqual([ts]);
    expect(SVELTE.views!(html)).toEqual(expandHtml([html]));
  });
});

const ngViews = (text: string) => componentViews(text, { bindings: ANGULAR_BINDINGS, grammar: ANGULAR_GRAMMAR });

/** The hits of the three views, as [rule, text, line, column]. */
const hitsOf = (path: string, views: { css: string; script: string; markup: string }) => {
  const file = (t: string, lang: SourceFile["lang"]): SourceFile => ({ path, abs: `/x/${path}`, text: t, lang });
  return [file(views.css, "css"), file(views.script, "script"), file(views.markup, "markup")].flatMap((f) => scanFile(f, scale)).map((h) => [h.rule, h.text, h.line, h.column] as [string, string, number, number]);
};

describe("componentViews: an Angular template as three views", () => {
  const text = NG_TEMPLATE;
  const views = ngViews(text);
  const after = (needle: string) => text.indexOf(needle);

  test("every view is the template's length, each kept character the original's at its place, none read twice", () => {
    expectExact(text, views);
  });

  test("CSS: the style attribute and a [style.prop] binding to a literal, as prop: value; at its place", () => {
    expect(holds(views.css, text, "padding: 13px")).toBe(true);
    const color = after("[style.color]");
    expect(views.css.slice(color, color + 22)).toBe("      ;color :  #333 ;");
    for (const absent of ["#fff", "300", "555", "#123", "gap", "{", "}"]) expect(views.css).not.toContain(absent);
  });

  test("script: interpolations, block parameters, @let and every bound value, at its place", () => {
    const exprs: [string, number][] = [
      ["13", after('[style.padding.px]="')],
      ["{ 'gap.px': 13 }", 0],
      ["on", after('[class.p-[13px]]="')],
      [" count > 13 ", after("{{ count")],
      [" '{' ", 0],
      ["count > 13", after("@if")],
      ["300", 0],
      ["go(13)", 0],
      ["count > 7", 0],
      ["t of tools; track t.id", 0],
      [" t.name ", 0],
      ["mode", 0],
      ["'a'", 0],
      ["on viewport; prefetch on idle", 0],
      ["minimum 500ms", 0],
      ["after 100ms; minimum 1s", 0],
      [" total = a + b", 0],
      ["count", after("{count,") + 1],
    ];
    for (const [expr, from] of exprs) {
      expect({ expr, script: holds(views.script, text, expr, from) }).toEqual({ expr, script: true });
      expect({ expr, markup: holds(views.markup, text, expr, from) }).toEqual({ expr, markup: false });
    }
    expect(views.script).not.toMatch(/@|plural|other|none|tools}|#333|class|<|\{\{|\}\}/);
  });

  test("blank in every view: block keywords and braces, @let, the ICU's keywords and braces, and a comment", () => {
    const blankAt = (needle: string, from = 0) => {
      const i = text.indexOf(needle, from);
      for (const view of [views.css, views.script, views.markup]) expect({ needle, from, view: view.slice(i, i + needle.length).trim() }).toEqual({ needle, from, view: "" });
    };
    for (const k of ["@if (", "} @else if (", "} @else {", "@for (", "} @empty {", "@switch (", "@case (", "@default {", "@defer (", "} @placeholder (", "} @loading (", "} @error {", "@let", ", plural, =0 {", "} =1 {", "} other {"]) blankAt(k);
    for (const from of [after("@if"), after("@for")]) blankAt(") {", from);
    blankAt("}}", after("# tools"));
    blankAt('<!-- <p style="color: #fff">color: #fff</p> -->');
  });

  test("markup: tags, text, interpolation braces, class names, a [class.name]'s name, the ICU's case texts", () => {
    for (const kept of ['<div class="p-[13px] card" style="', "[style.padding.px]=", "[class.p-[13px]]=", "Call 555-0134, ticket #123", "<p>{{", "}} {{", "}}</p>", "<span>some</span>", "<heavy-chart />", "<b>A</b>", "none", "one tool", "# tools", "</div>"]) {
      expect({ kept, markup: holds(views.markup, text, kept) }).toEqual({ kept, markup: true });
    }
  });

  test("findings: the real values at their line and column, nothing that only looks like one", () => {
    const hits = hitsOf("src/app/tools.html", views);
    expect(hits).toContainEqual(["off-scale", "13px", at(text, "13px\"").line, at(text, "13px\"").column]);
    expect(hits).toContainEqual(["raw-color", "#333", at(text, "#333").line, at(text, "#333").column]);
    expect(hits).toContainEqual(["tailwind-arbitrary", "p-[13px]", at(text, "p-[13px]").line, at(text, "p-[13px]").column]);
    expect(hits).toContainEqual(["tailwind-arbitrary", "p-[13px]", at(text, "p-[13px]]").line, at(text, "p-[13px]]").column]);
    for (const [, t] of hits) expect(["13px", "#333", "p-[13px]"]).toContain(t);
    expect(new Set(hits.map((h) => h.join("|"))).size).toBe(hits.length);
  });

  test("spans: each bound value with its attribute and element", () => {
    expect(views.spans.map((s) => [s.attr, s.tag, text.slice(s.start, s.end)])).toEqual([
      ["[style.padding.px]", "div", "13"],
      ["[ngStyle]", "div", "{ 'gap.px': 13 }"],
      ["[class.p-[13px]]", "div", "on"],
      ["[width]", "img", "300"],
      ["(click)", "img", "go(13)"],
    ]);
  });

  test("CRLF gives the same views as LF", () => {
    const crlf = ngViews(text.replace(/\n/g, "\r\n"));
    for (const key of ["css", "script", "markup"] as const) expect(crlf[key].replace(/\r/g, "")).toBe(views[key]);
  });
});

describe("componentViews: Angular's attribute forms", () => {
  test("bindings, events, two-way, structural directives, bind-/on-/bindon-, animate.*: their values script", () => {
    const text = [
      "<input",
      '  [(ngModel)]="name"',
      `  *ngIf="ready; else other"`,
      '  *ngFor="let t of tools; trackBy: id"',
      '  bind-title="t.name"',
      '  on-click="go()"',
      '  bindon-value="v"',
      '  [attr.aria-label]="label"',
      '  [style]="styles"',
      '  [class]="classes"',
      `  [ngClass]="{ 'p-[7px]': active }"`,
      '  [style.width.%]="50"',
      '  [style.margin]="m"',
      '  [animate.enter]="anim"',
      '  (animate.leave)="done($event)"',
      '  animate.enter="fade-in"',
      "  #ref",
      ">",
      '<ng-template let-item let-i="index"><b>{{ item }}</b></ng-template>',
    ].join("\n");
    const v = ngViews(text);
    expectExact(text, v);
    for (const s of ['"name"', '"ready; else other"', '"let t of tools; trackBy: id"', '"t.name"', '"go()"', '"v"', '"label"', '"styles"', '"classes"', `"{ 'p-[7px]': active }"`, '"50"', '"m"', '"anim"', '"done($event)"']) {
      expect({ s, script: holds(v.script, text, s.slice(1, -1), text.indexOf(s) + 1) }).toEqual({ s, script: true });
    }
    for (const m of ["[(ngModel)]=", "*ngIf=", "bind-title=", "[style.width.%]=", 'animate.enter="fade-in"', "#ref", "let-item", 'let-i="index"', "<b>{{"]) expect({ m, markup: holds(v.markup, text, m) }).toEqual({ m, markup: true });
    expect(isBlank(v.css)).toBe(true);
    expect(holds(v.script, text, " item ")).toBe(true);
  });

  test("[style.prop] is CSS only for a string or number literal; anything else is script", () => {
    const text = `<p [style.color]="'#333'" [style.opacity]="0.5" [style.gap]="gap" [style.padding]="'13px'"></p>`;
    const v = ngViews(text);
    expectExact(text, v);
    expect(v.css.replace(/\s+/g, " ").trim()).toBe(";color : #333 ; ;opacity : 0.5; ;padding : 13px ;");
    expect(holds(v.script, text, "gap", text.indexOf('="gap') + 2)).toBe(true);
    const hits = hitsOf("a.html", v);
    expect(hits).toContainEqual(["raw-color", "#333", 1, at(text, "#333").column]);
    expect(hits).toContainEqual(["off-scale", "13px", 1, at(text, "13px").column]);
  });

  test("interpolation in attribute values: its parts script, the rest as the attribute reads (a style's text CSS)", () => {
    const text = '<p title="Hi {{ name }}" style="padding: {{ p }}px; gap: 13px" class="p-2 {{ extra }}">x</p>';
    const v = ngViews(text);
    expectExact(text, v);
    for (const s of [" name ", " p ", " extra "]) expect(holds(v.script, text, s)).toBe(true);
    expect(v.css.replace(/\s+/g, " ").trim()).toBe(";padding: px; gap: 13px;");
    expect(holds(v.markup, text, 'title="Hi {{')).toBe(true);
    expect(holds(v.markup, text, 'class="p-2 {{')).toBe(true);
    expect(v.spans.map((s) => [s.attr, text.slice(s.start, s.end)])).toEqual([["title", " name "], ["style", " p "], ["class", " extra "]]);
  });

  test("interpolation: a } or }} in a string, nested object literals, and a {{ that never closes", () => {
    const text = "<p>{{ '}}' + \"}\" }} {{ {a: {b: 1}}.a }} {{ open</p>\n<p style=\"gap: 13px\">{{ n }}</p>";
    const v = ngViews(text);
    expect(holds(v.script, text, " '}}' + \"}\" ")).toBe(true);
    expect(holds(v.script, text, " {a: {b: 1}}.a ")).toBe(true);
    expect(holds(v.markup, text, "{{ open</p>")).toBe(true);
    expect(holds(v.css, text, "gap: 13px")).toBe(true);
    expect(holds(v.script, text, " n ")).toBe(true);
  });

  test("a regular expression literal (Angular 21) holding a brace stays in its interpolation", () => {
    const text = "<p>{{ /\\}}/.test(s) }}</p><b>{{ n }}</b>";
    const v = ngViews(text);
    expect(holds(v.script, text, " /\\}}/.test(s) ")).toBe(true);
    expect(holds(v.markup, text, "}}</p><b>{{")).toBe(true);
  });

  test("ICU: select, nested ICU and interpolation in a case, an offset; a bare { or } that is neither is text", () => {
    const text = "<p>{gender, select, male {He has {n, plural, offset:1 =0 {no tools} other {{{ n }} tools}}} other {They}}</p><p>{ a } b }</p>";
    const v = ngViews(text);
    expectExact(text, v);
    expect(v.script.replace(/\s+/g, " ").trim()).toBe("gender n n");
    for (const m of ["He has", "no tools", "}} tools", "They", "<p>{ a } b }</p>"]) expect({ m, markup: holds(v.markup, text, m) }).toEqual({ m, markup: true });
    for (const k of ["select", "male", "plural", "offset:1", "=0", "other"]) expect(v.markup).not.toContain(k);
  });

  test("a regular expression literal is read only where a value can't end: not after a name or a postfix ++", () => {
    const text = '<p>{{ i++ / 2 }}</p><a href="/x">{{ q }}</a><b>{{ a / b }}</b><i>{{ s.replace(/[{}]/g, "") }}</i>';
    const v = ngViews(text);
    for (const s of [" i++ / 2 ", " q ", " a / b ", ' s.replace(/[{}]/g, "") ']) expect({ s, script: holds(v.script, text, s) }).toEqual({ s, script: true });
    expect(holds(v.markup, text, '}}</p><a href="/x">{{')).toBe(true);
  });

  test("only @let starts a statement: a malformed @else doesn't read on to an entity's ;", () => {
    const text = "<p>@else a&nbsp;b</p>\n@let n = 1;";
    const v = ngViews(text);
    expect(holds(v.markup, text, " a&nbsp;b</p>")).toBe(true);
    expect(v.script.trim()).toBe("n = 1");
  });

  test("@-blocks: an unknown @ is text; unclosed blocks and parentheses read to the end without failing", () => {
    for (const text of ["<p>a @ b @foo</p>", "@if (a", "@if (a) {", "@for (t of ts; track t) { <p>x</p>", "@let x = 1", "{n, plural, =0 {none", "}}} @else {"]) {
      const v = ngViews(text);
      expect([v.css.length, v.script.length, v.markup.length]).toEqual([text.length, text.length, text.length]);
    }
    const text = "<p>a @ b @foo &#64;if</p>";
    expect(holds(ngViews(text).markup, text, text)).toBe(true);
  });
});

describe('componentViews: <style lang="">', () => {
  test("an empty lang is CSS, as no lang is", () => {
    const text = '<style lang="">.a { gap: 13px }</style>';
    expect(holds(vueViews(text).css, text, ".a { gap: 13px }")).toBe(true);
    expect(holds(ngViews(text).css, text, ".a { gap: 13px }")).toBe(true);
  });
});
