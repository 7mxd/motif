import { afterAll, describe, expect, test } from "bun:test";
import { composeRunList, composeScreenProblem, discoverComposeScreens, previewSlug } from "../src/stacks/compose/screens";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const GRADLE = 'plugins { alias(libs.plugins.android.application)\n alias(libs.plugins.kotlin.compose) }\nandroid { namespace = "com.x" }\n';
const SRC = "src/main/java/com/x";
const app = (files: Record<string, string>) =>
  makeProject({ "build.gradle.kts": GRADLE, ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`${SRC}/${k}`, v])) });

describe("navigation routes", () => {
  test("NavHost, composable, nested graphs, {arg} routes and constants", () => {
    const dir = app({
      "Routes.kt": `package com.x
const val HOME = "home"
object Routes {
  const val SETTINGS = "settings"
  const val DETAIL = "detail/{id}"
}
`,
      "Nav.kt": `package com.x
@Composable
fun AppNav(nav: NavHostController) {
  NavHost(nav, startDestination = HOME) {
    composable(HOME) { Home() }
    composable("sign-in") { SignIn() }
    composable(route = "detail/{id}") { Detail() }
    composable(Routes.DETAIL) { Detail() }
    // composable("commented")
    navigation(startDestination = "a", route = Routes.SETTINGS) {
      composable("a") { A() }
      composable("b") { B() }
    }
  }
}
`,
    });
    const r = discoverComposeScreens(dir);
    expect(r.routes).toEqual(["/", "/home", "/sign-in", "/settings", "/a", "/b"]);
    expect(r.skipped).toEqual(["/detail/{id}"]);
  });

  test("type-safe routes: objects and all-default data classes are listed with @, others skipped", () => {
    const dir = app({
      "Nav.kt": `package com.x
@Serializable object Profile
@Serializable data class Item(val id: String = "")
@Serializable data class Detail(val id: String)
fun G(nav: NavHostController) = NavHost(nav, startDestination = Profile) {
  composable<Profile> { }
  composable<Item> { }
  composable<Detail> { }
}
`,
    });
    const r = discoverComposeScreens(dir);
    expect(r.routes).toEqual(["/", "@Profile", "@Item"]);
    expect(r.skipped).toEqual(["@Detail"]);
  });

  test("only / with a note when routes are built at run time", () => {
    const dir = app({ "Nav.kt": `package com.x\nfun G() = NavHost(nav, startDestination = start) { composable(route) { } }\n` });
    const r = discoverComposeScreens(dir);
    expect(r.routes).toEqual(["/"]);
    expect(r.notes?.[0]).toContain("--routes");
  });
});

describe("previews", () => {
  test("fqn from package and file, JvmName, private, no package", () => {
    const dir = app({
      "ui/HomeScreen.kt": `package com.x.ui
@Preview
@Composable
fun HomeScreenPreview() { Home() }
@Preview(name = "dark", uiMode = 2) @Composable
private fun PrivatePreview() {}
@Composable fun NotAPreview() {}
@Preview @Composable fun WithArg(x: Int) {}
class Foo { @Preview @Composable fun Inner() {} }
`,
      "ui/Other.kt": `@file:JvmName("Previews")
package com.x.ui
@Preview @Composable fun OtherPreview() {}
`,
      "Bare.kt": `@Preview @Composable fun BarePreview() {}\n`,
    });
    const r = discoverComposeScreens(dir);
    expect(r.previews.map((p) => p.fqn).sort()).toEqual([
      "BareKt.BarePreview",
      "com.x.ui.HomeScreenKt.HomeScreenPreview",
      "com.x.ui.HomeScreenKt.PrivatePreview",
      "com.x.ui.Previews.OtherPreview",
    ]);
    expect(r.previews.find((p) => p.name === "HomeScreenPreview")?.file).toContain("HomeScreen.kt");
  });

  test("multipreview annotation classes, built-in ones, and @PreviewParameter", () => {
    const dir = app({
      "P.kt": `package com.x
@Preview(name = "light")
@Preview(name = "dark", uiMode = 32)
annotation class Both
@Both
annotation class Nested
@Both @Composable fun APreview() {}
@Nested @Composable fun BPreview() {}
@PreviewLightDark @Composable fun CPreview() {}
@Preview @Composable fun DPreview(@PreviewParameter(P::class) s: String) {}
@Composable fun Plain() {}
`,
    });
    const r = discoverComposeScreens(dir);
    expect(r.previews.map((p) => p.name)).toEqual(["APreview", "BPreview", "CPreview"]);
    expect(r.skippedPreviews.map((p) => p.name)).toEqual(["DPreview"]);
    expect(r.notes?.join(" ")).toContain("DPreview takes a @PreviewParameter");
  });

  test("slugs", () => {
    expect(previewSlug("HomeScreenPreview")).toBe("home-screen");
    expect(previewSlug("HTTPErrorPreview")).toBe("http-error");
    expect(previewSlug("Preview")).toBe("preview");
    expect(previewSlug("Settings2Preview")).toBe("settings2");
  });
});

describe("--screen and the cap", () => {
  const dir = app({
    "A.kt": `package com.x
@Preview @Composable fun APreview() {}
@Preview @Composable fun QPreview(@PreviewParameter(P::class) s: String) {}
`,
    "B.kt": `package com.x.b
@Preview @Composable fun APreview() {}
@Preview @Composable fun BPreview() {}
`,
  });
  test("accepts names and fqns; refuses unknown, parameterised and ambiguous ones, listing the previews", () => {
    expect(composeScreenProblem(dir, [])).toBeNull();
    expect(composeScreenProblem(dir, ["BPreview", "com.x.AKt.APreview"])).toBeNull();
    expect(composeScreenProblem(dir, ["Nope"])).toMatch(/isn't a @Preview function.*Previews found: .*BPreview/);
    expect(composeScreenProblem(dir, ["QPreview"])).toContain("@PreviewParameter");
    expect(composeScreenProblem(dir, ["APreview"])).toContain("Use the full name");
  });
  test("no previews at all says so", () => {
    expect(composeScreenProblem(app({ "A.kt": "package com.x\n" }), ["X"])).toContain("No @Preview functions");
  });
  test("a run takes sign-in first, then /, the routes, the previews, 12 at most", () => {
    const routes = ["/", "/a", "/b", "/sign-in", "/c", "/d", "/e", "/f"];
    const previews = Array.from({ length: 8 }, (_, i) => ({ fqn: `p.K.P${i}`, name: `P${i}`, file: "K.kt" }));
    const run = composeRunList({ routes, previews });
    expect(run.routes).toEqual(["/sign-in", "/", "/a", "/b", "/c", "/d", "/e", "/f"]);
    expect(run.previews.map((p) => p.name)).toEqual(["P0", "P1", "P2", "P3"]);
    expect(run.leftOut).toEqual(["P4", "P5", "P6", "P7"]);
  });
});
