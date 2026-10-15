import { join } from "node:path";
import { siteDir, type AppInfo } from "../detect/stacks";
import { isMotifGenerated, type GeneratedFile } from "../generate/header";
import type { Theme } from "../generate/theme";
import { prefixPath } from "../project/apps";
import { chooseSrcDir, detectTailwind, generateReactWeb, motifCss } from "../stacks/react-web/generate";
import { exceptionFor } from "./exceptions";
import { listSourceFiles, matchesPaths, type SourceFile } from "./files";
import { expandHtml } from "./html";
import { generatedEditedHits, reducedMotionHits } from "./rules/app";
import { scanColors } from "./rules/colors";
import { scanTailwind } from "./rules/tailwind";
import { scanTailwindScale } from "./rules/tailwind-scale";
import { scanValues } from "./rules/values";
import { buildScale } from "./scale";
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

export function scanFile(file: SourceFile, scale: Scale | null, opts: { tailwind?: boolean } = {}): Hit[] {
  const tailwind = opts.tailwind ?? true;
  return [
    ...scanColors(file),
    ...(tailwind ? [...scanTailwind(file, scale), ...scanTailwindScale(file, scale)] : []),
    ...scanValues(file, scale),
  ];
}

const byPosition = (a: Hit, b: Hit) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;

/** Plain web fixes speak CSS: there are no utility classes on a plain site. */
function plainFix(hit: Hit): string {
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

export function checkApp(root: string, app: AppInfo, theme: Theme, opts: { paths?: string[]; ignore?: string[] } = {}): AppCheck {
  const appDir = join(root, app.path);
  const plain = app.stack === "plain-web";
  const srcDir = plain ? siteDir(root, app) : (app.srcDir ?? chooseSrcDir(appDir));
  const scale = buildScale(theme, srcDir);
  const generatedHere: GeneratedFile[] = plain
    ? [{ path: srcDir === "." ? "motif.css" : `${srcDir}/motif.css`, content: motifCss(theme) }]
    : generateReactWeb(theme, { srcDir, tailwind: detectTailwind(appDir) });
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

  const violations: Hit[] = [];
  const exceptions: ExceptionHit[] = [];
  const appWide = reducedMotionHits(expandHtml(appFiles), expandHtml(generated)).filter((h) => inScope.has(h.file));
  const scanned = expandHtml(files).flatMap((f) => scanFile(f, scale, { tailwind: !plain }));
  for (const found of [...scanned, ...appWide]) {
    if (!found.violation) continue;
    const hit = plain ? { ...found, fix: plainFix(found) } : found;
    const ex = exceptionFor(lines.get(hit.file) ?? [], hit.line);
    if (ex && "reason" in ex) exceptions.push({ ...hit, reason: ex.reason });
    else if (ex) violations.push({ ...hit, fix: `${hit.fix} (A "motif-ok" comment needs a reason, e.g. "motif-ok: required by the partner's brand guide".)` });
    else violations.push(hit);
  }
  return {
    app: app.path,
    files: files.length,
    violations: violations.sort(byPosition),
    exceptions: exceptions.sort(byPosition),
    warnings: generatedEditedHits(root, expected),
  };
}
