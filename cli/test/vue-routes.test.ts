import { afterAll, describe, expect, test } from "bun:test";
import { discoverVueRoutes } from "../src/stacks/vue/routes";
import { VUE } from "../src/stacks/vue";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const SFC = "<template><div /></template>\n";
const vuePkg = JSON.stringify({ dependencies: { vue: "^3.5.0", "vue-router": "^4.5.0" } });

const STARTER_ROUTER = `import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue') },
  ],
})

export default router
`;

describe("discoverVueRoutes", () => {
  test("is the Vue stack's routes", () => {
    expect(VUE.routes).toBe(discoverVueRoutes);
  });

  test("the create-vue starter has / and /about", () => {
    const root = makeProject({ "package.json": vuePkg, "src/router/index.ts": STARTER_ROUTER, "src/main.ts": "import router from './router'\n" });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/", "/about"], skipped: [] });
  });

  test("the create-nuxt starter, with no pages, has / only", () => {
    const root = makeProject({ "package.json": JSON.stringify({ dependencies: { nuxt: "^4.0.0", vue: "^3.5.0" } }), "app/app.vue": SFC });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
  });

  test("a Nuxt page drawn only on the client or the server is its route, without .client or .server", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "^4.0.0" } }),
      "app/pages/index.client.vue": SFC,
      "app/pages/about.client.vue": SFC,
      "app/pages/terms.server.vue": SFC,
    });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/", "/about", "/terms"], skipped: [] });
  });

  test("Nuxt's pages folder", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "^4.0.0" } }),
      "app/pages/index.vue": SFC,
      "app/pages/about.vue": SFC,
      "app/pages/users/index.vue": SFC,
      "app/pages/users/[id].vue": SFC,
      "app/pages/blog/[[slug]].vue": SFC,
      "app/pages/docs/[...all].vue": SFC,
      "app/pages/(auth)/login.vue": SFC,
      "app/pages/-partials/card.vue": SFC,
      "app/pages/_draft.vue": SFC,
      "app/pages/about.test.vue": SFC,
      "app/pages/parent.vue": SFC,
      "app/pages/parent/child.vue": SFC,
    });
    expect(discoverVueRoutes(root)).toEqual({
      routes: ["/", "/about", "/login", "/parent", "/parent/child", "/users"],
      skipped: ["/blog/[[slug]]", "/docs/[...all]", "/users/[id]"],
    });
  });

  test("a Nuxt 3 app reads pages/ at its root", () => {
    const root = makeProject({ "package.json": JSON.stringify({ dependencies: { nuxt: "^3.15.0" } }), "pages/index.vue": SFC, "pages/pricing.vue": SFC });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/", "/pricing"], skipped: [] });
  });

  test("a Nuxt srcDir from nuxt.config", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ dependencies: { nuxt: "^3.15.0" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ srcDir: 'client/' })\n",
      "client/pages/team.vue": SFC,
    });
    expect(discoverVueRoutes(root).routes).toEqual(["/", "/team"]);
  });

  test("unplugin-vue-router's src/pages", () => {
    const root = makeProject({
      "package.json": vuePkg,
      "vite.config.ts": "import VueRouter from 'unplugin-vue-router/vite'\nexport default { plugins: [VueRouter()] }\n",
      "src/pages/index.vue": SFC,
      "src/pages/settings.vue": SFC,
      "src/pages/u/[id].vue": SFC,
    });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/", "/settings"], skipped: ["/u/[id]"] });
  });

  test("children join their parent, an empty child is the parent, :id goes to skipped", () => {
    const root = makeProject({
      "package.json": vuePkg,
      "src/router.ts": `import { createRouter } from 'vue-router'
export default createRouter({ history, routes: [
  { path: '/', component: Home },
  { path: '/user', component: Layout, children: [
    { path: '', component: Overview },
    { path: 'profile', component: Profile },
    { path: ':id', component: User },
  ] },
  { path: '/team', children: [{ path: 'members', component: M }] },
] })
`,
    });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/", "/team/members", "/user", "/user/profile"], skipped: ["/user/:id"] });
  });

  test("a separate routes array, catch-alls, redirects and comments", () => {
    const root = makeProject({
      "package.json": vuePkg,
      "src/router/routes.ts": `import type { RouteRecordRaw } from 'vue-router'
export const routes: RouteRecordRaw[] = [
  { path: '/', component: Home },
  { path: '/old', redirect: '/new' },
  { path: '/new', component: New },
  { path: '/docs/:slug', component: Doc },
  { path: '/:pathMatch(.*)*', component: NotFound },
  // { path: '/hidden', component: Hidden },
  /* { path: '/also-hidden', component: Hidden }, */
]
`,
      "src/router/index.ts": "import { createRouter } from 'vue-router'\nimport { routes } from './routes'\nexport default createRouter({ history, routes })\n",
    });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/", "/new"], skipped: ["/docs/:slug"] });
  });

  test("an app with no router has / only", () => {
    const root = makeProject({ "package.json": vuePkg, "src/App.vue": SFC });
    expect(discoverVueRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
  });
});
