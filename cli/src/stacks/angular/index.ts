import { posix } from "node:path";
import { componentFiles } from "../../check/component-views";
import { stringRegions, withEmbedded } from "../../check/embedded";
import { listAngularFiles, type SourceFile } from "../../check/files";
import { expandHtml } from "../../check/html";
import { maskComments } from "../../check/mask";
import type { WebStack } from "../web";
import { angularDoctor, angularUnsupported } from "./doctor";
import { collectAngular } from "./extract";
import { angularWiring, generateAngular } from "./generate";
import { angularSrcDir } from "./project";
import { angularFix, angularReducedMotionHits, scanAngular } from "./rules";
import { ANGULAR_BINDINGS, ANGULAR_GRAMMAR } from "./views";

const COMPONENT = /@Component\s*\(/;
const HTML_FILE = /\.html?$/i;
const TS_FILE = /\.ts$/i;
const STYLESHEET = /\.(?:css|scss|sass|less)$/i;
const STYLE_EXTENSIONS = [".css", ".scss", ".sass", ".less"];
/** A template: key of the decorator, whatever its value (an inline template, even an empty one). */
const TEMPLATE_KEY = /[{,]\s*["']?template["']?\s*:/;
const READ = { bindings: ANGULAR_BINDINGS, grammar: ANGULAR_GRAMMAR };

const isComponent = (file: SourceFile) => TS_FILE.test(file.path) && COMPONENT.test(maskComments(file.text, "script"));

/**
 * A component's own files among an app's, by path: its template (what templateUrl names, relative to its .ts; without
 * templateUrl or an inline template, the .html beside it of its own name) and its stylesheets (what styleUrl and
 * styleUrls name; without them, the stylesheet beside it of its own name).
 */
const owned = new WeakMap<SourceFile[], { templates: Set<string>; styles: Set<string> }>();
function componentFilesOf(files: SourceFile[]): { templates: Set<string>; styles: Set<string> } {
  const known = owned.get(files);
  if (known) return known;
  const found = { templates: new Set<string>(), styles: new Set<string>() };
  for (const f of files) {
    if (!isComponent(f)) continue;
    const dir = posix.dirname(f.path);
    const named = (key: string) => stringRegions(f.text, [key]).map((r) => posix.normalize(posix.join(dir, f.text.slice(r.start, r.end))));
    const templateUrl = named("templateUrl");
    for (const t of templateUrl) found.templates.add(t);
    if (templateUrl.length === 0 && !TEMPLATE_KEY.test(maskComments(f.text, "script"))) found.templates.add(f.path.replace(TS_FILE, ".html"));
    const styleUrls = [...named("styleUrl"), ...named("styleUrls")];
    for (const s of styleUrls) found.styles.add(s);
    if (styleUrls.length === 0) for (const ext of STYLE_EXTENSIONS) found.styles.add(f.path.replace(TS_FILE, ext));
  }
  owned.set(files, found);
  return found;
}

/**
 * A component's template (.html) as its CSS, script and markup, read through Angular's grammar; a component's .ts with
 * the strings its @Component holds (template:, styles:) read in place; a component's stylesheet as it is; each marked a
 * component's. Any other HTML (src/index.html) as the web reads it; other files (other stylesheets and code) as they are.
 */
function angularViews(file: SourceFile, files?: SourceFile[]): SourceFile[] {
  const own = files ? componentFilesOf(files) : null;
  if (HTML_FILE.test(file.path) && own?.templates.has(file.path)) return componentFiles(file, READ).map((v) => ({ ...v, component: true as const }));
  if (STYLESHEET.test(file.path) && own?.styles.has(file.path)) return [{ ...file, component: true }];
  if (isComponent(file)) {
    const { css, script, markup, dark, spans } = withEmbedded(file.text, READ);
    return [
      { ...file, text: css, lang: "css", component: true, ...(dark.length > 0 ? { dark } : {}) },
      { ...file, text: script, lang: "script", spans },
      { ...file, text: markup, lang: "markup", component: true },
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
  collect: collectAngular,
};
