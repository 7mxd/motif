import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditChecks } from "../src/stacks/flutter/shot";
import { swiftUIAuditChecks } from "../src/stacks/swiftui/shot";

// text-fit on the native stacks: each harness reports text cut off or broken one word per line, in the web's shape.
const read = (rel: string) => readFileSync(join(import.meta.dir, "../src/stacks", rel), "utf8");

describe("text-fit in the native harnesses (first impressions)", () => {
  const HARNESSES: [string, string, RegExp][] = [
    ["flutter", "flutter/harness/motif_audit.dart", /checks\.contains\('text-fit'\)/],
    ["compose", "compose/harness/MotifAudit.kt", /"text-fit" to ::textFit/],
    ["swiftui", "swiftui/harness/MotifAudit.swift", /checks\.contains\("text-fit"\)/],
  ];
  for (const [stack, file, gate] of HARNESSES) {
    test(`${stack}: runs when asked, and reports text-fit with fit cut or broken and whether it is prominent`, () => {
      const src = read(file);
      expect(src).toMatch(gate);
      // Dart and Kotlin write the key as a string; Swift sets the Encodable field.
      expect(src).toMatch(/\brule["']?\s*(?::|to|,|=)\s*["']text-fit["']/);
      expect(src).toMatch(/\bfit["']?\s*(?::|to|,|=)/);
      expect(src).toMatch(/["']cut["']/);
      expect(src).toMatch(/["']broken["']/);
      expect(src).toMatch(/\bprominent["']?\s*(?::|to|,|=)/);
    });
  }

  test("compose: cut is read from ellipsis, height overflow or a line wider than the text, never hasVisualOverflow or didOverflowWidth (Mac check: every short text was reported)", () => {
    const src = read("compose/harness/MotifAudit.kt");
    const body = src.slice(src.indexOf("private fun textFit"), src.indexOf("/** Whether all of a node is inside the screen"));
    expect(body).not.toContain("hasVisualOverflow");
    expect(body).not.toContain("didOverflowWidth");
    expect(body).toContain("isLineEllipsized");
    expect(body).toContain("getLineRight");
  });

  test("flutter: lines are counted from the paragraph's own text boxes (RenderParagraph has no computeLineMetrics)", () => {
    const src = read("flutter/harness/motif_audit.dart");
    expect(src).not.toContain("computeLineMetrics");
    expect(src).toContain("getBoxesForSelection");
  });

  test("swiftui: only plain text is judged, and cut only on a one-line text box (Mac check: buttons and a card's combined name were false findings)", () => {
    const src = read("swiftui/harness/MotifAudit.swift");
    const body = src.slice(src.indexOf("static func textFit"), src.indexOf("/// True when a text button's frame is well taller"));
    expect(body).toContain("guard e.kind == .text,");
    expect(body).not.toContain("e.kind == .button");
    expect(body).toMatch(/lines == 1, e\.rect\.height <= font\.size \* 1\.6/);
  });

  test("the native checks include text-fit in light, at every size, and not in dark", () => {
    const phone = { width: 390, height: 844, mobile: true } as any;
    const desk = { width: 1440, height: 900, mobile: false } as any;
    expect(auditChecks(phone, "light")).toContain("text-fit");
    expect(auditChecks(desk, "light")).toContain("text-fit");
    expect(auditChecks(phone, "dark")).not.toContain("text-fit");
    expect(swiftUIAuditChecks(desk, "light", "macos")).toContain("text-fit");
    expect(swiftUIAuditChecks(desk, "dark", "macos")).not.toContain("text-fit");
  });
});
