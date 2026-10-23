// A family the app ships is drafted as its own (a project font, with its files); a family is drafted as a Google font
// only when the app gets it from Google. Checked through what `motif tokens` reads from the draft (themeFonts).
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runExtract } from "../src/commands/extract";
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
