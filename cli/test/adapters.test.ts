import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_IDS } from "../src/check/types";
import { expandHtml } from "../src/check/html";
import type { Lang } from "../src/check/files";
import { scanFile } from "../src/check/run";
import { buildScale } from "../src/check/scale";
import { buildTheme } from "../src/generate/theme";
import { exceptionFor } from "../src/check/exceptions";
import { dartReducedMotion, scanDart } from "../src/stacks/flutter/rules";
import { composeReducedMotion, scanKotlin } from "../src/stacks/compose/rules";
import { NO_ANDROID_SDK } from "../src/stacks/compose/doctor";
import { rnReducedMotion, scanReactNative } from "../src/stacks/react-native/rules";
import { scanSwift, swiftUIReducedMotion } from "../src/stacks/swiftui/rules";
import { runCheck } from "../src/commands/check";
import { runTokens } from "../src/commands/tokens";
import { docFrom, FIXTURES, validTokens } from "./helpers";
import { makeProject } from "./project";

const ADAPTERS = join(import.meta.dir, "../../skill/adapters");
const read = (rel: string) => readFileSync(join(ADAPTERS, rel), "utf8").replace(/\r\n/g, "\n");
const GUIDE_FILES = ["README.md", "checks.md", "components.md", "motion.md", "platform.md", "tokens.md"];
const STARTER_SET = [
  "Button", "IconButton", "Input", "Textarea", "Select", "Checkbox", "Switch", "Card", "ListItem", "TopBar",
  "TabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the stack guide template", () => {
  test("names the six files every stack guide has, with the part each covers", () => {
    const template = read("_template/README.md");
    for (const file of GUIDE_FILES) expect(template).toContain(`\`${file}\``);
    for (const part of ["0. Detect and scaffold", "1. Theme code", "2. Components", "3. Motion", "4. Platform rules", "5. Checks and screenshots"]) {
      expect(template).toContain(part);
    }
  });
});

describe("the React web guide", () => {
  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "react-web")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: both starters, without Next.js agent feedback, plus build and type-check commands", () => {
    const readme = read("react-web/README.md");
    for (const s of ["create-next-app@latest", "--no-agent-feedback", "--src-dir", "create vite@latest", "--template react-ts", "@tailwindcss/vite", "npm install motion", "npm run build", "npx tsc --noEmit"]) {
      expect(readme).toContain(s);
    }
  });

  test("tokens.md: the generated files, wiring them in, dark mode and fonts", () => {
    const tokens = read("react-web/tokens.md");
    for (const s of ["src/styles/motif.css", "src/styles/motif.tailwind.css", "src/design/motion.ts", '@import "tailwindcss";', "data-theme", "@fontsource/", "next/font", "bg-action-primary"]) {
      expect(tokens).toContain(s);
    }
  });

  test("tokens.md: a fresh starter's own theme is removed first, so it can't override the design guide", () => {
    const tokens = read("react-web/tokens.md");
    expect(tokens).toContain("A fresh starter");
    for (const s of ["@theme inline", "Geist", "next/font/google", "src/App.css"]) expect(tokens).toContain(s);
  });

  test("components.md: the starter set, with states, focus and an example that uses only theme values", () => {
    const components = read("react-web/components.md");
    for (const c of STARTER_SET) expect(components).toContain(`\`${c}\``);
    for (const s of ["focus-visible:", "aria-busy", "aria-invalid", "radix-ui", "spring.snappy"]) expect(components).toContain(s);
    expect(components).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  test("motion.md: MotionConfig, the motion roles and the common patterns", () => {
    const motion = read("react-web/motion.md");
    for (const s of ['reducedMotion="user"', 'from "@/design/motion"', "spring.smooth", "duration.fast", "easing.exit", "AnimatePresence", "layout"]) {
      expect(motion).toContain(s);
    }
  });

  test("platform.md: semantics, logical properties, pointers, breakpoints and safe areas", () => {
    const platform = read("react-web/platform.md");
    for (const s of ["ps-4", "text-start", "hover", "prefers-reduced-motion", "lang", "safe-area-inset", "DESIGN.md"]) expect(platform).toContain(s);
  });

  test("checks.md explains every motif check rule and every shot finding", () => {
    const checks = read("react-web/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(`## \`${id}\``);
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "motif-ok"]) expect(checks).toContain(s);
  });
});

const PLAIN_STARTER_SET = [
  "Button", "IconButton", "Field", "Checkbox", "Choice", "Switch", "Card", "ListItem", "TopBar", "TabBar",
  "Sidebar", "Dialog", "Sheet", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge",
];

describe("the plain web guide", () => {
  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "plain-web")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: how a site and its site folder are recognised, starting one, and nothing to build", () => {
    const readme = read("plain-web/README.md");
    for (const s of ["index.html", "`public/`", "`src/`", "`site/`", "`www/`", "plain-web", "srcDir", "components.css", "styles.css", "mock-data.js", "npm create vite@latest", "--template vanilla", "nothing to build", "--url"]) {
      expect(readme).toContain(s);
    }
  });

  test("tokens.md: motif.css in the site folder linked first, the site's own names, dark mode and fonts", () => {
    const tokens = read("plain-web/tokens.md");
    for (const s of ['<link rel="stylesheet" href="motif.css">', "var(--motif-color-background)", "--bg: var(--motif-color-background);", "data-theme", "@font-face", "fonts.googleapis.com", "tokens.flat.json", "motif extract", "motif-ok"]) {
      expect(tokens).toContain(s);
    }
  });

  test("components.md: the Component: lines, states through CSS, and the starter set", () => {
    const components = read("plain-web/components.md");
    for (const c of PLAIN_STARTER_SET) expect(components).toContain(`\`${c}\``);
    for (const s of ["/* Component:", "components.css", ":focus-visible", ":disabled", '[aria-busy="true"]', '[aria-invalid="true"]', "showModal()", "aria-label"]) {
      expect(components).toContain(s);
    }
    // A field's description includes hidden text, so error text starts empty rather than hidden.
    expect(components).not.toMatch(/id="[\w-]+-error"[^>]*hidden/);
    expect(components).toContain(".field-error:empty");
  });

  test("motion.md: the roles in CSS, View Transitions, and reduced motion in scripts", () => {
    const motion = read("plain-web/motion.md");
    for (const s of ["var(--motif-duration-base)", "var(--motif-easing-enter)", "var(--motif-easing-exit)", "@keyframes", "startViewTransition", "prefers-reduced-motion", "getPropertyValue"]) {
      expect(motion).toContain(s);
    }
  });

  test("platform.md: native elements, labels, logical properties, phones, and things used together", () => {
    const platform = read("plain-web/platform.md");
    for (const s of ["Native elements", "A placeholder isn't a label", "padding-inline-start", "@media (hover: hover)", "safe-area-inset", "lang", "DESIGN.md", "on one screen", "360, 390 and 430 px wide"]) {
      expect(platform).toContain(s);
    }
  });

  test("checks.md: every rule on plain web, the audit's findings, and state scripts", () => {
    const checks = read("plain-web/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(id.startsWith("tailwind") ? `\`${id}\`` : `## \`${id}\``);
    for (const s of ["## Contrast", "## Target size", "## Reduced motion", "<!-- motif-ok", "## Screens behind a form or a click", "design/states/", "--state", "index@sent.mobile.png", "15 seconds", "runs in every page", 'dispatchEvent(new Event("input"']) {
      expect(checks).toContain(s);
    }
  });

  test("every CSS, HTML and script example passes motif check as it is", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), ".");
    const LANGS: Record<string, Lang> = { css: "css", html: "markup", js: "script" };
    for (const file of GUIDE_FILES) {
      const text = read(`plain-web/${file}`);
      for (const [i, m] of [...text.matchAll(/```(css|html|js)\n([\s\S]*?)```/g)].entries()) {
        const path = `${file}-example-${i + 1}.${m[1]}`;
        const hits = expandHtml([{ path, abs: path, text: m[2]!, lang: LANGS[m[1]!]! }])
          .flatMap((f) => scanFile(f, scale, { tailwind: false }))
          .filter((h) => h.violation);
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});

describe("the Flutter guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`flutter/${file}`);
    for (const s of strings) expect(text).toContain(s);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "flutter")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: the starter, the build commands, the toolchain, the theme folder and monorepos", () => {
    has("README.md", [
      "flutter create --org", "flutter analyze", "flutter test", "design/motif.json", "themeDir",
      "Flutter SDK", "Flutter 3.44.8 (Dart 3.12.2)", "3.27", "https://docs.flutter.dev/get-started/install",
      "## Monorepos", "mobile/packages", "one guide for the web dashboard and the Flutter app", "platform notes", "flutter_test",
    ]);
  });

  test("tokens.md: wiring the generated file, reading it in widgets, fonts, and switching variants", () => {
    has("tokens.md", [
      "MotifTheme.light(", "MotifColors.of(context)", "MotifText.", "MotifSpace.", "fontFamilyFallback", "pubspec.yaml", "google_fonts",
      "## Switching variants", "MotifTheme.light(variant: MotifVariant.", "MotifTheme.debugVariantOverride", "colours only",
    ]);
  });

  test("tokens.md: actionText for text, outlined and elevated buttons, and what still draws the action colour as text", () => {
    has("tokens.md", [
      "`TextButton`, `OutlinedButton` and `ElevatedButton` take their label colour from it", "`FilledButton`",
      "a focused field's label", "`TabBar` labels", "checkboxes, switches and radio buttons", "use `colors.actionText`",
    ]);
  });

  test("components.md: where widgets live, private widgets, every state, and names", () => {
    has("components.md", [
      "lib/widgets/", "lib/features/<feature>/widgets/", "private `_Widget` classes are parts of a screen",
      "WidgetState.pressed", "WidgetState.focused", "WidgetState.disabled", "Semantics(", "tooltip:",
    ]);
    for (const c of ["Button", "IconButton", "Field", "Checkbox", "Switch", "Card", "ListItem", "TopBar", "TabBar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge"]) {
      expect(read("flutter/components.md")).toContain(`\`${c}\``);
    }
  });

  test("motion.md: the roles in Flutter's animation API, springs, and reduced motion", () => {
    has("motion.md", ["MotifCurves.", "MotifDurations.", "MotifSprings.", "SpringSimulation", "MotifMotion.duration(context"]);
  });

  test("platform.md: right to left, Material on Android and Cupertino conventions on iOS, locales", () => {
    has("platform.md", ["Directionality", "EdgeInsetsDirectional", "AlignmentDirectional", "Material 3 on Android", "Cupertino conventions on iOS", "supportedLocales", "DESIGN.md"]);
  });

  test("checks.md: every rule, the audit, the setup and state scripts, and the screenshot flags", () => {
    const checks = read("flutter/checks.md");
    for (const id of RULE_IDS.filter((r) => !r.startsWith("tailwind") && r !== "primitive-use")) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", [
      "## Contrast", "## Target size", "## Names", "## Reduced motion", "// motif-ok:",
      "design/states/setup.dart", "Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async",
      "design/states/http.json", "Future<void> motifState(WidgetTester tester) async", "--screen", "--rtl", "--state", "flutter_test",
    ]);
  });

  test("the Dart examples pass motif check as they are", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), "lib/design");
    for (const file of GUIDE_FILES) {
      const text = read(`flutter/${file}`);
      const blocks = [...text.matchAll(/```dart\n([\s\S]*?)```/g)].map((m) => m[1]!);
      if (file !== "README.md") expect(blocks.length).toBeGreaterThan(0);
      for (const [i, code] of blocks.entries()) {
        const path = `${file}-example-${i + 1}.dart`;
        const source = { path, abs: path, text: code, lang: "dart" as const };
        const lines = code.split("\n");
        const hits = [...scanDart(source, scale), ...dartReducedMotion([source])].filter((h) => h.violation && !("reason" in (exceptionFor(lines, h.line) ?? {})));
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});

describe("the Compose guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`compose/${file}`);
    for (const s of strings) expect([file, s, text.includes(s)]).toEqual([file, s, true]);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "compose")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: the Empty Activity starter, the build commands, doctor's lines, the floors, the theme folder and monorepos", () => {
    has("README.md", [
      "Empty Activity", "./gradlew", "compileDebugKotlin", "design/motif.json", "themeDir",
      "`JDK`", "JDK 17.0.12.", "`Android SDK`", "(platforms 35, 36)", "No JDK found", "https://adoptium.net", "is older than 17", NO_ANDROID_SDK,
      "Kotlin 2.0", "Compose UI 1.9", "Material 3 1.3", "Android Gradle Plugin 8.6", "Gradle 8.7", "JDK 17", "`compileSdk` 35",
      "## Monorepos", "one guide for the web dashboard and the Android app", "platform notes", "--app",
    ]);
    // Compose UI 1.9 refuses AGP 8.5 (decision 0008), so the guide never offers it.
    expect(read("compose/README.md")).not.toContain("8.5");
  });

  test("README: the wrapper is made with no Gradle installed, from a cached Gradle or Gradle's own release, on Android Studio's JDK (Task 15)", () => {
    has("README.md", [
      "No Gradle needs to be installed", "`JAVA_HOME`", "C:\\Program Files\\Android\\Android Studio\\jbr", "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
      "~/.gradle/wrapper/dists/", "https://services.gradle.org/distributions/gradle-8.14.3-bin.zip", "`.sha256`", "`Expand-Archive`", "`curl.exe`",
      "bin/gradle wrapper --gradle-version 8.14.3", "`bin\\gradle.bat`", "sdk.dir=C:/Users/you/AppData/Local/Android/Sdk", "JAVA_HOME is not set",
      // The distribution's checksum is pinned (Gradle's published .sha256), checked per shell, and kept in the wrapper's properties.
      "bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531", "--gradle-distribution-sha256-sum bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531",
      "Get-FileHash -Algorithm SHA256", "shasum -a 256", "sha256sum",
      '$env:JAVA_HOME = "C:\\Program Files\\Android\\Android Studio\\jbr"', 'set "JAVA_HOME=', 'JAVA_HOME="/opt/android-studio/jbr" ./gradlew',
    ]);
  });

  test("tokens.md: wiring MotifTheme in, reading it in composables, fonts, the Arabic companion and switching variants", () => {
    has("tokens.md", [
      "MotifTheme(", "MotifTheme.colors.", "MotifType.", "MotifSpace.", "MotifRadius.", "Modifier.motifShadow(", "res/font", "ui-text-google-fonts", "motif_font_certs.xml",
      "Arabic companion", "MaterialTheme.typography", "ui/theme", "can be deleted",
      "## Switching variants", "MotifTheme(variant = MotifVariant.", "rememberSaveable", "StateFlow", "MotifTheme.debugVariantOverride", "colours only",
    ]);
  });

  test("components.md: where composables live, hoisted state, every state, names and touch targets", () => {
    has("components.md", [
      "ui/components/", "ui/<feature>/", "stateless", "hoist", "interactionSource", "collectIsPressedAsState", "collectIsFocusedAsState", "enabled = false",
      "Modifier.semantics {", "contentDescription", "Modifier.minimumInteractiveComponentSize()",
    ]);
    for (const c of ["Button", "IconButton", "Field", "Checkbox", "Switch", "Card", "ListItem", "TopBar", "TabBar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge"]) {
      expect(read("compose/components.md")).toContain(`\`${c}\``);
    }
  });

  test("motion.md: the roles in Compose's animation API, springs, and reduced motion", () => {
    has("motion.md", ["MotifEasing.", "MotifDurations.", "MotifSprings.", "animate*AsState", "MotifMotion.duration(", "MotifMotion.reduced()", "Remove animations"]);
  });

  test("platform.md: right to left, Material 3 on Android, edge to edge, languages", () => {
    has("platform.md", [
      "LayoutDirection.Rtl", "start =", "end =", "Icons.AutoMirrored", "material-icons-core", "Material 3 on Android", "enableEdgeToEdge()", "WindowInsets", "values-ar", "DESIGN.md",
    ]);
  });

  test("checks.md: every rule, the audit, the setup and state files, and the screenshot flags", () => {
    const checks = read("compose/checks.md");
    for (const id of RULE_IDS.filter((r) => !r.startsWith("tailwind") && r !== "primitive-use")) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", [
      "## Contrast", "## Target size", "## Names", "## Reduced motion", "// motif-ok:",
      "design/states/Setup.kt", "package dev.motif.states", "fun motifSetup(variant: String, locale: Locale, dark: Boolean)",
      "package dev.motif.states.sent", "fun motifState(rule: ComposeContentTestRule)", "--screen", "@Preview", "--rtl", "--state",
    ]);
  });

  test("the Kotlin examples pass motif check as they are", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), "app/src/main/java/com/example/app/ui/motif");
    for (const file of GUIDE_FILES) {
      const text = read(`compose/${file}`);
      const blocks = [...text.matchAll(/```kotlin\n([\s\S]*?)```/g)].map((m) => m[1]!);
      if (file !== "README.md") expect([file, blocks.length > 0]).toEqual([file, true]);
      for (const [i, code] of blocks.entries()) {
        const path = `${file}-example-${i + 1}.kt`;
        const source = { path, abs: path, text: code, lang: "kotlin" as const };
        const lines = code.split("\n");
        const hits = [...scanKotlin(source, scale), ...composeReducedMotion([source])].filter((h) => h.violation && !("reason" in (exceptionFor(lines, h.line) ?? {})));
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});

describe("the React Native guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`react-native/${file}`);
    for (const s of strings) expect(text).toContain(s);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "react-native")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: the starter, the build commands, the web target, the theme folder and the floors", () => {
    has("README.md", [
      "npx create-expo-app@latest", "npx expo install", "npx tsc --noEmit", "npx expo start --web", "react-native-web",
      "design/motif.json", "themeDir", "Expo's web target", "Expo SDK 52", "React Native 0.76", "Reanimated 3.16", "TypeScript 5",
    ]);
  });

  test("tokens.md: the provider, the hook, fonts, the scales and switching variants", () => {
    has("tokens.md", [
      "MotifProvider", "useMotifTheme()", "motifFonts", "useFonts", "@expo-google-fonts/", "space.", "radius.", "type.", "boxShadow",
      "## Switching variants", "useState", "constants/Colors.ts", "useThemeColor", "design/motif-theme.tsx", "data-variant", "regular (400)",
    ]);
  });

  test("components.md: where components live, Pressable states, names, tap areas and the starter set", () => {
    has("components.md", ["components/", "Pressable", "pressed", "android_ripple", "accessibilityRole", "accessibilityLabel", "hitSlop", "focused", "disabled"]);
    for (const c of STARTER_SET.filter((c) => !["Input", "Textarea", "Select", "Sidebar"].includes(c)).concat(["Field"])) {
      expect(read("react-native/components.md")).toContain(`\`${c}\``);
    }
  });

  test("motion.md: the roles in Reanimated, springs, and reduced motion", () => {
    has("motion.md", ["withSpring(", "spring.", "withTiming(", "duration.", "easing.", "useReducedMotion", "entering=", "ReduceMotion.System", "AccessibilityInfo"]);
  });

  test("platform.md: right to left, safe areas, iOS and Android, locales", () => {
    has("platform.md", ["I18nManager", "marginStart", "paddingEnd", "SafeAreaView", "react-native-safe-area-context", "iOS", "Android", "expo-localization", "DESIGN.md"]);
  });

  test("checks.md: every rule, the audit, state scripts as JavaScript for the web target, and --rtl", () => {
    const checks = read("react-native/checks.md");
    for (const id of RULE_IDS.filter((r) => !r.startsWith("tailwind") && r !== "primitive-use")) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", [
      "## Contrast", "## Target size", "## Names", "## Reduced motion", "// motif-ok:", "--state design/states/", "aria-label", "placeholder",
      "--rtl", "NativeWind", "tailwind-arbitrary", "accessibilityLabel", "hitSlop", "ReduceMotion.System",
    ]);
  });

  test("the TypeScript examples pass motif check as they are", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), "design");
    for (const file of GUIDE_FILES) {
      const text = read(`react-native/${file}`);
      const blocks = [...text.matchAll(/```(?:tsx|ts)\n([\s\S]*?)```/g)].map((m) => m[1]!);
      if (file !== "README.md") expect(blocks.length).toBeGreaterThan(0);
      for (const [i, code] of blocks.entries()) {
        const path = `${file}-example-${i + 1}.tsx`;
        const source = { path, abs: path, text: code, lang: "script" as const };
        const lines = code.split("\n");
        const hits = [...scanReactNative(source, scale), ...rnReducedMotion([source])].filter((h) => h.violation && !("reason" in (exceptionFor(lines, h.line) ?? {})));
        expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
      }
    }
  });
});

describe("the Vue guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`vue/${file}`);
    for (const s of strings) expect(text).toContain(s);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "vue")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: both starters, the commands, the theme folder, the floors, Vue 2, mockups and the first-screenshot times", () => {
    has("README.md", [
      "npm create vue@latest", "npm create nuxt@latest", "npx vue-tsc --noEmit", "nuxi typecheck", "npm run dev",
      "design/motif.json", "themeDir", "srcDir", "Vue 3", "Nuxt 3", "Node 22.22.3", "Vue 2 and Nuxt 2 aren't supported",
      "browser frame", "Vite about 2 seconds", "Nuxt with server rendering about 7 seconds",
      "motif shot --url", "dev server included, typical:", "a Vue 2 app is recognised too",
    ]);
    expect(read("vue/README.md")).not.toContain("measured on Windows");
  });

  test("tokens.md: the files, wiring them in, the starter's variables, and switching variants", () => {
    has("tokens.md", [
      "motif.css", "motif.tailwind.css", "nuxt.config.ts", "css: ['~/assets/css/motif.css']", "src/main.ts", "var(--motif-color-", "bg-action-primary",
      "data-variant", "## Switching variants", "document.documentElement.dataset.variant", "useHead({ htmlAttrs: { 'data-variant'",
      "--color-background: var(--motif-color-background)", "base.css",
    ]);
  });

  test("components.md: where components live, script setup, every state, names and the starter set", () => {
    has("components.md", [
      "src/components/", "components/", "auto-imports", '<script setup lang="ts">', "defineProps", "slot", "<button", ":hover", ":focus-visible", ":disabled", ":active",
      "aria-label", "<style scoped>", "var(--motif-",
    ]);
    for (const c of STARTER_SET) expect(read("vue/components.md")).toContain(`\`${c}\``);
  });

  test("motion.md: Transition, the CSS roles, Motion for Vue and reduced motion", () => {
    has("motion.md", [
      "<Transition>", "var(--motif-duration-base)", "motion-v", "<motion.div", ':transition="spring.', "duration.", "useReducedMotion", '<MotionConfig reduced-motion="user">',
    ]);
  });

  test("platform.md: right to left, logical properties, head tags, i18n and server rendering", () => {
    has("platform.md", [
      'dir="rtl"', "margin-inline-start", "padding-inline-end", "useHead({ htmlAttrs: { lang, dir } })", "vue-i18n", "server rendering", "onMounted",
    ]);
  });

  test("checks.md: every rule, the audit, state scripts as JavaScript, and --rtl", () => {
    const checks = read("vue/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", ["## Contrast", "## Target size", "## Reduced motion", "motif-ok", "<!-- motif-ok", "--state design/states/", "are JavaScript", "--rtl", "## Screens behind a form or a click", "data-ready"]);
  });

  test("the code examples pass motif check as they are", async () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ name: "x", scripts: { dev: "vite" }, dependencies: { vue: "^3.5.0", "motion-v": "^2.0.0", tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" } }),
      "index.html": '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
      "src/main.ts": 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");\n',
      "src/App.vue": '<script setup lang="ts">\nimport { MotionConfig } from "motion-v";\n</script>\n<template><MotionConfig reduced-motion="user"><main /></MotionConfig></template>\n',
      "design/tokens.json": readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8"),
    };
    const examples: string[] = [];
    for (const file of GUIDE_FILES) {
      const text = read(`vue/${file}`);
      for (const [i, m] of [...text.matchAll(/```(vue|ts|css)\n([\s\S]*?)```/g)].entries()) {
        const path = `src/examples/${file.replace(".md", "")}-${i + 1}.${m[1]}`;
        files[path] = m[2]!;
        examples.push(path);
      }
    }
    expect(examples.filter((p) => p.endsWith(".vue")).length).toBeGreaterThan(5);
    const root = makeProject(files);
    expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
    const result = await runCheck(root, { positionals: [] });
    const hits = ((result.data as any).violations as any[]).filter((h) => h.file.startsWith("src/examples/")).map((h) => `${h.file}:${h.line} ${h.rule} ${h.text}`);
    expect(hits).toEqual([]);
  });
});

describe("the SwiftUI guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`swiftui/${file}`);
    for (const s of strings) expect([file, s, text.includes(s)]).toEqual([file, s, true]);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "swiftui")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: Xcode's App template, no command-line starter, xcodebuild, the Mac, doctor's lines, the floors and monorepos", () => {
    has("README.md", [
      "**App**", "no command-line starter", "swift package init --type executable", "xcodebuild", "-destination", "a Mac",
      "`Xcode`", "SwiftUI screenshots need a Mac with Xcode.", "Xcode isn't installed.", "is older than 16", "install an iOS simulator in Xcode › Settings › Components",
      "A macOS app needs no simulator.", "not only its command-line tools",
      "Xcode 16", "iOS 17", "macOS 14", "**Swift 5**", "**Swift 6**", "design/motif.json", "themeDir", "## Monorepos", "one guide for the web dashboard and the iPhone app", "platform notes", "--app",
      "#Preview", "synchronized folder", "Podfile", "Package.swift",
      // A family the app ships is drafted as its own (sweep Task 3, SwiftUI).
      "the guide's fonts list", "`UIAppFonts`",
    ]);
  });

  test("tokens.md: wiring .motifTheme in, reading the colours from the environment, type, sizes, fonts and switching variants", () => {
    has("tokens.md", [
      ".motifTheme(", "@Environment(\\.motifColors)", ".motifFont(", "MotifSpace.", "MotifRadius.", ".motifShadow(", "MotifType.", "Arabic companion",
      "UIAppFonts", "ATSApplicationFontsPath", "fonts.google.com", "Info.plist", "AccentColor",
      "## Switching variants", "@AppStorage", "MotifVariant(rawValue:", ".motifTheme(variant:", "MotifTheme.debugVariantOverride", "colours only",
      // A new App for each root screenshot: its init runs; its delegate's launch work doesn't (final review).
      "`App`'s `init` runs before each screenshot of the root",
      // Init work that can't run twice stops the root's screenshots: guard it (v0.5.0 sweep).
      "can't run twice", "`if FirebaseApp.app() == nil { FirebaseApp.configure() }`",
    ]);
    expect(read("swiftui/tokens.md")).not.toContain("what the `App` sets up in its `init`");
  });

  test("components.md: where views live, private views, button styles, every state, names, 44 pt and focus", () => {
    has("components.md", [
      "Components/", "Features/<Feature>/", "`private` views are parts of a screen", "ButtonStyle", "configuration.isPressed", "@Environment(\\.isEnabled)",
      "@FocusState", ".accessibilityLabel", ".contentShape", "44", ".frame(minWidth: 44, minHeight: 44)", "Label(",
      // With a prompt, iOS names a field by its prompt: give it its label as its name (v0.5.0 sweep, Qahwa's email field).
      "iOS names the field by its prompt", "`.accessibilityLabel(label)`",
    ]);
    for (const c of ["Button", "IconButton", "Field", "Checkbox", "Switch", "Card", "ListItem", "TopBar", "TabBar", "Sheet", "Dialog", "Toast", "Skeleton", "EmptyState", "ErrorState", "Avatar", "Badge"]) {
      expect(read("swiftui/components.md")).toContain(`\`${c}\``);
    }
  });

  test("motion.md: the roles in SwiftUI's animation API, springs, and reduced motion", () => {
    has("motion.md", ["MotifSprings.", "MotifCurves.", "MotifDurations.", "withAnimation(", "accessibilityReduceMotion", "MotifMotion.animation(", "isReduceMotionEnabled", ".repeatForever("]);
  });

  test("platform.md: right to left, leading and trailing, Dynamic Type, safe areas, iOS and the Mac, languages", () => {
    has("platform.md", [
      ".environment(\\.layoutDirection", "leading", "trailing", ".flipsForRightToLeftLayoutDirection(true)", "Dynamic Type", "safe area", ".safeAreaInset(",
      "Localizable.xcstrings", "NavigationStack", "the Mac", "DESIGN.md",
    ]);
  });

  test("checks.md: every rule, the audit, the setup and state files with their exact signatures, and the screenshot flags", () => {
    const checks = read("swiftui/checks.md");
    for (const id of RULE_IDS.filter((r) => !r.startsWith("tailwind") && r !== "primitive-use")) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", [
      "## Contrast", "## Target size", "## Names", "## Reduced motion", "// motif-ok:",
      "design/states/Setup.swift", "func motifSetup(variant: String, locale: Locale, dark: Bool)", "@MainActor func motifState(_ app: MotifHarness) async throws",
      "MotifHarness", "app.tap(", "app.type(", "app.waitFor(", "app.exists(", "15 seconds", "top-level",
      "--screen", "#Preview", "--rtl", "--state", "a Mac", "1440×900", "900×700", "--sizes 1440",
      // How a state finds a field: its title, its prompt on iOS when it shows one, its label when it has one (c51cea3, fix round 1).
      "its title, or on iOS its prompt when it shows one, unless the field has an `.accessibilityLabel` (then that label)",
      // The Mac's title bar mirrors right to left (v0.5.0 sweep, Landmarks 5).
      "the window's buttons are at the top right",
      // A new App, and its own @State, for each root screenshot, and the note when it can't be kept (Task 15, final review).
      "a new `App` for each screenshot of `/`", "the run's note names the `@State` that wasn't kept", "@Previewable @State",
      "`App`'s `init` runs before each screenshot of the root",
      "can't run twice", "`if FirebaseApp.app() == nil { FirebaseApp.configure() }`", "Default app has already been configured",
      // A negative padding keeps its sign and is judged by its size (v0.5.0 sweep, Landmarks 9).
      "`.padding(.bottom, -2)`", "`-MotifSpace.s1`",
      // Sizes kept in a constants type aren't traced, so the guide says to replace them with roles (Landmarks 8).
      "static let standardPadding: CGFloat = 14", "can't see where the views use it", "replace each constant with the theme's role", "not a `shadowRadius`",
    ]);
  });

  test("the Swift examples pass motif check as they are, and each rule's bad example is reported by it", () => {
    const scale = buildScale(buildTheme(docFrom(validTokens())), "MyApp/Design");
    const reported = new Set<string>();
    for (const file of GUIDE_FILES) {
      const text = read(`swiftui/${file}`);
      const blocks = [...text.matchAll(/```swift\n([\s\S]*?)```/g)].map((m) => m[1]!);
      if (file !== "README.md") expect([file, blocks.length > 0]).toEqual([file, true]);
      for (const [i, code] of blocks.entries()) {
        const path = `${file}-example-${i + 1}.swift`;
        const source = { path, abs: path, text: code, lang: "swift" as const };
        const lines = code.split("\n");
        const hits = [...scanSwift(source, scale), ...swiftUIReducedMotion([source])].filter((h) => h.violation && !("reason" in (exceptionFor(lines, h.line) ?? {})));
        // A bad example starts with "// Reported as <rule>:", and motif check reports it as that rule, and only that.
        const bad = /^\/\/ Reported as ([a-z-]+):/.exec(code)?.[1];
        if (bad) {
          expect([path, file]).toEqual([path, "checks.md"]);
          expect([path, hits.length > 0, [...new Set(hits.map((h): string => h.rule))]]).toEqual([path, true, [bad]]);
          reported.add(bad);
        } else {
          expect(hits.map((h) => `${path}: ${h.rule} ${h.text}`)).toEqual([]);
        }
      }
    }
    expect([...reported].sort()).toEqual(["off-scale", "raw-color", "raw-font", "raw-motion", "reduced-motion"]);
  });
});

describe("the Svelte guide", () => {
  const has = (file: string, strings: string[]) => {
    const text = read(`svelte/${file}`);
    for (const s of strings) expect(text).toContain(s);
  };

  test("has exactly the template's files", () => {
    expect(readdirSync(join(ADAPTERS, "svelte")).sort()).toEqual(GUIDE_FILES);
  });

  test("README: both starters, the commands, the theme folder, the floors, Svelte 4, mockups and the first-screenshot times", () => {
    has("README.md", [
      "npx sv create", "npm create vite@latest", "npx svelte-check", "npm run dev", "design/motif.json", "themeDir", "srcDir",
      "Svelte 5", "SvelteKit 2 or 3", "Node 22.17", "Svelte 4 isn't supported", "motif shot --url", "browser frame",
      "SvelteKit 2 about 4 seconds", "Svelte with Vite about 3 seconds", "SvelteKit 3 about 4 seconds",
    ]);
  });

  test("tokens.md: the files, wiring them in, the starter's variables, and switching variants", () => {
    has("tokens.md", [
      "motif.css", "motif.tailwind.css", "$lib/styles/motif.css", "#lib/styles/motif.css", "+layout.svelte", "src/main.ts", "var(--motif-color-", "bg-action-primary",
      "data-variant", "## Switching variants", "document.documentElement.dataset.variant", "transformPageChunk", "hooks.server.ts", "%variant%",
    ]);
  });

  test("components.md: where components live, runes, snippets, every state, names and the starter set", () => {
    has("components.md", [
      "src/lib/components/", "$props()", "{@render", "<button", ":hover", ":focus-visible", ":disabled", ":active", "aria-label", "<style>", "var(--motif-", "PascalCase",
    ]);
    for (const c of STARTER_SET) expect(read("svelte/components.md")).toContain(`\`${c}\``);
  });

  test("motion.md: transitions, the CSS roles, Spring and Tween, Motion for the refresh-independent spring, and reduced motion", () => {
    has("motion.md", [
      "transition:fly", "duration.", "easing.", "Spring", "spring.", "Tween", "prefersReducedMotion", "animate(", "motionSpring.", "120 Hz", "var(--motif-duration-fast)",
    ]);
  });

  test("platform.md: right to left, logical properties, the page's lang and dir, and server rendering", () => {
    has("platform.md", [
      'dir="rtl"', "margin-inline-start", "padding-inline-end", "src/app.html", "<html lang", "transformPageChunk", "server rendering", "onMount", "$effect",
    ]);
  });

  test("checks.md: every rule, the audit, state scripts as JavaScript, and --rtl", () => {
    const checks = read("svelte/checks.md");
    for (const id of RULE_IDS) expect(checks).toContain(`## \`${id}\``);
    has("checks.md", ["## Contrast", "## Target size", "## Reduced motion", "motif-ok", "<!-- motif-ok", "--state design/states/", "are JavaScript", "--rtl", "## Screens behind a form or a click", "data-ready"]);
  });

  test("the code examples pass motif check as they are", async () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({
        name: "x", private: true, type: "module", scripts: { dev: "vite dev" },
        devDependencies: { "@sveltejs/kit": "^2.70.0", "@sveltejs/vite-plugin-svelte": "^7.0.0", svelte: "^5.57.0", typescript: "~5.9.0", vite: "^8.0.0", tailwindcss: "^4.1.0", "@tailwindcss/vite": "^4.1.0" },
        dependencies: { motion: "^14.6.0" },
      }),
      "svelte.config.js": "export default { kit: {} };\n",
      "src/app.html": '<!doctype html>\n<html lang="en">%sveltekit.head%%sveltekit.body%</html>\n',
      "src/routes/+page.svelte": "<h1>Welcome</h1>\n",
      "src/lib/pref.ts": 'import { prefersReducedMotion } from "svelte/motion";\nexport const calm = () => prefersReducedMotion.current;\n',
      "design/tokens.json": readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8"),
    };
    const examples: string[] = [];
    for (const file of GUIDE_FILES) {
      const text = read(`svelte/${file}`);
      for (const [i, m] of [...text.matchAll(/```(svelte|ts|css)\n([\s\S]*?)```/g)].entries()) {
        // The block that fills a placeholder in the page is a hook, not code to scan beside a layout.
        const path = `src/lib/examples/${file.replace(".md", "")}-${i + 1}.${m[1] === "svelte" ? "svelte" : m[1]}`;
        files[path] = m[2]!;
        examples.push(path);
      }
    }
    expect(examples.filter((p) => p.endsWith(".svelte")).length).toBeGreaterThan(8);
    const root = makeProject(files);
    expect((await runTokens(root, { positionals: [] })).exitCode).toBe(0);
    const result = await runCheck(root, { positionals: [] });
    const hits = ((result.data as any).violations as any[]).filter((h) => h.file.startsWith("src/lib/examples/")).map((h) => `${h.file}:${h.line} ${h.rule} ${h.text}`);
    expect(hits).toEqual([]);
  });
});

describe("the parity checklist (docs/parity.md, Task 15)", () => {
  const REPO = join(import.meta.dir, "../..");
  const AREAS = ["Detect and set up", "Theme code", "Checks", "Drafting a guide", "Components", "Mockups", "Screenshots", "Audit", "Skill", "Evals", "Agents"];
  const parity = readFileSync(join(REPO, "docs/parity.md"), "utf8").replace(/\r\n/g, "\n");
  const cells = (line: string) => line.split("|").slice(1, -1).map((c) => c.trim());
  const table = parity.split("\n").filter((l) => l.startsWith("| ")).map(cells);
  const header = table.find((r) => r[0] === "Stack")!;
  const row = (stack: string) => table.find((r) => r[0] === stack);

  test("has one row per stack, with the spec's areas as columns", () => {
    expect(header.slice(1)).toEqual(AREAS);
    for (const stack of ["React web", "Plain web", "Flutter", "Jetpack Compose", "SwiftUI", "React Native (Expo)", "Vue / Nuxt", "Svelte / SvelteKit", "Angular"]) {
      expect(row(stack)?.length ?? `${stack} has no row`).toBe(AREAS.length + 1);
    }
  });

  test("React web, plain web, Flutter, React Native, Jetpack Compose, SwiftUI and Vue have every area done; the stacks still to come have none", () => {
    for (const stack of ["React web", "Plain web", "Flutter", "React Native (Expo)", "Jetpack Compose", "SwiftUI", "Vue / Nuxt"]) expect([stack, row(stack)!.slice(1)]).toEqual([stack, AREAS.map(() => "done")]);
    // SwiftUI's proof names the runs its four cases passed in (2H Task 15).
    const swiftEvals = table.find((r) => r[0] === "Evals" && r[1]!.includes("fixtures-swiftui.test.ts"))!;
    for (const s of ["eval run 20261022-061913", "It passed in run 20261022-085041"]) expect(swiftEvals[1]).toContain(s);
    // The cell and its proof agree: each Evals proof names the run that passed.
    for (const fixtureTest of ["fixtures-rn.test.ts", "fixtures-compose.test.ts", "fixtures-vue.test.ts"]) {
      const proof = table.find((r) => r[0] === "Evals" && r[1]!.includes(fixtureTest))!;
      expect([fixtureTest, proof[1]!.includes("Recorded in eval run")]).toEqual([fixtureTest, true]);
    }
    for (const stack of ["Svelte / SvelteKit", "Angular"]) {
      expect([stack, row(stack)!.slice(1)]).toEqual([stack, AREAS.map(() => "not yet")]);
    }
  });

  test("Flutter's, Jetpack Compose's, React Native's, SwiftUI's and Vue's proofs name every area, and every file they link to exists", () => {
    const section = (heading: string) => {
      const start = parity.indexOf(heading);
      expect(start).toBeGreaterThan(-1);
      const next = parity.indexOf("\n## ", start + 1);
      return next === -1 ? parity.slice(start) : parity.slice(start, next);
    };
    for (const proof of [
      section("## Flutter: the tests that show it"), section("## Jetpack Compose: the tests that show it"), section("## React Native (Expo): the tests that show it"),
      section("## SwiftUI: the tests that show it"), section("## Vue / Nuxt: the tests that show it"),
    ]) {
      for (const area of AREAS) expect(proof).toContain(`| ${area} |`);
    }
    expect(section("## Jetpack Compose: the tests that show it")).toContain("(decisions/0008-compose-rendering.md)");
    const swift = section("## SwiftUI: the tests that show it");
    expect(swift).toContain("(decisions/0010-swiftui-rendering.md)");
    for (const job of ["`swiftui`", "`swiftui-fixtures`"]) expect(swift).toContain(job);
    const vue = section("## Vue / Nuxt: the tests that show it");
    expect(vue).toContain("`vue`");
    expect(vue).toContain("(notes/2026-10-24-vue-hands-on.md)");
    const links = [...parity.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)].map((m) => m[1]!).filter((l) => !l.startsWith("http"));
    expect(links.length).toBeGreaterThan(AREAS.length);
    for (const link of links) expect(existsSync(join(REPO, "docs", link)) ? "ok" : link).toBe("ok");
  });
});
