import type { DoctorDeps } from "../commands/doctor";

/** A version as its numbers (22.14.0 → [22, 14, 0]); a missing minor or patch is 0. */
type Version = [number, number, number];

function parseVersion(text: string): Version | null {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

const atLeast = (v: Version, floor: Version) => v[0] !== floor[0] ? v[0] > floor[0] : v[1] !== floor[1] ? v[1] > floor[1] : v[2] >= floor[2];

/** One part of an engines range: ^a.b.c (that major, from a.b.c) or >=a.b.c (anything from a.b.c). */
export interface RangePart {
  op: "^" | ">=";
  floor: Version;
}

/** The parts of an engines.node range ("^22.22.3 || ^24.15.0 || >=26.0.0") Motif reads; others are left out. */
export function rangeParts(range: string): RangePart[] {
  const parts: RangePart[] = [];
  for (const text of range.split("||")) {
    const m = /^\s*(\^|>=)\s*(\d[\d.]*)\s*$/.exec(text);
    const floor = m ? parseVersion(m[2]!) : null;
    if (m && floor) parts.push({ op: m[1] as RangePart["op"], floor });
  }
  return parts;
}

/**
 * Whether a Node.js version ("22.14.0" or "v22.14.0") is in an engines.node range made of ^a.b.c and >=a.b.c parts
 * joined by ||. A version or a range Motif can't read doesn't block: true.
 */
export function nodeFloor(range: string, version: string): boolean {
  const v = parseVersion(version);
  const parts = rangeParts(range);
  if (v === null || parts.length === 0) return true;
  return parts.some((p) => atLeast(v, p.floor) && (p.op === ">=" || v[0] === p.floor[0]));
}

/** The Node.js version this computer runs ("22.14.0", from `node --version`), or null when it can't be read. */
export function nodeVersion(deps: DoctorDeps): string | null {
  const r = deps.run?.(["node", "--version"]);
  if (!r || r.code !== 0 || !/v?(\d+)\.(\d+)/.test(r.stdout)) return null;
  return r.stdout.trim().replace(/^v/, "");
}
