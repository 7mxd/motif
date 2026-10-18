import type { Finding } from "../findings";
import { savedAsUtf16, UTF16_MESSAGE } from "../text";
import { CONTRACT_VERSION } from "./roles";

export const REQUIRED_SECTIONS = [
  "Brief", "Direction", "Foundations", "Motion", "Components",
  "Patterns", "Accessibility", "Platform notes", "Do / Don't", "Change log",
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

export function checkDesignMd(file: string, raw: string): Finding[] {
  if (savedAsUtf16(raw)) return [{ code: "not-utf8", severity: "error", file, line: 1, message: UTF16_MESSAGE }];
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  // Trailing spaces don't change a line's meaning.
  const lines = text.split("\n").map((l) => l.trimEnd());
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
        // YAML allows a value in quotes: motifContract: "1".
        if (m) header[m[1]!] = m[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
      }
      const version = Number(header.motifContract);
      if (header.motifContract === undefined || !/^\d+$/.test(header.motifContract) || version < 1) {
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

  // Sections (level-2 headings, optional "N." prefix), outside code blocks
  const found: { name: string; line: number }[] = [];
  // As Markdown reads them: a fence opens a block only alone on its line (an info string may follow ``` but no more
  // backticks), and closes it only with the same character, at least as long, and nothing after it.
  let fence: { marker: string; line: number } | null = null;
  lines.forEach((l, i) => {
    if (i < bodyStart) return;
    if (fence === null) {
      const open = l.match(/^ {0,3}(`{3,})[^`]*$/)?.[1] ?? l.match(/^ {0,3}(~{3,})/)?.[1];
      if (open) {
        fence = { marker: open, line: i + 1 };
        return;
      }
    } else {
      const close = l.match(/^ {0,3}(`{3,}|~{3,})\s*$/)?.[1];
      if (close && close[0] === fence.marker[0] && close.length >= fence.marker.length) fence = null;
      return;
    }
    const m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*#*\s*$/);
    if (m) found.push({ name: norm(m[1]!), line: i + 1 });
  });
  if (fence !== null) {
    const opened = fence as { marker: string; line: number };
    add("unclosed-code-block", "warning", `A code block opened on line ${opened.line} is never closed, so everything after it reads as code. Close it with ${opened.marker}.`, opened.line);
  }
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
