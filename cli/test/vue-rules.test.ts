import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { VUE } from "../src/stacks/vue";
import { docFrom, validTokens } from "./helpers";

const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
const sfc = (text: string): SourceFile => ({ path: "src/A.vue", abs: "/x/src/A.vue", text, lang: "markup" });
/** What the Vue stack's own rules find in a .vue file's views. */
const vue = (text: string) => VUE.views!(sfc(text)).flatMap((v) => VUE.scan!(v, scale));
/** The stack's rules and the web's rules together, as motif check runs them (a hit found twice counted once). */
const everything = (text: string): Hit[] => {
  const found = VUE.views!(sfc(text)).flatMap((v) => [...VUE.scan!(v, scale), ...scanFile(v, scale)]);
  return found.filter((h, i) => found.findIndex((g) => g.rule === h.rule && g.line === h.line && g.column === h.column && g.text === h.text) === i);
};
const violations = (text: string) => everything(text).filter((h) => h.violation);
/** Line and column (1-based) of the first occurrence of needle. */
const at = (text: string, needle: string, from = 0) => {
  const i = text.indexOf(needle, from);
  if (i === -1) throw new Error(`no ${needle}`);
  return { line: text.slice(0, i).split("\n").length, column: i - text.lastIndexOf("\n", i - 1) };
};
const tpl = (inner: string, script = "") => `<template>\n${inner}\n</template>\n${script ? `<script setup lang="ts">\n${script}\n</script>\n` : ""}`;

describe("what only looks like a value in a .vue file has no findings", () => {
  const SAFE = [
    "<template>",
    "  <div>",
    '    <!-- <p style="color: #fff">color: #fff</p> -->',
    "    <p>Call 555-0134, ticket #123</p>",
    '    <template v-if="count > 13">',
    '      <img src="a.png" :width="300" :height="200" @click="open(() => a > b)" />',
    "    </template>",
    "  </div>",
    "</template>",
    "",
    '<script setup lang="ts">',
    'const note = "rgba is a function";',
    "const count = ref(0);",
    "</script>",
    "",
    "<style scoped>",
    ".row { gap: 16px; color: var(--motif-color-text-primary); }",
    "</style>",
  ].join("\n");

  test("nothing is found, by the stack's rules or the web's", () => {
    expect(violations(SAFE)).toEqual([]);
    expect(vue(SAFE)).toEqual([]);
  });
});

describe("scanVue: a :style binding is judged as React web's inline styles are", () => {
  const T = tpl(`  <div :style="{ padding: '13px', marginTop: 7, 'padding-left': '1.3rem', fontSize: 15, gap: '16px' }" />`);
  const row = T.split("\n")[1]!;

  test("camelCase and quoted kebab-case keys, strings and bare numbers", () => {
    const found = vue(T).filter((h) => h.violation);
    expect(found.map((h) => [h.rule, h.kind, h.value, h.line, h.column])).toEqual([
      ["off-scale", "space", "13px", 2, row.indexOf("padding: '13px'") + 1],
      ["off-scale", "space", "7px", 2, row.indexOf("marginTop") + 1],
      ["off-scale", "space", "20.8px", 2, row.indexOf("'padding-left'") + 1],
      ["off-scale", "font-size", "15px", 2, row.indexOf("fontSize") + 1],
    ]);
  });

  test("a value on the scale is seen but allowed; keys that aren't lengths aren't judged", () => {
    const hits = vue(tpl(`  <div :style="{ gap: '16px', opacity: 13, zIndex: 13, width: '13px', lineHeight: 1.5 }" />`));
    expect(hits.filter((h) => h.violation)).toEqual([]);
  });

  test("v-bind:style reads the same, and an array of objects too", () => {
    const hits = vue(tpl(`  <div v-bind:style="[base, { top: 5 }]" />`));
    expect(hits.map((h) => h.value)).toEqual(["5px"]);
  });

  test("a font family typed in a style object is a raw font; a variable is not", () => {
    const hits = vue(tpl(`  <p :style="{ fontFamily: 'Georgia, serif' }" /><p :style="{ fontFamily: 'var(--motif-font-body-family)' }" />`));
    expect(hits.map((h) => [h.rule, h.value])).toEqual([["raw-font", "Georgia, serif"]]);
  });

  test("a colour in a style object says what to use in Vue's words, and is reported once", () => {
    const text = tpl(`  <div :style="{ color: '#336699' }" />`);
    const colours = everything(text).filter((h) => h.rule === "raw-color");
    expect(colours).toHaveLength(1);
    expect(colours[0]!.fix).toBe("Use 'var(--motif-color-<role>)' in the style binding, or a class (bg-<role>) with Tailwind.");
    expect(colours[0]).toMatchObject(at(text, "#336699"));
  });

  test("a style object in a <script> block is not a binding: only the bindings are judged", () => {
    expect(vue(tpl("  <div />", "const style = { padding: '13px' };"))).toEqual([]);
  });
});

describe("scanVue: motion", () => {
  test("<Transition :duration> in milliseconds, as a number or an enter/leave object", () => {
    const text = tpl(`  <Transition :duration="300"><p /></Transition>\n  <transition-group :duration="{ enter: 300, leave: 200 }" />`);
    const lines = text.split("\n");
    const found = vue(text);
    expect(found.map((h) => [h.rule, h.kind, h.value, h.line, h.column])).toEqual([
      ["raw-motion", "duration", "300ms", 2, lines[1]!.indexOf("300") + 1],
      ["raw-motion", "duration", "300ms", 3, lines[2]!.indexOf("enter") + 1],
      ["raw-motion", "duration", "200ms", 3, lines[2]!.indexOf("leave") + 1],
    ]);
    expect(found[0]!.fix).toBe("Use the duration in milliseconds from motion.ts (duration.base * 1000), or leave :duration out and time the transition in CSS with var(--motif-duration-base).");
  });

  test("a duration from motion.ts is not a typed number; :duration on another element isn't a transition", () => {
    expect(vue(tpl(`  <Transition :duration="duration.base * 1000" />\n  <Toast :duration="4000" />\n  <img :width="300" />`))).toEqual([]);
  });

  test("Motion for Vue: seconds, springs and easings in :transition, :animate, :while-hover, :initial", () => {
    const text = tpl(
      [
        `  <motion.div :transition="{ duration: 0.3, ease: 'easeOut' }" :while-hover="{ scale: 1.1, transition: { stiffness: 300 } }" />`,
        `  <Motion :initial="{ opacity: 0, transition: { delay: 0.2 } }" :animate="{ opacity: 1 }" :whileTap="{ scale: 0.9, transition: { damping: 10 } }" />`,
      ].join("\n"),
    );
    const found = vue(text);
    expect(found.map((h) => [h.kind, h.value, h.text, h.line])).toEqual([
      ["duration", "300ms", "duration: 0.3", 2],
      ["easing", "'easeOut'", "ease: 'easeOut'", 2],
      ["spring", "stiffness 300", "stiffness: 300", 2],
      ["duration", "200ms", "delay: 0.2", 3],
      ["spring", "damping 10", "damping: 10", 3],
    ]);
    expect(found[0]).toMatchObject(at(text, "duration: 0.3"));
    expect(found[0]!.fix).toBe("Import { duration, easing, spring } from the generated motion.ts and pass spring.<role> to :transition.");
  });

  test("a binding's setting and a script animate() call are each reported once", () => {
    const text = tpl(`  <motion.div :animate="{ x: 1, transition: { duration: 0.4 } }" />`, `import { animate } from "motion-v";\nanimate(".a", { x: 1 }, { duration: 0.5 });`);
    const found = everything(text).filter((h) => h.rule === "raw-motion");
    expect(found.map((h) => [h.text, h.line])).toEqual([["duration: 0.4", 2], ["duration: 0.5", 6]]);
  });

  test("the script's own motion settings use Vue's words once passed through VUE.fix", () => {
    const text = tpl("  <div />", `import { animate } from "motion-v";\nanimate(".a", { x: 1 }, { duration: 0.5 });`);
    const found = everything(text).filter((h) => h.rule === "raw-motion");
    expect(found).toHaveLength(1);
    expect(VUE.fix!(found[0]!)).toBe("Import { duration, easing, spring } from the generated motion.ts and pass spring.<role> to :transition.");
  });

  test("a :initial with a duration on a component that isn't Motion, in a file without Motion, is not motion", () => {
    expect(vue(tpl(`  <Form :initial="{ duration: 5, delay: 2 }" />`))).toEqual([]);
  });
});

describe("the web's rules on the views", () => {
  test("a Tailwind arbitrary value in a class, a bound class and a style block, at their places", () => {
    const text = [
      "<template>",
      `  <div class="p-[13px]" :class="{ 'm-[7px]': on }" style="color:#333">`,
      "  </div>",
      "</template>",
      "<style scoped>",
      ".row { gap: 13px }",
      "</style>",
    ].join("\n");
    const row = text.split("\n")[1]!;
    const found = violations(text).map((h) => [h.rule, h.text, h.line, h.column]);
    expect(found).toContainEqual(["tailwind-arbitrary", "p-[13px]", 2, row.indexOf("p-[13px]") + 1]);
    expect(found).toContainEqual(["tailwind-arbitrary", "m-[7px]", 2, row.indexOf("m-[7px]") + 1]);
    expect(found).toContainEqual(["raw-color", "#333", 2, row.indexOf("#333") + 1]);
    expect(found).toContainEqual(["off-scale", "13px", 6, 13]);
  });
});

describe("VUE.fix", () => {
  const hit = (over: Partial<Hit>): Hit => ({ rule: "raw-motion", file: "a.vue", line: 1, column: 1, text: "", message: "", fix: "", violation: true, ...over });
  test("React web's motion fix is Vue's words; others pass through", () => {
    expect(VUE.fix!(hit({ kind: "spring", fix: "Use the generated design/motion.ts: import { duration, easing, spring } from it (path relative to this file), e.g. transition={spring.smooth}." }))).toBe(
      "Import { duration, easing, spring } from the generated motion.ts and pass spring.<role> to :transition.",
    );
    expect(VUE.fix!(hit({ rule: "off-scale", fix: "Use var(--motif-space-<step>)." }))).toBe("Use var(--motif-space-<step>).");
  });
});
