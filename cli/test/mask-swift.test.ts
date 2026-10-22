import { describe, expect, test } from "bun:test";
import { exceptionFor } from "../src/check/exceptions";
import { maskComments, maskStrings } from "../src/check/mask";

const shape = (s: string) => [...s].map((c) => (c === "\n" || c === "\r" ? c : "x")).join("");
const same = (a: string, b: string) => {
  expect(a.length).toBe(b.length);
  expect(shape(a)).toBe(shape(b));
};
const both = (src: string) => maskStrings(maskComments(src, "swift"), "swift");
const raw = String.raw;

describe("maskComments (swift)", () => {
  test("blanks // and /// comments, keeps code and length", () => {
    const src = "let a = 1 // red 0.2\n/// doc Color(red: 1)\nlet b = 2\r\n";
    const out = maskComments(src, "swift");
    same(out, src);
    expect(out).not.toContain("0.2");
    expect(out).not.toContain("Color(red");
    expect(out).toContain("let a = 1");
    expect(out).toContain("let b = 2");
  });
  test("nested block comments", () => {
    const src = "a /* x /* Color(red: 1) */ still .padding(13) */ b\nc";
    const out = maskComments(src, "swift");
    same(out, src);
    expect(out).not.toContain("Color(red");
    expect(out).not.toContain("padding");
    expect(out).toContain(" b\nc");
  });
  test("// inside strings is not a comment", () => {
    const src = 'let u = "https://x.y/z" // .padding(13)\nlet d = 1';
    const out = maskComments(src, "swift");
    same(out, src);
    expect(out).toContain("https://x.y/z");
    expect(out).not.toContain("padding");
    expect(out).toContain("let d = 1");
  });
  test("comment markers inside an interpolation are comments", () => {
    const src = raw`let s = "a \(x /* 0.5 */) b"`;
    const out = maskComments(src, "swift");
    same(out, src);
    expect(out).not.toContain("0.5");
    expect(out).toContain(raw`a \(x`);
  });
  test("comment markers inside a multi-line string or a raw string are text", () => {
    const src = 'let s = """\n  // not a comment\n  /* nor this */\n  """\nlet r = #"// raw"#\n';
    expect(maskComments(src, "swift")).toBe(src);
  });
  test("an unterminated block comment runs to the end", () => {
    const src = "a /* open\nlet x = 1";
    const out = maskComments(src, "swift");
    same(out, src);
    expect(out.startsWith("a ")).toBe(true);
    expect(out).not.toContain("open");
  });
});

describe("maskStrings (swift)", () => {
  test("blanks string contents, keeps quotes and length", () => {
    const src = 'Color(hex: "#FF0000") // c\nText("Hi there")';
    const out = both(src);
    same(out, src);
    expect(out).toContain('Color(hex: "       ")');
    expect(out).toContain('Text("        ")');
    expect(out).not.toContain("FF0000");
  });
  test("escapes do not end a string", () => {
    const src = raw`let s = "say \"hi\" 0.2" ; Color(red: 1, green: 0, blue: 0)`;
    const out = both(src);
    same(out, src);
    expect(out).not.toContain("hi");
    expect(out).toContain("Color(red: 1, green: 0, blue: 0)");
  });
  test("code inside \\( … ) stays visible, text around it is blanked", () => {
    const src = raw`Text("Total: \(count + 1) items, \(f(a: "x")) done")`;
    const out = both(src);
    same(out, src);
    expect(out).toContain("(count + 1)");
    expect(out).toContain("f(a: ");
    expect(out).not.toContain("Total");
    expect(out).not.toContain("items");
    expect(out).not.toContain("done");
  });
  test("an interpolation holding a colour call is code", () => {
    const src = raw`Text("\(Color(red: 1, green: 0, blue: 0))")`;
    expect(both(src)).toContain("Color(red: 1, green: 0, blue: 0)");
  });
  test("multi-line strings are blanked, line breaks kept, interpolation visible", () => {
    const src = 'let s = """\n  Color(red: 0.2, green: 1)\n' + raw`  \(pad(13))` + '\n  """\nlet n = 1\n';
    const out = both(src);
    same(out, src);
    expect(out).not.toContain("Color(red");
    expect(out).toContain("pad(13)");
    expect(out).toContain("let n = 1");
  });
  test("a lone quote inside a multi-line string does not close it", () => {
    const src = 'let s = """\n  a "quoted" word\n  """\nlet n = 1\n';
    const out = both(src);
    same(out, src);
    expect(out).not.toContain("quoted");
    expect(out).toContain("let n = 1");
  });
  test('raw strings: #"…"# takes quotes and backslashes as text, \\#( ) interpolates', () => {
    const src = raw`let r = #"a "quoted" \(not code) \#(real(1)) end"#` + "\nlet n = 1\n";
    const out = both(src);
    same(out, src);
    expect(out).not.toContain("quoted");
    expect(out).not.toContain("not code");
    expect(out).toContain("real(1)");
    expect(out).not.toContain("end");
    expect(out).toContain("let n = 1");
  });
  test('##"…"## closes only on the matching run of hashes', () => {
    const src = 'let r = ##"abc "# def"## ; let n = 1\n';
    const out = both(src);
    same(out, src);
    expect(out).not.toContain("abc");
    expect(out).not.toContain("def");
    expect(out).toContain("let n = 1");
  });
  test("#if and #available are not raw strings", () => {
    const src = '#if DEBUG\nlet a = "x"\n#endif\nif #available(iOS 17, *) {}\n';
    const out = both(src);
    same(out, src);
    expect(out).toContain("#if DEBUG");
    expect(out).toContain("#available(iOS 17, *)");
  });
  test("an unterminated string ends at the line break", () => {
    const src = 'let a = "oops\nlet b = 2\n';
    const out = both(src);
    same(out, src);
    expect(out).toContain("let b = 2");
  });
  test("a motif-ok comment is found in the original lines", () => {
    expect(exceptionFor(['Text("x") // motif-ok: brand'], 1)).toEqual({ reason: "brand" });
  });
});
