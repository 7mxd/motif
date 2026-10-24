import { componentFiles, type Binding } from "../../check/component-views";
import { listSvelteFiles, type SourceFile } from "../../check/files";
import { expandHtml } from "../../check/html";
import type { WebStack } from "../web";
import { svelteDoctor, svelteUnsupported } from "./doctor";
import { generateSvelte, svelteWiring } from "./generate";
import { svelteSrcDir } from "./project";

/**
 * What a .svelte file binds beyond its {…} values, which are all expressions (onclick={…}, bind:value={…},
 * class:active={…}, transition:fly={{ … }}, {...props}): style:prop="…" sets one CSS property (style:--custom-prop and
 * style:color|important too), and class's quoted class names, in class="…" or class={…}, stay in the markup view where
 * the Tailwind rules read them.
 */
export const SVELTE_BINDINGS: Binding[] = [
  { attr: /^style:([\w-]+)(?:\|important)?$/, as: "css" },
  { attr: /^class$/i, as: "markup" },
];

const SVELTE_FILE = /\.svelte$/i;

/** A .svelte file as its CSS, script and markup, each a file with its path; HTML as the web reads it; other files as they are. */
function svelteViews(file: SourceFile): SourceFile[] {
  return SVELTE_FILE.test(file.path) ? componentFiles(file, { bindings: SVELTE_BINDINGS, braces: true }) : expandHtml([file]);
}

/** Svelte 5 apps with SvelteKit or with Vite. The parts that come later are filled in by their tasks. */
export const SVELTE: WebStack = {
  id: "svelte",
  extensions: [".svelte"],
  sourceFiles: (root, app, opts) => listSvelteFiles(root, app.path, opts),
  views: svelteViews,
  srcDir: svelteSrcDir,
  generate: generateSvelte,
  wiring: (root, app, files) => svelteWiring(root, app, files, svelteSrcDir),
  doctor: svelteDoctor,
  unsupported: svelteUnsupported,
};
