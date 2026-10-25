import { resolve } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { nodeFloor, nodeVersion } from "../../project/node-floor";
import { declared, packageVersion } from "../../project/package";
import { NO_VERSION, shown } from "../web-doctor";
import { beforeSvelte5, isSvelteKit } from "./project";

const SVELTE_4 =
  "Svelte 4 isn't supported: Motif supports Svelte 5 (runes). Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.";

/** What doctor says for a Svelte 4 (or earlier) app or SvelteKit 1, or null for a version the app can use. */
export function svelteUnsupported(appDir: string): string | null {
  return beforeSvelte5(appDir) ? SVELTE_4 : null;
}

/** SvelteKit 3's floor: its engines say Node.js 22.17 or later. */
const KIT_3_NODE = ">=22.17.0";

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
        if (node !== null && !nodeFloor(KIT_3_NODE, node)) {
          return {
            id,
            status: "needed",
            label,
            detail: `SvelteKit 3 needs Node.js 22.17 or later; this computer has ${node}. Install a newer Node.js from nodejs.org.`,
          };
        }
        return { id, status: "ok", label, detail: `${lead}${missing} with SvelteKit${kit === null ? NO_VERSION : shown(kit)}.` };
      }
      const vite = declared(dir, "vite") !== null ? " with Vite" : "";
      return { id, status: "ok", label, detail: `${lead}${vite}${missing}.` };
    });
}
