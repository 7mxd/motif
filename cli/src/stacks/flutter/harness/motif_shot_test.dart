// Motif's screenshot harness for Flutter apps (decision 0007). Motif writes this file, unchanged from run to run, to
// <app>/.motif/shot/ with motif_hooks.dart next to it (the app's imports and the calls that depend on them), runs
// `flutter test .motif/shot/motif_shot_test.dart`, and deletes both files when the run ends.
//
// The run's options come from the JSON file named by --dart-define=MOTIF_SHOT_CONFIG=<path>:
//   { "outDir": "<abs>", "resultPath": "<abs>", "debug": false, "defaultVariant": "default",
//     "fonts": [{ "family": "Onest_700", "files": ["<abs>.ttf"] }],
//     "plugins": ["flutter_secure_storage", …], "packageInfo": { "appName": …, "version": … }, "connectivityList": true,
//     "http": [{ "method": "GET", "path": "/items", "url": null, "file": "<abs>", "status": 200 }],
//     "shots": [{ "file": "home+partner.mobile.rtl.png", "target": "/home", "route": "/home", "screen": null,
//                 "width": 390, "height": 844, "dpr": 2, "safeTop": 47, "safeBottom": 34, "dark": false,
//                 "locale": "ar", "rtl": true, "variant": "partner", "variantId": "partner", "size": "mobile",
//                 "state": "filled", "checks": ["contrast", "names", "targets", "motion"] }] }
// Each screenshot starts the app afresh: brightness, locale, reduced motion and size set on the test view, the variant
// set on MotifTheme, design/states/setup.dart run, then the app's main() (or the widget setup returned). It waits with
// bounded pumps (never pumpAndSettle, which a spinner never ends), opens the route, waits again, runs the state's
// motifState if the shot has one, and draws the PNG; with checks, it audits what it drew (motif_audit.dart).
// It writes resultPath: { "screens": [{ "route", "shots": [file], "errors": [text], "unreachable"?, "landedOn"?,
// "unanswered": ["GET <url>"], "blankImages": ["GET <url>"], "missingFonts": [family], "missingFallbacks": [family],
// "auditError"?, "texts"? }],
// "shots": [{ "file", "error"? }], "issues": [{ rule, selector, label, kind, …, "route", "file", "size", "scheme",
// "variant"?, "state"?, "rtl"? }], "notes": [text] }.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'motif_audit.dart';
import 'motif_hooks.dart' as hooks;
import 'motif_http.dart';

const String _configPath = String.fromEnvironment('MOTIF_SHOT_CONFIG');

/// The longest Motif waits for a screen to stop scheduling frames: 50 pumps of 100 ms of fake time.
const int _maxPumps = 50;

/// How long a state script or design/states/setup.dart may run: 15 s, as a state script on the web.
const Duration _scriptLimit = Duration(seconds: 15);

const String _setupFile = 'design/states/setup.dart';

/// Flushes the fake-async work of a test that runs a state script, until that test ends (see _runState).
Timer? _kicker;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Screenshots show the app as people see it, without the DEBUG ribbon.
  WidgetsApp.debugAllowBannerOverride = false;
  final config = jsonDecode(File(_configPath).readAsStringSync()) as Map<String, dynamic>;
  final outDir = config['outDir'] as String;
  final debug = config['debug'] == true;
  final screens = <String, _Screen>{};
  final shots = <Map<String, Object?>>[];
  final notes = <String>{};
  final issues = <Map<String, Object?>>[];
  final loaded = <String>{};
  final http = MotifHttp((config['http'] as List? ?? const []).cast<Map<String, dynamic>>());
  final plugins = _Plugins(config);

  setUpAll(() async {
    // Fonts come from files Motif gathered: the app's pubspec fonts, google_fonts families from Motif's cache (under
    // the names google_fonts asks for, Family_700), and Roboto and MaterialIcons from the Flutter SDK.
    // google_fonts may not fetch: everything it needs is already loaded.
    hooks.fontsOffline();
    for (final font in (config['fonts'] as List).cast<Map<String, dynamic>>()) {
      final family = font['family'] as String;
      final loader = FontLoader(family);
      var any = false;
      for (final path in (font['files'] as List).cast<String>()) {
        // Motif checks the files before the run; one that has gone since is skipped rather than failing every shot.
        if (!File(path).existsSync()) continue;
        loader.addFont(File(path).readAsBytes().then((bytes) => ByteData.sublistView(bytes)));
        any = true;
      }
      await loader.load();
      if (any) loaded.add(family);
    }
    // The app's requests are answered from design/states/http.json, never the network.
    HttpOverrides.global = MotifHttpOverrides(http);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.allMessagesHandler = plugins.handle;
  });

  tearDownAll(() {
    _kicker?.cancel();
    plugins.removeTemps();
    File(config['resultPath'] as String).writeAsStringSync(
      jsonEncode({
        'screens': [for (final s in screens.values) s.toJson(debug)],
        'shots': shots,
        'issues': issues,
        'notes': notes.toList(),
      }),
    );
  });

  for (final shot in (config['shots'] as List).cast<Map<String, dynamic>>()) {
    final file = shot['file'] as String;
    testWidgets(file, (tester) async {
      _kicker?.cancel();
      final target = (shot['target'] ?? shot['route'] ?? shot['screen'] ?? file) as String;
      final screen = screens.putIfAbsent(target, () => _Screen(target));
      final run = _Run(screen, http, loaded);
      final checks = (shot['checks'] as List? ?? const []).cast<String>().toSet();
      // The audit reads the semantics tree, which Flutter builds only when something asks for it (testWidgets does by
      // default; the audit doesn't rely on that).
      final semantics = checks.isEmpty ? null : tester.ensureSemantics();
      final error = await _guarded(tester, run, () async {
        try {
          final found = await _capture(tester, config, shot, '$outDir/$file', run, notes, plugins, checks);
          final where = {
            'route': target,
            'file': file,
            'size': shot['size'],
            'scheme': shot['dark'] == true ? 'dark' : 'light',
            if (shot['variantId'] != null) 'variant': shot['variantId'],
            if (shot['state'] != null) 'state': shot['state'],
            if (shot['rtl'] == true) 'rtl': true,
          };
          for (final issue in found) {
            issues.add({...issue, ...where});
          }
        } finally {
          semantics?.dispose();
          // A state left behind may still wait on a timer in fake time, which flutter_test would report as "A Timer is
          // still pending" and fail the test with. The screenshot is taken; ten minutes of the app's clock let such
          // timers fire (what the script then does fails quietly: its errors are its own, already reported once).
          if (run.abandoned) {
            try {
              await tester.pump(const Duration(minutes: 10));
            } catch (_) {
              // The script left something that can't run on.
            }
          }
        }
      });
      if (run.captured) screen.shots.add(file);
      shots.add({'file': file, if (error != null) 'error': error});
    });
  }
}

/// What one screen collected over its screenshots.
class _Screen {
  _Screen(this.route);
  final String route;
  final List<String> shots = [];
  final Set<String> errors = {};
  String? unreachable;
  String? landedOn;
  final Set<String> unanswered = {};
  final Set<String> blankImages = {};
  final Set<String> missingFonts = {};
  final Set<String> missingFallbacks = {};
  final Set<String> texts = {};
  String? auditError;

  Map<String, Object?> toJson(bool debug) => {
    'route': route,
    'shots': shots,
    'errors': errors.toList(),
    if (unreachable != null) 'unreachable': unreachable,
    if (landedOn != null) 'landedOn': landedOn,
    'unanswered': unanswered.toList(),
    'blankImages': blankImages.toList(),
    'missingFonts': missingFonts.toList(),
    'missingFallbacks': missingFallbacks.toList(),
    if (auditError != null) 'auditError': auditError,
    if (debug) 'texts': texts.toList(),
  };
}

/// One screenshot's run.
class _Run {
  _Run(this.screen, this.http, this.loaded);
  final _Screen screen;
  final MotifHttp http;
  final Set<String> loaded;
  bool captured = false;

  /// The state script running, once it has started: what goes wrong from then on is the state's.
  String? state;

  /// The state script was still running at its time limit and was left behind.
  bool abandoned = false;

  void error(Object e) {
    final text = _describe(e);
    // google_fonts may not fetch, and its own load fails (google_fonts 6 rethrows it, unawaited), although Motif loaded
    // the font from files; a family Motif couldn't load is noted by _read, as text drawn in boxes.
    if (text.contains('allowRuntimeFetching is false') || text.isEmpty) return;
    // As on the web, an error the screen threw by itself (already reported, untagged) isn't the state's.
    final state = this.state;
    screen.errors.add(state == null || screen.errors.contains(text) ? text : 'State "$state": $text');
  }
}

/// A problem Motif says in plain words, without Dart's "Bad state:" in front.
class _Stop implements Exception {
  _Stop(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Plain words for what went wrong: a plugin with no phone behind it names itself.
String _describe(Object e) {
  final missing = RegExp(r'No implementation found for method (\S+) on channel (\S+)').firstMatch('$e');
  if (e is MissingPluginException || missing != null) {
    return '${_plugin(missing?.group(2) ?? '')} needs a phone; stub it in design/states/setup.dart.';
  }
  final text = e is FlutterErrorDetails ? e.exceptionAsString() : '$e';
  return text.split('\n').where((l) => l.trim().isNotEmpty).take(3).join(' ').trim();
}

/// A plugin's name from its channel: plugins.flutter.io/camera → camera, dev.flutter.pigeon.camera_android.… → camera.
String _plugin(String channel) {
  final pigeon = RegExp(r'^dev\.flutter\.pigeon\.([a-z0-9_]+)\.').firstMatch(channel);
  final name = pigeon?.group(1) ?? channel.split('/').where((p) => p.isNotEmpty).lastOrNull ?? 'A plugin';
  return name.replaceFirst(RegExp(r'_(android|ios|foundation|darwin|linux|windows|macos|web)$'), '');
}

/// Runs a screenshot so that whatever the app throws (in a build, a timer or a future nobody awaited) is the screen's
/// error, not the end of the test; returns the error that stopped it, if one did.
Future<String?> _guarded(WidgetTester tester, _Run run, Future<void> Function() body) async {
  final previous = FlutterError.onError;
  FlutterError.onError = (details) => run.error(details);
  final done = Completer<String?>();
  runZonedGuarded(() async {
    try {
      await body();
      if (!done.isCompleted) done.complete(null);
    } catch (e) {
      run.error(e);
      if (!done.isCompleted) done.complete(_describe(e));
    }
  }, (e, _) => run.error(e));
  try {
    return await done.future;
  } finally {
    FlutterError.onError = previous;
    final pending = tester.takeException();
    if (pending != null) run.error(pending);
    hooks.setVariant(null);
  }
}

/// Draws one screenshot and audits it with [checks]; returns the problems the audit found.
Future<List<Issue>> _capture(
  WidgetTester tester,
  Map<String, dynamic> config,
  Map<String, dynamic> shot,
  String path,
  _Run run,
  Set<String> notes,
  _Plugins plugins,
  Set<String> checks,
) async {
  final dpr = (shot['dpr'] as num).toDouble();
  tester.view.devicePixelRatio = dpr;
  tester.view.physicalSize = Size((shot['width'] as num) * dpr, (shot['height'] as num) * dpr);
  final padding = FakeViewPadding(
    top: (shot['safeTop'] as num? ?? 0) * dpr,
    bottom: (shot['safeBottom'] as num? ?? 0) * dpr,
  );
  tester.view.padding = padding;
  tester.view.viewPadding = padding;
  final brightness = shot['dark'] == true ? Brightness.dark : Brightness.light;
  tester.platformDispatcher.platformBrightnessTestValue = brightness;
  final parts = (shot['locale'] as String? ?? 'en_US').split('_');
  final locale = Locale(parts[0], parts.length > 1 ? parts[1] : null);
  tester.platformDispatcher.localeTestValue = locale;
  tester.platformDispatcher.localesTestValue = [locale];
  // Screenshots are still pictures: the app is asked for reduced motion, as the audit checks it.
  tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);

  // A fresh start: storage and plugins forget the last screenshot, then the variant and the setup script apply.
  hooks.resetStorage();
  plugins.reset();
  run.http.unanswered = (request, {required image}) =>
      (image ? run.screen.blankImages : run.screen.unanswered).add(request);
  final variant = shot['variant'] as String?;
  final wrong = hooks.setVariant(variant);
  if (wrong != null) throw _Stop(wrong);
  final setup = hooks.runSetup(
    (shot['variantId'] as String?) ?? (config['defaultVariant'] as String? ?? ''),
    locale,
    brightness,
  );
  // A setup that hasn't finished would leave the screen half set up: it's the screen's error, not a start without it.
  final waited = await _await(tester, setup, _scriptLimit);
  if (!waited.done) throw _Stop("$_setupFile didn't finish within ${_scriptLimit.inSeconds} s.");
  final root = waited.value;
  Future<void>? started;
  if (root != null) {
    await tester.pumpWidget(root);
  } else {
    started = hooks.startApp();
  }
  await _settle(tester, started);

  if (shot['rtl'] == true) {
    final apps = find.byType(WidgetsApp).evaluate();
    final offered = apps.isEmpty ? const <Locale>[] : (apps.first.widget as WidgetsApp).supportedLocales;
    if (!offered.any((l) => l.languageCode == locale.languageCode)) {
      notes.add(
        "This app doesn't offer ${locale.languageCode} (supportedLocales), so its RTL screenshots show it left to right.",
      );
    }
  }

  final screen = shot['screen'] as String?;
  final route = shot['route'] as String?;
  if (screen != null) {
    final navigator = _rootNavigator();
    if (navigator == null) {
      run.screen.unreachable = "Motif couldn't find the app's Navigator to open $screen on.";
      return const [];
    }
    unawaited(navigator.push(MaterialPageRoute<void>(builder: (_) => hooks.screen(screen)!)));
  } else if (route != null) {
    final unreachable = _open(route, run);
    if (unreachable != null) {
      run.screen.unreachable = unreachable;
      return const [];
    }
  }
  await _settle(tester, null);
  final router = route == null ? null : _router();
  final missing = router == null ? null : hooks.goMissing(router);
  if (missing != null) {
    run.screen.unreachable = 'The app has no page at $route (go_router: ${missing.split('\n').first}).';
    return const [];
  }
  if (route != null) {
    final where = _location();
    if (where != null && _path(where) != _path(route)) run.screen.landedOn = _path(where);
  }

  // The state script, after the screen has opened; what it throws is reported against the state, and the screenshot is
  // still taken, as on the web.
  final state = shot['state'] as String?;
  if (state != null) {
    run.state = state;
    final failed = await _runState(tester, state, run);
    if (failed != null) {
      run.error(failed);
      if (_describe(failed).contains('pumpAndSettle timed out')) {
        notes.add(
          'State "$state" waited in pumpAndSettle for a screen that keeps animating. '
          'Use tester.pump(const Duration(...)) instead of pumpAndSettle on screens that keep animating.',
        );
      }
    }
    await _settle(tester, null);
  }

  final view = tester.binding.renderViews.first;
  _read(view, run);
  Pixels? pixels;
  final bytes = await tester.runAsync(() async {
    final layer = view.debugLayer! as OffsetLayer;
    final image = await layer.toImage(view.paintBounds);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    // The contrast check reads the colours of this very picture.
    if (checks.contains('contrast')) {
      final raw = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (raw != null) pixels = Pixels(raw, image.width, image.height);
    }
    image.dispose();
    return data!.buffer.asUint8List();
  });
  File(path).writeAsBytesSync(bytes!);
  run.captured = true;
  if (checks.isEmpty) return const [];

  final issues = <Issue>[];
  try {
    issues.addAll(auditScreen(view, checks, pixels));
    // Last, as it lets the screen run on for two seconds.
    if (checks.contains('motion')) {
      final moving = await stillMoving(tester);
      if (moving != null) issues.add(moving);
    }
  } catch (e) {
    run.screen.auditError ??= _describe(e);
  }
  return issues;
}

/// Runs a state script on the screen as it is; returns what it threw, or that it was still running after
/// [_scriptLimit] of real time, or null. A script runs in the test's fake time, which moves only when it pumps: one
/// waiting on that clock (Future.delayed without a pump), or on something that never comes, is left behind
/// ([_Run.abandoned]).
///
/// The test body here runs in flutter_test's fake-async zone, whose work (microtasks) only runs when something flushes
/// it: flutter_test does while the test waits on runAsync, and not otherwise. Motif can't wait with runAsync itself, as
/// a script that calls runAsync at the same time would fail ("Reentrant call to runAsync() denied"). So a timer outside
/// the fake zone checks the clock and flushes that work every 5 ms, until the test ends. It flushes only, never moves
/// fake time on (that would make the rest of the screenshot run inside that move, where the next pump fails with
/// "Cannot elapse until previous elapse is complete").
Future<Object?> _runState(WidgetTester tester, String name, _Run run) {
  final finished = Completer<Object?>();
  Future<void>.sync(() => hooks.runState(name, tester)).then(
    (_) {
      if (!finished.isCompleted) finished.complete(null);
    },
    onError: (Object e) {
      if (!finished.isCompleted) finished.complete(e);
    },
  );
  final clock = Stopwatch()..start();
  final binding = tester.binding;
  _kicker?.cancel();
  _kicker = Zone.root.createPeriodicTimer(const Duration(milliseconds: 5), (timer) {
    if (!binding.inTest) {
      timer.cancel();
      return;
    }
    if (!finished.isCompleted && clock.elapsed >= _scriptLimit) {
      run.abandoned = true;
      finished.complete(
        _Stop('it was still running after ${_scriptLimit.inSeconds} seconds (time passes in a state only when it pumps)'),
      );
    }
    try {
      binding.asyncBarrier();
    } catch (_) {
      // The flush happened; what complained after it is a guarded call the script left open, reported by the test.
    }
  });
  return finished.future;
}

String _path(String location) {
  final p = Uri.parse(location).path;
  return p.length > 1 && p.endsWith('/') ? p.substring(0, p.length - 1) : (p.isEmpty ? '/' : p);
}

/// The router and navigator the app shows: go_router's, found from any Navigator below it, or the root Navigator.
Object? _router() {
  if (!hooks.usesGoRouter) return null;
  for (final element in find.byType(Navigator).evaluate()) {
    final router = hooks.goRouterOf(element);
    if (router != null) return router;
  }
  return null;
}

NavigatorState? _rootNavigator() {
  final found = find.byType(Navigator).evaluate();
  if (found.isEmpty) return null;
  return Navigator.maybeOf(found.first, rootNavigator: true) ?? (found.first as StatefulElement).state as NavigatorState?;
}

/// Opens a route; returns why it couldn't be opened, if it couldn't.
String? _open(String route, _Run run) {
  final router = _router();
  if (router != null) {
    // The router is the app's global object, so it keeps the last test's location: go to the route every time.
    hooks.goTo(router, route);
    return null;
  }
  // An app on Navigator starts at its home, which is /. (So does one whose GoRouter Motif couldn't find.)
  if (route == '/') return null;
  final navigator = _rootNavigator();
  if (navigator == null) return "Motif couldn't find the app's Navigator to open $route.";
  try {
    unawaited(navigator.pushNamed<Object?>(route));
  } catch (e) {
    return "The app has no page named $route (MaterialApp routes or onGenerateRoute).";
  }
  return null;
}

/// Where the app is: go_router's location, or the top route's name on the root Navigator.
String? _location() {
  final router = _router();
  if (router != null) return hooks.goLocation(router);
  final navigator = _rootNavigator();
  if (navigator == null) return null;
  String? name;
  navigator.popUntil((r) {
    name = r.settings.name;
    return true;
  });
  return name;
}

/// The text on screen (for MOTIF_DEBUG) and the fonts it asks for that Motif didn't load (drawn as boxes).
void _read(RenderObject root, _Run run) {
  void visit(RenderObject o) {
    InlineSpan? text;
    if (o is RenderParagraph) text = o.text;
    if (o is RenderEditable) text = o.text;
    if (text != null) {
      // Icons are characters in the private use area: not text anyone reads.
      final plain = text.toPlainText().replaceAll(RegExp('[-]'), '').trim();
      if (plain.isNotEmpty) run.screen.texts.add(plain);
      text.visitChildren((span) {
        final family = span.style?.fontFamily;
        if (family != null && !run.loaded.contains(family)) run.screen.missingFonts.add(family);
        return true;
      });
      _fallbacks(text, null, run);
    }
    o.visitChildren(visit);
  }

  visit(root);
}

/// Letters beyond Latin (Greek, Cyrillic, Hebrew, Arabic, CJK, emoji…): the ones a Latin font usually lacks, which
/// Flutter draws from the style's fontFamilyFallback. Punctuation, arrows and symbols (U+2000–U+2BFF) and icons (the
/// private use area) don't count.
final _beyondLatin = RegExp(r'[Ͱ-῿Ⰰ-\uDFFF豈-￿]');

/// The fallback families (fontFamilyFallback, as each span inherits it) that text with letters beyond Latin asks for
/// and Motif didn't load: those letters are drawn as boxes. Latin-only text never reaches its fallbacks, so it isn't
/// judged.
void _fallbacks(InlineSpan span, TextStyle? inherited, _Run run) {
  final style = inherited == null ? span.style : inherited.merge(span.style);
  if (span is! TextSpan) return;
  final text = span.text;
  if (text != null && _beyondLatin.hasMatch(text)) {
    for (final family in style?.fontFamilyFallback ?? const <String>[]) {
      if (!run.loaded.contains(family)) run.screen.missingFallbacks.add(family);
    }
  }
  for (final child in span.children ?? const <InlineSpan>[]) {
    _fallbacks(child, style, run);
  }
}

/// What [_await] waited for: whether it finished in time, and its value.
class _Waited<T> {
  _Waited(this.done, this.value);
  final bool done;
  final T? value;
}

/// Waits for a future the setup script started while pumping, for at most [limit] of the app's clock or of real time,
/// whichever comes first; rethrows what it threw.
Future<_Waited<T>> _await<T>(WidgetTester tester, Future<T> future, Duration limit) async {
  var done = false;
  T? value;
  Object? error;
  future.then((v) {
    value = v;
    done = true;
  }, onError: (Object e) {
    error = e;
    done = true;
  });
  const step = Duration(milliseconds: 100);
  final clock = Stopwatch()..start();
  var waited = Duration.zero;
  while (!done && waited < limit && clock.elapsed < limit) {
    await tester.pump(step);
    waited += step;
    // Work outside fake time (a file read, say) needs a moment of real time.
    if (!done) await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
  }
  if (error != null) throw error!;
  return _Waited(done, value);
}

/// Pumps until no frame is scheduled and what the app started has finished, at most [_maxPumps] times; never
/// pumpAndSettle, which a spinner never ends.
Future<void> _settle(WidgetTester tester, Future<void>? started) async {
  var done = started == null;
  started?.then((_) => done = true, onError: (Object _) => done = true);
  await tester.pump();
  for (var i = 0; i < _maxPumps && (tester.binding.hasScheduledFrame || !done); i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (!done && !tester.binding.hasScheduledFrame) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
    }
  }
}

/// Answers the platform channels of the plugins Motif stubs; any other call goes where it would have gone.
class _Plugins {
  _Plugins(Map<String, dynamic> config)
    : stubbed = (config['plugins'] as List? ?? const []).cast<String>().toSet(),
      packageInfo = (config['packageInfo'] as Map?)?.cast<String, Object?>() ?? const {},
      connectivityList = config['connectivityList'] != false;

  final Set<String> stubbed;
  final Map<String, Object?> packageInfo;
  final bool connectivityList;
  final Map<String, String> secure = {};

  /// path_provider's folder for this screenshot: a fresh one for each, so nothing one leaves is read by the next.
  Directory? _temp;
  final List<Directory> _temps = [];

  void reset() {
    secure.clear();
    _temp = null;
  }

  String get temp => (_temp ??= _newTemp()).path;

  Directory _newTemp() {
    final dir = Directory.systemTemp.createTempSync('motif_shot_');
    _temps.add(dir);
    return dir;
  }

  /// Deletes the folders path_provider handed out, when the run ends.
  void removeTemps() {
    for (final dir in _temps) {
      try {
        dir.deleteSync(recursive: true);
      } catch (_) {
        // A file the app still holds open (on Windows); the system's temp folder is cleaned in time.
      }
    }
    _temps.clear();
  }

  Future<ByteData?>? handle(String channel, MessageHandler? handler, ByteData? message) {
    if (handler != null) return handler(message);
    final pigeon = channel.startsWith('dev.flutter.pigeon.');
    final plugin = _plugin(channel);
    if (!stubbed.contains(plugin)) {
      return TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.delegate.send(channel, message);
    }
    if (pigeon) {
      final method = channel.split('.').last;
      final value = answer(plugin, method, const StandardMessageCodec().decodeMessage(message));
      return Future.value(const StandardMessageCodec().encodeMessage(<Object?>[value]));
    }
    const codec = StandardMethodCodec();
    final call = codec.decodeMethodCall(message);
    return Future.value(codec.encodeSuccessEnvelope(answer(plugin, call.method, call.arguments)));
  }

  Object? answer(String plugin, String method, Object? arguments) {
    final args = arguments is Map ? arguments : (arguments is List && arguments.isNotEmpty && arguments.first is Map ? arguments.first as Map : const {});
    switch (plugin) {
      case 'flutter_secure_storage':
        final key = args['key'] as String?;
        switch (method) {
          case 'write':
            if (key != null) secure[key] = '${args['value']}';
          case 'delete':
            secure.remove(key);
          case 'deleteAll':
            secure.clear();
          case 'read':
            return secure[key];
          case 'readAll':
            return Map<String, String>.of(secure);
          case 'containsKey':
            return secure.containsKey(key);
          case 'isProtectedDataAvailable':
            return true;
        }
        return null;
      case 'path_provider':
        return method.toLowerCase().contains('directories') ? <String>[temp] : temp;
      case 'package_info':
        return packageInfo;
      case 'connectivity':
        return method == 'check' ? (connectivityList ? <String>['wifi'] : 'wifi') : null;
      case 'url_launcher':
        return true;
    }
    return null;
  }
}
