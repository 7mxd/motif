import { converter, differenceEuclidean, formatHex, parse, type Color } from "culori";

export interface Sample {
  value: string;
  count: number;
  contexts: Record<string, number>;
  /** "file:line", at most five. */
  examples: string[];
}

export interface ColorCluster {
  id: string;
  hex: string;
  count: number;
  contexts: Record<string, number>;
  members: Sample[];
  l: number;
  c: number;
  h: number;
}

const toOklch = converter("oklch");
const distance = differenceEuclidean("oklab");

export function parseColor(value: string): Color | undefined {
  return parse(value.replace(/_/g, " "));
}

export function clusterColors(samples: Sample[], threshold = 0.03): { clusters: ColorCluster[]; unparsed: Sample[] } {
  const sorted = [...samples].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const groups: { rep: Color; members: Sample[] }[] = [];
  const unparsed: Sample[] = [];
  for (const s of sorted) {
    const color = parseColor(s.value);
    if (!color) {
      unparsed.push(s);
      continue;
    }
    const group = groups.find((g) => distance(g.rep, color) <= threshold);
    if (group) group.members.push(s);
    else groups.push({ rep: color, members: [s] });
  }
  const clusters = groups
    .map((g) => {
      const contexts: Record<string, number> = {};
      for (const m of g.members) for (const [k, n] of Object.entries(m.contexts)) contexts[k] = (contexts[k] ?? 0) + n;
      const lch = toOklch(g.rep);
      return {
        hex: (formatHex(g.rep) ?? "#000000").toUpperCase(),
        count: g.members.reduce((n, m) => n + m.count, 0),
        contexts,
        members: g.members,
        l: lch.l ?? 0,
        c: lch.c ?? 0,
        h: lch.h ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count)
    .map((c, i) => ({ id: `found-${i + 1}`, ...c }));
  return { clusters, unparsed };
}
