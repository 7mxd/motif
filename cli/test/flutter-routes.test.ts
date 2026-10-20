import { afterAll, describe, expect, test } from "bun:test";
import { discoverFlutterRoutes } from "../src/stacks/flutter/routes";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const PUBSPEC = "name: shop\ndependencies:\n  flutter:\n    sdk: flutter\n";

describe("discoverFlutterRoutes", () => {
  test("GoRoutes, with nested routes joined to their parent's path, and a shell's routes at the top", () => {
    const app = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/app/router.dart": `
import 'package:go_router/go_router.dart';

const signInPath = '/sign-in';

final router = GoRouter(
  initialLocation: '/',
  redirect: (context, state) => null,
  routes: [
    GoRoute(path: '/sign-in', builder: (c, s) => const SignIn()),
    ShellRoute(
      builder: (c, s, child) => Shell(child: child),
      routes: [
        GoRoute(
          path: '/',
          builder: (c, s) => const Home(),
          routes: [
            GoRoute(path: 'settings', builder: (c, s) => const Settings(), routes: [
              GoRoute(path: "notifications", builder: (c, s) => const Notifications()),
            ]),
            GoRoute(path: 'orders/:id', builder: (c, s) => Order(id: s.pathParameters['id']!)),
          ],
        ),
        GoRoute(
          name: 'profile',
          builder: (c, s) => const Profile(),
          path: '/profile',
        ),
      ],
    ),
    // GoRoute(path: '/old'),
    GoRoute(path: '/salon/:slug', builder: (c, s) => const Salon()),
  ],
);
`,
    });
    expect(discoverFlutterRoutes(app)).toEqual({
      routes: ["/", "/sign-in", "/settings", "/settings/notifications", "/profile"],
      skipped: ["/orders/:id", "/salon/:slug"],
    });
  });

  test("a MaterialApp's routes: map keys, and / even when nothing names it", () => {
    const app = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": `
import 'package:flutter/material.dart';

void main() => runApp(MaterialApp(
      home: const Home(),
      routes: <String, WidgetBuilder>{
        '/settings': (context) => const Settings(),
        '/about': (context) => const About(text: 'a: b'),
        '/items/:id': (context) => const Item(),
      },
    ));
`,
    });
    expect(discoverFlutterRoutes(app)).toEqual({ routes: ["/", "/settings", "/about"], skipped: ["/items/:id"] });
  });

  test("an app with no routes at all still has /", () => {
    const app = makeProject({ "pubspec.yaml": PUBSPEC, "lib/main.dart": "void main() {}\n" });
    expect(discoverFlutterRoutes(app)).toEqual({ routes: ["/"], skipped: [] });
  });
});

describe("routes written as constants, and TypedGoRoute", () => {
  const NOTE = "Only / was found; some routes are built at run time or named by constants Motif can't find — name the screens with --routes.";
  test("a GoRoute path named by a constant in a class is read from the constant", () => {
    const root = makeProject({
      "lib/routes.dart": `abstract final class Routes {
  static const home = '/home';
  static const String settings = "/settings";
  static const details = 'details';
}
abstract final class Paths { static const home = '/elsewhere'; }
`,
      "lib/router.dart": `import 'package:go_router/go_router.dart';
import 'routes.dart' as r;
final router = GoRouter(routes: [
  GoRoute(path: Routes.home, builder: (c, s) => const Home(), routes: [
    GoRoute(path: r.Routes.details, builder: (c, s) => const Details()),
  ]),
  GoRoute(path: Routes.settings, builder: (c, s) => const Settings()),
]);
`,
    });
    expect(discoverFlutterRoutes(root)).toEqual({ routes: ["/", "/home", "/home/details", "/settings"], skipped: [] });
  });

  test("a MaterialApp's routes: map keyed by a screen's routeName, and a top-level constant", () => {
    const root = makeProject({
      "lib/home.dart": "class HomeScreen extends StatelessWidget {\n  static const routeName = '/home';\n}\n",
      "lib/main.dart": `const aboutPath = '/about';
final app = MaterialApp(routes: {
  HomeScreen.routeName: (context) => const HomeScreen(),
  aboutPath: (context) => wide ? const About() : const AboutNarrow(),
});
`,
    });
    expect(discoverFlutterRoutes(root)).toEqual({ routes: ["/", "/home", "/about"], skipped: [] });
  });

  test("TypedGoRoute paths are read like GoRoute's, nested ones joined", () => {
    const root = makeProject({
      "lib/routes.dart": `import 'package:go_router/go_router.dart';
part 'routes.g.dart';
@TypedGoRoute<HomeRoute>(path: '/home', routes: <TypedGoRoute<GoRouteData>>[
  TypedGoRoute<DetailsRoute>(path: 'details/:id'),
  TypedGoRoute<OffersRoute>(path: 'offers'),
])
class HomeRoute extends GoRouteData { const HomeRoute(); }
`,
    });
    expect(discoverFlutterRoutes(root)).toEqual({ routes: ["/", "/home", "/home/offers"], skipped: ["/home/details/:id"] });
  });

  test("a constant Motif can't find, or a path built at run time: only / is found, and a note says why", () => {
    const root = makeProject({
      "lib/router.dart": `import 'package:go_router/go_router.dart';
import 'package:shared/routes.dart';
final router = GoRouter(routes: [
  GoRoute(path: SharedRoutes.home, builder: (c, s) => const Home()),
  GoRoute(path: '\${base}/settings', builder: (c, s) => const Settings()),
]);
`,
    });
    expect(discoverFlutterRoutes(root)).toEqual({ routes: ["/"], skipped: [], notes: [NOTE] });
  });

  test("an app with no router, or whose routes were read, gets no note", () => {
    expect(discoverFlutterRoutes(makeProject({ "lib/main.dart": "void main() {}\n" }))).toEqual({ routes: ["/"], skipped: [] });
    const read = makeProject({ "lib/r.dart": "final r = GoRouter(routes: [GoRoute(path: '/a', builder: (c, s) => const A()), GoRoute(path: Routes.b, builder: (c, s) => const B())]);\n" });
    expect(discoverFlutterRoutes(read)).toEqual({ routes: ["/", "/a"], skipped: [] });
  });
});
