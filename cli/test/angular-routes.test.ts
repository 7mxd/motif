import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ANGULAR } from "../src/stacks/angular";
import { discoverAngularRoutes } from "../src/stacks/angular/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const ANGULAR_JSON = (opts: { sourceRoot?: string; main?: string; key?: "browser" | "main" } = {}) => JSON.stringify({
  version: 1,
  projects: {
    ng: {
      projectType: "application",
      root: "",
      sourceRoot: opts.sourceRoot ?? "src",
      architect: { build: { builder: "@angular/build:application", options: { [opts.key ?? "browser"]: opts.main ?? "src/main.ts", styles: ["src/styles.css"] } } },
    },
  },
});
const PKG = JSON.stringify({ dependencies: { "@angular/core": "^21.2.0", "@angular/router": "^21.2.0" } });

/** main.ts as `ng new` writes it (CLI 21 and 22). */
const MAIN = "import { bootstrapApplication } from '@angular/platform-browser';\nimport { appConfig } from './app/app.config';\nimport { App } from './app/app';\n\nbootstrapApplication(App, appConfig)\n  .catch((err) => console.error(err));\n";
const CONFIG = (extra = "") => `import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter${extra ? ", withComponentInputBinding" : ""} } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes${extra})
  ]
};
`;
const COMPONENT = (name: string) => `import { Component } from '@angular/core';\n\n@Component({ selector: 'app-x', template: '<p>x</p>' })\nexport class ${name} {}\n`;

/** A standalone app as `ng new` lays it out, with the given app.routes.ts and other files. */
function standalone(routes: string, files: Record<string, string> = {}, config = CONFIG()): string {
  return makeProject({
    "package.json": PKG,
    "angular.json": ANGULAR_JSON(),
    "src/main.ts": MAIN,
    "src/app/app.ts": COMPONENT("App"),
    "src/app/app.config.ts": config,
    "src/app/app.routes.ts": routes,
    ...files,
  });
}

describe("discoverAngularRoutes", () => {
  test("is the Angular stack's routes", () => {
    expect(ANGULAR.routes).toBe(discoverAngularRoutes);
  });

  test("the ng new starter, with its empty routes, has / only", () => {
    const root = standalone("import { Routes } from '@angular/router';\n\nexport const routes: Routes = [];\n");
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
  });

  test("the ng new --ssr starter reads the browser's routes, not the server's", () => {
    const root = standalone("import { Routes } from '@angular/router';\n\nexport const routes: Routes = [\n  { path: 'about', component: About },\n];\n", {
      "src/main.server.ts": "import { bootstrapApplication } from '@angular/platform-browser';\nimport { App } from './app/app';\nimport { config } from './app/app.config.server';\n\nconst bootstrap = (context) => bootstrapApplication(App, config, context);\nexport default bootstrap;\n",
      "src/app/app.config.server.ts": "import { mergeApplicationConfig } from '@angular/core';\nimport { provideServerRendering, withRoutes } from '@angular/ssr';\nimport { appConfig } from './app.config';\nimport { serverRoutes } from './app.routes.server';\n\nexport const config = mergeApplicationConfig(appConfig, { providers: [provideServerRendering(withRoutes(serverRoutes))] });\n",
      "src/app/app.routes.server.ts": "import { RenderMode, ServerRoute } from '@angular/ssr';\n\nexport const serverRoutes: ServerRoute[] = [\n  { path: '**', renderMode: RenderMode.Prerender }\n];\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/about"], skipped: [] });
  });

  test("the angular-min fixture has /, /settings, and /audit and /calm for motif shot --audit", () => {
    expect(discoverAngularRoutes(join(import.meta.dir, "fixtures", "angular-min"))).toEqual({ routes: ["/", "/audit", "/calm", "/settings"], skipped: [] });
  });

  test("component and loadComponent pages, pathMatch, titles, redirects, :id and **", () => {
    const root = standalone(`import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Tools } from './tools/tools';
import { NotFound } from './not-found/not-found';

export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full', title: 'Home' },
  // { path: 'commented', component: Tools },
  { path: 'tools', component: Tools, title: 'Tools' },
  { path: 'tools/:id', loadComponent: () => import('./tool/tool').then(m => m.Tool) },
  { path: "settings", loadComponent: () => import('./settings/settings').then((m) => m.Settings) },
  { path: \`help\`, loadComponent: () => import('./help/help') },
  { path: 'old-tools', redirectTo: 'tools', pathMatch: 'full' },
  { path: 'guarded', canMatch: [authGuard] },
  { path: '**', component: NotFound },
];
`);
    // ** is a catch-all, not a page that needs a value: it is left out, as Vue and Svelte leave theirs out.
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/help", "/settings", "/tools"], skipped: ["/tools/:id"] });
  });

  test("an empty path that only redirects isn't a page; / is listed all the same", () => {
    const root = standalone("export const routes: Routes = [\n  { path: '', redirectTo: 'tools', pathMatch: 'full' },\n  { path: 'tools', component: Tools },\n];\n");
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/tools"], skipped: [] });
  });

  test("children are joined to their parent's path; a parent with children is a page only through a '' child", () => {
    const root = standalone(`export const routes: Route[] = [
  {
    path: 'shop',
    component: ShopShell,
    children: [
      { path: '', component: Shop },
      { path: 'cart', component: Cart },
      { path: 'items/:id', component: Item },
    ],
  },
  {
    path: 'account',
    canMatch: [authGuard],
    children: [
      { path: 'profile', component: Profile },
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      { path: 'orders', children: [{ path: 'recent', component: Recent }] },
    ],
  },
  { path: '', component: Layout, children: [{ path: 'about', component: About }] },
];
`);
    expect(discoverAngularRoutes(root)).toEqual({
      routes: ["/", "/about", "/account/orders/recent", "/account/profile", "/shop", "/shop/cart"],
      skipped: ["/shop/items/:id"],
    });
  });

  test("untyped arrays, satisfies Routes, and provideRouter with features after the routes", () => {
    const root = standalone("export const routes = [\n  { path: 'a', component: A },\n] satisfies Routes;\n", {}, CONFIG(", withComponentInputBinding()"));
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/a"], skipped: [] });
  });

  test("loadChildren is followed into the file it imports: a named export, m.routes, a default export, m.default", () => {
    const root = standalone(`export const routes: Routes = [
  { path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'blog', loadChildren: () => import('./blog/routes').then((m) => m.routes) },
  { path: 'docs', loadChildren: () => import('./docs/docs.routes') },
  { path: 'help', loadChildren: () => import('./help/help.routes').then(m => m.default) },
  { path: 'shop', loadChildren: () => import('./shop').then(({ SHOP_ROUTES }) => SHOP_ROUTES) },
];
`, {
      "src/app/admin/admin.routes.ts": "import { Route } from '@angular/router';\n\nexport const ADMIN_ROUTES: Route[] = [\n  { path: '', component: AdminHome },\n  { path: 'users', component: Users },\n  { path: 'users/:id', component: User },\n];\n",
      "src/app/blog/routes.ts": "export const routes: Routes = [{ path: 'posts', loadComponent: () => import('./posts') }];\n",
      "src/app/docs/docs.routes.ts": "export default [\n  { path: 'intro', component: Intro },\n] satisfies Routes;\n",
      "src/app/help/help.routes.ts": "const routes: Routes = [{ path: 'faq', component: Faq }];\nexport default routes;\n",
      "src/app/shop/index.ts": "export const SHOP_ROUTES: Routes = [{ path: 'cart', component: Cart }];\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({
      routes: ["/", "/admin", "/admin/users", "/blog/posts", "/docs/intro", "/help/faq", "/shop/cart"],
      skipped: ["/admin/users/:id"],
    });
  });

  test("loadChildren nested in children, and through a re-export, joins every parent path", () => {
    const root = standalone("export const routes: Routes = [\n  { path: 'org', children: [{ path: 'team', loadChildren: () => import('./team/team.routes').then(m => m.TEAM) }] },\n];\n", {
      "src/app/team/team.routes.ts": "export { TEAM } from './team-list';\n",
      "src/app/team/team-list.ts": "export const TEAM: Routes = [{ path: 'members', component: Members }];\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/org/team/members"], skipped: [] });
  });

  test("loadChildren goes no further than 5 files deep, and says so", () => {
    const level = (n: number) => `export const routes: Routes = [{ path: 'l${n}', component: P }, { path: 'n', loadChildren: () => import('./next/r').then(m => m.routes) }];\n`;
    const files: Record<string, string> = {};
    let dir = "src/app/next";
    for (let n = 1; n <= 7; n++, dir += "/next") files[`${dir}/r.ts`] = level(n);
    const root = standalone("export const routes: Routes = [{ path: 'n', loadChildren: () => import('./next/r').then(m => m.routes) }];\n", files);
    const found = discoverAngularRoutes(root);
    expect(found.routes).toEqual(["/", "/n/l1", "/n/n/l2", "/n/n/n/l3", "/n/n/n/n/l4", "/n/n/n/n/n/l5"]);
    expect(found.notes?.length).toBe(1);
    expect(found.notes?.[0]).toContain("--routes");
  });

  test("an imported array spread into the routes is followed; one Motif can't find is left out and named", () => {
    const root = standalone(`import { ADMIN_ROUTES } from './admin/admin.routes';
import { EXTERNAL } from '@acme/routes';

const LOCAL: Routes = [{ path: 'local', component: Local }];

export const routes: Routes = [
  ...LOCAL,
  { path: 'admin', children: [...ADMIN_ROUTES] },
  ...EXTERNAL,
];
`, { "src/app/admin/admin.routes.ts": "export const ADMIN_ROUTES: Routes = [{ path: 'users', component: Users }];\n" });
    const found = discoverAngularRoutes(root);
    expect(found.routes).toEqual(["/", "/admin/users", "/local"]);
    expect(found.notes).toEqual([expect.stringContaining("EXTERNAL")]);
    expect(found.notes?.[0]).toContain("--routes");
  });

  test("routes given to provideRouter in main.ts itself", () => {
    const root = makeProject({
      "package.json": PKG,
      "angular.json": ANGULAR_JSON(),
      "src/main.ts": "import { bootstrapApplication } from '@angular/platform-browser';\nimport { provideRouter, withComponentInputBinding } from '@angular/router';\nimport { App } from './app/app';\n\nbootstrapApplication(App, {\n  providers: [provideRouter([{ path: 'x', component: X }, { path: 'y/:id', component: Y }], withComponentInputBinding())],\n});\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/x"], skipped: ["/y/:id"] });
  });

  test("an NgModule app: RouterModule.forRoot in its routing module, and a lazy module's RouterModule.forChild", () => {
    const root = makeProject({
      "package.json": PKG,
      "angular.json": ANGULAR_JSON({ key: "main" }),
      "src/main.ts": "import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';\nimport { AppModule } from './app/app.module';\n\nplatformBrowserDynamic().bootstrapModule(AppModule)\n  .catch(err => console.error(err));\n",
      "src/app/app.module.ts": "import { NgModule } from '@angular/core';\nimport { BrowserModule } from '@angular/platform-browser';\nimport { AppRoutingModule } from './app-routing.module';\nimport { AppComponent } from './app.component';\n\n@NgModule({ declarations: [AppComponent], imports: [BrowserModule, AppRoutingModule], bootstrap: [AppComponent] })\nexport class AppModule { }\n",
      "src/app/app.component.ts": COMPONENT("AppComponent"),
      "src/app/app-routing.module.ts": "import { NgModule } from '@angular/core';\nimport { RouterModule, Routes } from '@angular/router';\n\nconst routes: Routes = [\n  { path: '', component: HomeComponent },\n  { path: 'heroes', component: HeroesComponent },\n  { path: 'detail/:id', component: HeroDetailComponent },\n  { path: 'admin', loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) },\n];\n\n@NgModule({\n  imports: [RouterModule.forRoot(routes)],\n  exports: [RouterModule]\n})\nexport class AppRoutingModule { }\n",
      "src/app/admin/admin.module.ts": "import { NgModule } from '@angular/core';\nimport { AdminRoutingModule } from './admin-routing.module';\n\n@NgModule({ imports: [AdminRoutingModule] })\nexport class AdminModule { }\n",
      "src/app/admin/admin-routing.module.ts": "import { RouterModule } from '@angular/router';\n\n@NgModule({ imports: [RouterModule.forChild([{ path: 'audit', component: Audit }])] })\nexport class AdminRoutingModule { }\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/admin/audit", "/heroes"], skipped: ["/detail/:id"] });
  });

  test("RouterModule.forRoot([...]) inline in the app module", () => {
    const root = makeProject({
      "package.json": PKG,
      "angular.json": ANGULAR_JSON({ key: "main" }),
      "src/main.ts": "import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';\nimport { AppModule } from './app/app.module';\n\nplatformBrowserDynamic().bootstrapModule(AppModule);\n",
      "src/app/app.module.ts": "@NgModule({ imports: [BrowserModule, RouterModule.forRoot([\n  { path: 'crisis-center', component: CrisisListComponent },\n  { path: 'heroes', component: HeroListComponent },\n], { useHash: false })] })\nexport class AppModule { }\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/crisis-center", "/heroes"], skipped: [] });
  });

  test("the 2016 file names: app.component.ts, app.config.ts, app.routes.ts and HomeComponent", () => {
    const root = makeProject({
      "package.json": PKG,
      "angular.json": ANGULAR_JSON(),
      "src/main.ts": MAIN.replace("./app/app'", "./app/app.component'").replace(/\bApp\b/g, "AppComponent"),
      "src/app/app.component.ts": COMPONENT("AppComponent"),
      "src/app/app.config.ts": CONFIG(),
      "src/app/app.routes.ts": "import { Routes } from '@angular/router';\nimport { HomeComponent } from './home/home.component';\n\nexport const routes: Routes = [\n  { path: '', component: HomeComponent },\n  { path: 'about', loadComponent: () => import('./about/about.component').then(m => m.AboutComponent) },\n];\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/about"], skipped: [] });
  });

  test("a sourceRoot other than src: main.ts is where angular.json says", () => {
    const root = makeProject({
      "package.json": PKG,
      "angular.json": ANGULAR_JSON({ sourceRoot: "projects/web/src", main: "projects/web/src/main.ts" }),
      "projects/web/src/main.ts": MAIN,
      "projects/web/src/app/app.config.ts": CONFIG(),
      "projects/web/src/app/app.routes.ts": "export const routes: Routes = [{ path: 'inbox', component: Inbox }];\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/inbox"], skipped: [] });
  });

  test("provideRouter with withHashLocation(): pages are /#/…, lazy children too; / stays /", () => {
    const root = standalone("export const routes: Routes = [\n  { path: '', component: Home },\n  { path: 'tools', component: Tools },\n  { path: 'tools/:id', component: Tool },\n  { path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES) },\n];\n", {
      "src/app/admin/admin.routes.ts": "export const ADMIN_ROUTES: Routes = [{ path: 'users', component: Users }, { path: 'shop', children: [{ path: 'cart', component: Cart }] }];\n",
    }, CONFIG(", withHashLocation()").replace("withComponentInputBinding", "withHashLocation"));
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/#/admin/shop/cart", "/#/admin/users", "/#/tools"], skipped: ["/#/tools/:id"] });
  });

  test("RouterModule.forRoot(routes, { useHash: true }): pages are /#/…, a lazy module's too", () => {
    const root = makeProject({
      "package.json": PKG,
      "angular.json": ANGULAR_JSON({ key: "main" }),
      "src/main.ts": "import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';\nimport { AppModule } from './app/app.module';\n\nplatformBrowserDynamic().bootstrapModule(AppModule);\n",
      "src/app/app.module.ts": "const routes: Routes = [\n  { path: 'heroes', component: HeroList },\n  { path: 'admin', loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) },\n];\n\n@NgModule({ imports: [BrowserModule, RouterModule.forRoot(routes, { useHash: true })] })\nexport class AppModule { }\n",
      "src/app/admin/admin.module.ts": "@NgModule({ imports: [RouterModule.forChild([{ path: 'audit', component: Audit }])] })\nexport class AdminModule { }\n",
    });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/", "/#/admin/audit", "/#/heroes"], skipped: [] });
  });

  test("useHash: false and other features keep plain addresses", () => {
    const root = standalone("export const routes: Routes = [{ path: 'a', component: A }];\n", {}, CONFIG(", withComponentInputBinding()"));
    expect(discoverAngularRoutes(root).routes).toEqual(["/", "/a"]);
  });

  test("an array that includes itself through children is read once, with a note, not without end", () => {
    const root = standalone("export const routes: Routes = [\n  { path: 'a', component: A },\n  { path: 'k', children: [...routes] },\n];\n");
    const found = discoverAngularRoutes(root);
    expect(found.routes).toEqual(["/", "/a"]);
    expect(found.notes).toEqual([expect.stringContaining("src/app/app.routes.ts")]);
    expect(found.notes?.[0]).toContain("--routes");
  });

  test("a path that isn't a quoted string gets one note naming its file", () => {
    const root = standalone("import { ROUTES } from './paths';\n\nexport const routes: Routes = [\n  { path: ROUTES.tools, component: Tools },\n  { path: ROUTES.settings, component: Settings },\n  { path: 'about', component: About },\n];\n");
    const found = discoverAngularRoutes(root);
    expect(found.routes).toEqual(["/", "/about"]);
    expect(found.notes).toEqual([expect.stringContaining("src/app/app.routes.ts")]);
    expect(found.notes?.[0]).toContain("ROUTES.tools");
    expect(found.notes?.[0]).toContain("--routes");
  });

  test("an app with no main.ts Motif can read has / only", () => {
    const root = makeProject({ "package.json": PKG, "angular.json": ANGULAR_JSON() });
    expect(discoverAngularRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
  });
});
