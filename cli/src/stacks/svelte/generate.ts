import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { springPhysics, type SpringParams } from "../../contract/spring";
import { num } from "../../generate/css-values";
import { FALLBACK_DIR } from "../../generate/fallback";
import { TS_HEADER, type GeneratedFile } from "../../generate/header";
import { motionFile, usesTypeScript } from "../../generate/javascript";
import { isReferenced } from "../../generate/referenced";
import type { Theme, ThemeSet } from "../../generate/theme";
import { appLabel, prefixPath } from "../../project/apps";
import type { AppInfo } from "../../detect/stacks";
import { motifCss, tailwindCss, tailwindV3Note, tailwindWiringNote, tsKey, type TailwindVersion } from "../react-web/generate";
import { beforeSvelte5, isSvelteKit, kitLibDir, libSpecifier, routesDir } from "./project";

interface SvelteCtx {
  root: string;
  app: AppInfo;
  srcDir: string;
  tailwind: TailwindVersion;
}

const norm = (p: string) => posix.normalize(p).replace(/^\.\//, "");

/**
 * Where each theme file goes, relative to the project root: under src/lib (SvelteKit's $lib, #lib in SvelteKit 3), or the
 * lib folder a SvelteKit config names (files.lib), unless themeDir says.
 */
function layout({ root, app, srcDir }: SvelteCtx): { css: string; tailwind: string; motion: string } {
  if (app.themeDir) return { css: `${app.themeDir}/motif.css`, tailwind: `${app.themeDir}/motif.tailwind.css`, motion: `${app.themeDir}/motion.ts` };
  const lib = prefixPath(app.path, kitLibDir(join(root, app.path)) ?? norm(`${srcDir}/lib`));
  return { css: `${lib}/styles/motif.css`, tailwind: `${lib}/styles/motif.tailwind.css`, motion: `${lib}/design/motion.ts` };
}

const SVELTE_4_MOTION =
  "motion.ts uses Svelte 5's Spring and Tween, so Motif didn't write it. Animate with the CSS variables in motif.css (--motif-duration-*, --motif-easing-*).";

/** Theme code for a Svelte app (SvelteKit or Vite): React web's CSS and Tailwind theme, and motion values in Svelte's terms. */
export function generateSvelte(set: ThemeSet, ctx: SvelteCtx): { files: GeneratedFile[]; notes: string[] } {
  const where = layout(ctx);
  const files: GeneratedFile[] = [{ path: where.css, content: motifCss(set.base, set.variants) }];
  const notes: string[] = [];
  if (ctx.tailwind === "v4") files.push({ path: where.tailwind, content: tailwindCss(set.base) });
  if (ctx.tailwind === "v3") notes.push(tailwindV3Note(appLabel(ctx.app)));
  if (beforeSvelte5(join(ctx.root, ctx.app.path))) notes.push(SVELTE_4_MOTION);
  else files.push(motionFile(where.motion, svelteMotionTs(set.base), !usesTypeScript(join(ctx.root, ctx.app.path), ctx.root)));
  return { files, notes };
}

/** Svelte's Spring takes one step per frame, sized for 60 frames a second (decision 0011). */
const FRAME_SECONDS = 1 / 60;

/**
 * A spring role as options for svelte/motion's Spring: the stiffness and damping whose frame-by-frame steps follow the
 * role's spring (Motif's, as springPhysics gives it) at 60 frames a second. Svelte's step is a two-term recurrence, so
 * matching its two roots to the role's spring sampled once a frame (z = e^(root × frame)) makes the two the same motion:
 * stiffness (1 − z1)(1 − z2), damping 1 − z1·z2. Four significant digits; Svelte caps stiffness at 1, which only springs
 * shorter than about five frames reach.
 */
export function svelteSpring(role: SpringParams): { stiffness: number; damping: number } {
  const p = springPhysics(role);
  const w = Math.sqrt(p.stiffness);
  const z = p.dampingRatio;
  let sum: number;
  let product: number;
  if (z < 1) {
    const r = Math.exp(-z * w * FRAME_SECONDS);
    sum = 2 * r * Math.cos(w * Math.sqrt(1 - z * z) * FRAME_SECONDS);
    product = r * r;
  } else {
    const q = Math.sqrt(z * z - 1);
    const z1 = Math.exp(-w * (z - q) * FRAME_SECONDS);
    const z2 = Math.exp(-w * (z + q) * FRAME_SECONDS);
    sum = z1 + z2;
    product = z1 * z2;
  }
  const digits = (n: number) => Number(n.toPrecision(4));
  return { stiffness: digits(Math.min(1, 1 - sum + product)), damping: digits(1 - product) };
}

/** The cubic-bezier solver motion.ts carries, so its easings need no package. */
const CUBIC_BEZIER = [
  "export type Easing = (t: number) => number;",
  "",
  "/**",
  " * The CSS curve cubic-bezier(x1, y1, x2, y2) as an easing function: the progress at time t, from 0 to 1. It finds the",
  " * point of the curve at t by Newton's method, and by halving when that stalls or leaves the curve, as browsers do.",
  " */",
  "function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {",
  "  // Each coordinate is a cubic in the curve's parameter s: ((a * s + b) * s + c) * s.",
  "  const cx = 3 * x1;",
  "  const bx = 3 * (x2 - x1) - cx;",
  "  const ax = 1 - cx - bx;",
  "  const cy = 3 * y1;",
  "  const by = 3 * (y2 - y1) - cy;",
  "  const ay = 1 - cy - by;",
  "  const x = (s: number) => ((ax * s + bx) * s + cx) * s;",
  "  const y = (s: number) => ((ay * s + by) * s + cy) * s;",
  "  const slope = (s: number) => (3 * ax * s + 2 * bx) * s + cx;",
  "  return (t) => {",
  "    if (t <= 0) return 0;",
  "    if (t >= 1) return 1;",
  "    let s = t;",
  "    for (let i = 0; i < 8; i++) {",
  "      const error = x(s) - t;",
  "      if (Math.abs(error) < 1e-7) return y(s);",
  "      const d = slope(s);",
  "      if (Math.abs(d) < 1e-6) break;",
  "      s -= error / d;",
  "      if (s < 0 || s > 1) break;",
  "    }",
  "    let lo = 0;",
  "    let hi = 1;",
  "    s = t;",
  "    for (let i = 0; i < 64 && hi - lo > 1e-7; i++) {",
  "      if (x(s) < t) lo = s;",
  "      else hi = s;",
  "      s = (lo + hi) / 2;",
  "    }",
  "    return y(s);",
  "  };",
  "}",
];

/** motion.ts for Svelte: durations and easings for transitions and Tween, springs for Spring, and Motion's for animate(). */
export function svelteMotionTs(theme: Theme): string {
  return [
    TS_HEADER,
    "",
    "/** Durations in milliseconds (the unit of Svelte's transitions and Tween). */",
    "export const duration = {",
    ...theme.durations.map((d) => `  ${tsKey(d.name)}: ${num(d.ms)},`),
    "} satisfies Record<string, number>;",
    "",
    ...(theme.easings.length > 0 ? [...CUBIC_BEZIER, ""] : ["export type Easing = (t: number) => number;", ""]),
    "/** Easing curves, for transitions (transition:fly={{ easing: easing.standard }}) and Tween. */",
    "export const easing = {",
    ...theme.easings.map((e) => `  ${tsKey(e.name)}: cubicBezier(${e.points.map(num).join(", ")}),`),
    "} satisfies Record<string, Easing>;",
    "",
    "export type Spring = { stiffness: number; damping: number };",
    "",
    "/**",
    " * Springs for svelte/motion's Spring (new Spring(0, spring.snappy)). Svelte moves a spring one step per frame, so these",
    " * are the guide's springs at 60 frames a second; on a 120 Hz screen they are more damped and bounce less. For the same",
    " * spring on every screen, use motionSpring with Motion's animate().",
    " */",
    "export const spring = {",
    ...theme.springs.map((s) => {
      const o = svelteSpring(s);
      return `  ${tsKey(s.name)}: { stiffness: ${o.stiffness}, damping: ${o.damping} },`;
    }),
    "} satisfies Record<string, Spring>;",
    "",
    'export type MotionSpring = { type: "spring"; visualDuration: number; bounce: number };',
    "",
    "/** Springs for Motion's animate() (animate(el, { opacity: 1 }, motionSpring.snappy)): visualDuration in seconds. */",
    "export const motionSpring = {",
    ...theme.springs.map((s) => `  ${tsKey(s.name)}: { type: "spring", visualDuration: ${num(s.duration)}, bounce: ${num(s.bounce)} },`),
    "} satisfies Record<string, MotionSpring>;",
    "",
  ].join("\n");
}

/** The files whose text can load the theme: Svelte components beside scripts, styles and HTML. */
const SOURCE_FILE = /\.(css|scss|ts|tsx|js|jsx|mjs|html?|svelte)$/;

/** The one step that puts the theme files to use, or null when the app's own files already load them. */
export function svelteWiring(root: string, app: AppInfo, files: GeneratedFile[], srcDirOf: (appDir: string) => string): string | null {
  const appDir = join(root, app.path);
  const srcDir = norm(app.srcDir ?? srcDirOf(appDir)) || ".";
  const tailwind = files.find((f) => posix.basename(f.path) === "motif.tailwind.css");
  const css = files.find((f) => posix.basename(f.path) === "motif.css");
  const entry = tailwind ?? css;
  if (!entry) return null;
  const kit = isSvelteKit(appDir);
  const routes = kit ? routesDir(appDir) : null;
  // An import of design/generated/motif.css is an earlier Motif's theme, which motif tokens no longer updates.
  const old = [`${FALLBACK_DIR}/`];
  const name = posix.basename(entry.path);
  const outside = routes !== null && posix.relative(srcDir, routes).startsWith("..") ? [routes] : [];
  if ([srcDir, ...outside].some((dir) => isReferenced(join(appDir, dir), name, SOURCE_FILE, old))) return null;

  if (tailwind) return tailwindWiringNote(entry.path);
  // The file as the app sees it (a themeDir may be outside the app's folder).
  const inApp = app.path === "." ? entry.path : posix.relative(app.path, entry.path);
  const relative = (from: string) => {
    const r = posix.relative(from, inApp);
    return r.startsWith(".") ? r : `./${r}`;
  };
  if (routes !== null) {
    const spec = libSpecifier(appDir, inApp) ?? relative(routes);
    return `Next: import '${spec}' once in ${prefixPath(app.path, `${routes}/+layout.svelte`)} (in its <script>).`;
  }
  // npm create vite writes main.ts with TypeScript and main.js without.
  const main = existsSync(join(appDir, srcDir, "main.js")) && !existsSync(join(appDir, srcDir, "main.ts")) ? "main.js" : "main.ts";
  return `Next: import '${relative(srcDir)}' once in ${prefixPath(app.path, posix.join(srcDir, main))}.`;
}
