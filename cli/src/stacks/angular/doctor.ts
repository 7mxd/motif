import { join, resolve } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { nodeFloor, nodeVersion, rangeParts } from "../../project/node-floor";
import { packageVersion, readJson } from "../../project/package";
import { NO_VERSION, shown } from "../web-doctor";
import { angularMajor, isStandalone } from "./project";

/** What doctor says for Angular 14 or older, or null for a version the app can use (or one that can't be read). */
export function angularUnsupported(appDir: string): string | null {
  const major = angularMajor(appDir);
  return major !== null && major < 15
    ? `Angular ${major} isn't supported: Motif supports Angular 15 and later. Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.`
    : null;
}

/** @angular/core's engines.node for each major, for an app whose installed copy doesn't say (or isn't installed). */
const NODE_RANGES: Record<number, string> = {
  18: "^18.19.1 || ^20.11.1 || >=22.0.0",
  19: "^18.19.1 || ^20.11.1 || >=22.0.0",
  20: "^20.19.0 || ^22.12.0 || >=24.0.0",
  21: "^20.19.0 || ^22.12.0 || >=24.0.0",
  22: "^22.22.3 || ^24.15.0 || >=26.0.0",
};

/** The Node.js versions the app's Angular runs on: the installed @angular/core's engines.node, else the known range for its major. */
function nodeRange(appDir: string, major: number): string | null {
  const engines = readJson<{ engines?: { node?: unknown } }>(join(appDir, "node_modules", "@angular", "core", "package.json"))?.engines?.node;
  return typeof engines === "string" ? engines : (NODE_RANGES[major] ?? null);
}

/** "22.22.3 or later (or 24.15 or later)": a range's first two floors, without trailing zeros. */
function floorWords(range: string): string {
  const [first, second] = rangeParts(range).map(({ floor: [a, b, c] }) => (c !== 0 ? `${a}.${b}.${c}` : b !== 0 ? `${a}.${b}` : `${a}`));
  return `${first} or later${second === undefined ? "" : ` (or ${second} or later)`}`;
}

/** One item per Angular app: its version and how it starts, that its Node.js is too old, or that its Angular isn't supported. */
export function angularDoctor(deps: DoctorDeps, ctx: { root: string; apps: AppInfo[] }): DoctorItem[] {
  return ctx.apps
    .filter((a) => a.stack === "angular")
    .map((app): DoctorItem => {
      const dir = resolve(ctx.root, app.path);
      const id = `angular:${app.path}`;
      const label = `Angular (${app.path === "." ? "this folder" : app.path})`;
      const unsupported = angularUnsupported(dir);
      if (unsupported !== null) return { id, status: "optional", label, detail: unsupported };
      const v = packageVersion(dir, "@angular/core");
      const range = v === null ? null : nodeRange(dir, v.major);
      const node = range === null ? null : nodeVersion(deps);
      if (v !== null && range !== null && node !== null && !nodeFloor(range, node)) {
        return {
          id,
          status: "needed",
          label,
          detail: `Angular ${v.major} needs Node.js ${floorWords(range)}; this computer has ${node}. Install a newer Node.js from nodejs.org.`,
        };
      }
      const how = isStandalone(dir) ? " with standalone components" : " (NgModules)";
      return { id, status: "ok", label, detail: `Angular${v === null ? NO_VERSION : shown(v)}${how}.` };
    });
}
