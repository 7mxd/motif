import type { Finding } from "../findings";
import { CONTRACT_VERSION } from "./roles";

export const REQUIRED_SECTIONS = [
  "Brief", "Direction", "Foundations", "Motion", "Components",
  "Patterns", "Accessibility", "Platform notes", "Do / Don't", "Change log",
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

export function checkDesignMd(file: string, raw: string): Finding[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const findings: Finding[] = [];
  const add = (code: string, severity: "error" | "warning", message: string, line?: number) =>
    findings.push({ code, severity, file, line, message });

  // Header (YAML-style front matter between --- lines)
  let bodyStart = 0;
  if (lines[0] !== "---") {
    add("missing-header", "error", `Your design guide should start with a small header between two "---" lines that includes "motifContract: ${CONTRACT_VERSION}".`, 1);
  } else {
    const end = lines.indexOf("---", 1);
    if (end === -1) {
      add("missing-header", "error", 'The header at the top of your design guide isn\'t closed with a "---" line.', 1);
    } else {
      const header: Record<string, string> = {};
      for (const l of lines.slice(1, end)) {
        const m = l.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
        if (m) header[m[1]!] = m[2]!.trim();
      }
      const version = Number(header.motifContract);
      if (header.motifContract === undefined || !Number.isInteger(version)) {
        add("missing-version", "error", `Add "motifContract: ${CONTRACT_VERSION}" to the header of your design guide.`, 1);
      } else if (version > CONTRACT_VERSION) {
        add("newer-format", "error", `Your design guide was made by a newer version of Motif (format ${version}). Update Motif to use it.`, 1);
      }
      if (!header.name) add("bad-header", "warning", 'Add a "name:" line to the header of your design guide.', 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(header.updated ?? "")) {
        add("bad-header", "warning", 'Add an "updated: YYYY-MM-DD" line to the header of your design guide.', 1);
      }
      bodyStart = end + 1;
    }
  }

  // Sections (level-2 headings, optional "N." prefix)
  const found: { name: string; line: number }[] = [];
  lines.forEach((l, i) => {
    if (i < bodyStart) return;
    const m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*#*\s*$/);
    if (m) found.push({ name: norm(m[1]!), line: i + 1 });
  });
  const positions: number[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const idx = found.findIndex((f) => f.name === norm(section));
    if (idx === -1) add("missing-section", "error", `Your design guide is missing the "${section}" section.`);
    else positions.push(idx);
  }
  if (positions.some((p, i) => i > 0 && p < positions[i - 1]!)) {
    add("section-order", "warning", `The sections of your design guide are out of order. Expected: ${REQUIRED_SECTIONS.join(", ")}.`);
  }

  // Plain-language summary before the first section
  const firstSectionLine = found[0]?.line ?? lines.length + 1;
  const summary = lines.slice(bodyStart, firstSectionLine - 1).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (summary.length === 0) {
    add("missing-summary", "warning", "Add a short plain-language summary at the top of your design guide, before the first section.");
  }

  return findings;
}
