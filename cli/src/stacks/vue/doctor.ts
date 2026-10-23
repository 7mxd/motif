import { resolve } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { declared } from "../react-native/project";
import { isNuxt, packageVersion, vueMajor, type PackageVersion } from "./project";

const VUE_2 =
  "Vue 2 isn't supported (it reached its end of life in 2023): Motif supports Vue 3 and Nuxt 3 or later. Theme code (CSS only), checks and drafts still work; for screenshots, start the app and pass its address to motif shot --url.";

const shown = (v: PackageVersion | null) => (v === null ? "" : v.minor === null ? ` ${v.major}` : ` ${v.major}.${v.minor}`);

/** One item per Vue app: its Vue or Nuxt version, or that Vue 2 isn't supported and what still works. */
export function vueDoctor(_deps: DoctorDeps, ctx: { root: string; apps: AppInfo[] }): DoctorItem[] {
  return ctx.apps
    .filter((a) => a.stack === "vue")
    .map((app): DoctorItem => {
      const dir = resolve(ctx.root, app.path);
      const id = `vue:${app.path}`;
      const label = `Vue / Nuxt (${app.path === "." ? "this folder" : app.path})`;
      const major = vueMajor(dir);
      if (major !== null && major < 3) return { id, status: "optional", label, detail: VUE_2 };
      if (isNuxt(dir)) return { id, status: "ok", label, detail: `Nuxt${shown(packageVersion(dir, "nuxt"))}.` };
      const vite = declared(dir, "vite") !== null ? " with Vite" : "";
      return { id, status: "ok", label, detail: `Vue${shown(packageVersion(dir, "vue"))}${vite}.` };
    });
}
