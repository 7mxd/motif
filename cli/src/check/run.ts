import { join } from "node:path";
import type { AppInfo } from "../detect/stacks";
import { isMotifGenerated } from "../generate/header";
import type { Theme } from "../generate/theme";
import { prefixPath } from "../project/apps";
import { chooseSrcDir, detectTailwind, generateReactWeb } from "../stacks/react-web/generate";
import { exceptionFor } from "./exceptions";
import { listSourceFiles, type SourceFile } from "./files";
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

export function scanFile(file: SourceFile, scale: Scale | null): Hit[] {
  return [...scanColors(file), ...scanTailwind(file, scale), ...scanTailwindScale(file, scale), ...scanValues(file, scale)];
}

const byPosition = (a: Hit, b: Hit) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;

export function checkApp(root: string, app: AppInfo, theme: Theme, opts: { paths?: string[]; ignore?: string[] } = {}): AppCheck {
  const appDir = join(root, app.path);
  const srcDir = app.srcDir ?? chooseSrcDir(appDir);
  const scale = buildScale(theme, srcDir);
  const expected = generateReactWeb(theme, { srcDir, tailwind: detectTailwind(appDir) })
    .map((f) => ({ path: prefixPath(app.path, f.path), content: f.content }));

  const all = listSourceFiles(root, app.path, opts);
  const generated = all.filter((f) => isMotifGenerated(f.path, f.text));
  const files = all.filter((f) => !isMotifGenerated(f.path, f.text));
  const lines = new Map(files.map((f) => [f.path, f.text.split(/\r?\n/)]));

  const violations: Hit[] = [];
  const exceptions: ExceptionHit[] = [];
  for (const hit of [...files.flatMap((f) => scanFile(f, scale)), ...reducedMotionHits(files, generated)]) {
    if (!hit.violation) continue;
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
