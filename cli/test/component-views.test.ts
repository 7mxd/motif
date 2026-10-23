import { describe, expect, test } from "bun:test";
import { componentViews, type Binding } from "../src/check/component-views";
import type { SourceFile } from "../src/check/files";
import { expandHtml, htmlViews } from "../src/check/html";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { VUE, VUE_BINDINGS, VUE_BLOCKS } from "../src/stacks/vue";
import { docFrom, validTokens } from "./helpers";

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
