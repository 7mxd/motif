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
