import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { FALLBACK_DIR } from "../../generate/fallback";
import { isReferenced, mentions } from "../../generate/referenced";
import type { GeneratedFile } from "../../generate/header";
import type { ThemeSet } from "../../generate/theme";
import { motifCss, motionTs, tailwindCss, type TailwindVersion } from "../react-web/generate";
import { appLabel, prefixPath } from "../../project/apps";
import { addPackages, packageManager } from "../../project/package";
import type { AppInfo } from "../../detect/stacks";
import { declared } from "../../project/package";
import { isNuxt, vueMajor } from "./project";

interface VueCtx {
  root: string;
  app: AppInfo;
  srcDir: string;
  tailwind: TailwindVersion;
}

const norm = (p: string) => posix.normalize(p).replace(/^\.\//, "");

/** Where each theme file goes, relative to the project root. */
function layout(ctx: VueCtx): { css: string; tailwind: string; motion: string } {
  const { root, app, srcDir } = ctx;
  const inApp = (rel: string) => prefixPath(app.path, norm(rel));
  if (app.themeDir) return { css: `${app.themeDir}/motif.css`, tailwind: `${app.themeDir}/motif.tailwind.css`, motion: `${app.themeDir}/motion.ts` };
  if (isNuxt(join(root, app.path))) {
    // A Nuxt 3 app at the project root has its source folder where Motif's own design/ is: motion goes beside it instead.
    const isProjectDesign = norm(posix.join(app.path, srcDir, "design")) === "design";
    return {
      css: inApp(`${srcDir}/assets/css/motif.css`),
      tailwind: inApp(`${srcDir}/assets/css/motif.tailwind.css`),
      motion: inApp(`${srcDir}/${isProjectDesign ? "motion/motif-motion.ts" : "design/motion.ts"}`),
    };
  }
  return { css: inApp(`${srcDir}/styles/motif.css`), tailwind: inApp(`${srcDir}/styles/motif.tailwind.css`), motion: inApp(`${srcDir}/design/motion.ts`) };
}

/** Theme code for a Vue or Nuxt app: React web's CSS, Tailwind theme and motion, in the folders that framework uses. */
export function generateVue(set: ThemeSet, ctx: VueCtx): { files: GeneratedFile[]; notes: string[] } {
  const appDir = join(ctx.root, ctx.app.path);
  const where = layout(ctx);
  const files: GeneratedFile[] = [{ path: where.css, content: motifCss(set.base, set.variants) }];
  const notes: string[] = [];
  if (ctx.tailwind === "v4") files.push({ path: where.tailwind, content: tailwindCss(set.base) });
  if (ctx.tailwind === "v3") {
    notes.push(`${appLabel(ctx.app)}: Tailwind v3 found, so Motif wrote CSS variables only. Use them as bg-[var(--motif-color-action-primary)], or upgrade to Tailwind v4 for Motif's Tailwind theme.`);
  }
  if (vueMajor(appDir) === 2) {
    notes.push("motion.ts is for Motion for Vue, which needs Vue 3, so Motif didn't write it. Animate with the CSS variables in motif.css (--motif-duration-*, --motif-easing-*).");
  } else {
    files.push({ path: where.motion, content: motionTs(set.base) });
    if (declared(appDir, "motion-v") === null) {
      notes.push(`${where.motion} is for Motion for Vue: ${addPackages(packageManager(appDir), "motion-v")}. Vue's <Transition> can use the CSS variables in motif.css instead.`);
    }
  }
  return { files, notes };
}

const CONFIG_FILE = /^nuxt\.config\.(?:ts|js|mjs|mts|cjs|cts)$/;
const SOURCE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs|html?|vue)$/;

/** The one step that puts the theme files to use, or null when the app's own files already load them. */
export function vueWiring(root: string, app: AppInfo, files: GeneratedFile[], srcDirOf: (appDir: string) => string): string | null {
  const appDir = join(root, app.path);
  const srcDir = app.srcDir ?? srcDirOf(appDir);
  const tailwind = files.find((f) => f.path.endsWith("/motif.tailwind.css") || f.path === "motif.tailwind.css");
  const css = files.find((f) => f.path.endsWith("motif.css"));
  const entry = tailwind ?? css;
  if (!entry) return null;
  const name = posix.basename(entry.path);
  const nuxt = isNuxt(appDir);
  let configs: string[] = [];
  try {
    configs = readdirSync(appDir).filter((e) => CONFIG_FILE.test(e)).map((e) => readFileSync(join(appDir, e), "utf8"));
  } catch {}
  // An import of design/generated/motif.css is an earlier Motif's theme, which motif tokens no longer updates.
  const old = [`${FALLBACK_DIR}/`];
  if ((nuxt && configs.some((t) => mentions(t, name, old))) || isReferenced(join(appDir, srcDir), name, SOURCE_FILE, old)) return null;

  const inApp = app.path === "." ? entry.path : entry.path.slice(app.path.length + 1);
  if (nuxt) {
    const fromSrc = posix.relative(norm(srcDir) || ".", inApp);
    const alias = fromSrc.startsWith("..") ? `~~/${inApp}` : `~/${fromSrc}`;
    return tailwind
      ? `Next: @import ${alias} right after @import "tailwindcss" in your main CSS file, and list that file in nuxt.config.ts's css.`
      : `Next: add '${alias}' to the css list in nuxt.config.ts (css: ['${alias}']), before your own styles.`;
  }
  if (tailwind) {
    return `Next: in your main CSS file, add an @import for ${entry.path} right after @import "tailwindcss" (write the path relative to that CSS file). Importing it before Tailwind undoes the theme.`;
  }
  // create-vue writes main.ts with TypeScript and main.js without.
  const main = existsSync(join(appDir, srcDir, "main.js")) && !existsSync(join(appDir, srcDir, "main.ts")) ? "main.js" : "main.ts";
  const from = posix.relative(norm(srcDir) || ".", inApp);
  return `Next: import ${entry.path} once in ${posix.join(norm(srcDir), main)} (import '${from.startsWith(".") ? from : `./${from}`}'), or @import it from your main CSS file.`;
}
