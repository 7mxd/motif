// A family the app ships is drafted as its own (a project font, with its files); a family is drafted as a Google font
// only when the app gets it from Google. Checked through what `motif tokens` reads from the draft (themeFonts).
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { checkProjectFontFiles, readProjectFonts } from "../src/contract/fonts";
import { validateTokens } from "../src/contract/tokens";
import type { AppInfo } from "../src/detect/stacks";
import { buildDraft } from "../src/extract/draft";
import { buildThemeSet } from "../src/generate/theme";
import { themeFonts } from "../src/generate/theme-fonts";
import { COMPOSE } from "../src/stacks/compose";
import { collectCompose } from "../src/stacks/compose/extract";
import { FLUTTER } from "../src/stacks/flutter";
import { collectFlutter } from "../src/stacks/flutter/extract";
import { REACT_NATIVE } from "../src/stacks/react-native";
import { collectReactNative } from "../src/stacks/react-native/extract";
import { docFrom } from "./helpers";
import { makeProject } from "./project";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

/** Each family the drafted roles use, with the source `motif tokens` gives it. */
const sources = (tokens: unknown) => Object.fromEntries(themeFonts(buildThemeSet(docFrom(tokens)).base).map((f) => [f.family, f.source]));
const fontsList = (tokens: any) => tokens.$extensions["dev.motif"].fonts;
/** The draft is a valid guide whose project fonts' files are all there. */
const valid = (root: string, tokens: unknown) => {
  const doc = docFrom(tokens);
  expect(validateTokens(doc)).toEqual([]);
  const { fonts, findings } = readProjectFonts(doc);
  expect(findings).toEqual([]);
  expect(checkProjectFontFiles(root, fonts, doc)).toEqual([]);
};
const read = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), "utf8"));

describe("Flutter", () => {
  const app = { path: ".", stack: "flutter" } as AppInfo;
  const draft = (root: string) => buildDraft(collectFlutter(FLUTTER.sourceFiles!(root, app, {})));
  const PUBSPEC = "name: shop\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n  google_fonts: ^6.2.1\n";
  const BUNDLES_READEX = `${PUBSPEC}
flutter:
  fonts:
    - family: Readex Pro
      fonts:
        - asset: assets/fonts/ReadexPro-Regular.ttf
        - asset: assets/fonts/ReadexPro-Bold.ttf
          weight: 700
`;
  const READEX_THEME = `import 'package:flutter/material.dart';

final theme = ThemeData(textTheme: const TextTheme(
  bodyMedium: TextStyle(fontFamily: 'Readex Pro', fontSize: 14),
  titleLarge: TextStyle(fontFamily: 'Readex Pro', fontSize: 22, fontWeight: FontWeight.w700),
));
`;
  const FILES = { "assets/fonts/ReadexPro-Regular.ttf": "font", "assets/fonts/ReadexPro-Bold.ttf": "font", "lib/main.dart": "void main() {}\n" };

  test("a family the pubspec bundles is a project font, with its files", () => {
    const root = makeProject({ ...FILES, "pubspec.yaml": BUNDLES_READEX, "lib/theme.dart": READEX_THEME });
    const { tokens } = draft(root);
    expect((tokens as any).primitive.font.sans.$value[0]).toBe("Readex Pro");
    expect(fontsList(tokens)).toEqual([
      {
        family: "Readex Pro",
        files: [
          { path: "assets/fonts/ReadexPro-Regular.ttf", weight: 400, style: "normal" },
          { path: "assets/fonts/ReadexPro-Bold.ttf", weight: 700, style: "normal" },
        ],
      },
    ]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    valid(root, tokens);
  });

  test("a family from google_fonts is a Google font", () => {
    const root = makeProject({
      "pubspec.yaml": PUBSPEC,
      "lib/main.dart": "void main() {}\n",
      "lib/theme.dart": `import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

final theme = ThemeData(textTheme: GoogleFonts.interTextTheme());
Widget title() => Text('Shop', style: GoogleFonts.inter(fontSize: 22));
`,
    });
    const { tokens } = draft(root);
    expect(fontsList(tokens)).toBeUndefined();
    expect(sources(tokens)).toEqual({ Inter: "google" });
  });

  test("a family the pubspec bundles and google_fonts also loads is the app's own, with a note", () => {
    const root = makeProject({
      ...FILES,
      "pubspec.yaml": BUNDLES_READEX,
      "lib/theme.dart": `import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

final theme = ThemeData(textTheme: GoogleFonts.readexProTextTheme());
Widget title() => Text('Shop', style: GoogleFonts.readexPro(fontSize: 22));
Widget body() => Text('Hi', style: TextStyle(fontFamily: 'Readex Pro', fontSize: 14));
`,
    });
    const { tokens, report } = draft(root);
    expect(fontsList(tokens)?.map((f: any) => f.family)).toEqual(["Readex Pro"]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    expect(report.notes.join("\n")).toContain("Readex Pro ships with your app and is also loaded from Google Fonts");
    valid(root, tokens);
  });
});

describe("Compose", () => {
  const app = { path: ".", stack: "compose" } as AppInfo;
  const draft = (root: string) => buildDraft(collectCompose(COMPOSE.sourceFiles!(root, app, {})));
  const TYPE = "app/src/main/java/com/example/shop/ui/theme/Type.kt";
  const RES = "app/src/main/res/font";
  const type = (families: string, family = "ReadexPro") => `package com.example.shop.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import com.example.shop.R

${families}

val Typography = Typography(
    bodyLarge = TextStyle(fontFamily = ${family}, fontSize = 16.sp),
    titleLarge = TextStyle(fontFamily = ${family}, fontWeight = FontWeight.Bold, fontSize = 22.sp),
)
`;
  const PROVIDER = `val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)`;
  const FILES = { [`${RES}/readex_pro_regular.ttf`]: "font", [`${RES}/readex_pro_bold.ttf`]: "font" };

  test("a family built from res/font files is a project font, with its files", () => {
    const root = makeProject({
      ...FILES,
      [TYPE]: type("val ReadexPro = FontFamily(Font(R.font.readex_pro_regular), Font(R.font.readex_pro_bold, FontWeight.Bold))"),
    });
    const { tokens } = draft(root);
    expect((tokens as any).primitive.font.sans.$value[0]).toBe("Readex Pro");
    expect(fontsList(tokens)).toEqual([
      {
        family: "Readex Pro",
        files: [
          { path: `${RES}/readex_pro_regular.ttf`, weight: 400, style: "normal" },
          { path: `${RES}/readex_pro_bold.ttf`, weight: 700, style: "normal" },
        ],
      },
    ]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    valid(root, tokens);
  });

  test("a family from Compose's downloadable GoogleFont is a Google font", () => {
    const root = makeProject({
      [TYPE]: type(`${PROVIDER}\nval Inter = FontFamily(Font(googleFont = GoogleFont("Inter"), fontProvider = provider))`, "Inter"),
    });
    const { tokens } = draft(root);
    expect(fontsList(tokens)).toBeUndefined();
    expect(sources(tokens)).toEqual({ Inter: "google" });
  });

  test("a family built from res/font files and also downloaded from Google is the app's own, with a note", () => {
    const root = makeProject({
      ...FILES,
      [TYPE]: type(
        `${PROVIDER}\nval ReadexPro = FontFamily(Font(R.font.readex_pro_regular), Font(R.font.readex_pro_bold, FontWeight.Bold))\nval Readex = FontFamily(Font(googleFont = GoogleFont("Readex Pro"), fontProvider = provider))`,
      ),
    });
    const { tokens, report } = draft(root);
    expect(fontsList(tokens)?.map((f: any) => f.family)).toEqual(["Readex Pro"]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    expect(report.notes.join("\n")).toContain("Readex Pro ships with your app and is also loaded from Google Fonts");
    valid(root, tokens);
  });

  test("a family whose res/font files aren't found says so", () => {
    const root = makeProject({ [TYPE]: type("val Inter = FontFamily(Font(R.font.inter_regular), Font(R.font.inter_bold, FontWeight.Bold))", "Inter") });
    const { tokens, report } = draft(root);
    expect(fontsList(tokens)).toBeUndefined();
    expect(report.notes.join("\n")).toContain("Inter comes from your app's font files (R.font.inter_regular)");
  });
});

describe("React Native", () => {
  const app = { path: ".", stack: "react-native" } as AppInfo;
  const draft = (root: string) => buildDraft(collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {})));
  const PKG = JSON.stringify({ name: "shop", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4" } });
  const STYLES = (family: string) => `import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  body: { fontFamily: '${family}', fontSize: 16 },
  title: { fontFamily: '${family}', fontSize: 22 },
});
`;
  const FILES = { "package.json": PKG, "assets/fonts/ReadexPro-Regular.ttf": "font", "assets/fonts/ReadexPro-Bold.ttf": "font" };

  test("a family useFonts loads from the app's own files is a project font, with its files", () => {
    const root = makeProject({
      ...FILES,
      "app/_layout.tsx": `import { useFonts } from 'expo-font';

export default function RootLayout() {
  const [loaded] = useFonts({
    'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),
    'ReadexPro-Bold': require('../assets/fonts/ReadexPro-Bold.ttf'),
  });
  return null;
}
`,
      "app/styles.ts": STYLES("ReadexPro-Regular"),
    });
    const { tokens } = draft(root);
    expect((tokens as any).primitive.font.sans.$value[0]).toBe("ReadexPro");
    expect(fontsList(tokens)).toEqual([
      {
        family: "ReadexPro",
        files: [
          { path: "assets/fonts/ReadexPro-Regular.ttf", weight: 400, style: "normal" },
          { path: "assets/fonts/ReadexPro-Bold.ttf", weight: 700, style: "normal" },
        ],
      },
    ]);
    expect(sources(tokens)).toEqual({ ReadexPro: "project" });
    valid(root, tokens);
  });

  test("a family from @expo-google-fonts is a Google font", () => {
    const root = makeProject({
      "package.json": PKG,
      "app/_layout.tsx": `import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_700Bold });
  return null;
}
`,
      "app/styles.ts": STYLES("Inter_400Regular"),
    });
    const { tokens } = draft(root);
    expect(fontsList(tokens)).toBeUndefined();
    expect(sources(tokens)).toEqual({ Inter: "google" });
  });

  test("a family the app ships and also loads from @expo-google-fonts is the app's own, with a note", () => {
    const root = makeProject({
      ...FILES,
      "app/_layout.tsx": `import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro';
import { useFonts } from 'expo-font';

export default function RootLayout() {
  const [loaded] = useFonts({
    ReadexPro_400Regular,
    'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),
    'ReadexPro-Bold': require('../assets/fonts/ReadexPro-Bold.ttf'),
  });
  return null;
}
`,
      "app/styles.ts": STYLES("ReadexPro-Regular"),
    });
    const { tokens, report } = draft(root);
    expect(fontsList(tokens)?.map((f: any) => f.family)).toEqual(["ReadexPro"]);
    expect(sources(tokens)).toEqual({ ReadexPro: "project" });
    expect(report.notes.join("\n")).toContain("ReadexPro ships with your app and is also loaded from Google Fonts");
    valid(root, tokens);
  });
});

describe("the web", () => {
  const FACE = (url: string, weight = 400) => `@font-face {\n  font-family: "Readex Pro";\n  font-weight: ${weight};\n  font-style: normal;\n  src: url("${url}") format("woff2");\n}\n`;
  const GOOGLE_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;700&display=swap">';
  const page = (head: string) => `<!doctype html><html><head>${head}<link rel="stylesheet" href="styles.css"></head><body><h1>Hi</h1></body></html>\n`;
  const BODY = "body { font-family: \"Readex Pro\", system-ui, sans-serif; background: #ffffff; color: #111111; }\n";

  test("a plain site's @font-face with its own files is a project font, with its files", async () => {
    const root = makeProject({
      "public/index.html": page(""),
      "public/styles.css": FACE("fonts/readex-pro-400.woff2") + FACE("fonts/readex-pro-700.woff2", 700) + BODY,
      "public/fonts/readex-pro-400.woff2": "font",
      "public/fonts/readex-pro-700.woff2": "font",
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect(fontsList(tokens)).toEqual([
      {
        family: "Readex Pro",
        files: [
          { path: "public/fonts/readex-pro-400.woff2", weight: 400, style: "normal" },
          { path: "public/fonts/readex-pro-700.woff2", weight: 700, style: "normal" },
        ],
      },
    ]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    valid(root, tokens);
  });

  test("a plain site's family from a Google Fonts link is a Google font", async () => {
    const root = makeProject({ "public/index.html": page(GOOGLE_LINK), "public/styles.css": BODY });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect(fontsList(tokens)).toBeUndefined();
    expect(sources(tokens)).toEqual({ "Readex Pro": "google" });
  });

  test("a React app's @font-face from public/ is a project font; with a Google @import as well, the app's own files win, with a note", async () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "shop", dependencies: { react: "19.1.0", "react-dom": "19.1.0" }, devDependencies: { vite: "7.0.0" } }),
      "index.html": '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
      "src/main.tsx": "import './index.css';\n",
      "src/index.css": `@import url("https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;700&display=swap");\n${FACE("/fonts/ReadexPro.woff2")}${BODY}`,
      "public/fonts/ReadexPro.woff2": "font",
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    const tokens = read(root, "design/tokens.draft.json");
    expect(fontsList(tokens)).toEqual([{ family: "Readex Pro", files: [{ path: "public/fonts/ReadexPro.woff2", weight: 400, style: "normal" }] }]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    expect(read(root, "design/extract-report.json").notes.join("\n")).toContain("Readex Pro ships with your app and is also loaded from Google Fonts");
    valid(root, tokens);
  });
});
