import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve } from "node:path";
import { FALLBACK_DIR } from "../../generate/fallback";
import type { GeneratedFile } from "../../generate/header";
import { commentLang, isReferenced, mentions } from "../../generate/referenced";
import type { ThemeSet } from "../../generate/theme";
import { appLabel, prefixPath } from "../../project/apps";
import type { AppInfo } from "../../detect/stacks";
import { addPackages, declared, packageManager } from "../../project/package";
import { motifCss, motionTs, tailwindCss, tailwindV3Note, tailwindWiringNote, type TailwindVersion } from "../react-web/generate";
import { angularProject, projectChoiceNote } from "./project";

interface AngularCtx {
  root: string;
  app: AppInfo;
  srcDir: string;
  tailwind: TailwindVersion;
}

const norm = (p: string) => posix.normalize(p).replace(/^\.\//, "").replace(/\/+$/, "");
const under = (dir: string, rel: string) => (norm(dir) === "." || norm(dir) === "" ? rel : `${norm(dir)}/${rel}`);

/**
 * Where each theme file goes, relative to the project root: the stylesheets in <sourceRoot>/styles, beside the global
 * styles.css, and motion.ts in the app folder `ng new` makes (<sourceRoot>/app), unless themeDir says. The app folder is
 * never the project's own design/: motion.ts goes in app/design/ even when sourceRoot is the app's own folder.
 */
function layout({ app, srcDir }: AngularCtx): { css: string; tailwind: string; motion: string } {
  if (app.themeDir) return { css: `${app.themeDir}/motif.css`, tailwind: `${app.themeDir}/motif.tailwind.css`, motion: `${app.themeDir}/motion.ts` };
  return {
    css: prefixPath(app.path, under(srcDir, "styles/motif.css")),
    tailwind: prefixPath(app.path, under(srcDir, "styles/motif.tailwind.css")),
    motion: prefixPath(app.path, under(srcDir, "app/design/motion.ts")),
  };
}

/**
 * Theme code for an Angular app: React web's CSS, Tailwind theme and motion.ts (Motion's animate() takes seconds), for
 * animate.enter and animate.leave classes and for Motion in (animate.leave) callbacks and code (decision 0012).
 */
export function generateAngular(set: ThemeSet, ctx: AngularCtx): { files: GeneratedFile[]; notes: string[] } {
  const appDir = join(ctx.root, ctx.app.path);
  const where = layout(ctx);
  const files: GeneratedFile[] = [{ path: where.css, content: motifCss(set.base, set.variants) }];
  const notes: string[] = [];
  if (ctx.tailwind === "v4") files.push({ path: where.tailwind, content: tailwindCss(set.base) });
  if (ctx.tailwind === "v3") notes.push(tailwindV3Note(appLabel(ctx.app)));
  files.push({ path: where.motion, content: motionTs(set.base) });
  const choice = projectChoiceNote(appDir);
  if (choice !== null) notes.push(choice);
  if (declared(appDir, "motion") === null) {
    notes.push(`${where.motion} is for Motion's animate(): ${addPackages(packageManager(appDir), "motion")}. animate.enter and animate.leave can use the CSS variables in motif.css instead.`);
  }
  return { files, notes };
}

/** The files whose text can load the theme: components, templates and every stylesheet language Angular builds. */
const SOURCE_FILE = /\.(css|scss|sass|less|ts|js|mjs|html?)$/;

/**
 * The git submodule a file of the app is in, as .gitmodules (in the app's folder or the project's) names its folder, or
 * null. A submodule's files are another repository's (RealWorld's shared theme): changes to them don't stay with the app.
 */
function submoduleOf(root: string, appDir: string, file: string): string | null {
  const at = resolve(appDir, file);
  for (const dir of new Set([resolve(appDir), resolve(root)])) {
    let text: string;
    try {
      text = readFileSync(join(dir, ".gitmodules"), "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) {
      const inside = relative(resolve(dir, m[1]!), at);
      // Inside the folder: a path below it, not one that climbs out of it or is on another drive.
      if (inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)) return norm(m[1]!.replace(/\\/g, "/"));
    }
  }
  return null;
}

/**
 * The app's global stylesheet, relative to the app folder: the first entry of the build's styles that is a file of the
 * app's own (Angular Material puts its prebuilt theme, from node_modules, first; a git submodule's stylesheet is another
 * repository's), else the first entry that is a file, else the first entry; null when there is none.
 */
function stylesFile(appDir: string, vendored: (file: string) => boolean): string | null {
  const styles = angularProject(appDir)?.styles ?? [];
  const files = styles.filter((s) => existsSync(join(appDir, s)));
  return files.find((s) => !vendored(s)) ?? files[0] ?? styles[0] ?? null;
}

/** The one step that puts the theme files to use, or null when the app's own files (or angular.json's styles) already load them. */
export function angularWiring(root: string, app: AppInfo, files: GeneratedFile[], srcDirOf: (appDir: string) => string): string | null {
  const appDir = join(root, app.path);
  const srcDir = norm(app.srcDir ?? srcDirOf(appDir)) || ".";
  const tailwind = files.find((f) => posix.basename(f.path) === "motif.tailwind.css");
  const css = files.find((f) => posix.basename(f.path) === "motif.css");
  const entry = tailwind ?? css;
  if (!entry) return null;
  const name = posix.basename(entry.path);
  // The file as the app sees it (a themeDir may be outside the app's folder).
  const inApp = app.path === "." ? entry.path : posix.relative(app.path, entry.path);
  const vendored = (file: string) => submoduleOf(root, appDir, file) !== null;
  const styles = stylesFile(appDir, vendored);
  // An import of design/generated/motif.css is an earlier Motif's theme, which motif tokens no longer updates.
  const old = [`${FALLBACK_DIR}/`];
  if (angularProject(appDir)?.styles.some((s) => norm(s) === norm(inApp))) return null;
  if (isReferenced(join(appDir, srcDir), name, SOURCE_FILE, old)) return null;
  if (styles !== null) {
    try {
      if (mentions(readFileSync(join(appDir, styles), "utf8"), name, old, commentLang(styles))) return null;
    } catch {}
  }

  if (styles === null) {
    if (tailwind) return tailwindWiringNote(entry.path);
    return `Next: add "${inApp}" to the build's styles in ${prefixPath(app.path, "angular.json")} ("styles": ["${inApp}"]).`;
  }
  // A stylesheet in a git submodule is another repository's: the theme joins the build's styles after it instead.
  const submodule = submoduleOf(root, appDir, styles);
  if (submodule !== null) {
    if (tailwind) return tailwindWiringNote(entry.path);
    return `Next: add "${inApp}" to the build's styles in ${prefixPath(app.path, "angular.json")}, after "${styles}", which is in the git submodule ${submodule}/.`;
  }
  const fromStyles = posix.relative(posix.dirname(styles), inApp);
  const spec = fromStyles.startsWith(".") ? fromStyles : `./${fromStyles}`;
  const shown = prefixPath(app.path, styles);
  if (tailwind) return `Next: add @import "${spec}"; to ${shown}, right after @import "tailwindcss". Importing it before Tailwind undoes the theme.`;
  // Sass loads a .css file with @use; the indented syntax (.sass) ends a statement without a semicolon.
  const ext = posix.extname(styles).toLowerCase();
  const statement = ext === ".scss" ? `@use "${spec}";` : ext === ".sass" ? `@use "${spec}"` : `@import "${spec}";`;
  return `Next: add ${statement} at the top of ${shown}.`;
}
