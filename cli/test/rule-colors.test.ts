import { describe, expect, test } from "bun:test";
import type { SourceFile } from "../src/check/files";
import { expandHtml } from "../src/check/html";
import { colorContext, scanColors } from "../src/check/rules/colors";

const file = (path: string, text: string): SourceFile => ({
  path, abs: path, text, lang: path.endsWith(".css") ? "css" : "script",
});
const values = (path: string, text: string) => scanColors(file(path, text)).map((h) => [h.value, h.context]);

describe("raw-color in CSS", () => {
  test("hex colour with its line and column", () => {
    const [hit] = scanColors(file("a.css", ".btn {\n  color: #3B82F6;\n}"));
    expect(hit).toMatchObject({ rule: "raw-color", value: "#3B82F6", context: "text", line: 2, column: 10, violation: true, kind: "color" });
  });
  test("id selectors are not colours", () => {
    expect(values("a.css", "#abc { padding: 0 }\n#fade:hover { opacity: 1 }")).toEqual([]);
  });
  test("colour functions and named colours, with context", () => {
    expect(values("a.css", "a { background: rgb(0 0 0 / 0.5); border: 1px solid red; }")).toEqual([
      ["rgb(0 0 0 / 0.5)", "background"],
      ["red", "border"],
    ]);
  });
  test("keywords and Motif variables are fine", () => {
    expect(values("a.css", "a { color: transparent; fill: currentColor; color: var(--motif-color-text-primary); }")).toEqual([]);
  });
  test("custom properties holding raw colours are flagged; Motif's own are not", () => {
    expect(values("a.css", ":root { --brand: #ff0000; --motif-color-x: #000; }")).toEqual([["#ff0000", "other"]]);
  });
  test("Windows line endings keep positions right", () => {
    const [hit] = scanColors(file("a.css", "a {\r\n  color: #fff;\r\n}"));
    expect([hit!.line, hit!.column]).toEqual([2, 10]);
  });
});

describe("raw-color in scripts", () => {
  test("style objects: hex and named colours", () => {
    expect(values("a.tsx", '<p style={{ color: "#fff", backgroundColor: "white" }} />')).toEqual([
      ["#fff", "text"],
      ["white", "background"],
    ]);
  });
  test("colour functions in strings", () => {
    expect(values("a.tsx", 'const shadow = "0 1px 2px rgba(0, 0, 0, 0.1)";')).toEqual([["rgba(0, 0, 0, 0.1)", "other"]]);
  });
  test("Tailwind arbitrary values are left to tailwind-arbitrary", () => {
    expect(values("a.tsx", '<p className="bg-[#fff] text-[rgb(1,2,3)]" />')).toEqual([]);
  });
  test("private class members are not colours", () => {
    expect(values("a.ts", "class A {\n  #add() {}\n  #abc = 1;\n  run() { this.#add(); }\n}")).toEqual([]);
  });
  test("a plain string constant is still a raw colour", () => {
    expect(values("a.ts", 'export const brand = "#3b82f6";')).toEqual([["#3b82f6", "other"]]);
  });
});

describe("colorContext", () => {
  test.each([
    ["color", "text"], ["fill", "text"], ["background-color", "background"], ["backgroundColor", "background"],
    ["border-top-color", "border"], ["outline", "border"], ["box-shadow", "other"],
  ])("%s → %s", (prop, ctx) => {
    expect(colorContext(prop)).toBe(ctx as any);
  });
});

describe("false positives in ordinary code", () => {
  test("issue numbers and UI text are not colours", () => {
    expect(values("a.tsx", '// after #1234 (see #456)\nconst label = "Room #101";\nconst t = <p>Invoice #1001</p>;')).toEqual([]);
  });
  test("colours inside comments are not flagged", () => {
    expect(values("a.css", "/* brand: #ff0000 */\n.a { color: var(--motif-color-text-primary); }")).toEqual([]);
    expect(values("a.tsx", '/* color: "#fff" */\nexport const A = 1;')).toEqual([]);
  });
  test("a colour after // inside a string is still checked", () => {
    expect(values("a.ts", 'const u = "https://x.com"; const c = "#3b82f6";')).toEqual([["#3b82f6", "other"]]);
  });
  test("the browser theme colour meta tag can't use variables, so it isn't flagged", () => {
    expect(values("index.html", '<meta name="theme-color" content="#0A1733" />')).toEqual([]);
  });
});

describe("colour context from CSS variable names", () => {
  test("names like --background, --foreground and --border say how a colour is used", () => {
    expect(values("a.css", ":root { --background: #ffffff; --card-foreground: #0a0a0a; --border: #e5e5e5; --brand: #7eebc1; }")).toEqual([
      ["#ffffff", "background"], ["#0a0a0a", "text"], ["#e5e5e5", "border"], ["#7eebc1", "other"],
    ]);
  });
});

describe("raw-color in scripts: from the backlog", () => {
  test("a colour after a space inside a CSS value in a string is found; prose like Room #101 isn't", () => {
    expect(values("a.tsx", 'const s = { boxShadow: "0 1px 2px #cccccc", border: "1px solid #333" };\nconst t = "Room #101 is free";')).toEqual([
      ["#cccccc", "other"],
      ["#333", "border"],
    ]);
  });

  test("prose with a number and a #1234 isn't a CSS value, in a string or between attributes (deferred review)", () => {
    expect(values("a.tsx", 'const t = "Faster by 30% #1234";')).toEqual([]);
    expect(values("a.html", '<span class="w-2">Faster by 30% #1234 <b class="x">new</b></span>')).toEqual([]);
  });

  test("a spaced colour still counts in a value with its property, or after a pair of strings on its line (deferred review)", () => {
    expect(values("a.js", 'el.style.cssText = "color: red; border: 1px solid #333";\nconst a = t("x"), b = "0 0 0 2px #fff";')).toEqual([
      ["#333", "other"],
      ["#fff", "other"],
    ]);
  });

  test("colours set as styles from a script say how they're used", () => {
    expect(values("a.js", 'el.style.background = "#abcdef";\nel.style.setProperty("--card-bg", "#123456");\nctx.fillStyle = "#654321";\nctx.strokeStyle = "#111111";')).toEqual([
      ["#abcdef", "background"],
      ["#123456", "background"],
      ["#654321", "background"],
      ["#111111", "border"],
    ]);
  });
});

describe("the review of batch C2", () => {
  test("light-dark(): the first colour is light, the second dark", () => {
    const hits = scanColors(file("a.css", ".a { color: light-dark(#111111, #eeeeee); }"));
    expect(hits.map((h) => [h.value, h.scheme ?? "light"])).toEqual([["#111111", "light"], ["#eeeeee", "dark"]]);
  });

  test("the page is html, body or :root on its own, and only their background", () => {
    const pages = (css: string) => scanColors(file("a.css", css)).filter((h) => h.page).map((h) => h.value);
    expect(pages(":root { --card-bg: #ffffff; } body { background: #f4f4f5; }")).toEqual(["#f4f4f5"]);
    expect(pages("body .panel { background: #ffffff; } :root .card { background-color: #eeeeee; }")).toEqual([]);
    expect(pages("html, body { background-color: #fafafa; }")).toEqual(["#fafafa"]);
  });

  test("an inline style after a stylesheet isn't the page's", () => {
    const views = expandHtml([{ path: "a.html", abs: "/a.html", text: '<style>:root{color:#111111}</style><div style="background:#ffffff">x</div>', lang: "markup" }]);
    const css = views.find((v) => v.lang === "css")!;
    expect(scanColors(css).filter((h) => h.page)).toEqual([]);
  });
});
