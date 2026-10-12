import { describe, expect, test } from "bun:test";
import { emit, type CommandResult } from "../src/cli/output";
import { formatFindings } from "../src/findings";

const result: CommandResult = { command: "demo", exitCode: 1, text: "Plain words", data: { count: 2 } };

describe("emit", () => {
  test("prints plain text with a trailing newline", () => {
    let out = "";
    emit(result, false, (s) => (out += s));
    expect(out).toBe("Plain words\n");
  });
  test("prints one JSON object with command, ok, exitCode and data", () => {
    let out = "";
    emit(result, true, (s) => (out += s));
    expect(JSON.parse(out)).toEqual({ command: "demo", ok: false, exitCode: 1, count: 2 });
  });
});

describe("formatFindings", () => {
  test("shows errors and warnings with file:line", () => {
    const text = formatFindings([
      { code: "a", severity: "error", message: "Broken.", file: "design/tokens.json", line: 4 },
      { code: "b", severity: "warning", message: "Odd.", file: "DESIGN.md" },
    ]);
    expect(text).toBe("  ✗ design/tokens.json:4 — Broken.\n  ⚠ DESIGN.md — Odd.");
  });
});
