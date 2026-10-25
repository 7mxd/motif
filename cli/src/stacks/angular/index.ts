import { posix } from "node:path";
import { componentFiles } from "../../check/component-views";
import { stringRegions, withEmbedded } from "../../check/embedded";
import { listAngularFiles, type SourceFile } from "../../check/files";
import { expandHtml } from "../../check/html";
import { maskComments } from "../../check/mask";
import type { WebStack } from "../web";
import { angularDoctor, angularUnsupported } from "./doctor";
import { angularWiring, generateAngular } from "./generate";
import { angularSrcDir } from "./project";
import { angularFix, angularReducedMotionHits, scanAngular } from "./rules";
import { ANGULAR_BINDINGS, ANGULAR_GRAMMAR } from "./views";

const COMPONENT = /@Component\s*\(/;
const HTML_FILE = /\.html?$/i;
const TS_FILE = /\.ts$/i;
const READ = { bindings: ANGULAR_BINDINGS, grammar: ANGULAR_GRAMMAR };

const isComponent = (file: SourceFile) => TS_FILE.test(file.path) && COMPONENT.test(maskComments(file.text, "script"));

/** The component templates among an app's files, by path: what each component's templateUrl names (relative to its .ts), and the .html beside it of its own name. */
const templates = new WeakMap<SourceFile[], Set<string>>();
function templatesOf(files: SourceFile[]): Set<string> {
  const known = templates.get(files);
  if (known) return known;
  const found = new Set<string>();
  for (const f of files) {
    if (!isComponent(f)) continue;
    const dir = posix.dirname(f.path);
    found.add(f.path.replace(TS_FILE, ".html"));
    for (const r of stringRegions(f.text, ["templateUrl"])) found.add(posix.normalize(posix.join(dir, f.text.slice(r.start, r.end))));
  }
  templates.set(files, found);
  return found;
}

/**
 * A component's template (.html) as its CSS, script and markup, read through Angular's grammar; a component's .ts with
 * the strings its @Component holds (template:, styles:) read in place; any other HTML (src/index.html) as the web reads
 * it; other files (stylesheets, other code) as they are.
 */
function angularViews(file: SourceFile, files?: SourceFile[]): SourceFile[] {
  if (HTML_FILE.test(file.path) && files && templatesOf(files).has(file.path)) return componentFiles(file, READ);
  if (isComponent(file)) {
    const { css, script, markup, dark, spans } = withEmbedded(file.text, READ);
    return [
      { ...file, text: css, lang: "css", ...(dark.length > 0 ? { dark } : {}) },
      { ...file, text: script, lang: "script", spans },
      { ...file, text: markup, lang: "markup" },
    ];
  }
  return expandHtml([file]);
}

/** Angular 15 or later, with the Angular CLI (or Nx). The parts that come later are filled in by their tasks. */
export const ANGULAR: WebStack = {
  id: "angular",
  extensions: [".ts", ".html", ".css", ".scss"],
  sourceFiles: (root, app, opts) => listAngularFiles(root, app.path, opts),
  views: angularViews,
  srcDir: angularSrcDir,
  generate: generateAngular,
  wiring: (root, app, files) => angularWiring(root, app, files, angularSrcDir),
  scan: scanAngular,
  appWide: angularReducedMotionHits,
  fix: angularFix,
  doctor: angularDoctor,
  unsupported: angularUnsupported,
};
