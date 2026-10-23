import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { buildThemeSet } from "../src/generate/theme";
import { generateFlutter } from "../src/stacks/flutter/generate";
import { docFrom, FIXTURES, hasFlutter, hexColor, partnerTokens, validTokens, withCompanion } from "./helpers";
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

/**
 * A role in the system font with a companion, in a DefaultTextStyle with no Material above it: Latin text must be in
 * the platform's family. Without a family of its own, Flutter would take the companion (the first fallback) as the
 * preferred family (fix round 1).
 */
const SYSTEM_FAMILY_TEST = `import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_min/design/system_plain_theme.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'a role in the system font names the platform family, not its companion',
    (tester) async {
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: DefaultTextStyle(style: MotifText.body, child: const Text('Hi')),
        ),
      );
      final style = tester.widget<RichText>(find.byType(RichText)).text.style!;
      final platform = Typography.material2021(
        platform: defaultTargetPlatform,
      ).black.bodyMedium!.fontFamily;
      expect(platform, isNotNull);
      expect(style.fontFamily, platform);
      expect(style.fontFamilyFallback, ['Readex Pro']);
    },
    variant: const TargetPlatformVariant({
      TargetPlatform.android,
      TargetPlatform.iOS,
      TargetPlatform.macOS,
      TargetPlatform.windows,
    }),
  );
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
    // The system font with an Arabic companion: no family of its own, the companion as its fallback (v0.5.0 sweep).
    const systemTokens = validTokens();
    systemTokens.font.body.$value.fontFamily = ["system-ui", "Readex Pro"];
    systemTokens.font.heading.$value.fontFamily = ["system-ui", "Readex Pro"];
    const [system] = generateFlutter(buildThemeSet(docFrom(systemTokens)), { googleFonts: true });
    expect(system!.content).toContain("fontFamilyFallback: [_family('Readex Pro')],");
    writeFileSync(join(dir, "lib/design/system_theme.dart"), system!.content);
    const [systemPlain] = generateFlutter(buildThemeSet(docFrom(systemTokens)), { googleFonts: false });
    expect(systemPlain!.content).toContain("fontFamily: _systemFamily,\n    fontFamilyFallback: ['Readex Pro'],");
    writeFileSync(join(dir, "lib/design/system_plain_theme.dart"), systemPlain!.content);
    // HiSalon's mint on a near-white page, in the default variant and the partner one: actionText for text,
    // outlined and elevated buttons (v0.5.0 gate).
    const readableTokens = partnerTokens();
    readableTokens.color["action-primary"].$value = hexColor("#7EEBC1");
    readableTokens.color["action-primary"].$extensions["dev.motif"].variants = { partner: { value: hexColor("#7EEBC1") } };
    readableTokens.color.background.$value = hexColor("#F7F9F8");
    const [readable] = generateFlutter(buildThemeSet(docFrom(readableTokens)), { googleFonts: false });
    expect(readable!.content).toContain("foregroundColor: colors.actionText,");
    expect(readable!.content).toContain("style: ElevatedButton.styleFrom(\n          foregroundColor: colors.actionText,");
    writeFileSync(join(dir, "lib/design/readable_theme.dart"), readable!.content);
    mkdirSync(join(dir, "test"), { recursive: true });
    writeFileSync(join(dir, "test/system_family_test.dart"), SYSTEM_FAMILY_TEST);

    const analyze = run([flutter, "analyze", "lib/design"], dir);
    if (analyze.code !== 0) console.log(analyze.out);
    expect(analyze.code).toBe(0);

    const widget = run([flutter, "test", "test/system_family_test.dart"], dir);
    if (widget.code !== 0) console.log(widget.out);
    expect(widget.code).toBe(0);
  }, 600_000);
});
