// Motif's screenshot harness for Flutter apps (decision 0007). Motif writes this file to <app>/.motif/shot/ for one
// run of `flutter test .motif/shot/motif_shot_test.dart` and deletes it when the run ends. It replaces motif_app in
// the import of the app's main.dart below with the app's own package name before writing it.
//
// The run's options come from the JSON file named by --dart-define=MOTIF_SHOT_CONFIG=<path>:
//   { "outDir": "<abs>", "fonts": [{ "family": "Onest_700", "files": ["<abs>.ttf"] }],
//     "shots": [{ "file": "home.mobile.png", "route": "/", "width": 390, "height": 844, "dpr": 2,
//                 "safeTop": 47, "safeBottom": 34, "dark": false, "locale": "en" }] }
// It writes each PNG to outDir and <outDir>/result.json: { "shots": [{ "file", "error"? }] }.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:motif_app/main.dart' as app;

const String _configPath = String.fromEnvironment('MOTIF_SHOT_CONFIG');

/// The longest Motif waits for a screen to stop scheduling frames: 50 pumps of 100 ms of fake time.
const int _maxPumps = 50;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Screenshots show the app as people see it, without the DEBUG ribbon.
  WidgetsApp.debugAllowBannerOverride = false;
  final config = jsonDecode(File(_configPath).readAsStringSync()) as Map<String, dynamic>;
  final outDir = config['outDir'] as String;
  final results = <Map<String, Object?>>[];

  setUpAll(() async {
    // Fonts come from files Motif gathered: the app's pubspec fonts, google_fonts families from Motif's cache (under
    // the names google_fonts asks for, Family_700), and Roboto and MaterialIcons from the Flutter SDK.
    // google_fonts may not fetch: everything it needs is already loaded.
    GoogleFonts.config.allowRuntimeFetching = false;
    for (final font in (config['fonts'] as List).cast<Map<String, dynamic>>()) {
      final loader = FontLoader(font['family'] as String);
      for (final path in (font['files'] as List).cast<String>()) {
        // Motif checks the files before the run; one that has gone since is skipped rather than failing every shot.
        if (!File(path).existsSync()) continue;
        loader.addFont(File(path).readAsBytes().then((bytes) => ByteData.sublistView(bytes)));
      }
      await loader.load();
    }
  });

  tearDownAll(() {
    File('$outDir/result.json').writeAsStringSync(jsonEncode({'shots': results}));
  });

  for (final shot in (config['shots'] as List).cast<Map<String, dynamic>>()) {
    final file = shot['file'] as String;
    testWidgets(file, (tester) async {
      try {
        await _capture(tester, shot, '$outDir/$file');
        results.add({'file': file});
      } catch (e) {
        results.add({'file': file, 'error': '$e'});
        rethrow;
      }
    });
  }
}

Future<void> _capture(WidgetTester tester, Map<String, dynamic> shot, String path) async {
  final dpr = (shot['dpr'] as num).toDouble();
  tester.view.devicePixelRatio = dpr;
  tester.view.physicalSize = Size((shot['width'] as num) * dpr, (shot['height'] as num) * dpr);
  final padding = FakeViewPadding(
    top: (shot['safeTop'] as num? ?? 0) * dpr,
    bottom: (shot['safeBottom'] as num? ?? 0) * dpr,
  );
  tester.view.padding = padding;
  tester.view.viewPadding = padding;
  tester.platformDispatcher.platformBrightnessTestValue = shot['dark'] == true ? Brightness.dark : Brightness.light;
  final locale = Locale(shot['locale'] as String? ?? 'en');
  tester.platformDispatcher.localeTestValue = locale;
  tester.platformDispatcher.localesTestValue = [locale];
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);

  app.main();
  await _settle(tester);
  // The router is the app's global object, so it keeps the last test's location: go to the route every time.
  GoRouter.of(tester.element(find.byType(Scaffold).first)).go(shot['route'] as String);
  await _settle(tester);

  final bytes = await tester.runAsync(() async {
    final view = tester.binding.renderViews.first;
    final layer = view.debugLayer! as OffsetLayer;
    final image = await layer.toImage(view.paintBounds);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data!.buffer.asUint8List();
  });
  File(path).writeAsBytesSync(bytes!);
}

/// Pumps until no frame is scheduled, at most [_maxPumps] times; never pumpAndSettle, which a spinner never ends.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  for (var i = 0; i < _maxPumps && tester.binding.hasScheduledFrame; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}
