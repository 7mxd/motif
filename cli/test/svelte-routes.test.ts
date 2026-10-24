import { afterAll, describe, expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { SVELTE } from "../src/stacks/svelte";
import { discoverSvelteRoutes } from "../src/stacks/svelte/routes";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const PAGE = "<h1>page</h1>\n";
const kitPkg = JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.70.0", svelte: "^5.0.0" } });
const vitePkg = JSON.stringify({ devDependencies: { svelte: "^5.0.0", vite: "^7.0.0" } });
const kit = (files: Record<string, string>) => makeProject({ "package.json": kitPkg, ...files });

describe("discoverSvelteRoutes", () => {
  test("is the Svelte stack's routes", () => {
    expect(SVELTE.routes).toBe(discoverSvelteRoutes);
  });

  test("the sv minimal starter fixture has / and /settings", () => {
    const root = tempDir("motif-svelte-min-");
    cpSync(join(import.meta.dir, "fixtures", "svelte-min"), root, { recursive: true });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/settings"], skipped: [] });
  });

  test("the sv demo template's folders: /, /about, /sverdle and /sverdle/how-to-play", () => {
    const fixture = tempDir("motif-svelte-demo-");
    cpSync(join(import.meta.dir, "fixtures", "svelte-kit-demo"), fixture, { recursive: true });
    // The fixture keeps only the demo's layout, so its one page is /.
    expect(discoverSvelteRoutes(fixture)).toEqual({ routes: ["/"], skipped: [] });
    const root = kit({
      "src/routes/+layout.svelte": "{@render children()}\n",
      "src/routes/+page.svelte": PAGE,
      "src/routes/about/+page.svelte": PAGE,
      "src/routes/about/+page.ts": "export const csr = false;\n",
      "src/routes/sverdle/+page.svelte": PAGE,
      "src/routes/sverdle/+page.server.ts": "export const actions = {};\n",
      "src/routes/sverdle/how-to-play/+page.svelte": PAGE,
      "src/routes/sverdle/how-to-play/+page.ts": "export const csr = false;\n",
      "src/routes/sverdle/game.ts": "export class Game {}\n",
    });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/about", "/sverdle", "/sverdle/how-to-play"], skipped: [] });
  });

  test("groups add no segment, layout resets are still pages", () => {
    const root = kit({
      "src/routes/(app)/dashboard/+page.svelte": PAGE,
      "src/routes/(app)/(admin)/users/+page.svelte": PAGE,
      "src/routes/(marketing)/+page.svelte": PAGE,
      "src/routes/reset/+page@.svelte": PAGE,
      "src/routes/reset-group/+page@(app).svelte": PAGE,
      "src/routes/reset-id/+page@[id].svelte": PAGE,
    });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/dashboard", "/reset", "/reset-group", "/reset-id", "/users"], skipped: [] });
  });

  test("[slug], [...rest] and [id=integer] go to skipped", () => {
    const root = kit({
      "src/routes/+page.svelte": PAGE,
      "src/routes/blog/[slug]/+page.svelte": PAGE,
      "src/routes/docs/[...path]/+page.svelte": PAGE,
      "src/routes/items/[id=integer]/+page.svelte": PAGE,
      "src/routes/p/prefix-[id]/+page.svelte": PAGE,
      "src/routes/shop/+page.svelte": PAGE,
    });
    expect(discoverSvelteRoutes(root)).toEqual({
      routes: ["/", "/shop"],
      skipped: ["/blog/[slug]", "/docs/[...path]", "/items/[id=integer]", "/p/prefix-[id]"],
    });
  });

  test("[[lang]] lists the form without it and skips the one with it", () => {
    const root = kit({
      "src/routes/[[lang]]/+page.svelte": PAGE,
      "src/routes/[[lang]]/about/+page.svelte": PAGE,
      "src/routes/[[lang]]/blog/[slug]/+page.svelte": PAGE,
    });
    expect(discoverSvelteRoutes(root)).toEqual({
      routes: ["/", "/about"],
      skipped: ["/[[lang]]", "/[[lang]]/about", "/[[lang]]/blog/[slug]", "/blog/[slug]"],
    });
  });

  test("files that are not pages: +page.server.ts, +server.ts, layouts, +error.svelte, tests", () => {
    const root = kit({
      "src/routes/+page.svelte": PAGE,
      "src/routes/api/+server.ts": "export const GET = () => new Response();\n",
      "src/routes/data/+page.server.ts": "export const load = () => ({});\n",
      "src/routes/data/+page.ts": "export const load = () => ({});\n",
      "src/routes/only-layout/+layout.svelte": PAGE,
      "src/routes/only-layout/+layout.ts": "export const ssr = false;\n",
      "src/routes/broken/+error.svelte": PAGE,
      "src/routes/tests/+page.test.svelte": PAGE,
      "src/routes/real/+page.svelte": PAGE,
      "src/routes/real/Widget.svelte": PAGE,
    });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/real"], skipped: [] });
  });

  test("kit.files.routes names another folder", () => {
    const root = kit({
      "svelte.config.js": "export default { kit: { files: { routes: 'app/routes' } } };\n",
      "app/routes/+page.svelte": PAGE,
      "app/routes/team/+page.svelte": PAGE,
      "src/routes/ignored/+page.svelte": PAGE,
    });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/team"], skipped: [] });
  });

  test("a SvelteKit app with no routes folder has / only", () => {
    expect(discoverSvelteRoutes(kit({}))).toEqual({ routes: ["/"], skipped: [] });
  });

  test("a route folder named design or build is still a route", () => {
    const root = kit({ "src/routes/design/+page.svelte": PAGE, "src/routes/build/+page.svelte": PAGE });
    expect(discoverSvelteRoutes(root).routes).toEqual(["/", "/build", "/design"]);
  });

  test("the Vite starter has / only", () => {
    const root = makeProject({ "package.json": vitePkg, "src/App.svelte": PAGE, "src/main.ts": "import App from './App.svelte'\n" });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
  });

  test("svelte-spa-router is a hash router: its routes are /#/about, and / stays /; wildcards and :params are skipped, comments are not read", () => {
    const root = makeProject({
      "package.json": vitePkg,
      "src/routes.ts": `import Home from './Home.svelte'
import Router from 'svelte-spa-router'
export const routes = {
  '/': Home,
  '/about': About,
  '/user/:id': User,
  '/files/*': Files,
  // '/hidden': Hidden,
  '*': NotFound,
}
`,
    });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/#/about"], skipped: ["/#/user/:id"] });
  });

  test("svelte-routing's <Route path>", () => {
    const root = makeProject({
      "package.json": vitePkg,
      "src/App.svelte": `<script>
  import { Router, Route } from 'svelte-routing'
</script>
<Router>
  <Route path="/" component={Home} />
  <Route path="/blog/:id" component={Post} />
  <Route path="/contact"><Contact /></Route>
  <Route path={'/pricing'} component={Pricing} />
  <Route path="/*" component={NotFound} />
  <!-- <Route path="/gone" component={Gone} /> -->
</Router>
`,
    });
    expect(discoverSvelteRoutes(root)).toEqual({ routes: ["/", "/contact", "/pricing"], skipped: ["/blog/:id"] });
  });
});
