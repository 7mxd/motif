import { componentFiles, type Binding } from "../../check/component-views";
import type { AppInfo } from "../../detect/stacks";
import { DEFAULT_IGNORES, listSourceFiles, listVueFiles, VUE_IGNORES, WEB_LANGS, type SourceFile } from "../../check/files";
import { expandHtml } from "../../check/html";
import type { WebStack } from "../web";
import { vueDoctor, vueUnsupported } from "./doctor";
import { collectVue } from "./extract";
import { generateVue, vueWiring } from "./generate";
import { isNuxt, vueSrcDir } from "./project";
import { discoverVueRoutes } from "./routes";
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
  return VUE_FILE.test(file.path) ? componentFiles(file, { bindings: VUE_BINDINGS, blocks: VUE_BLOCKS }) : expandHtml([file]);
}

/** Vuetify's config in a Nuxt app (vuetify-nuxt-module reads it from the project's root): a config file, which the usual ignores skip. */
const VUETIFY_CONFIGS = ["ts", "mts", "js", "mjs"].map((ext) => `vuetify.config.${ext}`);

function vuetifyConfigs(root: string, app: AppInfo, opts: { ignore?: string[] }): SourceFile[] {
  const wanted = VUETIFY_CONFIGS.map((name) => (app.path === "." ? name : `${app.path}/${name}`));
  return listSourceFiles(root, app.path, { ...opts, langs: WEB_LANGS, defaults: DEFAULT_IGNORES.filter((p) => p !== "*.config.*"), extraIgnores: VUE_IGNORES, paths: wanted }).filter((f) =>
    wanted.includes(f.path),
  );
}

/** Nuxt compiles its first page on demand, which takes longer than a Vite app's. */
const NUXT_START_TIMEOUT_MS = 180_000;
/**
 * nuxt dev runs in development. Under NODE_ENV=test (a test runner's, or a shell's) its logger keeps quiet, address
 * and all, so Motif would wait for a line that never comes.
 */
const NUXT_DEV_ENV = { NODE_ENV: "development" };
/** nuxt dev answers at once, with its loading screen (HTTP 503) until the app is built: that page isn't the app. */
const NUXT_BUILDING_STATUS = 503;

/** The audit's fixes in Vue's terms: Motion for Vue animates in script, where React web's MotionConfig isn't. */
const VUE_AUDIT_FIXES = {
  motion: 'Stop it under reduced motion: with motion-v, call useReducedMotion() or wrap your app once in <MotionConfig reduced-motion="user">; a CSS animation or <Transition> needs an @media (prefers-reduced-motion: reduce) rule (motif.css has one).',
};

/** Vue 3 and Nuxt 3 or later: apps with Vite (Vue's own starter) or Nuxt. The parts that come later are filled in by their tasks. */
export const VUE: WebStack = {
  id: "vue",
  extensions: [".vue"],
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
  unsupported: vueUnsupported,
  routes: discoverVueRoutes,
  startTimeoutMs: (appDir) => (isNuxt(appDir) ? NUXT_START_TIMEOUT_MS : undefined),
  devEnv: (appDir) => (isNuxt(appDir) ? NUXT_DEV_ENV : undefined),
  buildingStatus: (appDir) => (isNuxt(appDir) ? NUXT_BUILDING_STATUS : undefined),
  variantHow: "motif.css, which follows data-variant on <html>",
  auditFixes: VUE_AUDIT_FIXES,
};
