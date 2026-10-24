import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectApps } from "../src/detect/stacks";
import { declared, installedVersion, installRoot, packageManager, packageVersion } from "../src/project/package";
import { svelteDoctor, svelteUnsupported } from "../src/stacks/svelte/doctor";
import { isSvelteKit, kitMajor, routesDir, svelteMajor, svelteSrcDir } from "../src/stacks/svelte/project";
import { webStack, webStacks } from "../src/stacks/web";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) => JSON.stringify({ name: "app", dependencies: deps, devDependencies: dev });
const paths = (files: { path: string }[]) => files.map((f) => f.path);
const svelte = () => webStack("svelte")!;
const app = (path: string) => ({ path, stack: "svelte" as const, source: "detected" as const });

// npx sv create (minimal, TypeScript), with its "demo" routes.
const kitStarter = () => makeProject({
  "package.json": pkg({}, { "@sveltejs/kit": "^2.70.0", "@sveltejs/adapter-auto": "^6.0.0", "@sveltejs/vite-plugin-svelte": "^6.0.0", svelte: "^5.57.0", vite: "^7.0.0", typescript: "^5.0.0" }),
  "node_modules/svelte/package.json": JSON.stringify({ version: "5.57.1" }),
  "node_modules/@sveltejs/kit/package.json": JSON.stringify({ version: "2.70.3" }),
  "svelte.config.js": "export default { kit: { adapter: adapter() } };\n",
  "vite.config.ts": "export default {}",
  "src/app.html": "<html>%sveltekit.head%</html>",
  "src/app.css": ":root { --color-bg: #ffffff; }\n",
  "src/app.d.ts": "export {}",
  "src/lib/index.ts": "export {}\n",
  "src/routes/+layout.svelte": "<script>let { children } = $props();</script>{@render children()}",
  "src/routes/+page.svelte": "<h1>Welcome</h1>",
  "src/routes/about/+page.svelte": "<h1>About</h1>",
  "src/routes/sverdle/+page.svelte": "<h1>Sverdle</h1>",
  "src/routes/sverdle/+page.server.ts": "export {}",
  ".svelte-kit/generated/root.svelte": "x",
  ".svelte-kit/output/a.js": "x",
  "static/favicon.png": "x",
});

// npm create vite with the Svelte template (TypeScript).
const viteStarter = () => makeProject({
  "package.json": pkg({}, { svelte: "^5.55.0", vite: "^7.0.0", "@sveltejs/vite-plugin-svelte": "^6.0.0", typescript: "~5.8.0" }),
  "node_modules/svelte/package.json": JSON.stringify({ version: "5.55.2" }),
  "index.html": '<div id="app"></div>',
  "svelte.config.js": "export default {}\n",
  "vite.config.ts": "export default {}",
  "src/main.ts": "import './app.css'\n",
  "src/App.svelte": "<main />",
  "src/app.css": ":root { --c: #fff; }\n",
  "src/lib/Counter.svelte": "<button />",
  "src/vite-env.d.ts": "x",
  "public/vite.svg": "x",
});

const fakeDeps = (run?: (cmd: string[]) => { code: number; stdout: string }) => ({
  platform: "linux" as const, arch: "x64", home: "/h", findBrowser: () => null, which: () => null, ...(run ? { run } : {}),
});

describe("the web-stack registry", () => {
  test("Vue and Svelte are registered and the others are not", () => {
    expect(webStacks().map((s) => s.id)).toEqual(["vue", "svelte"]);
    expect(svelte().extensions).toEqual([".svelte"]);
    expect(webStack("react-web")).toBeNull();
  });
});

describe("Svelte and SvelteKit projects", () => {
  test("the SvelteKit starter: versions, routes and source folders", () => {
    const dir = kitStarter();
    expect(isSvelteKit(dir)).toBe(true);
    expect(svelteMajor(dir)).toBe(5);
    expect(kitMajor(dir)).toBe(2);
    expect(routesDir(dir)).toBe("src/routes");
    expect(svelteSrcDir(dir)).toBe("src");
    expect(svelte().srcDir(dir)).toBe("src");
    expect(detectApps(dir).apps.map((a) => [a.path, a.stack])).toEqual([[".", "svelte"]]);
  });

  test("the Vite starter: Svelte only", () => {
    const dir = viteStarter();
    expect(isSvelteKit(dir)).toBe(false);
    expect(svelteMajor(dir)).toBe(5);
    expect(kitMajor(dir)).toBeNull();
    expect(detectApps(dir).apps.map((a) => [a.path, a.stack])).toEqual([[".", "svelte"]]);
  });

  test("the SvelteKit starter's sources: .svelte, scripts and CSS, not .svelte-kit, types or config", () => {
    expect(paths(svelte().sourceFiles(kitStarter(), app("."), {}))).toEqual([
      "src/app.css", "src/app.html", "src/lib/index.ts", "src/routes/+layout.svelte", "src/routes/+page.svelte",
      "src/routes/about/+page.svelte", "src/routes/sverdle/+page.server.ts", "src/routes/sverdle/+page.svelte",
    ]);
  });

  test("the Vite starter's sources", () => {
    const files = svelte().sourceFiles(viteStarter(), app("."), {});
    expect(paths(files)).toEqual(["index.html", "src/App.svelte", "src/app.css", "src/lib/Counter.svelte", "src/main.ts"]);
    expect(files.find((f) => f.path === "src/App.svelte")!.lang).toBe("markup");
  });

  test("kit.files.routes as a string literal moves the routes folder; anything else keeps src/routes", () => {
    const at = (config: string) => routesDir(makeProject({ "package.json": pkg({ "@sveltejs/kit": "^2.0.0", svelte: "^5.0.0" }), "svelte.config.js": config }));
    expect(at("export default { kit: { files: { routes: 'src/pages' } } };")).toBe("src/pages");
    expect(at('export default {\n  kit: {\n    adapter: adapter(),\n    files: {\n      lib: "src/lib",\n      routes: "./app/routes/",\n    },\n  },\n};')).toBe("app/routes");
    expect(at("export default { kit: { files: { routes: join('src', 'x') } } };")).toBe("src/routes");
    expect(at("export default { kit: { files: { routes: `src/${name}` } } };")).toBe("src/routes");
    expect(at("export default {}")).toBe("src/routes");
    const ts = makeProject({ "package.json": "{}", "svelte.config.ts": "export default { kit: { files: { routes: 'src/site' } } };" });
    expect(routesDir(ts)).toBe("src/site");
    expect(routesDir(makeProject({ "package.json": "{}" }))).toBe("src/routes");
  });

  test("a monorepo: apps/web (SvelteKit) beside apps/admin (Vue), each read on its own", () => {
    const root = makeProject({
      "package.json": "{}",
      "apps/web/package.json": pkg({}, { "@sveltejs/kit": "^2.70.0", svelte: "^5.57.0" }),
      "apps/web/src/routes/+page.svelte": "x", "apps/web/.svelte-kit/a.svelte": "x",
      "apps/admin/package.json": pkg({ vue: "^3.5.0" }, { vite: "^6.0.0" }),
      "apps/admin/src/App.vue": "x",
    });
    const apps = detectApps(root).apps;
    expect(apps.map((a) => [a.path, a.stack])).toEqual([["apps/admin", "vue"], ["apps/web", "svelte"]]);
    expect(paths(svelte().sourceFiles(root, apps[1]!, {}))).toEqual(["apps/web/src/routes/+page.svelte"]);
    expect(paths(webStack("vue")!.sourceFiles(root, apps[0]!, {}))).toEqual(["apps/admin/src/App.vue"]);
  });

  test("Svelte 4 and SvelteKit 1 are unsupported; Svelte 5 and an unreadable version are not", () => {
    const at = (deps: Record<string, string>) => svelteUnsupported(makeProject({ "package.json": pkg(deps) }));
    expect(at({ svelte: "^4.2.19" })).toStartWith("Svelte 4 isn't supported");
    expect(at({ svelte: "^4.2.19", "@sveltejs/kit": "^2.5.0" })).toStartWith("Svelte 4 isn't supported");
    expect(at({ svelte: "^5.0.0", "@sveltejs/kit": "^1.30.0" })).toStartWith("Svelte 4 isn't supported");
    expect(at({ svelte: "^3.59.0" })).not.toBeNull();
    expect(at({ svelte: "^5.0.0" })).toBeNull();
    expect(at({ svelte: "workspace:*" })).toBeNull();
    expect(at({})).toBeNull();
    expect(svelte().unsupported!(makeProject({ "package.json": pkg({ svelte: "^4.0.0" }) }))).not.toBeNull();
  });

  test("a Svelte 4 app is still read: its .svelte files are sources", () => {
    const root = makeProject({ "package.json": pkg({ svelte: "^4.2.19" }), "src/App.svelte": "x", "src/main.js": "x" });
    expect(paths(svelte().sourceFiles(root, app("."), {}))).toEqual(["src/App.svelte", "src/main.js"]);
  });

  test("the doctor item for each app, and the Svelte 4 line", () => {
    const doctor = (dir: string) => svelteDoctor(fakeDeps(), { root: dir, apps: [app(".")] })[0]!;
    expect(doctor(kitStarter())).toMatchObject({ id: "svelte:.", status: "ok", detail: "Svelte 5.57 with SvelteKit 2.70." });
    expect(doctor(viteStarter())).toMatchObject({ status: "ok", detail: "Svelte 5.55 with Vite." });
    expect(doctor(makeProject({ "package.json": pkg({ svelte: "^4.2.19" }) }))).toMatchObject({ status: "optional" });
    expect(doctor(makeProject({ "package.json": pkg({ svelte: "workspace:*", "@sveltejs/kit": "workspace:*" }) })).detail).toBe(
      "Svelte (version not found in package.json) with SvelteKit (version not found in package.json).",
    );
  });
});

describe("SvelteKit 3 and Node.js", () => {
  const kit3 = () => makeProject({ "package.json": pkg({}, { "@sveltejs/kit": "^3.0.1", svelte: "^5.60.0" }) });
  const doctor = (dir: string, stdout: string | null) =>
    svelteDoctor(fakeDeps(stdout === null ? undefined : () => ({ code: 0, stdout })), { root: dir, apps: [app(".")] })[0]!;

  test("an older Node.js is told to update", () => {
    expect(doctor(kit3(), "v22.14.0\n")).toMatchObject({
      status: "needed",
      detail: "SvelteKit 3 needs Node.js 22.17 or later; this computer has 22.14.0. Install a newer Node.js from nodejs.org.",
    });
    expect(doctor(kit3(), "v20.19.0")).toMatchObject({ status: "needed" });
  });

  test("22.17, a later 22 and a later major are fine", () => {
    for (const v of ["v22.17.0", "v22.20.1", "v24.1.0"]) expect(doctor(kit3(), v)).toMatchObject({ status: "ok", detail: "Svelte 5.60 with SvelteKit 3.0." });
  });

  test("a Node.js version that can't be read doesn't block", () => {
    expect(doctor(kit3(), null).status).toBe("ok");
    expect(doctor(kit3(), "not a version").status).toBe("ok");
  });

  test("SvelteKit 2 doesn't ask for it", () => {
    expect(doctor(kitStarter(), "v20.19.0").status).toBe("ok");
  });
});

describe("the package helpers (moved to project/package.ts)", () => {
  test("declared, installed and combined versions", () => {
    const dir = makeProject({ "package.json": pkg({ a: "^1.2.3" }, { b: "~2" }), "node_modules/a/package.json": JSON.stringify({ version: "1.4.0" }) });
    expect(declared(dir, "a")).toBe("^1.2.3");
    expect(declared(dir, "b")).toBe("~2");
    expect(declared(dir, "c")).toBeNull();
    expect(installedVersion(dir, "a")).toBe("1.4.0");
    expect(installedVersion(dir, "b")).toBeNull();
    expect(packageVersion(dir, "a")).toEqual({ major: 1, minor: 4 });
    expect(packageVersion(dir, "b")).toEqual({ major: 2, minor: null });
    expect(packageVersion(dir, "c")).toBeNull();
  });

  test("the package manager and install root, through a workspace root", () => {
    const root = makeProject({ "package.json": JSON.stringify({ workspaces: ["apps/*"] }), "pnpm-lock.yaml": "x", "apps/web/package.json": "{}" });
    expect(installRoot(join(root, "apps/web"))).toBe(root);
    expect(packageManager(join(root, "apps/web"))).toBe("pnpm");
    expect(packageManager(makeProject({ "package.json": "{}" }))).toBe("npm");
  });
});
