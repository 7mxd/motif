import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { siteDir, type AppInfo } from "../detect/stacks";
import { isMotifGenerated, type GeneratedFile } from "../generate/header";
import type { Theme, ThemeSet, ThemeVariant } from "../generate/theme";
import { prefixPath } from "../project/apps";
import { motifCss } from "../generate/motif-css";
import { nativeStack, type NativeStack } from "../stacks/native";
import { chooseSrcDir, detectTailwind, generateReactWeb } from "../stacks/react-web/generate";
import { exceptionFor } from "./exceptions";
import { listSourceFiles, matchesPaths, type SourceFile } from "./files";
import { expandHtml } from "./html";
import { generatedEditedHits, reducedMotionHits } from "./rules/app";
import { scanColors } from "./rules/colors";
import { scanTailwind, scanThemeClassesV3, type ThemeRoles } from "./rules/tailwind";
import { scanTailwindScale } from "./rules/tailwind-scale";
import { scanValues } from "./rules/values";
import { buildScale } from "./scale";
import { suggestRole } from "./suggest";
import type { Hit, Scale } from "./types";

export interface ExceptionHit extends Hit {
  reason: string;
}

export interface AppCheck {
  app: string;
  files: number;
  violations: Hit[];
  exceptions: ExceptionHit[];
  warnings: Hit[];
}

export function scanFile(file: SourceFile, scale: Scale | null, opts: { tailwind?: boolean; v3Roles?: ThemeRoles } = {}): Hit[] {
  const tailwind = opts.tailwind ?? true;
  const hits = [
    ...scanColors(file),
    ...(tailwind ? [...scanTailwind(file, scale), ...scanTailwindScale(file, scale)] : []),
    ...scanValues(file, scale),
  ];
  if (!tailwind || !opts.v3Roles) return hits;
  return [...hits.map((h) => ({ ...h, fix: tailwind3Fix(h) })), ...scanThemeClassesV3(file, opts.v3Roles)];
}

const V3_TAIL = " (Tailwind 3 can't use Motif's theme classes; Tailwind 4 adds them.)";
/** A class (ease-in-out, md:duration-300), not a CSS value or a Motion setting. */
const MOTION_CLASS = /^(?:[\w-]+:)*!?(?:ease|duration)-/;

/** Tailwind 3 fixes: Motif writes only CSS variables there, so a class uses one as an arbitrary value. */
export function tailwind3Fix(hit: Hit): string {
  const util = hit.context === "text" ? "text" : hit.context === "border" ? "border" : "bg";
  switch (hit.kind) {
    case "color":
      return `Use var(--motif-color-<role>): ${util}-[var(--motif-color-<role>)] in a class.${V3_TAIL}`;
    case "font-size":
      return `Use var(--motif-font-<role>-size): text-[length:var(--motif-font-<role>-size)] in a class.${V3_TAIL}`;
    case "font-family":
      return `Use var(--motif-font-<role>-family): font-[family-name:var(--motif-font-<role>-family)] in a class.${V3_TAIL}`;
    case "radius":
      return `Use var(--motif-radius-<role>): rounded-[var(--motif-radius-<role>)] in a class.${V3_TAIL}`;
    case "easing":
      return MOTION_CLASS.test(hit.text) ? `Use ease-[var(--motif-easing-<role>)] (standard, enter or exit).${V3_TAIL}` : hit.fix;
    case "duration":
      return MOTION_CLASS.test(hit.text) ? `Use duration-[var(--motif-duration-base)] (or fast, slow).${V3_TAIL}` : hit.fix;
    default:
      return hit.fix;
  }
}

/** Tailwind 3's own names for colours, fonts and sizes, and easings: classes with them work there. */
const TAILWIND3_NAMES = {
  colors: new Set(["inherit", "current", "transparent", "black", "white"]),
  fonts: new Set(["sans", "serif", "mono", "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"]),
  easings: new Set(["linear", "in", "out", "in-out"]),
};

/** The keys an app's tailwind.config.* defines (colors: { background: … }): its own classes, which work on Tailwind 3. */
function tailwindConfigKeys(appDir: string): Set<string> {
  const keys = new Set<string>();
  for (const ext of ["js", "cjs", "mjs", "ts", "cts", "mts"]) {
    const path = join(appDir, `tailwind.config.${ext}`);
    if (!existsSync(path)) continue;
    for (const m of readFileSync(path, "utf8").matchAll(/(?:^|[{,\s])["'`]?([A-Za-z_$][\w$-]*)["'`]?\s*:/gm)) keys.add(m[1]!);
  }
  return keys;
}

/** The theme's role names whose classes do nothing on Tailwind 3: not one the app's config or Tailwind 3 defines. */
function tailwind3Roles(theme: Theme, appDir: string): ThemeRoles {
  const own = tailwindConfigKeys(appDir);
  const keep = (names: string[], defaults: Set<string>) => names.filter((n) => !own.has(n) && !defaults.has(n));
  return {
    colors: keep(theme.colors.map((c) => c.name), TAILWIND3_NAMES.colors),
    fonts: keep(theme.fonts.map((f) => f.name), TAILWIND3_NAMES.fonts),
    easings: keep(theme.easings.map((e) => e.name), TAILWIND3_NAMES.easings),
  };
}

const byPosition = (a: Hit, b: Hit) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;

/** Plain web fixes speak CSS: there are no utility classes on a plain site. */
export function plainFix(hit: Hit): string {
  if (hit.rule === "reduced-motion") return 'Run motif tokens and link the motif.css it writes in each page (<link rel="stylesheet" href="motif.css">; it includes the rule), or add an @media (prefers-reduced-motion: reduce) rule.';
  if (hit.rule === "raw-color") return "Use var(--motif-color-<role>), or one of your own variables defined from it (--bg: var(--motif-color-background)).";
  if (hit.rule === "raw-font") return "Use var(--motif-font-<role>-family).";
  if (hit.rule === "off-scale" && hit.kind === "radius") return "Use var(--motif-radius-<role>).";
  if (hit.rule === "off-scale" && hit.kind === "font-size") return "Use var(--motif-font-<role>-size).";
  return hit.fix;
}

/** The files Motif reads for an app. On a plain web site, only its site folder: server code beside it isn't the site. */
export function appSourceFiles(root: string, app: AppInfo, opts: { ignore?: string[] } = {}): SourceFile[] {
  const site = app.stack === "plain-web" ? siteDir(root, app) : ".";
  return listSourceFiles(root, app.path, { ignore: opts.ignore, ...(site === "." ? {} : { paths: [prefixPath(app.path, site)] }) });
}

export function checkApp(
  root: string,
  app: AppInfo,
  theme: Theme,
  opts: { paths?: string[]; ignore?: string[]; variants?: ThemeVariant[]; set?: ThemeSet } = {},
): AppCheck {
  const native = nativeStack(app.stack);
  if (native?.scan) {
    const set = opts.set ?? { base: theme, defaultId: null, defaultLabel: null, variants: opts.variants ?? [] };
    return checkNativeApp(root, app, native, native.scan, set, opts);
  }
  const appDir = join(root, app.path);
  const plain = app.stack === "plain-web";
  const srcDir = plain ? siteDir(root, app) : (app.srcDir ?? chooseSrcDir(appDir));
  const scale = buildScale(theme, srcDir);
  const tailwindVersion = plain ? "none" : detectTailwind(appDir);
  const generatedHere: GeneratedFile[] = plain
    ? [{ path: srcDir === "." ? "motif.css" : `${srcDir}/motif.css`, content: motifCss(theme, opts.variants) }]
    : generateReactWeb(theme, { srcDir, tailwind: tailwindVersion }, opts.variants);
  // On Tailwind 3, Motif's theme classes do nothing: they're flagged.
  const v3Roles: ThemeRoles | undefined = tailwindVersion === "v3" ? tailwind3Roles(theme, appDir) : undefined;
  const expected = generatedHere.map((f) => ({ path: prefixPath(app.path, f.path), content: f.content }));

  // App-wide rules need the whole app even when the scan is narrowed to some paths.
  const all = appSourceFiles(root, app, { ignore: opts.ignore });
  const generated = all.filter((f) => isMotifGenerated(f.path, f.text));
  const appFiles = all.filter((f) => !isMotifGenerated(f.path, f.text));
  const wanted = opts.paths ?? [];
  const files = appFiles.filter((f) => matchesPaths(f.path, wanted));
  const inScope = new Set(files.map((f) => f.path));
  // Exceptions are read from the files as written, not from their HTML views.
  const lines = new Map(files.map((f) => [f.path, f.text.split(/\r?\n/)]));

  const appWide = reducedMotionHits(expandHtml(appFiles), expandHtml(generated)).filter((h) => inScope.has(h.file));
  const scanned = expandHtml(files).flatMap((f) => scanFile(f, scale, { tailwind: !plain, v3Roles }));
  const { violations, exceptions } = sortOut([...scanned, ...appWide], lines, (found) => {
    const suggestion = suggestRole(found, theme, { tailwind3: tailwindVersion === "v3", variants: opts.variants });
    // A colour in a variant's block gets a hint naming the variant (it's the fix itself, not a "closest" role).
    const variantHint = found.kind === "color" && found.variant ? suggestion : undefined;
    return { ...found, ...(plain ? { fix: plainFix(found) } : {}), ...(variantHint ? { fix: variantHint } : suggestion ? { suggestion } : {}) };
  });
  return {
    app: app.path,
    files: files.length,
    violations: violations.sort(byPosition),
    exceptions: exceptions.sort(byPosition),
    warnings: generatedEditedHits(root, expected),
  };
}

/** Violations, and the ones a reasoned "motif-ok" comment allows; a "motif-ok" without a reason doesn't allow anything. */
function sortOut(found: Hit[], lines: Map<string, string[]>, decorate: (hit: Hit) => Hit): { violations: Hit[]; exceptions: ExceptionHit[] } {
  const violations: Hit[] = [];
  const exceptions: ExceptionHit[] = [];
  for (const f of found) {
    if (!f.violation) continue;
    const hit = decorate(f);
    const ex = exceptionFor(lines.get(hit.file) ?? [], hit.line);
    if (ex && "reason" in ex) exceptions.push({ ...hit, reason: ex.reason });
    else if (ex) violations.push({ ...hit, fix: `${hit.fix} (A "motif-ok" comment needs a reason, e.g. "motif-ok: required by the partner's brand guide".)` });
    else violations.push(hit);
  }
  return { violations, exceptions };
}

/** A native app (Flutter): its stack lists, reads and fixes its own code, and writes the theme files it expects. */
function checkNativeApp(root: string, app: AppInfo, native: NativeStack, scan: NonNullable<NativeStack["scan"]>, set: ThemeSet, opts: { paths?: string[]; ignore?: string[] }): AppCheck {
  const theme = set.base;
  const themeDir = native.themeDir(root, app);
  const scale = buildScale(theme, themeDir);
  const expected = native.generate ? native.generate(set, { root, app, themeDir }).files : [];

  const all = native.sourceFiles ? native.sourceFiles(root, app, { ignore: opts.ignore }) : [];
  const generated = all.filter((f) => isMotifGenerated(f.path, f.text));
  const appFiles = all.filter((f) => !isMotifGenerated(f.path, f.text));
  const files = appFiles.filter((f) => matchesPaths(f.path, opts.paths ?? []));
  const inScope = new Set(files.map((f) => f.path));
  const lines = new Map(files.map((f) => [f.path, f.text.split(/\r?\n/)]));

  const appWide = (native.appWide?.(appFiles, generated) ?? []).filter((h) => inScope.has(h.file));
  const scanned = files.flatMap((f) => scan(f, scale));
  const { violations, exceptions } = sortOut([...scanned, ...appWide], lines, (found) => {
    const suggestion = suggestRole(found, theme, { variants: set.variants, ...(native.role ? { role: native.role } : {}) });
    return { ...found, ...(native.fix ? { fix: native.fix(found) } : {}), ...(suggestion ? { suggestion } : {}) };
  });
  return {
    app: app.path,
    files: files.length,
    violations: violations.sort(byPosition),
    exceptions: exceptions.sort(byPosition),
    warnings: generatedEditedHits(root, expected),
  };
}
