import { componentViews, type Binding } from "../../check/component-views";
import type { AppInfo } from "../../detect/stacks";
import { DEFAULT_IGNORES, listSourceFiles, listVueFiles, VUE_IGNORES, WEB_LANGS, type SourceFile } from "../../check/files";
import { expandHtml } from "../../check/html";
import type { WebStack } from "../web";
import { vueDoctor } from "./doctor";
import { collectVue } from "./extract";
import { generateVue, vueWiring } from "./generate";
import { vueSrcDir } from "./project";
import { scanVue, vueFix, vueReducedMotionHits } from "./rules";

/**
 * What a .vue template binds. :class stays markup, where the Tailwind rules read its quoted class names once. Every
 * other bound value (:style, :width="300", v-bind:prop, v-bind="obj", .prop), event handler (@click, v-on:click),
 * directive (v-if="count > 13", v-for, v-model, v-show) and slot (#item="{ row }") is an expression: script.
 */
export const VUE_BINDINGS: Binding[] = [
  { attr: /^(?:v-bind)?:class$/, as: "markup" },
  { attr: /^(?:[:@#.]|v-)/, as: "script" },
];

/** A .vue file's own top-level blocks; any other (<i18n>, <docs>) is a custom block, read by none of the views. */
export const VUE_BLOCKS = ["template", "script", "style"];

const VUE_FILE = /\.vue$/i;

/** A .vue file as its CSS, script and markup, each a file with its path; HTML as the web reads it; other files as they are. */
function vueViews(file: SourceFile): SourceFile[] {
  if (!VUE_FILE.test(file.path)) return expandHtml([file]);
  const { css, script, markup, dark, spans } = componentViews(file.text, { bindings: VUE_BINDINGS, blocks: VUE_BLOCKS });
  return [
    { ...file, text: css, lang: "css", ...(dark.length > 0 ? { dark } : {}) },
    { ...file, text: script, lang: "script", spans },
    { ...file, text: markup, lang: "markup" },
  ];
}

/** Vuetify's config in a Nuxt app (vuetify-nuxt-module reads it from the project's root): a config file, which the usual ignores skip. */
const VUETIFY_CONFIGS = ["ts", "mts", "js", "mjs"].map((ext) => `vuetify.config.${ext}`);

function vuetifyConfigs(root: string, app: AppInfo, opts: { ignore?: string[] }): SourceFile[] {
  const wanted = VUETIFY_CONFIGS.map((name) => (app.path === "." ? name : `${app.path}/${name}`));
  return listSourceFiles(root, app.path, { ...opts, langs: WEB_LANGS, defaults: DEFAULT_IGNORES.filter((p) => p !== "*.config.*"), extraIgnores: VUE_IGNORES, paths: wanted }).filter((f) =>
    wanted.includes(f.path),
  );
}

/** Vue 3 and Nuxt 3 or later: apps with Vite (Vue's own starter) or Nuxt. The parts that come later are filled in by their tasks. */
export const VUE: WebStack = {
  id: "vue",
  sourceFiles: (root, app, opts) => listVueFiles(root, app.path, opts),
  views: vueViews,
  extractFiles: vuetifyConfigs,
  srcDir: vueSrcDir,
  generate: generateVue,
  wiring: (root, app, files) => vueWiring(root, app, files, vueSrcDir),
  scan: scanVue,
  appWide: vueReducedMotionHits,
  fix: vueFix,
  collect: collectVue,
  doctor: vueDoctor,
};
