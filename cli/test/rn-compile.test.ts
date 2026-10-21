import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { buildThemeSet } from "../src/generate/theme";
import { REACT_NATIVE } from "../src/stacks/react-native";
import { docFrom, FIXTURES, heavyStackTests, partnerTokens, validTokens, withCompanion } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// Removing an installed node_modules takes longer than a hook's default 5 s on Windows.
afterAll(cleanupTempDirs, 120_000);

const node = Bun.which("node");
const npm = Bun.which("npm");
// Runs npm ci on an Expo app: in CI that is the react-native job's work, not the test matrix's ("runs in CI's react-native job").
const heavy = heavyStackTests("react-native", Boolean(node && npm)).run;

/** Code that uses every part of the generated API, the way an app calls it. */
const usage = (extra: { variants: boolean; arabic: boolean }) => `import { useFonts } from "expo-font";
import { Text, View } from "react-native";
import { useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import {
  MotifProvider,
  duration,
  easing,
  motifColors,
  motifFonts,
  radius,
  shadow,
  space,
  spring,
  type,
  ${extra.arabic ? "typeArabic,\n  " : ""}useMotifTheme,
  ${extra.variants ? "motifVariants,\n  type MotifVariant,\n  " : ""}type MotifColors,
} from "./motif-theme";

function Card() {
  const { colors, type: styles, dark, reducedMotion${extra.variants ? ", variant" : ""} } = useMotifTheme();
  const progress = useSharedValue(0);
  progress.value = withTiming(1, { duration: reducedMotion ? 0 : duration.base, easing: easing.standard });
  progress.value = withSpring(1, spring.snappy);
  const surface: MotifColors["surface"] = colors.surface;
  return (
    <View style={[{ backgroundColor: surface, padding: space.s4, borderRadius: radius.md }, shadow.md]}>
      <Text style={[styles.body, { color: colors.textPrimary }]}>{dark ? "dark" : "light"}${extra.variants ? " {variant}" : ""}</Text>
      <Text style={[type.heading, ${extra.arabic ? "typeArabic.heading ?? {}, " : ""}{ color: motifColors${extra.variants ? ".default" : ""}.light.textSecondary }]}>Hi</Text>
    </View>
  );
}

export default function Root() {
  const [loaded] = useFonts(motifFonts);
  ${extra.variants ? "const first: MotifVariant = motifVariants[0]!;" : ""}
  if (!loaded) return null;
  return (
    <MotifProvider${extra.variants ? " variant={first}" : ""}>
      <Card />
    </MotifProvider>
  );
}
`;

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

describe("the generated TypeScript", () => {
  test.skipIf(!heavy)("passes tsc --noEmit in an Expo app, with variants and without", () => {
    const dir = tempDir("motif-expo-");
    cpSync(join(FIXTURES, "expo-min"), dir, { recursive: true, filter: (src) => !["node_modules", ".expo"].includes(basename(src)) });
    // The packages are fetched once; npm's cache makes later runs offline.
    if (run([npm!, "ci", "--prefer-offline", "--no-audit", "--no-fund"], dir).code !== 0) {
      const again = run([npm!, "ci", "--no-audit", "--no-fund"], dir);
      if (again.code !== 0) console.log(again.out);
      expect(again.code).toBe(0);
    }

    mkdirSync(join(dir, "design"), { recursive: true });
    const app = { path: ".", stack: "react-native" as const, source: "detected" as const };
    const generate = (tokens: any) => REACT_NATIVE.generate!(buildThemeSet(docFrom(tokens)), { root: dir, app, themeDir: "design" }).files[0]!;

    // Two variants, and Onest with Readex Pro as its Arabic companion (Readex Pro isn't installed, so it uses the system font).
    const tokens = withCompanion(partnerTokens());
    tokens.font.heading.$value.fontFamily = ["Satoshi", "Readex Pro"];
    tokens.space["0-5"] = { $value: { value: 2, unit: "px" } };
    const full = generate(tokens);
    expect(full.content).toContain("export const typeArabic");
    expect(full.content).toContain('from "@expo-google-fonts/onest"');
    writeFileSync(join(dir, "design/motif-theme.tsx"), full.content);
    writeFileSync(join(dir, "design/usage.tsx"), usage({ variants: true, arabic: true }));

    // The other shape: no variants, no companion.
    const plain = generate(withoutCompanionFamilies(validTokens()));
    mkdirSync(join(dir, "plain"), { recursive: true });
    writeFileSync(join(dir, "plain/motif-theme.tsx"), plain.content);
    writeFileSync(join(dir, "plain/usage.tsx"), usage({ variants: false, arabic: false }));

    const tsc = run([node!, join(dir, "node_modules/typescript/bin/tsc"), "--noEmit"], dir);
    if (tsc.code !== 0) console.log(tsc.out);
    expect(tsc.code).toBe(0);
  }, 900_000);
});

/** The test guide with Onest as its one font, which the fixture has installed. */
function withoutCompanionFamilies(t: any): any {
  for (const role of Object.values<any>(t.font)) if (role?.$value) role.$value.fontFamily = ["Onest", "sans-serif"];
  return t;
}
