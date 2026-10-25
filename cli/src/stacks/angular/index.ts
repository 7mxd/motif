import { listAngularFiles } from "../../check/files";
import type { WebStack } from "../web";
import { angularDoctor, angularUnsupported } from "./doctor";
import { angularWiring, generateAngular } from "./generate";
import { angularSrcDir } from "./project";

/** Angular 15 or later, with the Angular CLI (or Nx). The parts that come later are filled in by their tasks. */
export const ANGULAR: WebStack = {
  id: "angular",
  sourceFiles: (root, app, opts) => listAngularFiles(root, app.path, opts),
  srcDir: angularSrcDir,
  generate: generateAngular,
  wiring: (root, app, files) => angularWiring(root, app, files, angularSrcDir),
  doctor: angularDoctor,
  unsupported: angularUnsupported,
};
