import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTokens } from "../src/commands/tokens";
import { TS_HEADER } from "../src/generate/header";
import { twoVariantTokens, validTokens } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const TOKENS = JSON.stringify(validTokens());
const pubspec = (name: string, deps: string[] = ["google_fonts"]) =>
  `name: ${name}\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n${deps.map((d) => `  ${d}: ^6.2.1\n`).join("")}\nflutter:\n  uses-material-design: true\n`;
/** A Flutter app at the project's root. */
const flutterApp = (files: Record<string, string> = {}) =>
  makeProject({ "pubspec.yaml": pubspec("shop"), "lib/main.dart": "void main() {}\n", "design/tokens.json": TOKENS, ...files });
const ctx = { positionals: [] };
const statuses = (r: any) => Object.fromEntries((r.data.files as any[]).map((f) => [f.path, f.status]));
const notes = (r: any) => (r.data.notes as string[]).join("\n");
const WIRING = "Next: import package:shop/design/motif_theme.dart and set theme: MotifTheme.light(), darkTheme: MotifTheme.dark() on your MaterialApp.";

/** Tokens whose body font is a font the project bundles, with these files. */
const brandTokens = (files: string[]) => {
  const t = validTokens();
  t.$extensions["dev.motif"].fonts = [{
    family: "Brand Sans",
    files: files.map((path) => ({ path, weight: /Bold/.test(path) ? 700 : 400, style: "normal" })),
  }];
  t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
  return JSON.stringify(t);
};

describe("motif tokens for a Flutter app", () => {
  test("writes lib/design/motif_theme.dart and says how to wire it", async () => {
    const root = flutterApp();
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)).toEqual({ "lib/design/motif_theme.dart": "created", "design/motif.json": "created" });
    const dart = readFileSync(join(root, "lib/design/motif_theme.dart"), "utf8");
    expect(dart.startsWith(TS_HEADER + "\n")).toBe(true);
    expect(dart).toContain("static TextStyle get body => _font(");
    expect(notes(r)).toContain(WIRING);
    expect(notes(r)).not.toContain("coming soon");
    expect(existsSync(join(root, "design/generated"))).toBe(false);
    // The theme folder is recorded only when the developer sets it.
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps).toEqual([{ path: ".", stack: "flutter" }]);
  });

  test("running again changes nothing, and once the app uses MotifTheme the wiring note goes", async () => {
    const root = flutterApp();
    await runTokens(root, ctx);
    // A reference in a comment doesn't count.
    writeFileSync(join(root, "lib/main.dart"), "// theme: MotifTheme.light()\nvoid main() {}\n");
    expect(notes(await runTokens(root, ctx))).toContain(WIRING);
    writeFileSync(join(root, "lib/main.dart"), "import 'package:shop/design/motif_theme.dart';\n\nfinal theme = MotifTheme.light();\n");
    const r = await runTokens(root, ctx);
    expect(new Set(Object.values(statuses(r)))).toEqual(new Set(["unchanged"]));
    expect(r.text).toContain("up to date");
    expect(notes(r)).not.toContain("Next: import");
  });

  test("two apps that share one theme folder get one file, listed once", async () => {
    const shared = "mobile/shared/lib/design";
    const root = makeProject({
      "design/tokens.json": TOKENS,
      "design/motif.json": JSON.stringify({
        motifContract: 1,
        apps: [
          { path: "mobile/customer", stack: "flutter", themeDir: shared },
          { path: "mobile/admin", stack: "flutter", themeDir: shared },
        ],
        ignore: [],
      }),
      "mobile/customer/pubspec.yaml": pubspec("customer", ["google_fonts", "shared"]),
      "mobile/customer/lib/main.dart": "void main() {}\n",
      "mobile/admin/pubspec.yaml": pubspec("admin", ["google_fonts", "shared"]),
      "mobile/admin/lib/main.dart": "void main() {}\n",
      "mobile/shared/pubspec.yaml": pubspec("shared"),
      "mobile/shared/lib/shared.dart": "",
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    const paths = (r.data.files as any[]).map((f) => f.path);
    expect(paths.filter((p) => p === `${shared}/motif_theme.dart`)).toHaveLength(1);
    expect(statuses(r)[`${shared}/motif_theme.dart`]).toBe("created");
    expect(existsSync(join(root, "mobile/customer/lib/design"))).toBe(false);
    const wiring = (r.data.notes as string[]).filter((n) => n.includes("package:shared/design/motif_theme.dart"));
    expect(wiring).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(root, "design/motif.json"), "utf8")).apps[0].themeDir).toBe(shared);
  });

  test("a project font's .ttf files are copied into the app, with the pubspec block to add", async () => {
    const root = makeProject({
      "design/tokens.json": brandTokens(["design/fonts/BrandSans-Regular.ttf", "design/fonts/BrandSans-Bold.ttf"]),
      "design/fonts/BrandSans-Regular.ttf": "regular",
      "design/fonts/BrandSans-Bold.ttf": "bold",
      "app/pubspec.yaml": pubspec("shop"),
      "app/lib/main.dart": "void main() {}\n",
    });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(statuses(r)["app/assets/fonts/BrandSans-Regular.ttf"]).toBe("created");
    expect(statuses(r)["app/assets/fonts/BrandSans-Bold.ttf"]).toBe("created");
    expect(readFileSync(join(root, "app/assets/fonts/BrandSans-Bold.ttf"), "utf8")).toBe("bold");
    expect(notes(r)).toContain([
      "flutter:",
      "  fonts:",
      "    - family: Brand Sans",
      "      fonts:",
      "        - asset: assets/fonts/BrandSans-Regular.ttf",
      "        - asset: assets/fonts/BrandSans-Bold.ttf",
      "          weight: 700",
    ].join("\n"));
    const dart = readFileSync(join(root, "app/lib/design/motif_theme.dart"), "utf8");
    expect(dart).toContain("fontFamily: 'Brand Sans',");
    // Copies already in place are unchanged; one that differs is never overwritten.
    expect(statuses(await runTokens(root, ctx))["app/assets/fonts/BrandSans-Bold.ttf"]).toBe("unchanged");
    writeFileSync(join(root, "app/assets/fonts/BrandSans-Bold.ttf"), "mine");
    const again = await runTokens(root, ctx);
    expect(statuses(again)["app/assets/fonts/BrandSans-Bold.ttf"]).toBe("protected");
    expect(readFileSync(join(root, "app/assets/fonts/BrandSans-Bold.ttf"), "utf8")).toBe("mine");
  });

  test("font files already inside the app stay where they are", async () => {
    const root = flutterApp({
      "design/tokens.json": brandTokens(["design/fonts/BrandSans-Regular.ttf"]),
      "design/fonts/BrandSans-Regular.ttf": "regular",
    });
    const r = await runTokens(root, ctx);
    expect(Object.keys(statuses(r)).some((p) => p.startsWith("assets/"))).toBe(false);
    expect(notes(r)).toContain("        - asset: design/fonts/BrandSans-Regular.ttf");
  });

  test("font files with the same name from different folders get different names in the app", async () => {
    const t = validTokens();
    t.$extensions["dev.motif"].fonts = [{
      family: "Brand Sans",
      files: [
        { path: "design/fonts/regular/Brand.ttf", weight: 400, style: "normal" },
        { path: "design/fonts/bold/Brand.ttf", weight: 700, style: "normal" },
      ],
    }];
    t.font.body.$value.fontFamily = ["Brand Sans", "sans-serif"];
    const root = makeProject({
      "design/tokens.json": JSON.stringify(t),
      "design/fonts/regular/Brand.ttf": "regular",
      "design/fonts/bold/Brand.ttf": "bold",
      "app/pubspec.yaml": pubspec("shop"),
      "app/lib/main.dart": "void main() {}\n",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["app/assets/fonts/regular-Brand.ttf"]).toBe("created");
    expect(statuses(r)["app/assets/fonts/bold-Brand.ttf"]).toBe("created");
    expect(readFileSync(join(root, "app/assets/fonts/bold-Brand.ttf"), "utf8")).toBe("bold");
    expect(notes(r)).toContain("        - asset: assets/fonts/regular-Brand.ttf\n        - asset: assets/fonts/bold-Brand.ttf\n          weight: 700");
  });

  test("a font file that isn't there is skipped, with what to do", async () => {
    const root = makeProject({
      "design/tokens.json": brandTokens(["design/fonts/BrandSans-Regular.ttf"]),
      "app/pubspec.yaml": pubspec("shop"),
      "app/lib/main.dart": "void main() {}\n",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["app/assets/fonts/BrandSans-Regular.ttf"]).toBe("skipped");
    expect(notes(r)).toContain(
      "design/fonts/BrandSans-Regular.ttf doesn't exist, so it wasn't copied to app/assets/fonts/BrandSans-Regular.ttf. Add the file, or fix its path in design/tokens.json's fonts list.",
    );
  });

  test("a theme folder outside a package's lib/ gets a wiring note without a package: import", async () => {
    const root = makeProject({
      "design/tokens.json": TOKENS,
      "design/motif.json": JSON.stringify({ motifContract: 1, apps: [{ path: "app", stack: "flutter", themeDir: "design/flutter" }], ignore: [] }),
      "app/pubspec.yaml": pubspec("shop"),
      "app/lib/main.dart": "void main() {}\n",
    });
    const r = await runTokens(root, ctx);
    expect(statuses(r)["design/flutter/motif_theme.dart"]).toBe("created");
    const wiring = (r.data.notes as string[]).find((n) => n.startsWith("Next:"))!;
    expect(wiring).toContain("Next: import motif_theme.dart (design/flutter/motif_theme.dart) in your app's code");
    expect(wiring).toContain("set theme: MotifTheme.light(), darkTheme: MotifTheme.dark() on your MaterialApp.");
    expect(wiring).toContain("package: only from inside a package's lib/ folder");
    expect(wiring).not.toContain("package:shop");
    expect(wiring).not.toMatch(/import package:/);
  });

  test("a project font with only WOFF2 files gets a note", async () => {
    const root = flutterApp({
      "design/tokens.json": brandTokens(["design/fonts/BrandSans.woff2"]),
      "design/fonts/BrandSans.woff2": "woff2",
    });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("Flutter can't use WOFF2: add a .ttf or .otf of Brand Sans to the guide's font files.");
    expect(notes(r)).not.toContain("- family: Brand Sans");
  });

  test("without google_fonts, the code uses plain family names and a note says what to do", async () => {
    const root = flutterApp({ "pubspec.yaml": pubspec("shop", []) });
    const r = await runTokens(root, ctx);
    expect(notes(r)).toContain("Add google_fonts (flutter pub add google_fonts) and run motif tokens again, or bundle Inter as project fonts.");
    const dart = readFileSync(join(root, "lib/design/motif_theme.dart"), "utf8");
    expect(dart).toContain("fontFamily: 'Inter',");
    expect(dart).not.toContain("GoogleFonts");
  });

  test("a hand-written motif_theme.dart is never overwritten", async () => {
    const mine = "// my own theme\nclass MotifTheme {}\n";
    const root = flutterApp({ "lib/design/motif_theme.dart": mine });
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(1);
    expect(statuses(r)["lib/design/motif_theme.dart"]).toBe("protected");
    expect(readFileSync(join(root, "lib/design/motif_theme.dart"), "utf8")).toBe(mine);
    expect(notes(r)).not.toContain("Next: import");
  });
});

describe("motif tokens: variants in the wiring note, and a guide git ignores (Task 15 wave B, #8 and #10)", () => {
  test("with design variants, the wiring note says how to choose one, and how to switch at runtime", async () => {
    const r = await runTokens(flutterApp({ "design/tokens.json": JSON.stringify(twoVariantTokens()) }), ctx);
    expect(r.exitCode).toBe(0);
    expect(notes(r)).toContain(WIRING);
    expect(notes(r)).toContain("MotifTheme.light(variant: MotifVariant.women) and MotifTheme.dark(variant: MotifVariant.women)");
    expect(notes(r)).toContain("MotifVariant.men");
    expect(notes(r)).toContain("at runtime");
  });

  test("without variants, the note doesn't mention them", async () => {
    expect(notes(await runTokens(flutterApp(), ctx))).not.toContain("variant:");
  });

  const git = (root: string, ...args: string[]) => Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });

  test("a .gitignore that ignores design/ is named, with its line and the fix", async () => {
    const root = flutterApp({ ".gitignore": "build/\n# Figma exports\ndesign/\n", "DESIGN.md": "# Design\n" });
    expect(git(root, "init", "-q").exitCode).toBe(0);
    const r = await runTokens(root, ctx);
    expect(r.exitCode).toBe(0);
    expect(notes(r)).toContain(
      "Your .gitignore ignores design/ (line 3 of .gitignore), so design/tokens.json, lib/design/motif_theme.dart and design/motif.json won't be committed. Add !design/ on a line below it (git can't let a file back in while its folder is ignored), or narrow the rule.",
    );
    expect(notes(r)).not.toContain("DESIGN.md won't");
  });

  test("a file git already tracks, or no repository at all, gives no message", async () => {
    const plain = flutterApp({ ".gitignore": "design/\n" });
    expect(notes(await runTokens(plain, ctx))).not.toContain("won't be committed");
    const tracked = flutterApp({ ".gitignore": "*.md\n", "DESIGN.md": "# Design\n" });
    git(tracked, "init", "-q");
    git(tracked, "add", "-f", "DESIGN.md");
    expect(notes(await runTokens(tracked, ctx))).not.toContain("won't be committed");
  });
});

describe("wave B review fixes: git advice (review #6)", () => {
  const git = (root: string, ...args: string[]) => Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });

  test("a rule that ignores a folder is negated as a folder rule: a file can't be let back in under an ignored folder", async () => {
    const root = flutterApp({ ".gitignore": "**/design/\n", "DESIGN.md": "# Design\n" });
    git(root, "init", "-q");
    const n = notes(await runTokens(root, ctx));
    expect(n).toContain("Your .gitignore ignores **/design/ (line 1 of .gitignore), so design/tokens.json, lib/design/motif_theme.dart and design/motif.json won't be committed.");
    expect(n).toContain("Add !**/design/ on a line below it (git can't let a file back in while its folder is ignored), or narrow the rule.");
    expect(n).not.toContain("!design/tokens.json");
  });

  test("a rule that ignores the files themselves is answered file by file", async () => {
    const root = flutterApp({ ".gitignore": "*.md\n", "DESIGN.md": "# Design\n" });
    git(root, "init", "-q");
    expect(notes(await runTokens(root, ctx))).toContain("Your .gitignore ignores *.md (line 1 of .gitignore), so DESIGN.md won't be committed. Add !DESIGN.md on a line below it, or narrow the rule.");
  });
});
