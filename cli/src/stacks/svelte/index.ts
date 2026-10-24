import { listSvelteFiles } from "../../check/files";
import type { WebStack } from "../web";
import { svelteDoctor, svelteUnsupported } from "./doctor";
import { svelteSrcDir } from "./project";

/** Svelte 5 apps with SvelteKit or with Vite. The parts that come later are filled in by their tasks. */
export const SVELTE: WebStack = {
  id: "svelte",
  extensions: [".svelte"],
  sourceFiles: (root, app, opts) => listSvelteFiles(root, app.path, opts),
  srcDir: svelteSrcDir,
  doctor: svelteDoctor,
  unsupported: svelteUnsupported,
};
