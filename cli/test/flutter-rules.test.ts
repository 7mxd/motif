import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { buildScale } from "../src/check/scale";
import { suggestRole } from "../src/check/suggest";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { FLUTTER } from "../src/stacks/flutter";
import { scanDart } from "../src/stacks/flutter/rules";
import { docFrom, validTokens } from "./helpers";

const scale = buildScale(buildTheme(docFrom(validTokens())), "lib/design");
const file = (text: string, path = "lib/main.dart"): SourceFile => ({ path, abs: path, text, lang: "dart" });
const scan = (text: string) => scanDart(file(text), scale);
/** The one hit, with its position given by the text it starts at (the nth time it appears). */
const one = (src: string) => {
  const hits = scan(src);
  expect(hits).toHaveLength(1);
  return hits[0]!;
};
const at = (src: string, needle: string) => {
  const i = src.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  const before = src.slice(0, i).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
};
const pick = (h: Hit) => ({
  rule: h.rule, line: h.line, column: h.column, kind: h.kind, text: h.text, violation: h.violation,
  ...(h.value !== undefined ? { value: h.value } : {}), ...(h.context !== undefined ? { context: h.context } : {}),
});

describe("raw-color in Dart", () => {
  test("Color(0xFFrrggbb) is #rrggbb, and color: in a Container is a background", () => {
    const src = "final w = Container(\n  color: Color(0xFF3B82F6),\n);\n";
    expect(pick(one(src))).toEqual({
      rule: "raw-color", ...at(src, "Color(0x"), kind: "color", text: "Color(0xFF3B82F6)", violation: true, value: "#3b82f6", context: "background",
    });
  });

  test("an alpha other than FF gives #rrggbbaa; color: in a TextStyle is text", () => {
    const src = "Text('a', style: const TextStyle(color: Color(0x803b82f6)))";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color("), value: "#3b82f680", context: "text" });
  });

  test("Color.fromARGB in a BorderSide is a border", () => {
    const src = "BorderSide(color: Color.fromARGB(255, 59, 130, 246), width: 1)";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color.fromARGB"), text: "Color.fromARGB(255, 59, 130, 246)", value: "#3b82f6", context: "border" });
  });

  test("Color.fromRGBO as a backgroundColor", () => {
    const src = "AppBar(backgroundColor: Color.fromRGBO(59, 130, 246, 0.5))";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color.fromRGBO"), value: "#3b82f680", context: "background" });
  });

  test("Color.from in Border.all is a border", () => {
    const src = "Border.all(color: Color.from(alpha: 1, red: 0.2, green: 0.4, blue: 0.6))";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color.from("), value: "#336699", context: "border" });
  });

  test("Colors.white and Colors.black have values; other named colours don't", () => {
    const white = "TextButton.styleFrom(foregroundColor: Colors.white)";
    expect(pick(one(white))).toEqual({ rule: "raw-color", ...at(white, "Colors.white"), kind: "color", text: "Colors.white", violation: true, value: "#ffffff", context: "text" });
    const black = "Card(color: Colors.black)";
    expect(pick(one(black))).toMatchObject({ text: "Colors.black", value: "#000000", context: "background" });
    const shade = "Icon(Icons.add, color: Colors.blue.shade700)";
    const h = one(shade);
    expect(pick(h)).toEqual({ rule: "raw-color", ...at(shade, "Colors.blue"), kind: "color", text: "Colors.blue.shade700", violation: true, context: "text" });
    expect(h.value).toBeUndefined();
  });

  test("CupertinoColors as a fillColor; borderColor; and everything else is other", () => {
    expect(pick(one("InputDecoration(fillColor: CupertinoColors.systemGrey6)"))).toMatchObject({ text: "CupertinoColors.systemGrey6", context: "background" });
    expect(pick(one("Chip(borderColor: Colors.red)"))).toMatchObject({ text: "Colors.red", context: "border" });
    expect(pick(one("LinearGradient(colors: [Colors.red])"))).toMatchObject({ context: "other" });
    expect(pick(one("Material(color: Colors.amber)"))).toMatchObject({ context: "background" });
    expect(pick(one("ColoredBox(color: Colors.amber)"))).toMatchObject({ context: "background" });
    expect(pick(one("BoxDecoration(color: Colors.amber)"))).toMatchObject({ context: "background" });
    expect(pick(one("TextField(cursorColor: Colors.amber)"))).toMatchObject({ context: "text" });
    expect(pick(one("ListTile(iconColor: Colors.amber)"))).toMatchObject({ context: "text" });
    expect(pick(one("ThemeData(scaffoldBackgroundColor: Colors.amber, )"))).toMatchObject({ context: "background" });
    expect(pick(one("ThemeData(canvasColor: Colors.amber)"))).toMatchObject({ context: "background" });
  });

  test("the nearest named argument counts, through a wrapper call", () => {
    const src = "ButtonStyle(backgroundColor: WidgetStatePropertyAll(Colors.red))";
    expect(pick(one(src))).toMatchObject({ context: "background" });
  });

  test("not colours: a string, a comment, Colors.transparent, Curves, the theme's own colours", () => {
    expect(scan("Text('Color(0xFF000000) and Colors.red')")).toEqual([]);
    expect(scan("// Colors.red\n/* Color(0xFF000000) */\nfinal a = 1;")).toEqual([]);
    expect(scan("Container(color: Colors.transparent)")).toEqual([]);
    expect(scan("Container(color: MotifColors.of(context).surface)")).toEqual([]);
    expect(scan("/// Uses Colors.red and Color(0xFF000000).\nfinal a = 1;")).toEqual([]);
    expect(scan("final s = r'Color(0xFF000000) Colors.red';")).toEqual([]);
    expect(scan("final s = '''\nColors.red\nContainer(color: Color(0xFF000000))\n''';")).toEqual([]);
  });

  test("digit separators: Color(0xFF_3B_82_F6)", () => {
    const src = "Container(color: Color(0xFF_3B_82_F6))";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color(0x"), text: "Color(0xFF_3B_82_F6)", value: "#3b82f6", context: "background" });
  });
});

describe("off-scale sizes in Dart", () => {
  test("EdgeInsets.all on the scale is seen but allowed; off it is a violation", () => {
    const on = "Padding(padding: EdgeInsets.all(16))";
    expect(pick(one(on))).toEqual({ rule: "off-scale", ...at(on, "16"), kind: "space", text: "16", violation: false, value: "16px" });
    const off = "Padding(padding: EdgeInsets.all(13))";
    expect(pick(one(off))).toEqual({ rule: "off-scale", ...at(off, "13"), kind: "space", text: "13", violation: true, value: "13px" });
  });

  test("symmetric, only, fromLTRB, and the directional ones; 0 is always allowed", () => {
    const sym = "EdgeInsets.symmetric(horizontal: 13, vertical: 8)";
    expect(scan(sym).map(pick)).toEqual([
      { rule: "off-scale", ...at(sym, "horizontal"), kind: "space", text: "horizontal: 13", violation: true, value: "13px" },
      { rule: "off-scale", ...at(sym, "vertical"), kind: "space", text: "vertical: 8", violation: false, value: "8px" },
    ]);
    expect(scan("EdgeInsets.only(left: 6)").map((h) => [h.value, h.violation])).toEqual([["6px", true]]);
    expect(scan("EdgeInsets.fromLTRB(0, 6, 8, 10)").map((h) => [h.value, h.violation])).toEqual([["0px", false], ["6px", true], ["8px", false], ["10px", true]]);
    expect(scan("EdgeInsetsDirectional.only(start: 6)").map((h) => [h.value, h.violation])).toEqual([["6px", true]]);
    expect(scan("EdgeInsetsDirectional.fromSTEB(6, 0, 6, 0)").map((h) => h.value)).toEqual(["6px", "0px", "6px", "0px"]);
  });

  test("a SizedBox with one side and no child is a gap; Gap and the spacing arguments are too", () => {
    const gap = "Column(children: [Text('a'), SizedBox(height: 10), Text('b')])";
    expect(pick(one(gap))).toEqual({ rule: "off-scale", ...at(gap, "height"), kind: "space", text: "height: 10", violation: true, value: "10px" });
    expect(scan("const SizedBox(width: 10)").map((h) => h.value)).toEqual(["10px"]);
    expect(scan("Gap(10)").map((h) => [h.kind, h.value])).toEqual([["space", "10px"]]);
    for (const name of ["spacing", "runSpacing", "mainAxisSpacing", "crossAxisSpacing"]) {
      const src = `Wrap(${name}: 10, children: [])`;
      expect(scan(src).map(pick)).toEqual([{ rule: "off-scale", ...at(src, name), kind: "space", text: `${name}: 10`, violation: true, value: "10px" }]);
    }
  });

  test("not gaps: a sized box, a SizedBox with a child, a theme value", () => {
    expect(scan("SizedBox(width: 48, height: 48)")).toEqual([]);
    expect(scan("SizedBox(height: 10, child: Text('a'))")).toEqual([]);
    expect(scan("Padding(padding: EdgeInsets.all(MotifSpace.s4))")).toEqual([]);
    expect(scan("Padding(padding: EdgeInsets.all(MotifSpace.s4 * 2))")).toEqual([]);
  });

  test("corners: BorderRadius.circular, BorderRadiusDirectional.circular, Radius.circular", () => {
    const src = "BoxDecoration(borderRadius: BorderRadius.circular(12))";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, "12"), kind: "radius", text: "12", violation: true, value: "12px" });
    expect(scan("BorderRadiusDirectional.circular(6)").map((h) => [h.kind, h.value, h.violation])).toEqual([["radius", "6px", true]]);
    expect(scan("Radius.circular(8)").map((h) => [h.kind, h.value, h.violation])).toEqual([["radius", "8px", false]]);
  });

  test("text sizes: fontSize:", () => {
    const src = "TextStyle(fontSize: 15, fontWeight: FontWeight.w600)";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, "fontSize"), kind: "font-size", text: "fontSize: 15", violation: true, value: "15px" });
    expect(scan("TextStyle(fontSize: 16)").map((h) => h.violation)).toEqual([false]);
  });

  test("a CustomPainter's paint method is a drawing: its sizes are its geometry, its colours are still read (Sahm's welcome art, Plan 2L final run)", () => {
    const src = `class _Art extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(8, 10, 304, 132), const Radius.circular(28)), Paint()..color = const Color(0xFF123456));
    final label = TextPainter(text: TextSpan(text: 'Gate', style: TextStyle(fontSize: 11)));
    if (size.width > 0) { canvas.drawRRect(RRect.fromRectAndRadius(Rect.zero, const Radius.circular(3)), Paint()); }
  }

  @override
  bool shouldRepaint(_Art old) => false;
}
final card = BoxDecoration(borderRadius: BorderRadius.circular(28));
`;
    expect(scan(src).map((h) => [h.rule, h.kind, h.line, h.violation])).toEqual([
      ["raw-color", "color", 4, true],
      ["off-scale", "radius", 12, true],
    ]);
  });
});

describe("raw-font in Dart", () => {
  test("fontFamily: a literal", () => {
    const src = "TextStyle(fontFamily: 'Roboto')";
    expect(pick(one(src))).toEqual({ rule: "raw-font", ...at(src, "fontFamily"), kind: "font-family", text: "fontFamily: 'Roboto'", violation: true, value: "Roboto" });
    expect(scan("TextStyle(fontFamily: MotifText.body.fontFamily)")).toEqual([]);
  });

  test("each literal in fontFamilyFallback", () => {
    const src = 'TextStyle(fontFamilyFallback: const ["Noto Sans", \'Arial\'])';
    expect(scan(src).map(pick)).toEqual([
      { rule: "raw-font", ...at(src, '"Noto'), kind: "font-family", text: '"Noto Sans"', violation: true, value: "Noto Sans" },
      { rule: "raw-font", ...at(src, "'Arial'"), kind: "font-family", text: "'Arial'", violation: true, value: "Arial" },
    ]);
  });

  test("GoogleFonts.<family>( and GoogleFonts.getFont('…')", () => {
    const src = "Text('a', style: GoogleFonts.robotoMono(fontWeight: FontWeight.w500))";
    expect(pick(one(src))).toEqual({ rule: "raw-font", ...at(src, "GoogleFonts"), kind: "font-family", text: "GoogleFonts.robotoMono", violation: true, value: "Roboto Mono" });
    const get = "GoogleFonts.getFont('Lato')";
    expect(pick(one(get))).toEqual({ rule: "raw-font", line: 1, column: 1, kind: "font-family", text: "GoogleFonts.getFont('Lato')", violation: true, value: "Lato" });
    expect(scan("GoogleFonts.interTextTheme()").map((h) => h.value)).toEqual(["Inter"]);
  });
});

describe("raw-motion in Dart", () => {
  test("a Duration given as a duration argument, off the theme's durations", () => {
    const src = "AnimatedOpacity(\n  duration: const Duration(milliseconds: 300),\n  opacity: 1,\n)";
    expect(pick(one(src))).toEqual({ rule: "raw-motion", ...at(src, "Duration("), kind: "duration", text: "Duration(milliseconds: 300)", violation: true, value: "300ms" });
    expect(scan("x(duration: Duration(milliseconds: 200))").map((h) => [h.value, h.violation])).toEqual([["200ms", false]]);
    expect(scan("x(reverseDuration: Duration(seconds: 1))").map((h) => [h.value, h.violation])).toEqual([["1000ms", true]]);
    expect(scan("PageRouteBuilder(transitionDuration: Duration(milliseconds: 250))").map((h) => h.value)).toEqual(["250ms"]);
  });

  test("other Durations (timers, timeouts) aren't read", () => {
    expect(scan("await Future.delayed(Duration(seconds: 2));")).toEqual([]);
    expect(scan("Timer(const Duration(seconds: 2), tick);")).toEqual([]);
    expect(scan("x(timeout: Duration(seconds: 30))")).toEqual([]);
    expect(scan("x(duration: MotifDurations.base)")).toEqual([]);
  });

  test("how long a message stays up isn't motion: SnackBar, MaterialBanner and Tooltip durations, and timing names", () => {
    expect(scan("SnackBar(content: Text('Saved'), duration: const Duration(seconds: 3))")).toEqual([]);
    expect(scan("MaterialBanner(content: x, actions: [], duration: Duration(seconds: 5))")).toEqual([]);
    expect(scan("Tooltip(message: 'a', duration: Duration(seconds: 2), waitDuration: Duration(milliseconds: 500), showDuration: Duration(seconds: 3), exitDuration: Duration(milliseconds: 100))")).toEqual([]);
    for (const name of ["debounceDuration", "cacheDuration", "timeoutDuration", "pollDuration", "refreshDuration", "autoplayDuration", "pauseDuration", "delayDuration"]) {
      expect(scan(`x(${name}: Duration(milliseconds: 300))`)).toEqual([]);
    }
    // Other widgets' duration: and animation names stay read.
    expect(scan("AnimatedSwitcher(duration: Duration(milliseconds: 300), child: x)").map((h) => h.value)).toEqual(["300ms"]);
  });

  test("a duration chosen in a condition is read on its typed side", () => {
    const src = "AnimatedOpacity(duration: reduce ? Duration.zero : Duration(milliseconds: 300), opacity: 1)";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Duration(milliseconds"), text: "Duration(milliseconds: 300)", value: "300ms", violation: true });
    expect(scan("x(duration: fast ? const Duration(milliseconds: 300) : MotifDurations.base)").map((h) => h.value)).toEqual(["300ms"]);
  });

  test("easing: Curves.<name> (not linear) and Cubic(", () => {
    const src = "x(curve: Curves.easeInOut)";
    expect(pick(one(src))).toEqual({ rule: "raw-motion", ...at(src, "Curves"), kind: "easing", text: "Curves.easeInOut", violation: true, value: "Curves.easeInOut" });
    expect(scan("x(curve: Curves.linear)")).toEqual([]);
    expect(scan("x(curve: MotifCurves.standard)")).toEqual([]);
    const cubic = "x(curve: const Cubic(0.2, 0, 0, 1))";
    expect(pick(one(cubic))).toEqual({ rule: "raw-motion", ...at(cubic, "Cubic"), kind: "easing", text: "Cubic(0.2, 0, 0, 1)", violation: true, value: "cubic-bezier(0.2, 0, 0, 1)" });
  });

  test("springs: SpringDescription( and SpringDescription.withDampingRatio(", () => {
    const src = "final s = SpringDescription(mass: 1, stiffness: 100, damping: 10);";
    expect(pick(one(src))).toMatchObject({ rule: "raw-motion", ...at(src, "Spring"), kind: "spring", text: "SpringDescription(mass: 1, stiffness: 100, damping: 10)", violation: true });
    expect(scan("SpringDescription.withDampingRatio(mass: 1, stiffness: 100)").map((h) => [h.rule, h.kind])).toEqual([["raw-motion", "spring"]]);
    expect(scan("final s = MotifSprings.smooth;")).toEqual([]);
  });

  test("a call written over several lines is reported on one", () => {
    const src = "SpringDescription.withDampingRatio(\n  mass: 1,\n  stiffness: 100,\n)";
    expect(one(src).text).toBe("SpringDescription.withDampingRatio(mass: 1, stiffness: 100)");
    expect(one("GoogleFonts.getFont(\n  r'Lato',\n)")).toMatchObject({ text: "GoogleFonts.getFont(r'Lato')", value: "Lato" });
  });
});

describe("Dart fixes", () => {
  const fixOf = (src: string) => one(src).fix;
  test("each kind names the generated Dart to use", () => {
    expect(fixOf("Container(color: Colors.red)")).toBe("Use MotifColors.of(context).<role>.");
    expect(fixOf("EdgeInsets.all(13)")).toBe("Use MotifSpace.s<N>.");
    expect(fixOf("BorderRadius.circular(12)")).toBe("Use MotifRadius.<role>.");
    expect(fixOf("TextStyle(fontSize: 15)")).toBe("Use MotifText.<role>.");
    expect(fixOf("TextStyle(fontFamily: 'Roboto')")).toBe("Use MotifText.<role>.");
    expect(fixOf("x(duration: Duration(milliseconds: 300))")).toBe("Use MotifDurations.<role> (or MotifMotion.duration(context, …)).");
    expect(fixOf("x(curve: Curves.easeIn)")).toBe("Use MotifCurves.<role>.");
    expect(fixOf("SpringDescription(mass: 1, stiffness: 100, damping: 10)")).toBe("Use MotifSprings.<role>.");
  });

  test("FLUTTER.fix speaks Dart, and the closest role is the generated member", () => {
    const hit = one("Container(color: Colors.red)");
    expect(FLUTTER.fix!({ ...hit, fix: "something else" })).toBe("Use MotifColors.of(context).<role>.");
    expect(FLUTTER.role!("color", "text-secondary")).toBe("MotifColors.of(context).textSecondary");
    expect(FLUTTER.role!("space", "0-5")).toBe("MotifSpace.s0p5");
    expect(FLUTTER.role!("radius", "md")).toBe("MotifRadius.md");
    expect(FLUTTER.role!("font-size", "body")).toBe("MotifText.body");
  });
});

describe("the closest colour role (grouped output)", () => {
  const theme = buildTheme(docFrom(validTokens()));
  const closest = (src: string) => suggestRole(one(src), theme, { role: FLUTTER.role! });
  test("a colour that reads as a role's colour gets that role, even a near miss", () => {
    expect(closest("Text('a', style: TextStyle(color: Color(0xFF4B5563)))")).toBe("MotifColors.of(context).textSecondary");
    expect(closest("Text('a', style: TextStyle(color: Color(0xFF4A5462)))")).toBe("MotifColors.of(context).textSecondary");
  });
  test("an off-brand colour gets none (the plain fix is shown), nor a named colour with no value", () => {
    expect(closest("Container(color: Color(0xFFFF00AA))")).toBeUndefined();
    expect(closest("Container(color: Color(0xFF3B82F6))")).toBeUndefined();
    expect(closest("Container(color: Colors.blue)")).toBeUndefined();
  });
  test("sizes get the nearest generated member", () => {
    expect(suggestRole(one("EdgeInsets.all(13)"), theme, { role: FLUTTER.role! })).toBe("MotifSpace.s3 (12px)");
  });
});

describe("without a scale (extract)", () => {
  test("every value is seen and none is judged against a scale", () => {
    const hits = scanDart(file("Padding(padding: EdgeInsets.all(13), child: x(duration: Duration(milliseconds: 300)))"), null);
    expect(hits.map((h) => [h.kind, h.value, h.violation])).toEqual([["space", "13px", false], ["duration", "300ms", false]]);
  });
});

describe("reduced motion in a Flutter app", () => {
  const anim = file("class A {\n  final c = AnimationController(vsync: this);\n}\n", "lib/a.dart");
  test("an app that animates without MotifMotion or disableAnimations gets one hit at the first animation", () => {
    const hits = FLUTTER.appWide!([file("void main() {}\n"), anim], []);
    expect(hits.map((h) => ({ rule: h.rule, file: h.file, line: h.line, column: h.column, text: h.text, violation: h.violation, message: h.message, fix: h.fix }))).toEqual([{
      rule: "reduced-motion", file: "lib/a.dart", line: 2, column: 13, text: "animation", violation: true,
      message: 'Animations here ignore the "reduce motion" setting.',
      fix: "Use MotifMotion.duration(context, …) for durations (it is zero when reduce motion is on), or check MediaQuery.disableAnimationsOf(context).",
    }]);
  });

  test("MotifMotion. or disableAnimations in the app's code answers it; in a comment it doesn't", () => {
    expect(FLUTTER.appWide!([anim, file("final d = MotifMotion.duration(context, MotifDurations.base);")], [])).toEqual([]);
    expect(FLUTTER.appWide!([anim, file("final r = MediaQuery.of(context).disableAnimations;")], [])).toEqual([]);
    expect(FLUTTER.appWide!([anim, file("// MotifMotion.duration")], [])).toHaveLength(1);
  });

  test("Animated widgets, TweenAnimationBuilder, .animate( and Hero( animate; an app without them is fine", () => {
    for (const src of ["AnimatedContainer(duration: d)", "TweenAnimationBuilder<double>(tween: t)", "Text('a').animate().fadeIn()", "Hero(tag: 'a', child: x)"]) {
      expect(FLUTTER.appWide!([file(src)], [])).toHaveLength(1);
    }
    expect(FLUTTER.appWide!([file("Text('AnimatedContainer(')")], [])).toEqual([]);
  });
});
