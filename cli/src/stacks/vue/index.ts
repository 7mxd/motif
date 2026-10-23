import { listVueFiles } from "../../check/files";
import type { WebStack } from "../web";
import { vueDoctor } from "./doctor";
import { vueSrcDir } from "./project";

/** Vue 3 and Nuxt 3 or later: apps with Vite (Vue's own starter) or Nuxt. The parts that come later are filled in by their tasks. */
export const VUE: WebStack = {
  id: "vue",
  sourceFiles: (root, app, opts) => listVueFiles(root, app.path, opts),
  srcDir: vueSrcDir,
  doctor: vueDoctor,
};
