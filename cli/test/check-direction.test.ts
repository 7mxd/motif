import { describe, expect, test } from "bun:test";
import { directionHits, directionLangs, type DirectionLang } from "../src/check/rules/direction";
import type { Lang, SourceFile } from "../src/check/files";
import { RULE_IDS } from "../src/check/types";
import { startEndRequired } from "../src/check/guide";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = (text: string, lang: Lang, path = "src/a"): SourceFile => ({ path, abs: path, text, lang });
const texts = (text: string, lang: Lang, langs: DirectionLang[]) => directionHits(file(text, lang), langs).map((h) => h.text);
const fixes = (text: string, lang: Lang, langs: DirectionLang[]) => directionHits(file(text, lang), langs).map((h) => h.fix);

test("the rule id is known", () => {
  expect(RULE_IDS).toContain("physical-direction");
});

describe("css", () => {
  test("flags physical sides and names the start/end form", () => {
    const css = [
      ".a { margin-left: 8px; }",
      ".b { padding-right: 4px; }",
      ".c { border-left-width: 1px; }",
      ".d { border-top-left-radius: 4px; }",
      ".e { text-align: right; }",
      ".f { float: left; }",
      ".g { position: absolute; left: 12px; }",
    ].join("\n");
    expect(texts(css, "css", ["css"])).toEqual(["margin-left", "padding-right", "border-left-width", "border-top-left-radius", "text-align: right", "float: left", "left"]);
    const f = fixes(css, "css", ["css"]);
    for (const want of ["margin-inline-start", "padding-inline-end", "border-inline-start-width", "border-start-start-radius", "text-align: end", "float: inline-start", "inset-inline-start"]) {
      expect(f.some((x) => x.includes(want))).toBe(true);
    }
  });
  test("hits carry the rule, a violation flag and 1-based positions", () => {
    const [hit] = directionHits(file(".a {\n  margin-left: 8px;\n}", "css"), ["css"]);
    expect(hit).toMatchObject({ rule: "physical-direction", violation: true, line: 2, column: 3, file: "src/a" });
  });
  test("symmetric insets and 50% centring mirror the same and aren't flagged", () => {
    expect(texts(".a { position: absolute; left: 0; right: 0; }", "css", ["css"])).toEqual([]);
    expect(texts(".a { position: absolute; left: 50%; transform: translateX(-50%); }", "css", ["css"])).toEqual([]);
  });
  test("start/end forms and comments aren't flagged", () => {
    expect(texts(".a { margin-inline-start: 8px; text-align: start; } /* was margin-left: 8px */", "css", ["css"])).toEqual([]);
  });
  test("style attributes in markup are read as CSS", () => {
    expect(texts('<div style="margin-left: 4px">3 seats left</div>', "markup", ["css"])).toEqual(["margin-left"]);
  });
  test("equal left and right values in one rule mirror to themselves and aren't flagged", () => {
    const css = [
      ".a { margin-left: auto; margin-right: auto; }",
      ".b { padding-left: 16px; padding-right: 16px; }",
      ".c { border-left: 1px solid red; border-right: 1px solid red; border-left-width: 2px; border-right-width: 2px; }",
      ".d { border-top-left-radius: 8px; border-top-right-radius: 8px; border-bottom-left-radius: 2px; border-bottom-right-radius: 2px; }",
    ].join("\n");
    expect(texts(css, "css", ["css"])).toEqual([]);
    expect(texts(".a { padding-left: 16px; padding-right: 8px; }", "css", ["css"])).toEqual(["padding-left", "padding-right"]);
    expect(texts(".a { margin-left: auto; } .b { margin-right: auto; }", "css", ["css"])).toEqual(["margin-left", "margin-right"]);
  });
  test("50% centring with translate on both axes isn't flagged", () => {
    expect(texts(".a { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }", "css", ["css"])).toEqual([]);
    expect(texts(".a { position: absolute; left: 50%; translate: -50% -50%; }", "css", ["css"])).toEqual([]);
    expect(texts(".a { position: absolute; left: 50%; transform: translate(0, -50%); }", "css", ["css"])).toEqual(["left"]);
  });
  test("a safe-area inset of the same side is physical by nature and isn't flagged", () => {
    expect(texts(".a { padding-left: env(safe-area-inset-left); padding-right: calc(16px + env(safe-area-inset-right)); }", "css", ["css"])).toEqual([]);
    expect(texts(".a { padding-left: env(safe-area-inset-right); }", "css", ["css"])).toEqual(["padding-left"]);
  });
});

describe("tailwind", () => {
  test("flags physical classes with their start/end class", () => {
    const html = '<div class="ml-4 mr-2 pl-3 pr-1 left-2 right-3 text-left text-right border-l-2 border-r rounded-l-lg rounded-tr float-left -ml-2 md:pl-6 !pr-2"></div>';
    expect(texts(html, "markup", ["tailwind"])).toEqual([
      "ml-4", "mr-2", "pl-3", "pr-1", "left-2", "right-3", "text-left", "text-right", "border-l-2", "border-r", "rounded-l-lg", "rounded-tr", "float-left", "-ml-2", "md:pl-6", "!pr-2",
    ]);
    expect(fixes('<div class="ml-4"></div>', "markup", ["tailwind"])[0]).toContain("ms-4");
    expect(fixes('<div class="rounded-tr"></div>', "markup", ["tailwind"])[0]).toContain("rounded-se");
    expect(fixes('<div class="md:pl-6"></div>', "markup", ["tailwind"])[0]).toContain("md:ps-6");
  });
  test("className strings in scripts are read too", () => {
    expect(texts('const x = <p className="text-left font-bold">Hi</p>;', "script", ["tailwind"])).toEqual(["text-left"]);
  });
  test("direction-aware and symmetric classes aren't flagged", () => {
    expect(texts('<div class="rtl:ml-2 ltr:pr-4 left-1/2 -translate-x-1/2 ms-4 inset-x-0"></div>', "markup", ["tailwind"])).toEqual([]);
    expect(texts('<div class="absolute left-0 right-0"></div>', "markup", ["tailwind"])).toEqual([]);
  });
  test("equal left and right classes on one element aren't flagged", () => {
    expect(texts('<div class="pl-4 pr-4 ml-auto mr-auto rounded-tl-lg rounded-tr-lg border-l border-r"></div>', "markup", ["tailwind"])).toEqual([]);
    expect(texts('<div class="md:pl-4 pr-4 rounded-tl-lg rounded-tr"></div>', "markup", ["tailwind"])).toEqual(["md:pl-4", "pr-4", "rounded-tl-lg", "rounded-tr"]);
  });
  test("plain classes named like a side aren't Tailwind", () => {
    expect(texts('<aside class="left-rail right-panel"></aside>', "markup", ["tailwind"])).toEqual([]);
    expect(texts('<div class="left-[3px] -right-px pl-0.5 ml-(--gap) lg:!mr-auto left-1/2 right-full"></div>', "markup", ["tailwind"])).toEqual([
      "left-[3px]", "-right-px", "pl-0.5", "ml-(--gap)", "lg:!mr-auto", "left-1/2", "right-full",
    ]);
    expect(fixes('<div class="md:pl-4!"></div>', "markup", ["tailwind"])[0]).toContain("md:ps-4!");
  });
  test("margin and padding with a theme's named spacing are still Tailwind", () => {
    expect(texts('<div class="pl-section mr-menu ml-gutter"></div>', "markup", ["tailwind"])).toEqual(["pl-section", "mr-menu", "ml-gutter"]);
  });
  test("a safe-area inset of the same side isn't flagged", () => {
    expect(texts('<div class="pl-[env(safe-area-inset-left)]"></div>', "markup", ["tailwind"])).toEqual([]);
  });
});

describe("js-style", () => {
  test("flags physical style keys in style objects", () => {
    const rn = [
      "const s = StyleSheet.create({",
      "  a: { marginLeft: 8, paddingRight: 4, borderLeftWidth: 1, borderTopLeftRadius: 4, textAlign: 'left', left: 4 },",
      "});",
    ].join("\n");
    expect(texts(rn, "script", ["js-style"])).toEqual(["marginLeft", "paddingRight", "borderLeftWidth", "borderTopLeftRadius", "textAlign: 'left'", "left"]);
    const f = fixes(rn, "script", ["js-style"]);
    for (const want of ["marginStart", "paddingEnd", "borderStartWidth", "borderTopStartRadius", "start"]) expect(f.some((x) => x.includes(want))).toBe(true);
  });
  test("inline style={{…}} is read", () => {
    expect(texts("<View style={{ marginRight: 4 }} />", "script", ["js-style"])).toEqual(["marginRight"]);
  });
  test("a left key outside a style object isn't layout", () => {
    expect(texts("const seats = { left: 3 };", "script", ["js-style"])).toEqual([]);
  });
  test("equal left and right values in one style object aren't flagged", () => {
    const rn = [
      "const s = StyleSheet.create({",
      "  fill: { position: 'absolute', left: 0, right: 0 },",
      "  pad: { paddingLeft: 8, paddingRight: 8 },",
      "  mid: { marginLeft: 'auto', marginRight: 'auto' },",
      "  odd: { marginLeft: '8px', marginRight: '4px' },",
      "});",
    ].join("\n");
    expect(texts(rn, "script", ["js-style"])).toEqual(["marginLeft", "marginRight"]);
  });
  test("a safe-area inset of the same side is physical by nature and isn't flagged", () => {
    expect(texts("<View style={{ paddingLeft: insets.left, paddingRight: insets.right + 8 }} />", "script", ["js-style"])).toEqual([]);
    expect(texts("<View style={{ paddingLeft: insets.right }} />", "script", ["js-style"])).toEqual(["paddingLeft"]);
  });
  test("style names and bare identifiers aren't style keys", () => {
    const rn = [
      "const s = StyleSheet.create({",
      "  left: { flex: 1 },",
      "  right: { marginLeft: 4 },",
      "});",
      "const v = <View style={{ marginTop: rtl ? left : 0, width: right ? 1 : 2 }} />;",
    ].join("\n");
    expect(texts(rn, "script", ["js-style"])).toEqual(["marginLeft"]);
  });
  test("web stacks get the CSS logical property in camelCase, React Native its own start/end names", () => {
    const jsx = "<div style={{ marginLeft: 8, paddingRight: 4, left: 0, borderTopLeftRadius: 4, textAlign: 'left' }} />";
    for (const stack of ["react-web", "vue", "svelte", "angular"] as const) {
      const f = directionHits(file(jsx, "script"), ["js-style"], stack).map((h) => h.fix);
      expect(f[0]).toContain("marginInlineStart");
      expect(f[1]).toContain("paddingInlineEnd");
      expect(f[2]).toContain("insetInlineStart");
      expect(f[3]).toContain("borderStartStartRadius");
      expect(f[4]).toContain("textAlign: 'start'");
      expect(f.join(" ")).not.toContain("marginStart");
    }
    const rn = directionHits(file(jsx, "script"), ["js-style"], "react-native").map((h) => h.fix);
    expect(rn[0]).toContain("marginStart");
    expect(rn[2]).toContain("start");
    expect(rn[4]).not.toContain("'start'");
    expect(texts("<Text style={{ textAlign: 'left' as const }} />", "script", ["js-style"])).toEqual(["textAlign: 'left'"]);
  });
});

describe("dart", () => {
  test("flags physical Flutter forms with the Directional ones", () => {
    const dart = [
      "Padding(padding: EdgeInsets.only(left: 8));",
      "Padding(padding: EdgeInsets.fromLTRB(16, 8, 4, 8));",
      "Align(alignment: Alignment.centerLeft);",
      "Align(alignment: Alignment.topRight);",
      "Positioned(left: 4, child: x);",
      "Text('a', textAlign: TextAlign.right);",
      "BorderRadius.only(topLeft: Radius.circular(4));",
    ].join("\n");
    expect(texts(dart, "dart", ["dart"])).toEqual(["EdgeInsets.only", "EdgeInsets.fromLTRB", "Alignment.centerLeft", "Alignment.topRight", "Positioned", "TextAlign.right", "BorderRadius.only"]);
    const f = fixes(dart, "dart", ["dart"]);
    for (const want of ["EdgeInsetsDirectional.only", "EdgeInsetsDirectional.fromSTEB", "AlignmentDirectional.centerStart", "PositionedDirectional", "TextAlign.end", "BorderRadiusDirectional.only"]) {
      expect(f.some((x) => x.includes(want))).toBe(true);
    }
  });
  test("symmetric and directional forms aren't flagged", () => {
    expect(texts("EdgeInsets.fromLTRB(8, 4, 8, 4); EdgeInsets.symmetric(horizontal: 8); AlignmentDirectional.centerStart; EdgeInsets.only(top: 4);", "dart", ["dart"])).toEqual([]);
  });
  test("import and export lines aren't layout", () => {
    expect(texts("import 'package:a/b.dart' show Alignment;\nexport 'src/x.dart' hide TextAlign;\n", "dart", ["dart"])).toEqual([]);
  });
  test("equal left and right insets and corners aren't flagged", () => {
    expect(texts("EdgeInsets.only(left: 16, right: 16, top: 4); BorderRadius.only(topLeft: r, topRight: r); BorderRadius.only(topLeft: a, topRight: a, bottomLeft: b, bottomRight: b);", "dart", ["dart"])).toEqual([]);
    expect(texts("EdgeInsets.only(left: 16, right: 8); BorderRadius.only(topLeft: r, topRight: r, bottomLeft: s);", "dart", ["dart"])).toEqual(["EdgeInsets.only", "BorderRadius.only"]);
  });
  test("alignments inside a gradient are decoration, not layout", () => {
    const dart = [
      "BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [a, b]));",
      "RadialGradient(center: Alignment.centerLeft, colors: c);",
      "Align(alignment: Alignment.topLeft);",
    ].join("\n");
    expect(texts(dart, "dart", ["dart"])).toEqual(["Alignment.topLeft"]);
  });
});

describe("kotlin", () => {
  test("flags absolute Compose forms", () => {
    const kt = [
      "Modifier.absolutePadding(left = 8.dp)",
      "Modifier.absoluteOffset(x = 4.dp)",
      "Row(horizontalArrangement = Arrangement.Absolute.Left)",
      "Box(contentAlignment = AbsoluteAlignment.Left)",
      "Text(\"a\", textAlign = TextAlign.Right)",
      "CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {}",
    ].join("\n");
    expect(texts(kt, "kotlin", ["kotlin"])).toEqual(["absolutePadding", "absoluteOffset", "Arrangement.Absolute.Left", "AbsoluteAlignment.Left", "TextAlign.Right", "LayoutDirection.Ltr"]);
    const f = fixes(kt, "kotlin", ["kotlin"]);
    for (const want of ["padding(start", "offset", "Arrangement.Start", "Alignment.Start", "TextAlign.End", "forced direction"]) expect(f.some((x) => x.includes(want))).toBe(true);
  });
  test("start/end forms aren't flagged", () => {
    expect(texts("Modifier.padding(start = 8.dp); Text(\"a\", textAlign = TextAlign.Start)", "kotlin", ["kotlin"])).toEqual([]);
  });  test("import lines aren't layout", () => {
    expect(texts("package a.b\n\nimport androidx.compose.foundation.layout.absolutePadding\nimport androidx.compose.ui.text.style.TextAlign.Left\n", "kotlin", ["kotlin"])).toEqual([]);
  });
});

describe("swift", () => {
  test("flags a forced left-to-right direction and unflipped direction symbols", () => {
    const swift = [
      "VStack {}.environment(\\.layoutDirection, .leftToRight)",
      'Image(systemName: "chevron.left")',
      'Image(systemName: "arrow.right.circle.fill").font(.title)',
    ].join("\n");
    expect(texts(swift, "swift", ["swift"])).toEqual([".leftToRight", "chevron.left", "arrow.right.circle.fill"]);
    expect(fixes(swift, "swift", ["swift"])[1]).toContain(".flipsForRightToLeftLayoutDirection(true)");
  });
  test("backward/forward symbols and flipped ones aren't flagged", () => {
    const swift = [
      'Image(systemName: "chevron.backward")',
      'Image(systemName: "arrow.forward")',
      'Image(systemName: "chevron.right")',
      "    .flipsForRightToLeftLayoutDirection(true)",
      'Text("Turn right")',
    ].join("\n");
    expect(texts(swift, "swift", ["swift"])).toEqual([]);
  });
  test("compound symbols that are already symmetric aren't flagged", () => {
    const swift = [
      'Image(systemName: "arrow.left.arrow.right")',
      'Image(systemName: "chevron.left.forwardslash.chevron.right")',
      'Image(systemName: "arrow.left.and.right")',
      'Label("Swap", systemImage: "arrow.right.arrow.left.circle")',
    ].join("\n");
    expect(texts(swift, "swift", ["swift"])).toEqual([]);
  });
  test("one-way symbols with more parts are still flagged, with their backward/forward name", () => {
    const swift = ['Image(systemName: "arrow.left.to.line")', 'Image(systemName: "chevron.left.2")', 'Image(systemName: "arrow.right.to.line.compact")'].join("\n");
    expect(texts(swift, "swift", ["swift"])).toEqual(["arrow.left.to.line", "chevron.left.2", "arrow.right.to.line.compact"]);
    const f = fixes(swift, "swift", ["swift"]);
    expect(f[0]).toContain('"arrow.backward.to.line"');
    expect(f[1]).toContain('"chevron.backward.2"');
    expect(f[2]).toContain('"arrow.forward.to.line.compact"');
  });
  test("the suggested symbol is a real backward/forward name", () => {
    const swift = ['Image(systemName: "chevron.left")', 'Image(systemName: "arrow.right.circle")', 'Image(systemName: "arrow.left.square.fill")', 'Image(systemName: "chevron.right.circle.fill")'].join("\n");
    expect(texts(swift, "swift", ["swift"])).toEqual(["chevron.left", "arrow.right.circle", "arrow.left.square.fill", "chevron.right.circle.fill"]);
    const f = fixes(swift, "swift", ["swift"]);
    expect(f[0]).toContain('"chevron.backward"');
    expect(f[1]).toContain('"arrow.forward.circle"');
    expect(f[2]).toContain('"arrow.backward.square.fill"');
    expect(f[3]).toContain('"chevron.forward.circle.fill"');
  });
});

describe("ignores comments and plain text", () => {
  test("the word left/right in text and comments is not layout", () => {
    expect(texts('// was margin-left\n<p aria-label="Swipe left">3 seats left</p>', "markup", ["css", "tailwind"])).toEqual([]);
    expect(texts("// marginLeft: 8\nconst t = 'marginLeft: 8';", "script", ["js-style", "tailwind"])).toEqual([]);
    expect(texts("// EdgeInsets.only(left: 8)\nText('Alignment.centerLeft');", "dart", ["dart"])).toEqual([]);
    expect(texts('// TextAlign.Right\nText("TextAlign.Right")', "kotlin", ["kotlin"])).toEqual([]);
  });
});

describe("ignores direction-aware forms", () => {
  test("rtl selectors, rtl: variants and directional APIs", () => {
    expect(texts('[dir="rtl"] .x { margin-left: 0; }', "css", ["css"])).toEqual([]);
    expect(texts('<i class="rtl:ml-2 ltr:mr-2"></i>', "markup", ["tailwind"])).toEqual([]);
    expect(texts("EdgeInsetsDirectional.only(start: 8)", "dart", ["dart"])).toEqual([]);
    expect(texts("HStack(alignment: .leading) {}", "swift", ["swift"])).toEqual([]);
  });
});

describe("directionLangs", () => {
  test("picks the scanners for a stack and file", () => {
    expect(directionLangs("vue", "src/App.vue", true)).toEqual(["css", "tailwind", "js-style"]);
    expect(directionLangs("flutter", "lib/a.dart", false)).toEqual(["dart"]);
    expect(directionLangs("react-native", "app/x.tsx", false)).toEqual(["js-style"]);
    expect(directionLangs("compose", "app/src/main/A.kt", false)).toEqual(["kotlin"]);
    expect(directionLangs("swiftui", "App/A.swift", false)).toEqual(["swift"]);
    expect(directionLangs("react-web", "src/a.css", false)).toEqual(["css"]);
    expect(directionLangs("plain-web", "index.html", false)).toEqual(["css"]);
  });
});

describe("startEndRequired", () => {
  const LINE = "- Layouts use start/end (not left/right), so right-to-left languages work.";
  test("start/end line is found whatever the heading and line endings", () => {
    expect(startEndRequired(`# G\n\n## 7. Accessibility\n\n${LINE}\n\n## 8. Platform notes\n`)).toBe(true);
    expect(startEndRequired(`# G\r\n\r\n## Accessibility\r\n\r\n${LINE}\r\n`)).toBe(true);
    expect(startEndRequired(readFileSync(join(import.meta.dir, "..", "..", "skill", "contract", "DESIGN.template.md"), "utf8"))).toBe(true);
  });
  test("SwiftUI's own words, leading and trailing, count as start/end", () => {
    expect(startEndRequired("# G\n\n## 7. Accessibility\n\n- Layouts use leading and trailing (`.padding(.leading)`), never left and right, so Arabic mirrors correctly.\n")).toBe(true);
  });
  test("false without the line, outside the section, or without a guide", () => {
    expect(startEndRequired("# G\n\n## 7. Accessibility\n\n- Text meets WCAG 2.2 AA.\n")).toBe(false);
    expect(startEndRequired(`# G\n\n## 9. Do / Don't\n\n${LINE}\n`)).toBe(false);
    expect(startEndRequired(null)).toBe(false);
  });
});
