import { resolve } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { declared, packageVersion, type PackageVersion } from "../../project/package";
import { isNuxt, vueMajor } from "./project";

/** What doctor says for a Vue 2 app (and Nuxt 2), or null for a Vue the app can use. */
export function vueUnsupported(appDir: string): string | null {
  return (vueMajor(appDir) ?? 3) < 3 ? VUE_2 : null;
}

const VUE_2 =
  "Vue 2 isn't supported (it reached its end of life in 2023): Motif supports Vue 3 and Nuxt 3 or later. Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.";

const shown = (v: PackageVersion | null) => (v === null ? "" : v.minor === null ? ` ${v.major}` : ` ${v.major}.${v.minor}`);
const NO_VERSION = " (version not found in package.json)";

/** One item per Vue app: its Vue or Nuxt version, or that Vue 2 isn't supported and what still works. */
export function vueDoctor(_deps: DoctorDeps, ctx: { root: string; apps: AppInfo[] }): DoctorItem[] {
  return ctx.apps
    .filter((a) => a.stack === "vue")
    .map((app): DoctorItem => {
      const dir = resolve(ctx.root, app.path);
      const id = `vue:${app.path}`;
      const label = `Vue / Nuxt (${app.path === "." ? "this folder" : app.path})`;
      const unsupported = vueUnsupported(dir);
      if (unsupported !== null) return { id, status: "optional", label, detail: unsupported };
      if (isNuxt(dir)) {
        const v = packageVersion(dir, "nuxt");
        return { id, status: "ok", label, detail: `Nuxt${v === null ? NO_VERSION : shown(v)}.` };
      }
      const vite = declared(dir, "vite") !== null ? " with Vite" : "";
      const v = packageVersion(dir, "vue");
      return { id, status: "ok", label, detail: `Vue${shown(v)}${vite}${v === null ? NO_VERSION : ""}.` };
    });
}
