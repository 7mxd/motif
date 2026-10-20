// Motif's audit of a Flutter screen as it was drawn (motif shot --audit, plan 2E Task 10): the contrast of its text,
// from the screenshot's own pixels; its tap targets and their names, from the semantics tree; and motion that goes on
// when reduce motion is on. Motif writes this file next to motif_shot_test.dart, the same in every run, and deletes it
// when the run ends.
//
// Each problem is a map like audit.json's RawIssue: { rule, selector, label, kind, ratio?, expected?, fg?, bg?, width?,
// height? }. The selector is a short widget path: the closest three widgets worth naming above the one with the
// problem, then that one with its key and its text: AuditScreen > Scaffold > ListView > Text("Prices include tax").
//
// SemanticsData.hasFlag and SemanticsNode.hasFlag are deprecated in newer Flutter (flagsCollection replaces them), but
// they work in every Flutter a developer may have; flagsCollection doesn't exist in older ones.
// ignore_for_file: deprecated_member_use
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// One problem, as audit.json's RawIssue has it.
typedef Issue = Map<String, Object?>;

/// The smallest tap target, in logical pixels, on phones and tablets (as on the web).
const double minTarget = 44;

/// The screenshot's pixels: RGBA, at the device pixel ratio.
class Pixels {
  Pixels(this.bytes, this.width, this.height);
  final ByteData bytes;
  final int width;
  final int height;

  int argb(int x, int y) {
    final rgba = bytes.getUint32((y * width + x) * 4);
    return ((rgba & 0xFF) << 24) | (rgba >> 8);
  }
}

/// The audit's checks on a screen as it is now: contrast, names and targets, as asked. [blankImages] are the image
/// requests the harness answered with a blank picture ("GET <url>"): text over them isn't judged.
List<Issue> auditScreen(RenderView view, Set<String> checks, Pixels? pixels, {Set<String> blankImages = const {}}) {
  final issues = <Issue>[];
  if (checks.contains('contrast') && pixels != null) issues.addAll(_contrast(view, pixels, blankImages));
  if (checks.contains('names') || checks.contains('targets')) {
    issues.addAll(_tappables(view, names: checks.contains('names'), targets: checks.contains('targets')));
  }
  return issues;
}

/// What keeps moving on a screen that has settled, with reduce motion on: if the app still asks for frames after two
/// more seconds of its clock, the first widget that rebuilt (or, failing that, repainted) in the next frame. Null when
/// the screen is still.
Future<Issue?> stillMoving(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  if (!tester.binding.hasScheduledFrame) return null;
  final rebuilt = <Element>[];
  final painted = <RenderObject>[];
  debugOnRebuildDirtyWidget = (element, builtOnce) => rebuilt.add(element);
  debugOnProfilePaint = painted.add;
  try {
    await tester.pump(const Duration(milliseconds: 100));
  } finally {
    debugOnRebuildDirtyWidget = null;
    debugOnProfilePaint = null;
  }
  Element? moving;
  for (final element in [...rebuilt, ...painted.reversed.map(_creator).whereType<Element>()]) {
    final named = _named(element) ? element : _ancestor(element, _named);
    if (named != null) {
      moving = named;
      break;
    }
  }
  return {
    'rule': 'motion',
    'selector': moving == null ? '' : _selector(moving, null),
    'label': moving == null ? '' : _type(moving.widget),
    'kind': 'element',
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Contrast

/// Text that's hard to read, and icons that are hard to see: every paragraph and text field drawn on screen, its main
/// colour against the colour most common under it in the screenshot. Not judged: text something else is drawn over (a
/// floating tab bar), text over an image the harness couldn't draw, and text with no letters or digits (a "·" between
/// two facts), as axe-core leaves text of only symbols and punctuation unjudged on the web.
List<Issue> _contrast(RenderView view, Pixels pixels, Set<String> blankImages) {
  final dpr = view.flutterView.devicePixelRatio;
  final undrawn = _undrawnImages(view, blankImages);
  final out = <Issue>[];
  void visit(RenderObject o) {
    Issue? issue;
    if (o is RenderParagraph) issue = _textContrast(view, o, o.text, o.textScaler, pixels, dpr, undrawn);
    if (o is RenderEditable && o.text != null) issue = _textContrast(view, o, o.text!, o.textScaler, pixels, dpr, undrawn);
    if (issue != null) out.add(issue);
    o.visitChildren(visit);
  }

  visit(view);
  return out;
}

/// Where images are that the screenshot doesn't show as people would see them: an image that hasn't loaded, the
/// harness's blank 1×1 picture (an image request nothing answered), and a decoration's network image nothing answered.
/// The colour under a text there isn't what people see.
List<Rect> _undrawnImages(RenderView view, Set<String> blankImages) {
  final out = <Rect>[];
  void visit(RenderObject o) {
    var undrawn = false;
    if (o is RenderImage) {
      final image = o.image;
      undrawn = image == null || (image.width <= 1 && image.height <= 1);
    } else if (o is RenderDecoratedBox) {
      final decoration = o.decoration;
      final provider = decoration is BoxDecoration ? decoration.image?.image : null;
      undrawn = provider is NetworkImage && blankImages.contains('GET ${Uri.parse(provider.url).removeFragment()}');
    }
    if (undrawn && o is RenderBox && o.hasSize) {
      final rect = _visibleRect(o);
      if (rect != null) out.add(rect);
    }
    o.visitChildren(visit);
  }

  visit(view);
  return out;
}

/// True when something is drawn over a text: a hit test at three points along its middle line (a quarter, half and
/// three quarters across) reaches something that paints (a box with a colour, an image, other text, a blur) before it
/// reaches the text or a box the text is in. What only takes taps (an InkWell over a card) doesn't count. Hit tests go
/// from the top down, the reverse of painting, so the first thing hit is what is drawn on top. Text that takes no hits
/// (under an IgnorePointer) can't be told apart this way, and is judged as before.
bool _covered(RenderView view, RenderBox box, Rect rect) {
  final mine = <RenderObject>{};
  for (RenderObject? p = box; p != null; p = p.parent) {
    if (p is RenderIgnorePointer && p.ignoring) return false;
    mine.add(p);
  }
  for (final across in const [0.25, 0.5, 0.75]) {
    final result = HitTestResult();
    view.hitTest(result, position: Offset(rect.left + rect.width * across, rect.center.dy));
    for (final entry in result.path) {
      final target = entry.target;
      if (target is! RenderObject) continue;
      if (mine.contains(target)) break;
      if (_paints(target)) return true;
    }
  }
  return false;
}

/// True for render objects that draw something over what's under them.
bool _paints(RenderObject o) {
  if (o is RenderParagraph || o is RenderEditable || o is RenderBackdropFilter) return true;
  if (o is RenderImage) return o.image != null;
  if (o is RenderCustomPaint) return o.painter != null || o.foregroundPainter != null;
  if (o is RenderPhysicalModel) return o.color.a > 0;
  if (o is RenderPhysicalShape) return o.color.a > 0;
  if (o is RenderDecoratedBox) {
    final d = o.decoration;
    if (d is BoxDecoration) return (d.color?.a ?? 0) > 0 || d.gradient != null || d.image != null;
    if (d is ShapeDecoration) return (d.color?.a ?? 0) > 0 || d.gradient != null || d.image != null;
    return true;
  }
  // ColoredBox's render object is private; its colour isn't.
  if (o.runtimeType.toString() == '_RenderColoredBox') {
    try {
      return ((o as dynamic).color as Color).a > 0;
    } catch (_) {
      return true;
    }
  }
  return false;
}

/// An icon's glyph: the paragraph an Icon widget draws, or text in an icon font, or text of only private-use
/// characters (where icon fonts put their glyphs).
class _IconMark {
  _IconMark(this.widget, this.codePoint, this.font);
  final Element? widget;
  final int codePoint;
  final String font;
  String get code => 'U+${codePoint.toRadixString(16).toUpperCase().padLeft(4, '0')}';
}

bool _isPrivateUse(int rune) => (rune >= 0xE000 && rune <= 0xF8FF) || rune >= 0xF0000;

_IconMark? _iconMark(RenderBox box, String raw, String? family) {
  final runes = raw.runes.where((r) => String.fromCharCode(r).trim().isNotEmpty).toList();
  if (runes.isEmpty) return null;
  // The Icon widget a few levels up (Icon > ExcludeSemantics > SizedBox > Center > RichText); an Icon has no child, so
  // a paragraph under one is its glyph.
  final element = _creator(box);
  Element? icon;
  if (element != null) {
    var levels = 0;
    try {
      element.visitAncestorElements((e) {
        if (e.widget is Icon) icon = e;
        return icon == null && ++levels < 8;
      });
    } catch (_) {
      // An element no longer in the tree.
    }
  }
  final font = (family ?? '').replaceFirst(RegExp(r'^packages/[^/]+/'), '');
  if (icon != null) {
    final data = (icon!.widget as Icon).icon;
    return _IconMark(icon, data?.codePoint ?? runes.first, data?.fontFamily ?? font);
  }
  final private = runes.every(_isPrivateUse);
  if (private || (runes.length <= 2 && font.toLowerCase().contains('icon'))) return _IconMark(null, runes.first, font);
  return null;
}

final RegExp _letterOrDigit = RegExp(r'[\p{L}\p{N}]', unicode: true);

/// The colour, size and weight of most of a text's characters.
class _Style {
  _Style(this.color, this.size, this.weight, this.family);
  final Color color;
  final double size;
  final FontWeight weight;
  final String? family;
  int count = 0;
}

/// The style of most of a text's characters; with [marks], private-use characters (icon glyphs) count too.
_Style? _mainStyle(InlineSpan root, TextScaler scaler, {bool marks = false}) {
  final styles = <String, _Style>{};
  void walk(InlineSpan span, TextStyle inherited) {
    final style = span.style == null ? inherited : inherited.merge(span.style);
    if (span is! TextSpan) return;
    final text = span.text;
    if (text != null) {
      final count = marks ? text.replaceAll(RegExp(r'\s'), '').runes.length : _plain(text).replaceAll(' ', '').length;
      if (count > 0) {
        // Text with no colour of its own is drawn black.
        final color = style.foreground?.color ?? style.color ?? const Color(0xFF000000);
        final size = scaler.scale(style.fontSize ?? 14);
        final weight = style.fontWeight ?? FontWeight.normal;
        (styles['${color.toARGB32()}|$size|${weight.value}|${style.fontFamily}'] ??= _Style(color, size, weight, style.fontFamily)).count += count;
      }
    }
    for (final child in span.children ?? const <InlineSpan>[]) {
      walk(child, style);
    }
  }

  walk(root, const TextStyle());
  _Style? main;
  for (final s in styles.values) {
    if (main == null || s.count > main.count) main = s;
  }
  return main;
}

Issue? _textContrast(RenderView view, RenderBox box, InlineSpan text, TextScaler scaler, Pixels pixels, double dpr, List<Rect> undrawn) {
  if (!box.hasSize) return null;
  final raw = text.toPlainText();
  final plain = _plain(raw);
  final family = _mainStyle(text, scaler, marks: true)?.family;
  // An icon is a mark, not text: WCAG 1.4.11 asks 3:1 of it.
  final icon = box is RenderParagraph ? _iconMark(box, raw, family) : null;
  // Text of only symbols and punctuation (a "·" between two facts) isn't judged, as axe-core doesn't judge it.
  if (icon == null && !_letterOrDigit.hasMatch(plain)) return null;
  final rect = _visibleRect(box);
  if (rect == null || rect.width < 1 || rect.height < 1) return null;
  final node = _semanticsOf(box);
  // A disabled control's text needn't be readable, as on the web.
  if (node != null && _disabled(node)) return null;
  final style = _mainStyle(text, scaler, marks: icon != null);
  if (style == null) return null;
  final alpha = style.color.a * _opacity(box);
  if (alpha < 0.02) return null;
  final drawn = _drawn(pixels, rect, dpr, style.color, alpha);
  if (drawn == null) return null;
  final fg = drawn.fg;
  final bg = drawn.bg;
  final ratio = _ratio(fg, bg);
  // WCAG's large text: 18 pt (24 px), or 14 pt (about 18.66 px) in bold, as axe-core judges it on the web.
  final large = style.size >= 24 || (style.size >= 18.66 && style.weight.value >= 700);
  final expected = icon != null || large ? 3.0 : 4.5;
  if (ratio >= expected) return null;
  // What the screenshot shows there isn't the text on its background: something is drawn over it, or the image under
  // it wasn't drawn.
  if (undrawn.any((r) => r.contains(rect.center))) return null;
  if (_covered(view, box, rect)) return null;
  final element = _creator(box);
  if (icon != null) {
    final label = icon.widget == null ? '' : ((icon.widget!.widget as Icon).semanticLabel ?? '');
    final subject = icon.widget ?? (element == null ? null : _subject(element, rect));
    return {
      'rule': 'color-contrast',
      'selector': subject == null ? '' : _selector(subject, label, mark: label.trim().isEmpty ? icon.code : null),
      'label': _short(label),
      'kind': 'icon',
      'icon': icon.code,
      if (icon.font.isNotEmpty) 'iconFont': icon.font,
      'ratio': ratio,
      'expected': expected,
      'fg': _hex(fg),
      'bg': _hex(bg),
    };
  }
  final subject = element == null ? null : _subject(element, rect, loose: box is RenderEditable);
  return {
    'rule': 'color-contrast',
    'selector': subject == null ? '' : _selector(subject, plain),
    'label': _short(plain),
    'kind': _textKind(box, node, plain, subject?.widget),
    'ratio': ratio,
    'expected': expected,
    'fg': _hex(fg),
    'bg': _hex(bg),
  };
}

/// What a text is, for a contrast finding: a field's own text is the field; text that is a control's whole name (a
/// button's label) is that control; any other text is text, even inside a tappable card.
String _textKind(RenderBox box, SemanticsNode? node, String plain, Widget? subject) {
  if (box is RenderEditable) return 'field';
  if (node == null) return 'element';
  final data = node.getSemanticsData();
  final kind = _kind(data, subject);
  return kind != 'element' && _plain(data.label) == plain ? kind : 'element';
}

/// A text's background and its colour as drawn on it.
class _Drawn {
  _Drawn(this.bg, this.fg);
  final Color bg;
  final Color fg;
}

/// How far apart two colours may be (in 0–255 RGB, straight-line distance) and still count as one: rounding, and the
/// anti-aliasing of a glyph's edge, which lies on the line between the background and the text's colour.
const double _tolerance = 6;

/// The share of the pixels under a text (its glyphs and their edges left out) that one colour must cover to be its
/// background. Under a photo or a gradient no colour does, and a ratio would be a guess: such text is left out, as
/// axe-core leaves it "incomplete" on the web.
const double _backgroundShare = 0.5;

/// The background under a text, in the screenshot's own pixels, and the text's colour blended on it ([alpha] is the
/// text's own alpha times its Opacity ancestors'); null when no one colour is clearly the background.
///
/// The text's pixels are those on the line from the background to its blended colour (glyphs, and their anti-aliased
/// edges), so text drawn at an alpha doesn't compete with the background however faint it is. The background is the
/// candidate among the most common colours that explains the most pixels that way.
_Drawn? _drawn(Pixels pixels, Rect rect, double dpr, Color text, double alpha) {
  final left = math.max(0, (rect.left * dpr).floor());
  final top = math.max(0, (rect.top * dpr).floor());
  final right = math.min(pixels.width, (rect.right * dpr).ceil());
  final bottom = math.min(pixels.height, (rect.bottom * dpr).ceil());
  final counts = <int, int>{};
  for (var y = top; y < bottom; y++) {
    for (var x = left; x < right; x++) {
      final c = pixels.argb(x, y) | 0xFF000000;
      counts[c] = (counts[c] ?? 0) + 1;
    }
  }
  if (counts.isEmpty) return null;
  final total = counts.values.fold<int>(0, (a, b) => a + b);
  final common = counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  final opaque = text.withValues(alpha: 1);
  _Drawn? best;
  var bestBackground = 0;
  var bestText = 0;
  for (final candidate in common.take(3)) {
    final bg = Color(candidate.key);
    final fg = Color.lerp(bg, opaque, alpha)!;
    var background = 0;
    var glyphs = 0;
    for (final e in common) {
      final c = Color(e.key);
      if (_distance(c, bg) <= _tolerance) {
        background += e.value;
      } else if (_toSegment(c, bg, fg) <= _tolerance) {
        glyphs += e.value;
      }
    }
    if (best == null || background + glyphs > bestBackground + bestText) {
      best = _Drawn(bg, fg);
      bestBackground = background;
      bestText = glyphs;
    }
  }
  final rest = total - bestText;
  if (best == null || rest <= 0 || bestBackground / rest < _backgroundShare) return null;
  return best;
}

List<double> _rgb(Color c) => [c.r * 255, c.g * 255, c.b * 255];

double _distance(Color a, Color b) {
  final p = _rgb(a);
  final q = _rgb(b);
  return math.sqrt(math.pow(p[0] - q[0], 2) + math.pow(p[1] - q[1], 2) + math.pow(p[2] - q[2], 2));
}

/// How far a colour is from the line between two others (a blend of them).
double _toSegment(Color c, Color from, Color to) {
  final p = _rgb(c);
  final a = _rgb(from);
  final b = _rgb(to);
  final v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  final length = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (length == 0) return _distance(c, from);
  final t = (((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1] + (p[2] - a[2]) * v[2]) / length).clamp(0.0, 1.0);
  final x = [a[0] + t * v[0] - p[0], a[1] + t * v[1] - p[1], a[2] + t * v[2] - p[2]];
  return math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
}

/// WCAG's contrast ratio, cut to two decimals as axe-core does.
double _ratio(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final ratio = (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
  return (ratio * 100).floor() / 100;
}

String _hex(Color c) {
  String part(double v) => (v * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${part(c.r)}${part(c.g)}${part(c.b)}';
}

/// How opaque a render object is drawn: its Opacity and FadeTransition ancestors, multiplied.
double _opacity(RenderObject o) {
  var opacity = 1.0;
  for (var p = o.parent; p != null; p = p.parent) {
    if (p is RenderOpacity) opacity *= p.opacity;
    if (p is RenderAnimatedOpacityMixin) opacity *= p.opacity.value;
  }
  return opacity;
}

/// True when a parent draws the child: not offstage, not a route under an opaque one, not fully transparent. Flutter
/// leaves such children out of the semantics tree too, which tells them apart where paintsChild doesn't (an Overlay's
/// entries under an opaque route); only parents that hide what they still draw (ExcludeSemantics) are taken at their
/// word.
bool _draws(RenderObject parent, RenderObject child) {
  if (!parent.paintsChild(child)) return false;
  if (parent is RenderExcludeSemantics || parent is RenderIgnorePointer || parent is RenderAbsorbPointer) return true;
  var visited = false;
  parent.visitChildrenForSemantics((c) => visited = visited || identical(c, child));
  return visited;
}

/// Where a box is drawn on screen, in logical pixels, after the clips above it (a list's edge); null when it isn't
/// drawn at all (offstage, under another route, scrolled out of sight).
Rect? _visibleRect(RenderBox box) {
  var rect = MatrixUtils.transformRect(box.getTransformTo(null), Offset.zero & box.size);
  RenderObject child = box;
  for (var parent = box.parent; parent != null; parent = parent.parent) {
    if (!_draws(parent, child)) return null;
    final clip = parent.describeApproximatePaintClip(child);
    if (clip != null) rect = rect.intersect(MatrixUtils.transformRect(parent.getTransformTo(null), clip));
    if (rect.width <= 0 || rect.height <= 0) return null;
    child = parent;
  }
  if (child is RenderView) {
    rect = rect.intersect(Offset.zero & child.size);
    if (rect.width <= 0 || rect.height <= 0) return null;
  }
  return rect;
}

/// The semantics node a render object's text belongs to: its own, or the one it was merged into.
SemanticsNode? _semanticsOf(RenderObject o) {
  for (RenderObject? r = o; r != null; r = r.parent) {
    var node = r.debugSemantics;
    if (node == null) continue;
    while (node!.isMergedIntoParent && node.parent != null) {
      node = node.parent;
    }
    return node;
  }
  return null;
}

bool _disabled(SemanticsNode node) {
  for (SemanticsNode? n = node; n != null; n = n.parent) {
    if (n.hasFlag(ui.SemanticsFlag.hasEnabledState) && !n.hasFlag(ui.SemanticsFlag.isEnabled)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tap targets and names

/// Tappable nodes (tap or long press) that are too small on a phone or tablet (targets), or have nothing a screen
/// reader can say (names). Nodes off the screen are left out, and links too for size, as in WCAG's inline exception.
List<Issue> _tappables(RenderView view, {required bool names, required bool targets}) {
  final root = view.owner?.semanticsOwner?.rootSemanticsNode;
  if (root == null) return const [];
  final owners = <int, RenderObject>{};
  void own(RenderObject o) {
    final node = o.debugSemantics;
    if (node != null) owners.putIfAbsent(node.id, () => o);
    o.visitChildren(own);
  }

  own(view);
  final dpr = view.flutterView.devicePixelRatio;
  final screen = Offset.zero & view.flutterView.physicalSize;
  final out = <Issue>[];
  void visit(SemanticsNode node) {
    node.visitChildren((child) {
      visit(child);
      return true;
    });
    if (node.isMergedIntoParent || node.isInvisible) return;
    final data = node.getSemanticsData();
    if (!data.hasAction(ui.SemanticsAction.tap) && !data.hasAction(ui.SemanticsAction.longPress)) return;
    if (data.hasFlag(ui.SemanticsFlag.isHidden)) return;
    // Where the node is drawn, in physical pixels: off the screen, nobody can tap it.
    var shown = node.rect;
    for (SemanticsNode? n = node; n != null; n = n.parent) {
      final transform = n.transform;
      if (transform != null) shown = MatrixUtils.transformRect(transform, shown);
    }
    if (!shown.overlaps(screen)) return;
    // Its size, from the box that made it (the node's own rect is cut by a list's edge when it's partly scrolled).
    final owner = owners[node.id];
    final rect = owner is RenderBox && owner.hasSize
        ? MatrixUtils.transformRect(owner.getTransformTo(null), owner.semanticBounds)
        : Rect.fromLTRB(shown.left / dpr, shown.top / dpr, shown.right / dpr, shown.bottom / dpr);
    final element = owner == null ? null : _creator(owner);
    final subject = element == null ? null : _subject(element, rect, tappable: true);
    final kind = _kind(data, subject?.widget);
    // A field's hint (its placeholder) names it, as axe-core accepts a placeholder; a button's hint doesn't.
    final name = [data.label, data.tooltip, data.value, if (kind == 'field') data.hint]
        .firstWhere((s) => s.trim().isNotEmpty, orElse: () => '');
    final described = {
      'selector': subject == null ? '' : _selector(subject, name),
      'label': _short(name),
      'kind': kind,
    };
    // A tap area over (nearly) the whole screen that doesn't say it's a button, link or field is a gesture on the
    // background (tapping out of a field to close the keyboard), not a control anyone aims at: it needs no name.
    final logical = Offset.zero & view.size;
    final seen = rect.intersect(logical);
    final background = seen.width > 0 &&
        seen.height > 0 &&
        seen.width * seen.height >= 0.9 * logical.width * logical.height &&
        !data.hasFlag(ui.SemanticsFlag.isButton) &&
        !data.hasFlag(ui.SemanticsFlag.isLink) &&
        !data.hasFlag(ui.SemanticsFlag.isTextField);
    if (names && name.trim().isEmpty && !background) out.add({'rule': 'name', ...described});
    final small = rect.width < minTarget - 0.01 || rect.height < minTarget - 0.01;
    if (targets && small && kind != 'link') {
      out.add({'rule': 'target-mobile', ...described, 'width': rect.width.round(), 'height': rect.height.round()});
    }
  }

  visit(root);
  return out;
}

String _kind(SemanticsData data, Widget? subject) {
  final type = subject == null ? '' : _type(subject);
  if (data.hasFlag(ui.SemanticsFlag.isLink)) return 'link';
  if (data.hasFlag(ui.SemanticsFlag.isTextField) || const {'TextField', 'TextFormField', 'CupertinoTextField'}.contains(type)) {
    return 'field';
  }
  if (data.hasFlag(ui.SemanticsFlag.isButton) || RegExp(r'Button$|^(InkWell|InkResponse|GestureDetector)$').hasMatch(type)) {
    return 'button';
  }
  return 'element';
}

// ---------------------------------------------------------------------------------------------------------------------
// Widget paths

/// Framework widgets that sit between the widgets people write and name nothing a developer would look for.
const Set<String> _plumbing = {
  'Builder', 'StatefulBuilder', 'AnimatedBuilder', 'ListenableBuilder', 'ValueListenableBuilder', 'KeyedSubtree',
  'AutomaticKeepAlive', 'Scrollable', 'ScrollNotificationObserver', 'RawGestureDetector', 'GestureDetector', 'Focus',
  'FocusScope', 'FocusTraversalGroup', 'ExcludeFocus', 'Actions', 'Shortcuts', 'CallbackShortcuts',
  'DefaultTextEditingShortcuts', 'TickerMode', 'Visibility', 'Overlay', 'Navigator', 'Router', 'HeroControllerScope',
  'Hero', 'PageStorage', 'RestorationScope', 'UnmanagedRestorationScope', 'RootRestorationScope', 'SafeArea',
  'WidgetsApp', 'MaterialApp', 'CupertinoApp', 'Title', 'Localizations', 'CheckedModeBanner', 'Banner', 'View',
  'RawView', 'SelectionContainer', 'SelectionArea', 'SelectableRegion', 'TextFieldTapRegion', 'TapRegionSurface',
  'ShortcutRegistrar', 'SharedAppData', 'UndoHistory', 'EditableText', 'DualTransitionBuilder', 'AnimatedSwitcher',
  'AnimatedCrossFade', 'AnimatedSize', 'AnimatedContainer', 'AnimatedOpacity', 'AnimatedPadding', 'AnimatedAlign',
  'AnimatedPositioned', 'AnimatedDefaultTextStyle', 'AnimatedPhysicalModel', 'AnimatedTheme', 'ModalBarrier',
  'AnimatedModalBarrier', 'GlowingOverscrollIndicator', 'StretchingOverscrollIndicator', 'RawScrollbar', 'Scrollbar',
  'Material', 'Ink', 'InkWell', 'InkResponse', 'Theme', 'ScaffoldMessenger', 'NavigationToolbar', 'Tooltip',
  'TooltipVisibility', 'PopScope', 'WillPopScope', 'NotificationListener', 'PrimaryScrollController', 'StretchEffect',
  'CupertinoTheme', 'TextSelectionGestureDetector', 'InputDecorator', 'IconTheme', 'DefaultTextStyle',
};

/// Widgets that can be the one a tap target is about, though they name nothing as a widget above another.
const Set<String> _tappers = {'InkWell', 'InkResponse', 'GestureDetector'};

/// A widget's type without its type arguments; Material's private FilledButton.icon (_FilledButtonWithIcon) by the
/// name it's written with.
String _type(Widget widget) {
  final type = widget.runtimeType.toString().split('<').first;
  return RegExp(r'^_([A-Z]\w*?)WithIcon$').firstMatch(type)?.group(1) ?? type;
}

/// A widget as the path shows it: its type, and its key when it's a value (FilledButton#sign-in).
String _name(Widget widget) {
  final key = widget.key;
  final value = key is ValueKey ? key.value : null;
  final shown = value is String || value is num ? '$value' : (value is Enum ? value.name : null);
  return shown == null || shown.isEmpty ? _type(widget) : '${_type(widget)}#$shown';
}

/// True for widgets worth naming in a path: those people write (stateless and stateful widgets, public, not plumbing).
bool _named(Element element) {
  final widget = element.widget;
  if (widget is! StatelessWidget && widget is! StatefulWidget) return false;
  final type = _type(widget);
  return !type.startsWith('_') && !_plumbing.contains(type) && !type.endsWith('Transition');
}

Element? _creator(RenderObject o) {
  final creator = o.debugCreator;
  return creator is DebugCreator ? creator.element : null;
}

Element? _ancestor(Element element, bool Function(Element) test) {
  Element? found;
  try {
    element.visitAncestorElements((e) {
      if (test(e)) {
        found = e;
        return false;
      }
      return true;
    });
  } catch (_) {
    // An element no longer in the tree.
  }
  return found;
}

/// Widgets at the edge of a screen or of the app: a problem's subject is never above one (a full-screen tap area isn't
/// the app around it).
const Set<String> _edges = {'Navigator', 'Overlay', 'Router', 'WidgetsApp', 'MaterialApp', 'CupertinoApp', 'View', 'RawView'};

/// The widget a problem is about: walking up from where it was found, the outermost widget worth naming that is no
/// bigger than the problem (an IconButton around its InkWell, not the list around the button), up to the screen's
/// edge. A tap area around the app's navigator (one that closes the keyboard on every screen) is named by the closest
/// widget worth naming around it. With [loose], the first widget worth naming above it, whatever its size (a TextField
/// around its text).
Element _subject(Element start, Rect rect, {bool tappable = false, bool loose = false}) {
  bool candidate(Element e) => _named(e) || (tappable && _tappers.contains(_type(e.widget)));
  if (loose) return _ancestor(start, _named) ?? start;
  final room = rect.inflate(1);
  bool fits(Element e) {
    final ro = e.renderObject;
    if (ro is! RenderBox || !ro.attached || !ro.hasSize) return false;
    final r = MatrixUtils.transformRect(ro.getTransformTo(null), Offset.zero & ro.size);
    return room.contains(r.topLeft) && room.contains(r.bottomRight);
  }

  final shell = _ancestor(start, (e) => e.widget is Navigator) == null;
  var subject = candidate(start) ? start : null;
  try {
    start.visitAncestorElements((e) {
      if (_edges.contains(_type(e.widget))) return false;
      if (subject != null && !fits(e)) return false;
      if (candidate(e)) {
        subject = e;
        if (shell && _named(e)) return false;
      }
      return true;
    });
  } catch (_) {
    // An element no longer in the tree.
  }
  return subject ?? start;
}

/// The closest three widgets worth naming above the subject, then the subject with its text:
/// AuditScreen > Scaffold > ListView > Text("Prices include tax"). An icon with no label shows its code point instead
/// ([mark]): Row > Icon(U+E5F9).
String _selector(Element subject, String? text, {String? mark}) {
  final names = <String>[];
  try {
    subject.visitAncestorElements((e) {
      if (_named(e)) names.add(_name(e.widget));
      return names.length < 3;
    });
  } catch (_) {
    // An element no longer in the tree.
  }
  final shown = mark != null
      ? '($mark)'
      : text == null || text.trim().isEmpty
          ? ''
          : '("${_short(text).replaceAll('"', r'\"')}")';
  return [...names.reversed, '${_name(subject.widget)}$shown'].join(' > ');
}

/// Text as people read it: icon glyphs (characters in the private use areas, the supplementary ones too) and
/// placeholders left out, spaces as one.
String _plain(String text) => text
    .replaceAll(RegExp(r'[\u{E000}-\u{F8FF}\u{F0000}-\u{10FFFF}\u{FFFC}]', unicode: true), '')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

String _short(String text) {
  final plain = _plain(text);
  return plain.length <= 40 ? plain : plain.substring(0, 40);
}
