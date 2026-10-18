import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineAt, loadTokenDocument } from "../src/contract/load";
import { FIXTURES } from "./helpers";

const fixtureText = readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8");

describe("loadTokenDocument", () => {
  test("loads the valid fixture without findings", () => {
    const { doc, findings } = loadTokenDocument("design/tokens.json", fixtureText);
    expect(findings).toEqual([]);
    expect(doc!.tokens.has("color.text-primary")).toBe(true);
    expect(doc!.tokens.has("primitive.color.gray.900")).toBe(true);
    expect(doc!.tokens.has("spring.snappy.bounce")).toBe(true);
  });

  test("inherits $type from the nearest group", () => {
    const { doc } = loadTokenDocument("t.json", fixtureText);
    expect(doc!.tokens.get("space.4")!.type).toBe("dimension");
    expect(doc!.tokens.get("primitive.font.sans")!.type).toBe("fontFamily");
  });

  test("records the 1-based line of each token", () => {
    const text = '{\n  "a": {\n    "$type": "number",\n    "$value": 1\n  }\n}';
    const { doc } = loadTokenDocument("t.json", text);
    expect(doc!.tokens.get("a")!.line).toBe(2);
  });

  test("keeps $extensions on tokens and at the root", () => {
    const { doc } = loadTokenDocument("t.json", fixtureText);
    expect(doc!.tokens.get("color.background")!.extensions).toEqual({
      "dev.motif": { modes: { dark: "{primitive.color.gray.950}" } },
    });
    expect((doc!.rootExtensions as any)["dev.motif"].motifContract).toBe(1);
  });

  test("accepts a UTF-8 byte-order mark (Windows editors add one)", () => {
    const { doc, findings } = loadTokenDocument("t.json", "\uFEFF" + fixtureText);
    expect(findings).toEqual([]);
    expect(doc).not.toBeNull();
  });

  test("reports invalid JSON with its line", () => {
    const { doc, findings } = loadTokenDocument("design/tokens.json", '{\n  "a": {\n    "$value": 1,\n  }\n}');
    expect(doc).toBeNull();
    expect(findings[0]!.code).toBe("invalid-json");
    expect(findings[0]!.line).toBe(4);
  });

  test("reports names containing a dot", () => {
    const { findings } = loadTokenDocument("t.json", '{ "a.b": { "$type": "number", "$value": 1 } }');
    expect(findings.map((f) => f.code)).toEqual(["bad-name"]);
  });

  test("reports $ref as not supported yet", () => {
    const { findings } = loadTokenDocument("t.json", '{ "a": { "$ref": "#/b/$value" } }');
    expect(findings.map((f) => f.code)).toEqual(["unsupported-ref"]);
  });

  test("rejects a top-level array", () => {
    const { doc, findings } = loadTokenDocument("t.json", "[]");
    expect(doc).toBeNull();
    expect(findings[0]!.code).toBe("invalid-json");
  });
});

describe("lineAt", () => {
  test("counts newlines before the offset", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 2)).toBe(2);
    expect(lineAt("a\r\nb", 3)).toBe(2);
  });
});

describe("loadTokenDocument: from the backlog", () => {
  test("a file saved as UTF-16 (Windows PowerShell's >) says to save it as UTF-8, not that the JSON is broken", () => {
    const utf16 = new TextDecoder("utf-8").decode(new Uint8Array([0xff, 0xfe, ...Buffer.from(fixtureText, "utf16le")]));
    const { doc, findings } = loadTokenDocument("design/tokens.json", utf16);
    expect(doc).toBeNull();
    expect(findings.map((f) => f.code)).toEqual(["not-utf8"]);
    expect(findings[0]!.message).toBe(
      "This file is saved as UTF-16, not UTF-8 (Windows PowerShell's > saves files that way). Open it in your editor and save it as UTF-8.",
    );
  });

  test("a large file loads quickly (each token's line is looked up, not counted again)", () => {
    const tokens: Record<string, unknown> = {};
    for (let i = 0; i < 20_000; i++) tokens[`t${i}`] = { $type: "dimension", $value: { value: i, unit: "px" } };
    const text = JSON.stringify({ space: tokens }, null, 2);
    const started = Date.now();
    const { doc } = loadTokenDocument("big.json", text);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(doc!.tokens.get("space.t19999")!.line).toBe(lineAt(text, text.indexOf('"t19999"')));
  });
});
