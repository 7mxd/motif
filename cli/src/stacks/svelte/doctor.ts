import { resolve } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { declared, packageVersion, type PackageVersion } from "../../project/package";
import { beforeSvelte5, isSvelteKit } from "./project";

const SVELTE_4 =
  "Svelte 4 isn't supported: Motif supports Svelte 5 (runes). Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.";

/** What doctor says for a Svelte 4 (or earlier) app or SvelteKit 1, or null for a version the app can use. */
export function svelteUnsupported(appDir: string): string | null {
  return beforeSvelte5(appDir) ? SVELTE_4 : null;
}

/** SvelteKit 3's floor: its engines say Node.js 22.17 or later. */
const KIT_3_NODE = [22, 17];

const shown = (v: PackageVersion | null) => (v === null ? "" : v.minor === null ? ` ${v.major}` : ` ${v.major}.${v.minor}`);
const NO_VERSION = " (version not found in package.json)";

/** The version text of `node --version` ("v22.14.0") as [major, minor], or null when it can't be read. */
function nodeVersion(deps: DoctorDeps): { text: string; parts: number[] } | null {
  const r = deps.run?.(["node", "--version"]);
  if (!r || r.code !== 0) return null;
  const m = /v?(\d+)\.(\d+)/.exec(r.stdout);
  return m ? { text: r.stdout.trim().replace(/^v/, ""), parts: [Number(m[1]), Number(m[2])] } : null;
}

const older = (a: number[], b: number[]) => a[0]! < b[0]! || (a[0] === b[0] && a[1]! < b[1]!);

/** One item per Svelte app: its Svelte and SvelteKit (or Vite) versions, or that Svelte 4 isn't supported and what still works. */
export function svelteDoctor(deps: DoctorDeps, ctx: { root: string; apps: AppInfo[] }): DoctorItem[] {
  return ctx.apps
    .filter((a) => a.stack === "svelte")
    .map((app): DoctorItem => {
      const dir = resolve(ctx.root, app.path);
      const id = `svelte:${app.path}`;
      const label = `Svelte / SvelteKit (${app.path === "." ? "this folder" : app.path})`;
      const unsupported = svelteUnsupported(dir);
      if (unsupported !== null) return { id, status: "optional", label, detail: unsupported };
      const svelte = packageVersion(dir, "svelte");
      const lead = `Svelte${shown(svelte)}`;
      const missing = svelte === null ? NO_VERSION : "";
      if (isSvelteKit(dir)) {
        const kit = packageVersion(dir, "@sveltejs/kit");
        const node = (kit?.major ?? 0) >= 3 ? nodeVersion(deps) : null;
        if (node && older(node.parts, KIT_3_NODE)) {
          return {
            id,
            status: "needed",
            label,
            detail: `SvelteKit 3 needs Node.js 22.17 or later; this computer has ${node.text}. Install a newer Node.js from nodejs.org.`,
          };
        }
        return { id, status: "ok", label, detail: `${lead}${missing} with SvelteKit${kit === null ? " (version not found in package.json)" : shown(kit)}.` };
      }
      const vite = declared(dir, "vite") !== null ? " with Vite" : "";
      return { id, status: "ok", label, detail: `${lead}${vite}${missing}.` };
    });
}
