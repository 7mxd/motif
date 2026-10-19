import { describe, expect, test } from "bun:test";
import { exceptionFor } from "../src/check/exceptions";
import { maskComments, maskStrings } from "../src/check/mask";

const same = (a: string, b: string) => {
  expect(a.length).toBe(b.length);
  expect([...a].map((c) => (c === "\n" || c === "\r" ? c : "x")).join("")).toBe(
    [...b].map((c) => (c === "\n" || c === "\r" ? c : "x")).join(""),
  );
};

describe("maskComments (dart)", () => {
  test("blanks // and /// comments, keeps code and length", () => {
    const src = "final a = 1; // 0xFF red\n/// doc 0xAA\nfinal b = 2;\r\n";
    const out = maskComments(src, "dart");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0xAA");
    expect(out).toContain("final a = 1;");
    expect(out).toContain("final b = 2;");
  });
  test("nested block comments", () => {
    const src = "a /* x /* 0xFF */ still 0xEE */ b\nc";
    const out = maskComments(src, "dart");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0xEE");
    expect(out.startsWith("a ")).toBe(true);
    expect(out).toContain(" b\nc");
  });
  test("comment markers inside strings are not comments", () => {
    for (const s of [`'http://x // y'`, `"a /* b */"`, `'''//\n/*'''`, `"""//"""`, `r'//\\'`, `r"/*"`]) {
      expect(maskComments(`${s} // gone`, "dart").startsWith(s)).toBe(true);
    }
    expect(maskComments(`'it\\'s // 0xFF' // c`, "dart")).toContain("it\\'s // 0xFF");
  });
  test("comments inside an interpolation are comments", () => {
    const src = `'a \${x /* 0xFF */} b // not'`;
    const out = maskComments(src, "dart");
    expect(out).not.toContain("0xFF");
    expect(out).toContain("b // not");
  });
  test("unterminated block comment and string do not hang", () => {
    expect(maskComments("a /* never closed 0xFF", "dart")).toBe("a " + " ".repeat(20));
    const s = `x = 'open // c\ny // gone`;
    const out = maskComments(s, "dart");
    same(out, s);
    expect(out).toContain("y ");
    expect(out).not.toContain("gone");
    expect(() => maskComments(`'''never closed ${"${"}`, "dart")).not.toThrow();
  });
});

describe("maskStrings (dart)", () => {
  const blankedBetween = (src: string, inner: string) => {
    const out = maskStrings(src, "dart");
    same(out, src);
    expect(out).not.toContain(inner);
    return out;
  };
  test("each string form is blanked, quotes kept", () => {
    expect(blankedBetween(`'0xFF'`, "0xFF")).toBe(`'    '`);
    expect(blankedBetween(`"0xFF"`, "0xFF")).toBe(`"    "`);
    expect(blankedBetween(`'''0xFF\n0xEE'''`, "0xFF")).toBe(`'''    \n    '''`);
    expect(blankedBetween(`"""0xFF\r\n0xEE"""`, "0xEE")).toBe(`"""    \r\n    """`);
    expect(blankedBetween(`r'0xFF'`, "0xFF")).toBe(`r'    '`);
    expect(blankedBetween(`r"0xFF"`, "0xFF")).toBe(`r"    "`);
    expect(blankedBetween(`r'''0xFF'''`, "0xFF")).toBe(`r'''    '''`);
  });
  test("escaped quote does not end the string", () => {
    const src = `x('it\\'s 0xFF'); y(0xAA)`;
    const out = blankedBetween(src, "0xFF");
    expect(out).toContain("y(0xAA)");
  });
  test("raw strings have no escapes and no interpolation", () => {
    const src = `r'a\\' + Colors.red`;
    const out = maskStrings(src, "dart");
    expect(out).toContain("Colors.red");
    const raw = maskStrings(`r'\${Colors.red}'`, "dart");
    expect(raw).not.toContain("Colors");
  });
  test("${…} interpolation stays visible", () => {
    const out = maskStrings(`'x \${Colors.red} y'`, "dart");
    expect(out).toContain("Colors.red");
    expect(out).not.toContain("x ");
    expect(maskStrings(`'\${Colors.red}'`, "dart")).toContain("Colors.red");
  });
  test("nested braces and nested strings inside interpolation", () => {
    const src = `'a \${ {1: 'b \${Colors.blue} c'}[1] } d 0xFF' + 0xAA`;
    const out = maskStrings(src, "dart");
    same(out, src);
    expect(out).toContain("Colors.blue");
    expect(out).toContain("[1]");
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("a ");
    expect(out).toContain("+ 0xAA");
  });
  test("$identifier interpolation is masked", () => {
    expect(maskStrings(`'hi $name'`, "dart")).toBe(`'        '`);
  });
  test("quotes inside comments do not open strings", () => {
    const src = `// it's\nfinal c = 0xFF;`;
    expect(maskStrings(src, "dart")).toBe(src);
    expect(maskStrings(`/* ' */ 0xFF`, "dart")).toBe(`/* ' */ 0xFF`);
  });
  test("an identifier ending in r is not a raw prefix", () => {
    expect(maskStrings(`bar'a\\'b'`, "dart")).toBe(`bar'    '`);
  });
  test("unterminated strings stop; single-line ones at the line end", () => {
    const src = `a = 'open 0xFF\nb = 0xAA`;
    const out = maskStrings(src, "dart");
    same(out, src);
    expect(out).toContain("b = 0xAA");
    expect(out).not.toContain("0xFF");
    expect(() => maskStrings(`'''never \${ {`, "dart")).not.toThrow();
    expect(() => maskStrings(`"a \${`, "dart")).not.toThrow();
    same(maskStrings("'''abc", "dart"), "'''abc");
  });
  test("other languages are returned unchanged", () => {
    expect(maskStrings(`a = "0xFF"`, "script")).toBe(`a = "0xFF"`);
    expect(maskStrings(`a { color: "red" }`, "css")).toBe(`a { color: "red" }`);
  });
});

describe("motif-ok in Dart", () => {
  test("a comment-only line above and a trailing comment", () => {
    const lines = ["// motif-ok: brand partner", "const c = Color(0xFF123456);"];
    expect(exceptionFor(lines, 2)).toEqual({ reason: "brand partner" });
    expect(exceptionFor(["const c = Color(0xFF123456); // motif-ok: legacy"], 1)).toEqual({ reason: "legacy" });
    expect(exceptionFor(["/// motif-ok", "const c = 1;"], 2)).toEqual({ missingReason: true });
    expect(exceptionFor(["final a = 1;", "const c = 1;"], 2)).toBeNull();
  });
});
