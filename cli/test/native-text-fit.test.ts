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
