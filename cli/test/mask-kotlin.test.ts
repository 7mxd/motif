import { describe, expect, test } from "bun:test";
import { exceptionFor } from "../src/check/exceptions";
import { maskComments, maskStrings } from "../src/check/mask";

const shape = (s: string) => [...s].map((c) => (c === "\n" || c === "\r" ? c : "x")).join("");
const same = (a: string, b: string) => {
  expect(a.length).toBe(b.length);
  expect(shape(a)).toBe(shape(b));
};
const both = (src: string) => maskStrings(maskComments(src, "kotlin"), "kotlin");

describe("maskComments (kotlin)", () => {
  test("blanks // and KDoc, keeps code and length", () => {
    const src = "val a = 1 // 0xFF\n/** doc 0xAA */\nval b = 2\r\n";
    const out = maskComments(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0xAA");
    expect(out).toContain("val a = 1");
    expect(out).toContain("val b = 2");
  });
  test("nested block comments", () => {
    const src = "a /* x /* 0xFF */ still 0xEE */ b\nc";
    const out = maskComments(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0xEE");
    expect(out).toContain(" b\nc");
  });
  test("// inside strings and char literals is not a comment", () => {
    const src = 'val u = "https://x.y/0xFF"\nval c = \'"\' // 0xEE\nval d = 1';
    const out = maskComments(src, "kotlin");
    same(out, src);
    expect(out).toContain("https://x.y/0xFF");
    expect(out).not.toContain("0xEE");
    expect(out).toContain("val d = 1");
  });
  test("comment markers inside a template expression are comments", () => {
    const src = 'val s = "a ${x /* 0xAB */} b"';
    const out = maskComments(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xAB");
  });
});

describe("maskStrings (kotlin)", () => {
  test("blanks plain strings, keeps quotes", () => {
    const src = 'val a = "0xFF red"\nval b = 1';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).toContain('val a = "');
    expect(out).toContain("val b = 1");
  });
  test("escaped quote does not end the string", () => {
    const src = 'val a = "it\\"s 0xFF"; val b = Color.Red';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).toContain("val b = Color.Red");
  });
  test("${expr} stays code, $name is masked", () => {
    const src = 'val a = "x ${Color.Red} y $name 0xAA"';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).toContain("Color.Red");
    expect(out).not.toContain("name");
    expect(out).not.toContain("0xAA");
  });
  test("template with nested braces and strings", () => {
    const src = 'val a = "p ${f({ "in 0xBB" }) + Color.Blue} q 0xCC"; val z = 1';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).toContain("Color.Blue");
    expect(out).not.toContain("0xBB");
    expect(out).not.toContain("0xCC");
    expect(out).toContain("val z = 1");
  });
  test("raw strings: no escapes, quotes inside, templates, multiple lines", () => {
    const src = 'val a = """he said "hi" and ""ok"" \ 0xFF\n${Color.Red} 0xEE"""\nval b = 1';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0xEE");
    expect(out).toContain("Color.Red");
    expect(out).toContain("val b = 1");
  });
  test("raw string ending with extra quotes ends at the last of the run", () => {
    const src = 'val a = """"a 0xFF""""; val b = Color.Red';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
    expect(out).toContain("val b = Color.Red");
  });
  test("empty string", () => {
    const src = 'val a = ""; val b = "0xFF"';
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).not.toContain("0xFF");
  });
  test("char literals", () => {
    const src = String.raw`val a = '"'; val b = '\''; val c = 'A'; val d = Color.Red; val e = "0xFF"`;
    const out = maskStrings(src, "kotlin");
    same(out, src);
    expect(out).toContain("val d = Color.Red");
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0041");
  });
  test("a comment-looking thing in a string is masked, not a comment", () => {
    const out = both('val a = "/* 0xFF */"; val b = 2 // 0xEE');
    expect(out).not.toContain("0xFF");
    expect(out).not.toContain("0xEE");
    expect(out).toContain("val b = 2");
  });
});

describe("exceptionFor (kotlin)", () => {
  test("// motif-ok: reason above or on a hit", () => {
    const lines = ["// motif-ok: brand partner", "val c = Color(0xFF123456)", "val d = Color(0xFF654321)"];
    expect(exceptionFor(lines, 2)).toEqual({ reason: "brand partner" });
    expect(exceptionFor(["val c = Color(0xFF1) // motif-ok: logo"], 1)).toEqual({ reason: "logo" });
    expect(exceptionFor(lines, 3)).toBeNull();
  });
});
