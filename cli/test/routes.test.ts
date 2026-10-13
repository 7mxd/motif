import { afterAll, describe, expect, test } from "bun:test";
import { discoverRoutes } from "../src/stacks/react-web/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const PAGE = "export default function Page() { return null; }\n";
const pkg = (deps: Record<string, string>) => JSON.stringify({ dependencies: { react: "^19", "react-dom": "^19", ...deps } });

describe("discoverRoutes", () => {
  test("Next.js App Router", () => {
    const root = makeProject({
      "package.json": pkg({ next: "^15" }),
      "app/page.tsx": PAGE,
      "app/layout.tsx": PAGE,
      "app/settings/page.tsx": PAGE,
      "app/(marketing)/about/page.tsx": PAGE,
      "app/posts/[id]/page.tsx": PAGE,
      "app/docs/[...slug]/page.mdx": PAGE,
      "app/@modal/(.)photo/page.tsx": PAGE,
      "app/_components/page.tsx": PAGE,
      "app/dashboard/layout.tsx": PAGE,
      "app/api/health/route.ts": "export function GET() {}\n",
    });
    expect(discoverRoutes(root)).toEqual({ routes: ["/", "/about", "/settings"], skipped: ["/docs/[...slug]", "/posts/[id]"] });
  });

  test("Next.js App Router under src/", () => {
    const root = makeProject({ "package.json": pkg({ next: "^15" }), "src/app/page.tsx": PAGE, "src/app/profile/page.tsx": PAGE });
    expect(discoverRoutes(root).routes).toEqual(["/", "/profile"]);
  });

  test("Next.js Pages Router", () => {
    const root = makeProject({
      "package.json": pkg({ next: "^15" }),
      "pages/index.tsx": PAGE,
      "pages/_app.tsx": PAGE,
      "pages/_document.tsx": PAGE,
      "pages/404.tsx": PAGE,
      "pages/about.tsx": PAGE,
      "pages/blog/index.tsx": PAGE,
      "pages/blog/[slug].tsx": PAGE,
      "pages/blog/post.test.tsx": PAGE,
      "pages/api/hello.ts": PAGE,
    });
    expect(discoverRoutes(root)).toEqual({ routes: ["/", "/about", "/blog"], skipped: ["/blog/[slug]"] });
  });

  test("React Router route objects and <Route> elements", () => {
    const root = makeProject({
      "package.json": pkg({ "react-router-dom": "^7", vite: "^6" }),
      "src/main.tsx": `import { createBrowserRouter } from "react-router-dom";
export const router = createBrowserRouter([{ path: "/", element: null }, { path: "/settings", element: null }, { path: "/users/:id", element: null }, { path: "*", element: null }]);
`,
      "src/App.tsx": `import { Route, Routes } from "react-router-dom";
export const App = () => (<Routes><Route path="/about" element={null} /><Route path="/about/" element={null} /></Routes>);
`,
      "src/api.ts": `export const endpoints = [{ path: "/api/users" }];\n`,
    });
    expect(discoverRoutes(root)).toEqual({ routes: ["/", "/about", "/settings"], skipped: ["/users/:id"] });
  });

  test("other apps get the home page only, even with a src/pages folder", () => {
    const root = makeProject({ "package.json": pkg({ vite: "^6" }), "src/pages/Home.tsx": PAGE, "src/main.tsx": "" });
    expect(discoverRoutes(root)).toEqual({ routes: ["/"], skipped: [] });
    expect(discoverRoutes(makeProject({}))).toEqual({ routes: ["/"], skipped: [] });
  });
});
