// A family the app ships is drafted as its own (a project font, with its files); a family is drafted as a Google font
// only when the app gets it from Google. Checked through what `motif tokens` reads from the draft (themeFonts).
import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
import { runTokens } from "../src/commands/tokens";
import { checkProjectFontFiles, readProjectFonts } from "../src/contract/fonts";
import { validateTokens } from "../src/contract/tokens";
import type { AppInfo } from "../src/detect/stacks";
import { buildDraft, mergeOccurrences, type Occurrences } from "../src/extract/draft";
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
    // The family is named by its @expo-google-fonts package, Readex Pro, whichever way the code spells a face (final fix wave).
    expect(fontsList(tokens)?.map((f: any) => f.family)).toEqual(["Readex Pro"]);
    expect(sources(tokens)).toEqual({ "Readex Pro": "project" });
    expect(report.notes.join("\n")).toContain("Readex Pro ships with your app and is also loaded from Google Fonts");
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

describe("fix round 1", () => {
  const flutterApp = { path: ".", stack: "flutter" } as AppInfo;
  const flutterDraft = (root: string) => buildDraft(collectFlutter(FLUTTER.sourceFiles!(root, flutterApp, {})));
  const PUBSPEC = "name: shop\nenvironment:\n  sdk: ^3.6.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n  google_fonts: ^6.2.1\n";
  const readex = (weights: number[]) => ({
    "pubspec.yaml": `${PUBSPEC}\nflutter:\n  fonts:\n    - family: Readex Pro\n      fonts:\n${weights.map((w) => `        - asset: assets/fonts/ReadexPro-${w}.ttf\n          weight: ${w}\n`).join("")}`,
    ...Object.fromEntries(weights.map((w) => [`assets/fonts/ReadexPro-${w}.ttf`, "font"])),
    "lib/main.dart": "void main() {}\n",
    "lib/theme.dart": "import 'package:flutter/material.dart';\n\nWidget body() => Text('Hi', style: TextStyle(fontFamily: 'Readex Pro', fontSize: 14));\n",
  });

  test("Flutter: a Google main family with a bundled Arabic fallback stays first, and the fallback is the project-font companion", () => {
    const root = makeProject({
      "pubspec.yaml": `${PUBSPEC}\nflutter:\n  fonts:\n    - family: NotoNaskhArabic\n      fonts:\n        - asset: assets/fonts/NotoNaskhArabic.ttf\n`,
      "assets/fonts/NotoNaskhArabic.ttf": "font",
      "lib/main.dart": "void main() {}\n",
      "lib/theme.dart": `import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

final theme = ThemeData(textTheme: GoogleFonts.latoTextTheme(ThemeData().textTheme).apply(fontFamilyFallback: const ['NotoNaskhArabic']));
`,
    });
    const { tokens } = flutterDraft(root);
    expect((tokens as any).primitive.font.sans.$value).toEqual(["Lato", "NotoNaskhArabic", "system-ui", "sans-serif"]);
    expect(sources(tokens)).toEqual({ Lato: "google", NotoNaskhArabic: "project" });
    expect(fontsList(tokens).map((f: any) => f.family)).toEqual(["NotoNaskhArabic"]);
    valid(root, tokens);
  });

  test("a shipped family without every weight the roles use is noted, naming the missing weights", () => {
    const { report } = flutterDraft(makeProject(readex([400])));
    expect(report.notes).toContain(
      "Readex Pro's files have weight 400 only, but the type roles also use 500, 600 and 700. Add files for those weights to the guide's fonts list, or change the roles' weights.",
    );
  });

  test("a variable font file covers every weight, so a family shipped as one gets no such note (re-review of the fix round)", () => {
    // Google Fonts ships many families, Arabic ones among them, as one variable file named like these.
    for (const file of ["ReadexPro[HEXP,wght].ttf", "ReadexPro-VariableFont_HEXP,wght.ttf", "ReadexPro-Variable.ttf", "ReadexPro-VF.ttf"]) {
      const { report } = flutterDraft(
        makeProject({
          "pubspec.yaml": `${PUBSPEC}\nflutter:\n  fonts:\n    - family: Readex Pro\n      fonts:\n        - asset: assets/fonts/${file}\n`,
          [`assets/fonts/${file}`]: "font",
          "lib/main.dart": "void main() {}\n",
          "lib/theme.dart": "import 'package:flutter/material.dart';\n\nWidget body() => Text('Hi', style: TextStyle(fontFamily: 'Readex Pro', fontSize: 14));\n",
        }),
      );
      expect([file, report.notes.join("\n").includes("Readex Pro's files have")]).toEqual([file, false]);
    }
  });

  test("a shipped family with every weight the roles use has no such note", () => {
    const { report } = flutterDraft(makeProject(readex([400, 500, 600, 700])));
    expect(report.notes.join("\n")).not.toContain("Readex Pro's files have");
  });

  test("a web @font-face with a weight range covers the weights in it", async () => {
    const root = makeProject({
      "public/index.html": '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hi</h1></body></html>\n',
      "public/styles.css": '@font-face {\n  font-family: "Nunito";\n  font-weight: 200 1000;\n  src: url("fonts/nunito.woff2") format("woff2");\n}\nbody { font-family: "Nunito", system-ui, sans-serif; }\n',
      "public/fonts/nunito.woff2": "font",
    });
    expect((await runExtract(root, { positionals: [] })).exitCode).toBe(0);
    expect(fontsList(read(root, "design/tokens.draft.json"))?.map((f: any) => f.family)).toEqual(["Nunito"]);
    expect(read(root, "design/extract-report.json").notes.join("\n")).not.toContain("Nunito's files have");
  });

  const rnApp = { path: ".", stack: "react-native" } as AppInfo;
  const rnDraft = (root: string) => buildDraft(collectReactNative(REACT_NATIVE.sourceFiles!(root, rnApp, {})));
  const RN = {
    "package.json": JSON.stringify({ name: "shop", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4" } }),
    "assets/fonts/ReadexPro-Regular.ttf": "font",
    "assets/fonts/ReadexPro-Bold.ttf": "font",
    "app/styles.ts":
      "import { StyleSheet } from 'react-native';\n\nexport const styles = StyleSheet.create({\n  body: { fontFamily: 'ReadexPro-Regular', fontSize: 16 },\n  title: { fontFamily: 'ReadexPro-Bold', fontSize: 22 },\n});\n",
  };
  const READEX_FILES = [
    { path: "assets/fonts/ReadexPro-Regular.ttf", weight: 400, style: "normal" },
    { path: "assets/fonts/ReadexPro-Bold.ttf", weight: 700, style: "normal" },
  ];

  test("React Native: fonts expo-font's config plugin lists in app.json are project fonts", () => {
    const root = makeProject({
      ...RN,
      "app.json": JSON.stringify({
        expo: { name: "Shop", plugins: ["expo-router", ["expo-font", { fonts: ["./assets/fonts/ReadexPro-Regular.ttf", "./assets/fonts/ReadexPro-Bold.ttf"] }]] },
      }),
    });
    const { tokens } = rnDraft(root);
    expect(fontsList(tokens)).toEqual([{ family: "ReadexPro", files: READEX_FILES }]);
    expect(sources(tokens)).toEqual({ ReadexPro: "project" });
    valid(root, tokens);
  });

  test("React Native: the literal fonts list in app.config.ts's expo-font plugin is read too", () => {
    const root = makeProject({
      ...RN,
      "app.config.ts": `import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Shop',
  plugins: [
    'expo-router',
    ['expo-font', { fonts: ['./assets/fonts/ReadexPro-Regular.ttf', './assets/fonts/ReadexPro-Bold.ttf'] }],
  ],
};
export default config;
`,
    });
    const { tokens } = rnDraft(root);
    expect(fontsList(tokens)).toEqual([{ family: "ReadexPro", files: READEX_FILES }]);
    expect(sources(tokens)).toEqual({ ReadexPro: "project" });
  });

  test("React Native: Font.loadAsync with the app's own files is read like useFonts", () => {
    const root = makeProject({
      ...RN,
      "app/_layout.tsx": `import * as Font from 'expo-font';

export async function loadFonts() {
  await Font.loadAsync({
    'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),
    'ReadexPro-Bold': require('../assets/fonts/ReadexPro-Bold.ttf'),
  });
}
`,
    });
    const { tokens } = rnDraft(root);
    expect(fontsList(tokens)).toEqual([{ family: "ReadexPro", files: READEX_FILES }]);
    expect(sources(tokens)).toEqual({ ReadexPro: "project" });
  });

  test("Compose: a family from an XML font family says Motif doesn't read those yet", () => {
    const composeApp = { path: ".", stack: "compose" } as AppInfo;
    const root = makeProject({
      "app/src/main/res/font/inter.xml": '<?xml version="1.0" encoding="utf-8"?>\n<font-family xmlns:app="http://schemas.android.com/apk/res-auto" />\n',
      "app/src/main/java/com/example/shop/ui/theme/Type.kt": `package com.example.shop.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp
import com.example.shop.R

val Inter = FontFamily(Font(R.font.inter))

val Typography = Typography(bodyLarge = TextStyle(fontFamily = Inter, fontSize = 16.sp))
`,
    });
    const { tokens, report } = buildDraft(collectCompose(COMPOSE.sourceFiles!(root, composeApp, {})));
    expect(fontsList(tokens)).toBeUndefined();
    const notes = report.notes.join("\n");
    expect(notes).toContain("Inter comes from an XML font family (app/src/main/res/font/inter.xml), which Motif doesn't read yet");
    expect(notes).not.toContain("didn't find them");
  });

  test("mergeOccurrences joins every part's fonts, each family once, the first part's winning", () => {
    const part = (extra: Partial<Occurrences>): Occurrences => ({
      colors: [], space: [], radius: [], fontSize: [], fontFamily: [], duration: [], easing: [], unresolved: [], ...extra,
    });
    const file = (path: string) => ({ path, weight: 400, style: "normal" as const });
    const merged = mergeOccurrences([
      part({ projectFonts: [{ family: "Inter", files: [file("web/fonts/inter.woff2")] }], googleFonts: ["Inter"] }),
      part({
        projectFonts: [{ family: "inter", files: [file("app/assets/fonts/Inter.ttf")] }, { family: "Cairo", files: [file("app/assets/fonts/Cairo.ttf")] }],
        googleFonts: ["Roboto", "inter"],
        unfoundFonts: [{ family: "Lato", from: "R.font.lato" }],
      }),
    ]);
    expect(merged.projectFonts).toEqual([
      { family: "Inter", files: [file("web/fonts/inter.woff2")] },
      { family: "Cairo", files: [file("app/assets/fonts/Cairo.ttf")] },
    ]);
    expect(merged.googleFonts).toEqual(["Inter", "Roboto"]);
    expect(merged.unfoundFonts).toEqual([{ family: "Lato", from: "R.font.lato" }]);
  });
});

describe("React Native: an object passed to useFonts by name", () => {
  const app = { path: ".", stack: "react-native" } as AppInfo;
  const draft = (root: string) => buildDraft(collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {})));
  const PKG = JSON.stringify({ name: "salon", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4", "@expo-google-fonts/onest": "^0.4.0" } });
  const THMANYAH = ["Light", "Regular", "Medium", "Bold", "Black"];
  const THMANYAH_FILES = [
    { path: "assets/fonts/thmanyahsans-Light.ttf", weight: 300, style: "normal" },
    { path: "assets/fonts/thmanyahsans-Regular.ttf", weight: 400, style: "normal" },
    { path: "assets/fonts/thmanyahsans-Medium.ttf", weight: 500, style: "normal" },
    { path: "assets/fonts/thmanyahsans-Bold.ttf", weight: 700, style: "normal" },
    { path: "assets/fonts/thmanyahsans-Black.ttf", weight: 900, style: "normal" },
  ];
  // HiSalon's shape: App.tsx calls useFonts(fontAssets), imported through the @/ alias (./src/*) from a theme folder
  // whose index re-exports it from typography.ts, where the object mixes @expo-google-fonts names with require()d files.
  const HISALON = {
    "package.json": PKG,
    "tsconfig.json": JSON.stringify({ extends: "expo/tsconfig.base", compilerOptions: { strict: true, paths: { "@/*": ["./src/*"] } } }),
    ...Object.fromEntries(THMANYAH.map((w) => [`assets/fonts/thmanyahsans-${w}.ttf`, "font"])),
    "App.tsx": `import { useFonts } from "expo-font";
import { ThemeProvider, fontAssets } from "@/theme";

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);
  return null;
}
`,
    "src/theme/index.ts": `export { ThemeProvider, useTheme } from "./theme-context";
export {
  sansFamily,
  fontAssets,
  type FontWeight,
} from "./typography";
`,
    "src/theme/theme-context.tsx": "export function ThemeProvider() { return null; }\nexport function useTheme() { return null; }\n",
    "src/theme/typography.ts": `import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_700Bold,
} from "@expo-google-fonts/onest";

export type FontWeight = 400 | 500 | 700;

const onest: Record<FontWeight, string> = { 400: "Onest_400Regular", 500: "Onest_500Medium", 700: "Onest_700Bold" };
const thmanyah: Record<FontWeight, string> = { 400: "ThmanyahSans-Regular", 500: "ThmanyahSans-Medium", 700: "ThmanyahSans-Bold" };

export function sansFamily(weight: FontWeight, locale: string): string {
  return locale === "ar" ? thmanyah[weight] : onest[weight];
}

export const fontAssets = {
  Onest_400Regular,
  Onest_500Medium,
  Onest_700Bold,
  // Thmanyah Sans: the app's own files.
${THMANYAH.map((w) => `  "ThmanyahSans-${w}": require("../../assets/fonts/thmanyahsans-${w}.ttf"),`).join("\n")}
};
`,
    "src/screens/home.tsx": `import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  body: { fontSize: 16 },
  title: { fontSize: 22 },
});
`,
  };

  test("HiSalon's useFonts(fontAssets), re-exported from another module, gives the shipped Arabic family as the companion", () => {
    const root = makeProject(HISALON);
    const { tokens, report } = draft(root);
    expect((tokens as any).primitive.font.sans.$value).toEqual(["Onest", "ThmanyahSans", "system-ui", "sans-serif"]);
    expect(fontsList(tokens)).toEqual([{ family: "ThmanyahSans", files: THMANYAH_FILES }]);
    expect(sources(tokens).ThmanyahSans).toBe("project");
    expect(report.notes.join("\n")).toContain("Your theme also uses ThmanyahSans (for Arabic text, or as a fallback), so it's each type role's companion after Onest");
    valid(root, tokens);
  });

  test("an object defined in the same file is read", () => {
    const root = makeProject({
      "package.json": PKG,
      "assets/fonts/ReadexPro-Regular.ttf": "font",
      "assets/fonts/ReadexPro-Bold.ttf": "font",
      "app/_layout.tsx": `import { useFonts } from 'expo-font';

const fonts = {
  'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),
  'ReadexPro-Bold': require('../assets/fonts/ReadexPro-Bold.ttf'),
};

export default function RootLayout() {
  const [loaded] = useFonts(fonts);
  return null;
}
`,
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
    valid(root, tokens);
  });

  test("a module's default export, imported under another name with a relative path, is read", () => {
    const root = makeProject({
      "package.json": PKG,
      "assets/fonts/ReadexPro-Regular.ttf": "font",
      "app/_layout.tsx": `import { useFonts } from 'expo-font';
import appFonts from '../constants/fonts';

export default function RootLayout() {
  const [loaded] = useFonts(appFonts);
  return null;
}
`,
      "constants/fonts.ts": "export default {\n  'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),\n};\n",
    });
    const { tokens } = draft(root);
    expect(fontsList(tokens)).toEqual([{ family: "ReadexPro", files: [{ path: "assets/fonts/ReadexPro-Regular.ttf", weight: 400, style: "normal" }] }]);
  });

  test("a name Motif can't follow to an object literal (a package's export, a function's result) is skipped", () => {
    const root = makeProject({
      "package.json": PKG,
      "app/_layout.tsx": `import { useFonts } from 'expo-font';
import { iconFonts } from 'some-icon-package';

const built = makeFonts();

export default function RootLayout() {
  useFonts(iconFonts);
  useFonts(built);
  return null;
}
`,
    });
    const { tokens } = draft(root);
    expect(fontsList(tokens)).toBeUndefined();
    expect((tokens as any).primitive.font.sans.$value).toEqual(["system-ui", "sans-serif"]);
  });
});

describe("React Native companion and name-following, Task 5 fix round 1", () => {
  const app = { path: ".", stack: "react-native" } as AppInfo;
  const collect = (root: string) => collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {}));
  const PKG = JSON.stringify({ name: "x", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4" } });
  const LATIN = { "package.json": PKG, "assets/fonts/Inter-Regular.ttf": "f", "assets/fonts/PlayfairDisplay-Bold.ttf": "f" };
  const LOAD_LATIN = "useFonts({ 'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'), 'PlayfairDisplay-Bold': require('../assets/fonts/PlayfairDisplay-Bold.ttf') })";

  /** A TrueType file with only a cmap (format 4) that maps the given code point ranges. */
  const ttf = (ranges: [number, number][]) => {
    const segs: [number, number][] = [...ranges, [0xffff, 0xffff]];
    const n = segs.length;
    const sub = Buffer.alloc(16 + n * 8);
    sub.writeUInt16BE(4, 0);
    sub.writeUInt16BE(sub.length, 2);
    sub.writeUInt16BE(n * 2, 6);
    segs.forEach(([, end], i) => sub.writeUInt16BE(end, 14 + i * 2));
    segs.forEach(([start], i) => sub.writeUInt16BE(start, 16 + n * 2 + i * 2));
    segs.forEach((_, i) => sub.writeUInt16BE(1, 16 + n * 4 + i * 2)); // idDelta 1: each code point has a glyph
    const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 1, 0, 0, 0, 12]), sub]);
    const head = Buffer.alloc(28);
    head.writeUInt32BE(0x00010000, 0);
    head.writeUInt16BE(1, 4);
    head.write("cmap", 12, "latin1");
    head.writeUInt32BE(28, 20);
    head.writeUInt32BE(cmap.length, 24);
    return Buffer.concat([head, cmap]);
  };

  test("probe A: a layout that reads isRTL and loads two Latin families has no companion", () => {
    const occ = collect(makeProject({
      ...LATIN,
      "app/_layout.tsx": `import { useFonts } from 'expo-font';\nimport { I18nManager } from 'react-native';\nexport default function RootLayout() {\n  const [loaded] = ${LOAD_LATIN};\n  const dir = I18nManager.isRTL ? 'rtl' : 'ltr';\n  return null;\n}\n`,
      "app/index.tsx": "export const s = { a: { fontFamily: 'Inter-Regular', fontSize: 16 }, b: { fontFamily: 'Inter-Regular' }, c: { fontFamily: 'PlayfairDisplay-Bold', fontSize: 28 } };\n",
    }));
    expect(occ.companion).toBeUndefined();
  });

  test("probe A2: a layout that tests for 'ar' and loads two Latin families has no companion", () => {
    const occ = collect(makeProject({
      ...LATIN,
      "app/_layout.tsx": `import { useFonts } from 'expo-font';\nimport i18n from 'i18next';\nimport { I18nManager } from 'react-native';\nif (i18n.language === 'ar') I18nManager.forceRTL(true);\nexport default function RootLayout() {\n  const [loaded] = ${LOAD_LATIN};\n  return null;\n}\n`,
      "app/index.tsx": "export const s = { a: { fontFamily: 'Inter-Regular', fontSize: 16 }, b: { fontFamily: 'Inter-Regular' } };\n",
    }));
    expect(occ.companion).toBeUndefined();
  });

  test("probe H: the 'ar' branch of a locale ternary is the companion, over a more used Latin display font", () => {
    const occ = collect(makeProject({
      ...LATIN,
      "assets/fonts/Cairo-Regular.ttf": "f",
      "app/_layout.tsx": "import { useFonts } from 'expo-font';\nimport { I18nManager } from 'react-native';\nexport default function RootLayout() {\n  const [loaded] = useFonts({ 'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'), 'PlayfairDisplay-Bold': require('../assets/fonts/PlayfairDisplay-Bold.ttf'), 'Cairo-Regular': require('../assets/fonts/Cairo-Regular.ttf') });\n  I18nManager.allowRTL(I18nManager.isRTL);\n  return null;\n}\n",
      "app/index.tsx": "export const s = { a: { fontFamily: 'Inter-Regular', fontSize: 16 }, b: { fontFamily: 'Inter-Regular' }, c: { fontFamily: 'PlayfairDisplay-Bold', fontSize: 28 }, d: { fontFamily: 'PlayfairDisplay-Bold' } };\nexport const ar = (l: string) => (l === 'ar' ? 'Cairo-Regular' : 'Inter-Regular');\n",
    }));
    expect(occ.companion).toBe("Cairo");
  });

  test("a ternary written with !== or with 'ar' first picks the 'ar' branch, and a family on the Latin side never is the companion", () => {
    const files = (ternary: string) => ({
      "package.json": PKG,
      "assets/fonts/Inter-Regular.ttf": "f",
      "assets/fonts/Lalezar-Regular.ttf": "f",
      "App.tsx": `import { useFonts } from 'expo-font';\nexport default function L() { useFonts({ 'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'), 'Lalezar-Regular': require('./assets/fonts/Lalezar-Regular.ttf') }); return null; }\nexport const fam = (l: string) => ${ternary};\nexport const s = { a: { fontFamily: 'Inter-Regular', fontSize: 16 } };\n`,
    });
    expect(collect(makeProject(files("l !== 'ar' ? 'Inter-Regular' : 'Lalezar-Regular'"))).companion).toBe("Lalezar");
    expect(collect(makeProject(files("'ar' === l ? 'Lalezar-Regular' : 'Inter-Regular'"))).companion).toBe("Lalezar");
    expect(collect(makeProject(files("l === 'ar' ? 'Inter-Regular' : 'Lalezar-Regular'"))).companion).toBeUndefined();
  });

  // The app reads I18nManager.isRTL: a sign it's used in Arabic, which a family's file or name alone isn't (fix round 2).
  const zainProject = (zain: Buffer, signal = "export const rtl = I18nManager.isRTL;\n") => {
    const root = makeProject({
      "package.json": PKG,
      "App.tsx": `import { useFonts } from 'expo-font';\nimport { I18nManager } from 'react-native';\nexport default function L() { useFonts({ 'Inter-Regular': require('./assets/fonts/Inter-Regular.ttf'), 'Zain-Regular': require('./assets/fonts/Zain-Regular.ttf') }); return null; }\nexport const s = { a: { fontFamily: 'Inter-Regular', fontSize: 16 } };\n${signal}`,
    });
    mkdirSync(join(root, "assets/fonts"), { recursive: true });
    writeFileSync(join(root, "assets/fonts/Inter-Regular.ttf"), ttf([[0x20, 0x7e]]));
    writeFileSync(join(root, "assets/fonts/Zain-Regular.ttf"), zain);
    return root;
  };

  test("a shipped family whose font file has Arabic letters is the companion; one without them isn't", () => {
    expect(collect(zainProject(ttf([[0x20, 0x7e], [0x0600, 0x06ff]]))).companion).toBe("Zain");
    expect(collect(zainProject(ttf([[0x20, 0x7e]]))).companion).toBeUndefined();
  });

  test("fix round 2: without any sign of Arabic in the app, a family's Arabic letters or name don't make it the companion", () => {
    expect(collect(zainProject(ttf([[0x20, 0x7e], [0x0600, 0x06ff]]), "")).companion).toBeUndefined();
    // The review's rubik.ts: Inter for text, Rubik (which Motif's kit knows covers Arabic) for headings, in English only.
    const rubik = makeProject({
      "package.json": JSON.stringify({ name: "x", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4", "@expo-google-fonts/inter": "*", "@expo-google-fonts/rubik": "*" } }),
      "App.tsx":
        "import { useFonts, Inter_400Regular } from '@expo-google-fonts/inter';\nimport { Rubik_700Bold } from '@expo-google-fonts/rubik';\nexport default function L() { useFonts({ Inter_400Regular, Rubik_700Bold }); return null; }\nexport const s = { a: { fontFamily: 'Inter_400Regular', fontSize: 16 }, b: { fontFamily: 'Inter_400Regular' }, h: { fontFamily: 'Rubik_700Bold', fontSize: 28 } };\n",
    });
    expect(collect(rubik).companion).toBeUndefined();
    // With Arabic in its i18n resources, Rubik is the companion.
    writeFileSync(join(rubik, "i18n.ts"), "export const resources = { en: { translation: {} }, ar: { translation: {} } };\n");
    expect(collect(rubik).companion).toBe("Rubik");
    // The other common ways (re-review of fix round 2): shorthand resources from imported files, and a default language.
    for (const i18n of [
      "import en from './en.json';\nimport ar from './ar.json';\nexport const resources = { en, ar };\n",
      "import en from './en.json';\nimport ar from './ar.json';\nexport const i18n = new I18n({ en, ar });\n",
      "i18n.init({ lng: 'ar', fallbackLng: 'en' });\n",
    ]) {
      writeFileSync(join(rubik, "i18n.ts"), i18n);
      expect([i18n, collect(rubik).companion]).toEqual([i18n, "Rubik"]);
    }
    // An object whose key happens to be "en" or "ar" in a list of words isn't a sign: shorthand needs a language beside it.
    writeFileSync(join(rubik, "i18n.ts"), "export const icons = { home, search };\n");
    expect(collect(rubik).companion).toBeUndefined();
  });

  test("fix round 2: a damaged font file the app loads (the review's 28-byte one) doesn't stop extract", async () => {
    const bad = Buffer.alloc(28);
    bad.writeUInt32BE(0x4f54544f, 0);
    bad.writeUInt16BE(1, 4);
    bad.write("cmap", 12, "latin1");
    bad.writeUInt32BE(0, 20);
    const root = zainProject(bad);
    expect(collect(root).companion).toBeUndefined();
    expect((await runExtract(root, { positionals: [], flags: {} })).exitCode).toBe(0);
  });

  const READEX = { "package.json": PKG, "assets/fonts/ReadexPro-Regular.ttf": "f" };
  const readexFound = (root: string) =>
    expect(collect(root).projectFonts).toEqual([{ family: "ReadexPro", files: [{ path: "assets/fonts/ReadexPro-Regular.ttf", weight: 400, style: "normal" }] }]);

  test("probe B: export default name, without semicolons, is followed", () => {
    readexFound(makeProject({
      ...READEX,
      "app/_layout.tsx": "import { useFonts } from 'expo-font'\nimport appFonts from '../constants/fonts'\nexport default function L() { useFonts(appFonts); return null }\n",
      "constants/fonts.ts": "const fonts = {\n  'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),\n}\nexport default fonts\n",
    }));
  });

  test("probe C: export { fonts as default }, and export { default } from another file, are followed", () => {
    readexFound(makeProject({
      ...READEX,
      "app/_layout.tsx": "import { useFonts } from 'expo-font';\nimport appFonts from '../constants/fonts';\nexport default function L() { useFonts(appFonts); return null; }\n",
      "constants/fonts.ts": "const fonts = {\n  'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),\n};\nexport { fonts as default };\n",
    }));
    readexFound(makeProject({
      ...READEX,
      "app/_layout.tsx": "import { useFonts } from 'expo-font';\nimport appFonts from '../constants';\nexport default function L() { useFonts(appFonts); return null; }\n",
      "constants/index.ts": "export { default } from './fonts';\n",
      "constants/fonts.ts": "export default {\n  'ReadexPro-Regular': require('../assets/fonts/ReadexPro-Regular.ttf'),\n};\n",
    }));
  });

  test("probe F: a tsconfig.json with comments and trailing commas still gives the @/ alias", () => {
    readexFound(makeProject({
      ...READEX,
      "tsconfig.json": '{\n  // Expo\n  "compilerOptions": { "paths": { "@/*": ["./src/*"], }, },\n}\n',
      "App.tsx": "import { useFonts } from 'expo-font';\nimport { fonts } from '@/theme/fonts';\nexport default function L() { useFonts(fonts); return null; }\n",
      "src/theme/fonts.ts": "export const fonts = {\n  'ReadexPro-Regular': require('../../assets/fonts/ReadexPro-Regular.ttf'),\n};\n",
    }));
  });
});

describe("final fix wave: Expo Google families by their package, and weights from the font's own axis", () => {
  const app = { path: ".", stack: "react-native" } as AppInfo;
  const pkg = (deps: Record<string, string>) => JSON.stringify({ name: "x", dependencies: { expo: "~54.0.1", react: "19.1.0", "react-native": "0.81.4", "expo-font": "~14.0.0", ...deps } });

  test("@expo-google-fonts/readex-pro's ReadexPro_400Regular is Readex Pro, the companion; motif tokens names the real package", async () => {
    const root = makeProject({
      "package.json": pkg({ "@expo-google-fonts/inter": "*" }),
      "App.tsx": `import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro';
export default function App() { useFonts({ Inter_400Regular, Inter_700Bold, ReadexPro_400Regular }); return null; }
export const family = (locale: string) => (locale === 'ar' ? 'ReadexPro_400Regular' : 'Inter_400Regular');
export const s = { body: { fontFamily: 'Inter_400Regular', fontSize: 16 }, title: { fontFamily: 'Inter_700Bold', fontSize: 22 } };
`,
    });
    const occ = collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {}));
    expect(occ.companion).toBe("Readex Pro");
    expect(occ.googleFonts).toEqual(["Inter", "Readex Pro"]);
    const { tokens } = buildDraft(occ);
    expect((tokens as any).primitive.font.sans.$value).toEqual(["Inter", "Readex Pro", "system-ui", "sans-serif"]);
    expect(sources(tokens)).toEqual({ Inter: "google", "Readex Pro": "bundled" });
    writeFileSync(join(root, "tokens.draft.json"), JSON.stringify(tokens));
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design/tokens.json"), JSON.stringify(tokens));
    const r = await runTokens(root, { positionals: [] });
    const notes = ((r.data as { notes?: string[] }).notes ?? []).join("\n");
    expect(notes).toContain("@expo-google-fonts/readex-pro");
    expect(notes).not.toContain("readexpro");
  });

  test("@expo-google-fonts/ibm-plex-sans-arabic's export is IBM Plex Sans Arabic, as the main family", () => {
    const root = makeProject({
      "package.json": pkg({ "@expo-google-fonts/ibm-plex-sans-arabic": "*" }),
      "App.tsx": `import { useFonts } from 'expo-font';
import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic';
export default function App() { useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_700Bold }); return null; }
export const s = { body: { fontFamily: 'IBMPlexSansArabic_400Regular', fontSize: 16 }, title: { fontFamily: 'IBMPlexSansArabic_700Bold', fontSize: 22 } };
`,
    });
    const occ = collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {}));
    expect(occ.fontFamily.map((f) => f.value)).toEqual(["IBM Plex Sans Arabic"]);
    const { tokens } = buildDraft(occ);
    expect((tokens as any).primitive.font.sans.$value).toEqual(["IBM Plex Sans Arabic", "system-ui", "sans-serif"]);
    expect(sources(tokens)).toEqual({ "IBM Plex Sans Arabic": "google" });
  });

  const READEX_USE = `export default function App() { useFonts({ ReadexPro_400Regular }); return null; }
export const s = { body: { fontFamily: 'ReadexPro_400Regular', fontSize: 16 } };
`;
  test.each([
    ["a per-weight subpath", `import { ReadexPro_400Regular } from '@expo-google-fonts/readex-pro/400Regular';\n`],
    ["a default import of a subpath", `import ReadexPro_400Regular from '@expo-google-fonts/readex-pro/400Regular';\n`],
    ["require()", `const { ReadexPro_400Regular } = require('@expo-google-fonts/readex-pro');\n`],
    ["an aliased require()", `const { ReadexPro_400Regular: Readex } = require("@expo-google-fonts/readex-pro");\n`],
    ["import * as", `import * as Readex from '@expo-google-fonts/readex-pro';\nconst ReadexPro_400Regular = Readex.ReadexPro_400Regular;\n`],
    ["import * as, its faces never read by name", `import * as Readex from '@expo-google-fonts/readex-pro';\nconst ReadexPro_400Regular = 1;\n`],
  ])("@expo-google-fonts/readex-pro through %s is Readex Pro, and motif tokens names the real package", async (_, imports) => {
    const root = makeProject({ "package.json": pkg({ "@expo-google-fonts/readex-pro": "*" }), "App.tsx": `import { useFonts } from 'expo-font';\n${imports}${READEX_USE}` });
    const occ = collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {}));
    expect(occ.googleFonts).toEqual(["Readex Pro"]);
    expect(occ.fontFamily.map((f) => f.value)).toEqual(["Readex Pro"]);
    const { tokens } = buildDraft(occ);
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design/tokens.json"), JSON.stringify(tokens));
    const notes = (((await runTokens(root, { positionals: [] })).data as { notes?: string[] }).notes ?? []).join("\n");
    expect(notes).not.toContain("readexpro");
  });

  test("@expo-google-fonts/dev, which exports every family, keeps each family by its export: Inter and Readex Pro, not Dev", () => {
    const root = makeProject({
      "package.json": pkg({ "@expo-google-fonts/dev": "*" }),
      "App.tsx": `import { useFonts } from 'expo-font';
import { Inter_400Regular, ReadexPro_400Regular, IBMPlexSansArabic_400Regular } from '@expo-google-fonts/dev';
export default function App() { useFonts({ Inter_400Regular, ReadexPro_400Regular, IBMPlexSansArabic_400Regular }); return null; }
export const s = { body: { fontFamily: 'Inter_400Regular', fontSize: 16 } };
`,
    });
    const occ = collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {}));
    expect(occ.googleFonts).toEqual(["Inter", "Readex Pro", "IBM Plex Sans Arabic"]);
  });

  /** A copy of a real font whose fvar table is renamed away: a static font at its default weight, 400. */
  const staticCopy = (path: string) => {
    const b = Buffer.from(readFileSync(path));
    for (let i = 0, n = b.readUInt16BE(4); i < n; i++) if (b.toString("latin1", 12 + i * 16, 16 + i * 16) === "fvar") b.write("xvar", 12 + i * 16, "latin1");
    return b;
  };
  const WEIGHTS = "files have weight";
  const extractNotes = async (fixture: string, change?: (root: string) => void) => {
    const root = makeProject({});
    cpSync(join(import.meta.dir, "fixtures", fixture), root, { recursive: true });
    change?.(root);
    expect((await runExtract(root, { positionals: [], flags: {} })).exitCode).toBe(0);
    return (read(root, "design/extract-report.json").notes as string[]).join("\n");
  };

  test("compose-min's and flutter-min's Noto Naskh Arabic has a 400–700 weight axis, so it has every weight the roles use", async () => {
    expect(await extractNotes("compose-min")).not.toContain(WEIGHTS);
    expect(await extractNotes("flutter-min")).not.toContain(WEIGHTS);
  });

  test("the same font made static (no weight axis) still gets the note", async () => {
    const compose = "app/src/main/res/font/noto_naskh_arabic.ttf";
    const notes = await extractNotes("compose-min", (root) => writeFileSync(join(root, compose), staticCopy(join(import.meta.dir, "fixtures/compose-min", compose))));
    expect(notes).toContain("Naskh Arabic's files have weight 400 only, but the type roles also use");
    const flutter = "assets/fonts/NotoNaskhArabic.ttf";
    expect(await extractNotes("flutter-min", (root) => writeFileSync(join(root, flutter), staticCopy(join(import.meta.dir, "fixtures/flutter-min", flutter))))).toContain(
      "NotoNaskhArabic's files have weight 400 only",
    );
  });

  test("an Expo app's require()d variable font is read the same way", () => {
    const root = makeProject({
      "package.json": pkg({}),
      "App.tsx": "import { useFonts } from 'expo-font';\nexport default function App() { useFonts({ 'NotoNaskhArabic-Regular': require('./assets/fonts/NotoNaskhArabic.ttf') }); return null; }\nexport const s = { body: { fontFamily: 'NotoNaskhArabic-Regular', fontSize: 16 } };\n",
    });
    mkdirSync(join(root, "assets/fonts"), { recursive: true });
    cpSync(join(import.meta.dir, "fixtures/flutter-min/assets/fonts/NotoNaskhArabic.ttf"), join(root, "assets/fonts/NotoNaskhArabic.ttf"));
    const occ = collectReactNative(REACT_NATIVE.sourceFiles!(root, app, {}));
    expect(occ.fontWeightRanges).toEqual([{ family: "NotoNaskhArabic", min: 400, max: 700 }]);
    expect(buildDraft(occ).report.notes.join("\n")).not.toContain(WEIGHTS);
  });
});
