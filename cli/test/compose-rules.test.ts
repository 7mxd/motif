import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { buildScale } from "../src/check/scale";
import { suggestRole } from "../src/check/suggest";
import type { Hit } from "../src/check/types";
import { buildTheme } from "../src/generate/theme";
import { COMPOSE } from "../src/stacks/compose";
import { composePaletteFile } from "../src/stacks/compose/palette";
import { composeFix, composeReducedMotion, composeRole, scanKotlin } from "../src/stacks/compose/rules";
import { docFrom, validTokens } from "./helpers";

const theme = buildTheme(docFrom(validTokens()));
const scale = buildScale(theme, "app/src/main/java/com/example/ui/motif");
const file = (text: string, path = "app/src/main/java/com/example/Home.kt"): SourceFile => ({ path, abs: path, text, lang: "kotlin" });
const scan = (text: string) => scanKotlin(file(text), scale);
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

describe("the Compose stack checks Kotlin", () => {
  test("is wired into the registry", () => {
    expect(COMPOSE.scan).toBe(scanKotlin);
    expect(COMPOSE.fix).toBe(composeFix);
    expect(COMPOSE.role).toBe(composeRole);
    expect(COMPOSE.paletteFile).toBe(composePaletteFile);
    expect(COMPOSE.appWide).toBeDefined();
  });
});

describe("raw-color in Kotlin", () => {
  test("Color(0xFFrrggbb) is #rrggbb; containerColor is a background", () => {
    const src = "Card(\n    colors = CardDefaults.cardColors(containerColor = Color(0xFF3B82F6)),\n)\n";
    expect(pick(one(src))).toEqual({
      rule: "raw-color", ...at(src, "Color(0x"), kind: "color", text: "Color(0xFF3B82F6)", violation: true, value: "#3b82f6", context: "background",
    });
  });

  test("an L suffix, digit separators and an alpha other than FF", () => {
    expect(pick(one("val a = Color(0xFF3B82F6L)"))).toMatchObject({ text: "Color(0xFF3B82F6L)", value: "#3b82f6" });
    expect(pick(one("val a = Color(0xFF_3B_82_F6)"))).toMatchObject({ value: "#3b82f6" });
    expect(pick(one("val a = Color(0x803B82F6)"))).toMatchObject({ value: "#3b82f680" });
  });

  test("six digits are read as Compose reads them: an Int with no alpha", () => {
    expect(pick(one("val a = Color(0x3B82F6)"))).toMatchObject({ value: "#3b82f600" });
  });

  test("color inside Text( and TextStyle( is text; tint and contentColor are text", () => {
    expect(one('Text("a", color = Color(0xFF111111))').context).toBe("text");
    expect(one("val s = TextStyle(color = Color(0xFF111111))").context).toBe("text");
    expect(one("Icon(Icons.Default.Add, null, tint = Color.Red)").context).toBe("text");
    expect(one("ButtonDefaults.buttonColors(contentColor = Color.White)").context).toBe("text");
  });

  test("background( takes a colour positionally or by name; Surface and Card colour is a background", () => {
    const src = "Box(Modifier.background(Color.White))";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color.White"), text: "Color.White", value: "#ffffff", context: "background" });
    expect(one("Box(Modifier.background(color = Color(0xFF111111)))").context).toBe("background");
    expect(one("Surface(color = Color(0xFF111111)) {}").context).toBe("background");
    expect(one("Card(colors = CardDefaults.cardColors(containerColor = Color.Black))").context).toBe("background");
  });

  test("BorderStroke( and border( are borders", () => {
    expect(one("BorderStroke(1.dp, Color(0xFFCCCCCC))").context).toBe("border");
    expect(one("Modifier.border(1.dp, Color.Red, shape)").context).toBe("border");
    expect(one("BorderStroke(width = 1.dp, color = Color.Gray)").context).toBe("border");
  });

  test("a colour anywhere else is other", () => {
    expect(one("drawRect(Color(0xFF111111))").context).toBe("other");
    expect(one("val brush = Color(0xFF111111).copy(alpha = 0.5f)").context).toBe("other");
  });

  test("Color(red, green, blue) with literal numbers: ints are 0–255, floats 0–1, alpha last", () => {
    expect(pick(one("val c = Color(59, 130, 246)"))).toMatchObject({ text: "Color(59, 130, 246)", value: "#3b82f6" });
    expect(one("val c = Color(red = 59, green = 130, blue = 246)").value).toBe("#3b82f6");
    expect(one("val c = Color(red = 0.5f, green = 0f, blue = 1f, alpha = 0.5f)").value).toBe("#8000ff80");
    expect(one("val c = Color(59, 130, 246, 128)").value).toBe("#3b82f680");
  });

  test("Color(r, g, b) from variables is not a literal colour", () => {
    expect(scan("val c = Color(r, g, b)")).toEqual([]);
    expect(scan("val c = Color(red = base, green = 0.2f, blue = 0.3f)")).toEqual([]);
  });

  test("Color constants other than Transparent and Unspecified", () => {
    const src = "Text(\"a\", color = Color.Red)";
    expect(pick(one(src))).toMatchObject({ ...at(src, "Color.Red"), text: "Color.Red", value: "#ff0000", context: "text" });
    expect(one("val c = Color.Gray").value).toBe("#888888");
    expect(one("val c = Color.Magenta").value).toBe("#ff00ff");
    expect(scan("val c = Color.Transparent\nval d = Color.Unspecified")).toEqual([]);
  });

  test("Color.hsl and other members are not constants; android's Color.RED is another class", () => {
    expect(scan("val c = Color.hsl(210f, 0.5f, 0.5f)")).toEqual([]);
    expect(scan("val c = Color.RED")).toEqual([]);
  });

  test("android.graphics.Color.parseColor reads the colour from the string", () => {
    const src = 'val c = android.graphics.Color.parseColor("#3B82F6")';
    expect(pick(one(src))).toMatchObject({ ...at(src, "android."), text: 'android.graphics.Color.parseColor("#3B82F6")', value: "#3b82f6" });
    expect(one('val c = Color.parseColor("#80FF0000")').value).toBe("#ff000080");
    expect(scan('val c = Color.parseColor(hex)')).toEqual([]);
  });

  test("Review Focus 2: a colour in a string, raw string, nested comment or KDoc is not a finding", () => {
    expect(scan('val s = "Color(0xFF3B82F6)"')).toEqual([]);
    expect(scan('val s = """\n  Color(0xFF3B82F6) and Color.Red\n"""')).toEqual([]);
    expect(scan("/* a /* nested */ Color(0xFF3B82F6) */\nval x = 1")).toEqual([]);
    expect(scan("/**\n * Use Color(0xFF3B82F6) or Color.Red.\n */\nfun f() {}")).toEqual([]);
    expect(scan("// Color.Red\nval x = 1")).toEqual([]);
  });

  test("Review Focus 2: the code inside a ${'$'} template is read; the text around it isn't", () => {
    expect(scan('val s = "${\'$\'}Color.Red"')).toEqual([]);
    expect(scan('val s = "colour: ${Color.Red}"')).toHaveLength(1);
  });

  test("an import of a colour is not a use of one", () => {
    expect(scan("import androidx.compose.ui.graphics.Color.Companion.Red\nval x = 1")).toEqual([]);
  });

  test("positions are the original file's, after a multi-byte comment and a raw string", () => {
    const src = '// héllo — \nval raw = """\n  x\n"""\nval c = Color.White\n';
    expect(pick(one(src))).toMatchObject({ line: 5, column: 9 });
  });
});

describe("off-scale in Kotlin", () => {
  test("padding(16.dp) is on the scale and allowed; padding(13.dp) is not", () => {
    const on = one("Modifier.padding(16.dp)");
    expect(pick(on)).toMatchObject({ rule: "off-scale", kind: "space", violation: false, value: "16px", text: "16.dp" });
    const src = "Modifier.padding(13.dp)";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, "13.dp"), kind: "space", text: "13.dp", violation: true, value: "13px" });
  });

  test("0 is always allowed", () => {
    expect(one("Modifier.padding(0.dp)").violation).toBe(false);
  });

  test("named padding arguments are each read, at the argument", () => {
    const src = "Modifier.padding(horizontal = 16.dp, vertical = 13.dp)";
    const hits = scan(src);
    expect(hits.map(pick)).toEqual([
      { rule: "off-scale", ...at(src, "horizontal"), kind: "space", text: "horizontal = 16.dp", violation: false, value: "16px" },
      { rule: "off-scale", ...at(src, "vertical"), kind: "space", text: "vertical = 13.dp", violation: true, value: "13px" },
    ]);
  });

  test("Arrangement.spacedBy, Spacer height and width, and PaddingValues", () => {
    expect(pick(one("Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {}"))).toMatchObject({ kind: "space", value: "10px", violation: true });
    expect(pick(one("Spacer(Modifier.height(10.dp))"))).toMatchObject({ kind: "space", value: "10px", violation: true });
    expect(pick(one("Spacer(modifier = Modifier.width(10.dp))"))).toMatchObject({ kind: "space", value: "10px", violation: true });
    expect(pick(one("LazyColumn(contentPadding = PaddingValues(10.dp)) {}"))).toMatchObject({ kind: "space", value: "10px", violation: true });
    expect(pick(one("LazyColumn(contentPadding = PaddingValues(horizontal = 10.dp)) {}"))).toMatchObject({ kind: "space", value: "10px", violation: true });
  });

  test("a float dp, 8.5.dp, is 8.5px", () => {
    expect(one("Modifier.padding(8.5.dp)").value).toBe("8.5px");
  });

  test("Review Focus 2: sizes of things that aren't spacing are not read", () => {
    expect(scan("Icon(Icons.Default.Add, null, Modifier.size(40.dp))")).toEqual([]);
    expect(scan("Spacer(Modifier.size(16.dp))")).toEqual([]);
    expect(scan("Divider(Modifier.width(1.dp))")).toEqual([]);
    expect(scan("Box(Modifier.height(13.dp))")).toEqual([]);
    expect(scan("Modifier.padding(MotifSpace.s4)")).toEqual([]);
    expect(scan("Modifier.padding(gap)")).toEqual([]);
    expect(scan("Modifier.contentPadding(13.dp)")).toEqual([]);
  });

  test("RoundedCornerShape and CornerSize read radius", () => {
    const src = "Surface(shape = RoundedCornerShape(10.dp)) {}";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, "10.dp"), kind: "radius", text: "10.dp", violation: true, value: "10px" });
    expect(pick(one("val s = RoundedCornerShape(8.dp)"))).toMatchObject({ kind: "radius", violation: false });
    expect(scan("val s = RoundedCornerShape(topStart = 8.dp, topEnd = 10.dp)").filter((h) => h.violation).map(pick)).toMatchObject([{ value: "10px", text: "topEnd = 10.dp" }]);
    expect(pick(one("val s = CornerSize(10.dp)"))).toMatchObject({ kind: "radius", violation: true });
    expect(scan("val s = RoundedCornerShape(50)")).toEqual([]);
    expect(scan("val s = RoundedCornerShape(percent = 50)")).toEqual([]);
  });

  test("fontSize = N.sp reads font-size", () => {
    const src = "Text(\"a\", fontSize = 15.sp)";
    expect(pick(one(src))).toEqual({ rule: "off-scale", ...at(src, "fontSize"), kind: "font-size", text: "fontSize = 15.sp", violation: true, value: "15px" });
    expect(pick(one("TextStyle(fontSize = 16.sp)"))).toMatchObject({ violation: false, value: "16px" });
    expect(pick(one("TextStyle(fontSize = 14f.sp)"))).toMatchObject({ violation: false, value: "14px" });
  });

  test("without a scale, every size is seen and none is judged", () => {
    const hits = scanKotlin(file("Modifier.padding(13.dp)\nTextStyle(fontSize = 15.sp)\ntween(250)"), null);
    expect(hits.map((h) => [h.kind, h.violation])).toEqual([["space", false], ["font-size", false], ["duration", false]]);
  });
});

describe("raw-font in Kotlin", () => {
  test("FontFamily(Font(…)) built in a composable is a hard-coded font", () => {
    const src = "@Composable\nfun Title() {\n    val family = FontFamily(Font(R.font.inter_regular))\n    Text(\"a\", fontFamily = family)\n}\n";
    expect(pick(one(src))).toEqual({
      rule: "raw-font", ...at(src, "FontFamily("), kind: "font-family", text: "FontFamily(Font(R.font.inter_regular))", violation: true, value: "inter_regular",
    });
  });

  test("the same family defined at the top of a file is the app's own type setup, not read", () => {
    expect(scan("val Inter = FontFamily(Font(R.font.inter_regular))\n")).toEqual([]);
  });

  test("a composable with an expression body is a composable", () => {
    const src = "@Composable fun Title() = Text(\"a\", fontFamily = FontFamily(Font(R.font.x)))\n\nval Other = FontFamily(Font(R.font.y))\n";
    expect(scan(src).map((h) => h.value)).toEqual(["x"]);
  });

  test("a lambda typed @Composable in a parameter doesn't make the next function one", () => {
    const src = "fun wrap(content: @Composable () -> Unit) {}\n\nfun plain() {\n    val f = FontFamily(Font(R.font.x))\n}\n";
    expect(scan(src)).toEqual([]);
  });

  test("FontFamily.Serif, Monospace and Cursive given as fontFamily =", () => {
    const src = "Text(\"a\", fontFamily = FontFamily.Monospace)";
    expect(pick(one(src))).toEqual({
      rule: "raw-font", ...at(src, "fontFamily"), kind: "font-family", text: "fontFamily = FontFamily.Monospace", violation: true, value: "monospace",
    });
    expect(one("TextStyle(fontFamily = FontFamily.Serif)").value).toBe("serif");
    expect(one("TextStyle(fontFamily = FontFamily.Cursive)").value).toBe("cursive");
    expect(scan("TextStyle(fontFamily = FontFamily.Default)")).toEqual([]);
    expect(scan("TextStyle(fontFamily = FontFamily.SansSerif)")).toEqual([]);
    expect(scan("TextStyle(fontFamily = MotifType.body)")).toEqual([]);
  });

  test("GoogleFont(\"…\") names its family", () => {
    const src = 'val g = GoogleFont("Roboto Mono")';
    expect(pick(one(src))).toEqual({
      rule: "raw-font", ...at(src, "GoogleFont("), kind: "font-family", text: 'GoogleFont("Roboto Mono")', violation: true, value: "Roboto Mono",
    });
    expect(scan("val p = GoogleFont.Provider(authority, pkg, certs)")).toEqual([]);
  });

  test("a GoogleFont inside a FontFamily this rule already reports is one hit", () => {
    const src = '@Composable\nfun T() {\n    val f = FontFamily(Font(googleFont = GoogleFont("Inter"), fontProvider = provider))\n}\n';
    expect(scan(src)).toHaveLength(1);
  });
});

describe("raw-motion in Kotlin", () => {
  test("tween(N), tween(durationMillis = N), snap(N), keyframes { durationMillis = N }", () => {
    const src = "val a = tween<Float>(250)";
    expect(pick(one(src))).toEqual({
      rule: "raw-motion", ...at(src, "tween"), kind: "duration", text: "tween<Float>(250)", violation: true, value: "250ms",
    });
    expect(pick(one("val a = tween(durationMillis = 250, easing = LinearEasing)"))).toMatchObject({ kind: "duration", value: "250ms", violation: true });
    expect(pick(one("val a = snap(250)"))).toMatchObject({ kind: "duration", value: "250ms" });
    const k = "val a = keyframes {\n    durationMillis = 250\n    0f at 0\n}";
    expect(pick(one(k))).toMatchObject({ ...at(k, "durationMillis"), kind: "duration", text: "durationMillis = 250", value: "250ms", violation: true });
  });

  test("a duration on the guide's scale (and 0) is seen but allowed", () => {
    expect(pick(one("val a = tween(200)"))).toMatchObject({ violation: false, value: "200ms" });
    expect(pick(one("val a = tween(0)"))).toMatchObject({ violation: false, value: "0ms" });
    expect(pick(one("val a = keyframes { durationMillis = 320 }"))).toMatchObject({ violation: false });
  });

  test("a tween from the theme or a computed value isn't a literal", () => {
    expect(scan("val a = tween(MotifDurations.fast)")).toEqual([]);
    expect(scan("val a = tween(durationMillis = MotifMotion.duration(250))")).toEqual([]);
    expect(scan("val a = tween(easing = MotifEasing.standard)")).toEqual([]);
  });

  test("Review Focus 2: delay(300) in a coroutine is not motion", () => {
    expect(scan("LaunchedEffect(Unit) {\n    delay(300)\n}")).toEqual([]);
    expect(scan("Handler(Looper.getMainLooper()).postDelayed(run, 300)")).toEqual([]);
  });

  test("Review Focus 2: FastOutSlowInEasing in a tween is a hard-coded easing", () => {
    const src = "val a = tween(MotifDurations.fast, easing = FastOutSlowInEasing)";
    expect(pick(one(src))).toEqual({
      rule: "raw-motion", ...at(src, "FastOutSlowInEasing"), kind: "easing", text: "FastOutSlowInEasing", violation: true, value: "FastOutSlowInEasing",
    });
  });

  test("the other easing constants, and cubic-bezier literals", () => {
    for (const name of ["LinearOutSlowInEasing", "FastOutLinearInEasing", "EaseIn", "EaseOutCubic", "EaseInOutBack", "Ease"]) {
      expect(one(`val a = tween(MotifDurations.fast, easing = ${name})`).value).toBe(name);
    }
    expect(scan("val a = tween(MotifDurations.fast, easing = LinearEasing)")).toEqual([]);
    expect(scan("val a = tween(MotifDurations.fast, easing = EaseOfUse)")).toEqual([]);
    const src = "val e = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)";
    expect(pick(one(src))).toMatchObject({ ...at(src, "CubicBezierEasing"), kind: "easing", text: "CubicBezierEasing(0.4f, 0f, 0.2f, 1f)", value: "cubic-bezier(0.4, 0, 0.2, 1)" });
    expect(one("val e = CubicBezierEasing(a, b, c, d)").value).toBe("CubicBezierEasing(a, b, c, d)");
  });

  test("spring( with literal damping or stiffness, or Spring constants", () => {
    const src = "val s = spring<Float>(dampingRatio = 0.5f, stiffness = 300f)";
    expect(pick(one(src))).toEqual({
      rule: "raw-motion", ...at(src, "spring"), kind: "spring", text: "spring<Float>(dampingRatio = 0.5f, stiffness = 300f)",
      violation: true, value: "spring<Float>(dampingRatio = 0.5f, stiffness = 300f)",
    });
    expect(one("val s = spring(dampingRatio = Spring.DampingRatioMediumBouncy)").kind).toBe("spring");
    expect(one("val s = spring(stiffness = Spring.StiffnessLow)").kind).toBe("spring");
    expect(one("val s = spring(0.5f, 300f)").kind).toBe("spring");
    expect(scan("val s = spring<Float>()")).toEqual([]);
    expect(scan("val s = MotifSprings.snappy<Float>()")).toEqual([]);
    expect(scan("val s = spring(dampingRatio = ratio)")).toEqual([]);
  });
});

describe("reduced-motion in Kotlin", () => {
  const ANIM = "@Composable\nfun Pulse(on: Boolean) {\n    val a = animateFloatAsState(if (on) 1f else 0f)\n}\n";
  const files = (...texts: string[]) => texts.map((t, i) => file(t, `app/src/main/java/com/example/F${i}.kt`));

  test("an app that animates and never reads the setting gets one hit at the first animation", () => {
    const hits = composeReducedMotion(files(ANIM, "fun x() {}\n"));
    expect(hits).toHaveLength(1);
    expect(pick(hits[0]!)).toMatchObject({ rule: "reduced-motion", ...at(ANIM, "animateFloatAsState"), violation: true, text: "animation" });
    expect(hits[0]!.fix).toBe("Use MotifMotion.duration(…) for durations (it is zero when Remove animations is on), or check MotifMotion.reduced().");
  });

  test.each([
    "AnimatedVisibility(visible) {}",
    "AnimatedContent(targetState = s) {}",
    "Crossfade(targetState = s) {}",
    "val t = rememberInfiniteTransition()",
    "val a = remember { Animatable(0f) }",
    "val t = updateTransition(s)",
    "val c = animateColorAsState(Color.Unspecified)",
    "val c = animateDpAsState(targetValue = x)",
  ])("%s counts as animating", (line) => {
    expect(composeReducedMotion(files(`fun f() {\n    ${line}\n}\n`))).toHaveLength(1);
  });

  test("MotifMotion. anywhere in the app's code, or ANIMATOR_DURATION_SCALE, is enough", () => {
    expect(composeReducedMotion(files(ANIM, "val d = MotifMotion.duration(200)\n"))).toEqual([]);
    expect(composeReducedMotion(files(ANIM, "val s = Settings.Global.ANIMATOR_DURATION_SCALE\n"))).toEqual([]);
  });

  test("a mention in a comment or a string doesn't count either way", () => {
    expect(composeReducedMotion(files(ANIM, "// MotifMotion.reduced()\nval s = \"ANIMATOR_DURATION_SCALE\"\n"))).toHaveLength(1);
    expect(composeReducedMotion(files("// animateFloatAsState(\nval s = \"Crossfade(\"\n"))).toEqual([]);
  });

  test("an app that doesn't animate has no hit", () => {
    expect(composeReducedMotion(files("fun x() {}\n"))).toEqual([]);
  });
});

describe("Compose fixes and roles", () => {
  const fix = (src: string) => one(src).fix;

  test("every rule speaks Kotlin", () => {
    expect(fix("val c = Color(0xFF3B82F6)")).toBe("Use MotifTheme.colors.<role>.");
    expect(fix("Modifier.padding(13.dp)")).toBe("Use MotifSpace.s<N>.");
    expect(fix("RoundedCornerShape(10.dp)")).toBe("Use MotifRadius.<role>.");
    expect(fix("TextStyle(fontSize = 15.sp)")).toBe("Use MotifType.<role>.");
    expect(fix("val g = GoogleFont(\"Inter\")")).toBe("Use MotifType.<role>.");
    expect(fix("val a = tween(250)")).toBe("Use MotifDurations.<role> (or MotifMotion.duration(…)).");
    expect(fix("val a = tween(MotifDurations.fast, easing = EaseIn)")).toBe("Use MotifEasing.<role>.");
    expect(fix("val s = spring(0.5f, 300f)")).toBe("Use MotifSprings.<role>().");
  });

  test("role names the generated member", () => {
    expect(composeRole("color", "text-secondary")).toBe("MotifTheme.colors.textSecondary");
    expect(composeRole("space", "4")).toBe("MotifSpace.s4");
    expect(composeRole("radius", "md")).toBe("MotifRadius.md");
    expect(composeRole("font-size", "body")).toBe("MotifType.body");
    expect(composeRole("duration", "fast")).toBe("MotifDurations.fast");
    expect(composeRole("easing", "standard")).toBe("MotifEasing.standard");
    expect(composeRole("spring", "snappy")).toBe("MotifSprings.snappy()");
  });

  test("a closest-role suggestion is written in Kotlin", () => {
    const hit = one("val c = Color(0xFFFFFFFF)");
    expect(suggestRole(hit, theme, { role: composeRole })).toMatch(/^MotifTheme\.colors\./);
  });
});

describe("the app's own palette in Kotlin", () => {
  const COLOR_KT = `package com.example.ui.theme

import androidx.compose.ui.graphics.Color

val Purple80 = Color(0xFFD0BCFF)
val PurpleGrey80 = Color(0xFFCCC2DC)
val Pink80 = Color(0xFFEFB8C8)

val Purple40 = Color(0xFF6650a4)
`;
  const palette = (text: string, path = "app/src/main/java/com/example/ui/theme/Color.kt") => {
    const f = file(text, path);
    return composePaletteFile(f, scanKotlin(f, scale).filter((h) => h.violation));
  };

  test("the template's Color.kt of top-level vals is a palette", () => {
    expect(palette(COLOR_KT)).toBe(true);
  });

  test("a lightColorScheme( with two or more typed colours is a palette; a seed alone isn't", () => {
    expect(palette("val L = lightColorScheme(\n    primary = Color(0xFF111111),\n    secondary = Color(0xFF222222),\n)\n")).toBe(true);
    expect(palette("val D = darkColorScheme(primary = Color(0xFF111111))\n")).toBe(false);
  });

  test("an object of colour constants is a palette", () => {
    expect(palette("object Brand {\n    val ink = Color(0xFF111111)\n    val paper = Color.White\n}\n")).toBe(true);
  });

  test("colours styling a composable aren't a palette", () => {
    expect(palette("@Composable\nfun Banner() {\n    val bg = Color(0xFF111111)\n    Box(Modifier.background(bg)) {}\n}\n")).toBe(false);
    expect(palette("fun f() {\n    val bg = Color(0xFF111111)\n}\n")).toBe(false);
  });

  test("the app's entry point is never a palette", () => {
    expect(palette("val A = Color(0xFF111111)\nval B = Color(0xFF222222)\nclass Main : ComponentActivity() {\n    fun go() { setContent { App() } }\n}\n")).toBe(false);
  });

  test("a file with no typed colours isn't", () => {
    expect(palette("val x = 1\n")).toBe(false);
  });
});
