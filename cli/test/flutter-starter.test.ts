import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pngSize } from "../src/browser/png";
import { runShot } from "../src/commands/shot";
import { runTokens } from "../src/commands/tokens";
import { hasFlutter, twoVariantTokens, withCompanion } from "./helpers";
import { cleanupTempDirs, tempDir } from "./tmp";

// Needs the Flutter SDK on the PATH (each name says so). The app is a fresh `flutter create`, so the test runs on
// whichever Flutter is installed: CI runs it on the pinned version and on the oldest one Motif supports (FLUTTER_MIN).
const flutter = hasFlutter();
let app = "";
const savedHome = process.env.MOTIF_HOME;

const run = (cmd: string[], cwd: string) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}\n${r.stderr.toString()}` };
};

/** A screen with the Material widgets the theme styles, in the guide's variant. */
const MAIN = `import 'package:flutter/material.dart';

import 'design/motif_theme.dart';

void main() => runApp(const StarterApp());

class StarterApp extends StatelessWidget {
  const StarterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: MotifTheme.light(variant: MotifVariant.men),
      darkTheme: MotifTheme.dark(variant: MotifVariant.men),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Starter')),
      body: ListView(
        padding: const EdgeInsets.all(MotifSpace.s4),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(MotifSpace.s4),
              child: Text(
                'A card',
                style: MotifText.body.copyWith(color: colors.textPrimary),
              ),
            ),
          ),
          const SizedBox(height: MotifSpace.s4),
          const TextField(decoration: InputDecoration(labelText: 'Name')),
          const SizedBox(height: MotifSpace.s4),
          FilledButton(onPressed: () {}, child: const Text('Save')),
          OutlinedButton(onPressed: () {}, child: const Text('Cancel')),
        ],
      ),
    );
  }
}
`;

beforeAll(() => {
  if (!flutter) return;
  const parent = tempDir("motif-flutter-starter-");
  const bin = Bun.which("flutter")!;
  const created = run([bin, "create", "--offline", "--project-name", "starter", "--platforms", "android,ios", "starter"], parent);
  app = join(parent, "starter");
  if (created.code !== 0) expect(run([bin, "create", "--project-name", "starter", "--platforms", "android,ios", "starter"], parent).code).toBe(0);
  // google_fonts at whatever version this Flutter resolves.
  if (run([bin, "pub", "add", "--offline", "google_fonts"], app).code !== 0) expect(run([bin, "pub", "add", "google_fonts"], app).code).toBe(0);
  mkdirSync(join(app, "design"), { recursive: true });
  writeFileSync(join(app, "design", "tokens.json"), JSON.stringify(withCompanion(twoVariantTokens())));
  process.env.MOTIF_HOME = join(import.meta.dir, ".tmp", "flutter-home");
  // flutter create and pub add take longer than a hook's default 5 s, and a hook that times out has its processes killed.
}, 300_000);

afterAll(() => {
  if (savedHome === undefined) delete process.env.MOTIF_HOME;
  else process.env.MOTIF_HOME = savedHome;
  cleanupTempDirs();
});

describe("a fresh flutter create app on the installed Flutter", () => {
  test.skipIf(!flutter)("motif tokens writes a theme that passes flutter analyze with Material's widgets on it (skipped without Flutter)", async () => {
    const r = await runTokens(app, { positionals: [], flags: {} });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(app, "lib/design/motif_theme.dart"))).toBe(true);
    writeFileSync(join(app, "lib/main.dart"), MAIN);
    // The starter's own widget test pumps the counter app, which is gone.
    writeFileSync(join(app, "test/widget_test.dart"), "void main() {}\n");
    const analyze = run([Bun.which("flutter")!, "analyze"], app);
    if (analyze.code !== 0) console.log(analyze.out);
    expect(analyze.code).toBe(0);
  }, 600_000);

  test.skipIf(!flutter)("motif shot --audit draws / in light and dark, in each variant, and writes the audit (skipped without Flutter)", async () => {
    const r = await runShot(app, { positionals: [], flags: { routes: "/", sizes: "390", audit: true } });
    // The test guide's men surface (#123456) is dark under the field's grey label: the audit finds it, in that
    // variant only, and the run fails.
    if (r.exitCode !== 1) console.log(r.text);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain('(mobile, light, men variant) The "Name" field is hard to read in light mode in the men variant');
    expect(r.text).not.toMatch(/\(mobile, (light|dark)\) /);
    // Every variant by default; the app passes variant: men itself, yet the default's shots are the default's.
    expect(r.data.shots).toEqual([
      "design/shots/index.mobile.png", "design/shots/index+men.mobile.png", "design/shots/index.mobile.dark.png", "design/shots/index+men.mobile.dark.png",
    ]);
    expect(pngSize(readFileSync(join(app, "design/shots/index.mobile.png")))).toEqual({ width: 780, height: 1688 });
    const shot = (name: string) => readFileSync(join(app, "design/shots", name));
    expect(Buffer.compare(shot("index.mobile.png"), shot("index+men.mobile.png"))).not.toBe(0);
    expect(r.text).not.toContain("looks exactly like the default");
    expect(existsSync(join(app, "design/shots/audit.json"))).toBe(true);
  }, 600_000);
});
