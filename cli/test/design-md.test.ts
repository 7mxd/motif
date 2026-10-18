import { describe, expect, test } from "bun:test";
import { checkDesignMd } from "../src/contract/design-md";
import { validDesignMd } from "./helpers";

const lf = () => validDesignMd().replace(/\r\n/g, "\n");
const codes = (text: string) => checkDesignMd("DESIGN.md", text).map((f) => `${f.severity}:${f.code}`);

describe("checkDesignMd", () => {
  test("the valid fixture has no findings", () => {
    expect(checkDesignMd("DESIGN.md", lf())).toEqual([]);
  });

  test("Windows line endings are fine", () => {
    expect(checkDesignMd("DESIGN.md", lf().replace(/\n/g, "\r\n"))).toEqual([]);
  });

  test("a byte-order mark is fine", () => {
    expect(checkDesignMd("DESIGN.md", "\uFEFF" + lf())).toEqual([]);
  });

  test("reports a missing section with its name", () => {
    const f = checkDesignMd("DESIGN.md", lf().replace("## 4. Motion", "## 4. Movement"));
    expect(f.map((x) => x.code)).toEqual(["missing-section"]);
    expect(f[0]!.message).toBe('Your design guide is missing the "Motion" section.');
  });

  test("sections out of order are a warning", () => {
    const text = lf().replace("## 1. Brief", "## 1. TEMP").replace("## 2. Direction", "## 2. Brief").replace("## 1. TEMP", "## 1. Direction");
    expect(codes(text)).toEqual(["warning:section-order"]);
  });

  test("accepts headings without numbers and with a curly apostrophe", () => {
    const text = lf().replace("## 9. Do / Don't", "## Do / Don’t").replace("## 1. Brief", "## Brief");
    expect(checkDesignMd("DESIGN.md", text)).toEqual([]);
  });

  test("requires the header", () => {
    expect(codes(lf().replace(/^---[\s\S]*?\n---\n/, ""))).toContain("error:missing-header");
  });

  test("an unclosed header is reported", () => {
    expect(codes("---\nmotifContract: 1\n# Title\n")).toContain("error:missing-header");
  });

  test("refuses a newer format", () => {
    expect(codes(lf().replace("motifContract: 1", "motifContract: 2"))).toEqual(["error:newer-format"]);
  });

  test("requires the version in the header", () => {
    expect(codes(lf().replace("motifContract: 1\n", ""))).toEqual(["error:missing-version"]);
  });

  test("warns about a missing name or date", () => {
    expect(codes(lf().replace("updated: 2026-10-12", "updated: soon"))).toEqual(["warning:bad-header"]);
  });

  test("warns when there is no plain-language summary", () => {
    expect(codes(lf().replace(/Fixture App feels calm[^\n]*\n/, ""))).toEqual(["warning:missing-summary"]);
  });
});

describe("checkDesignMd: from the backlog", () => {
  test('header lines with trailing spaces, and a quoted motifContract "1", are fine', () => {
    const text = lf().replace(/^---$/gm, "---  ").replace(/motifContract: 1/, 'motifContract: "1"');
    expect(checkDesignMd("DESIGN.md", text)).toEqual([]);
  });

  test("a heading inside a code block isn't a section", () => {
    const text = lf().replace("## 4. Motion", "```md\n## 4. Motion\n```");
    expect(codes(text)).toEqual(["error:missing-section"]);
  });

  test("a guide saved as UTF-16 says to save it as UTF-8", () => {
    const utf16 = new TextDecoder("utf-8").decode(new Uint8Array([0xff, 0xfe, ...Buffer.from(lf(), "utf16le")]));
    const f = checkDesignMd("DESIGN.md", utf16);
    expect(f.map((x) => x.code)).toEqual(["not-utf8"]);
    expect(f[0]!.message).toContain("UTF-16");
  });
});
