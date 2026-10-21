import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { buildThemeSet } from "../src/generate/theme";
import { generateFlutter } from "../src/stacks/flutter/generate";
import { docFrom, FIXTURES, hasFlutter, partnerTokens, validTokens, withCompanion } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

/** Code that uses every part of the generated API, so the analyzer checks it the way an app calls it. */
const USAGE = `import 'package:flutter/material.dart';

import 'motif_theme.dart';

final ThemeData partnerDark = MotifTheme.dark(variant: MotifVariant.partner);

class Example extends StatelessWidget {
  const Example({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return AnimatedContainer(
      duration: MotifMotion.duration(context, MotifDurations.base),
      curve: MotifCurves.standard,
      padding: const EdgeInsets.symmetric(
        horizontal: MotifSpace.s4,
        vertical: MotifSpace.s0p5,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(MotifRadius.md),
        boxShadow: MotifShadows.md,
      ),
      child: Text('Hi', style: MotifText.body.copyWith(color: colors.textPrimary)),
    );
  }
}

void main() {
  MotifTheme.debugVariantOverride = MotifVariant.partner;
  runApp(MaterialApp(theme: MotifTheme.light(), darkTheme: MotifTheme.dark(), home: const Example()));
  MotifTheme.debugVariantOverride = null;
  debugPrint('\${MotifSprings.snappy.stiffness} \${MotifMotion.reduced}');
}
`;

function run(cmd: string[], cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
}

describe("the generated Dart", () => {
  test.skipIf(!hasFlutter())("passes flutter analyze with no errors or warnings", () => {
    const flutter = Bun.which("flutter")!;
    const dir = tempDir("motif-flutter-");
    cpSync(join(FIXTURES, "flutter-min"), dir, {
      recursive: true,
      filter: (src) => ![".dart_tool", "build"].includes(basename(src)),
    });
    // Offline once the packages have been fetched on this machine.
    if (run([flutter, "pub", "get", "--offline"], dir).code !== 0) {
      // By its exit code: newer pub says "Changed 5 dependencies!" where older pub said "Got dependencies!".
      const online = run([flutter, "pub", "get"], dir);
      if (online.code !== 0) console.log(online.out);
      expect(online.code).toBe(0);
    }
    mkdirSync(join(dir, "lib/design"), { recursive: true });
    // Two variants; a companion at two weights through _family; a family google_fonts may not have (Satoshi) through
    // _font; a space role with a point in its name.
    const tokens = withCompanion(partnerTokens());
    tokens.font.heading.$value.fontFamily = ["Satoshi", "Readex Pro"];
    tokens.space["0-5"] = { $value: { value: 2, unit: "px" } };
    const [variants] = generateFlutter(buildThemeSet(docFrom(tokens)), { googleFonts: true });
    expect(variants!.content).toContain("'Satoshi',");
    expect(variants!.content).toContain("static const double s0p5 = 2;");
    writeFileSync(join(dir, "lib/design/motif_theme.dart"), variants!.content);
    writeFileSync(join(dir, "lib/design/usage.dart"), USAGE);
    // The other shape: no variants, and plain family names.
    const [plain] = generateFlutter(buildThemeSet(docFrom(withCompanion(validTokens()))), { googleFonts: false });
    writeFileSync(join(dir, "lib/design/plain_theme.dart"), plain!.content);

    const analyze = run([flutter, "analyze", "lib/design"], dir);
    if (analyze.code !== 0) console.log(analyze.out);
    expect(analyze.code).toBe(0);
  }, 600_000);
});
