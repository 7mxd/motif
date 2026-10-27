import type { Finding } from "../findings";
import { darkValueOf, resolveToken } from "./resolve";
import { MOTIF_EXT, type TokenDocument } from "./types";
import { durationToMs, type DtcgDuration } from "./values";

export const CONTRACT_VERSION = 1;

export const REQUIRED_ROLES: Record<string, { type: string; names: string[] }> = {
  color: {
    type: "color",
    names: [
      "background", "surface", "surface-raised", "border", "text-primary", "text-secondary", "text-inverse",
      "action-primary", "on-action-primary", "action-secondary", "on-action-secondary", "focus",
      "success", "on-success", "warning", "on-warning", "danger", "on-danger", "info", "on-info",
    ],
  },
  font: { type: "typography", names: ["display", "title", "heading", "body", "label", "caption"] },
  space: { type: "dimension", names: ["0", "1", "2", "3", "4", "5", "6", "8", "10", "12", "16"] },
  radius: { type: "dimension", names: ["none", "sm", "md", "lg", "full"] },
  shadow: { type: "shadow", names: ["sm", "md", "lg"] },
  duration: { type: "duration", names: ["instant", "fast", "base", "slow"] },
  easing: { type: "cubicBezier", names: ["standard", "enter", "exit"] },
};

/** Roles a theme may leave out; one it has must be the right type. */
export const OPTIONAL_ROLES: Record<string, { type: string; names: string[] }> = {
  color: { type: "color", names: ["brand", "on-brand", "brand-soft"] },
  font: { type: "typography", names: ["mono"] },
};

export const REQUIRED_SPRINGS = ["snappy", "smooth", "bouncy"];

const MAX_DURATION_MS = 2000;
const SPRING_SECONDS: [number, number] = [0.05, 2];

export function checkRoles(doc: TokenDocument): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, message: string, path?: string) =>
    findings.push({ code, severity: "error", file: doc.file, message, path, line: path ? doc.tokens.get(path)?.line : undefined });

  // Format version
  const version = (doc.rootExtensions?.[MOTIF_EXT] as { motifContract?: unknown } | undefined)?.motifContract;
  if (typeof version !== "number") {
    add("missing-version", `Your theme values don't say which Motif format they use. Add "motifContract": ${CONTRACT_VERSION} under $extensions["${MOTIF_EXT}"].`);
  } else if (version > CONTRACT_VERSION) {
    add("newer-format", `These theme values were made by a newer version of Motif (format ${version}). Update Motif to use them.`);
  }

  // Required roles: present and of the right type (resolution problems are reported by validateTokens)
  const requireRole = (path: string, type: string): unknown | undefined => {
    if (!doc.tokens.has(path)) {
      // No line: the value doesn't exist yet. The path tells the agent exactly what to add.
      findings.push({ code: "missing-role", severity: "error", file: doc.file, path, message: `Your theme values are missing "${path}". Every Motif design guide needs it.` });
      return undefined;
    }
    const r = resolveToken(doc, path);
    if (!r.ok) return undefined;
    if (r.type !== type) {
      add("wrong-type", `"${path}" should be a ${type} value, but it is "${r.type ?? "untyped"}".`, path);
      return undefined;
    }
    return r.value;
  };

  for (const [group, { type, names }] of Object.entries(REQUIRED_ROLES)) {
    for (const name of names) {
      const path = `${group}.${name}`;
      const value = requireRole(path, type);
      if (group === "duration" && value !== undefined) {
        const ms = durationToMs(value as DtcgDuration);
        if (ms > MAX_DURATION_MS) {
          add("motion-range", `"${path}" is ${ms} ms. Anything over 2 seconds feels sluggish; use ${MAX_DURATION_MS} ms or less.`, path);
        }
      }
    }
  }

  for (const [group, { type, names }] of Object.entries(OPTIONAL_ROLES)) {
    for (const name of names) if (doc.tokens.has(`${group}.${name}`)) requireRole(`${group}.${name}`, type);
  }

  for (const name of REQUIRED_SPRINGS) {
    const dPath = `spring.${name}.duration`;
    const bPath = `spring.${name}.bounce`;
    const d = requireRole(dPath, "duration");
    const b = requireRole(bPath, "number");
    if (d !== undefined) {
      const s = durationToMs(d as DtcgDuration) / 1000;
      if (s < SPRING_SECONDS[0] || s > SPRING_SECONDS[1]) {
        add("motion-range", `"${dPath}" should be between ${SPRING_SECONDS[0]} and ${SPRING_SECONDS[1]} seconds.`, dPath);
      }
    }
    if (b !== undefined && !((b as number) > -1 && (b as number) < 1)) {
      add("motion-range", `"${bPath}" must be greater than -1 and less than 1.`, bPath);
    }
  }

  // Every colour role needs a dark-mode value
  for (const tok of doc.tokens.values()) {
    if (tok.path.startsWith("color.") && darkValueOf(doc, tok.path) === undefined) {
      add("missing-dark", `"${tok.path}" has no dark-mode value. Add one under $extensions["${MOTIF_EXT}"].modes.dark.`, tok.path);
    }
  }

  return findings;
}
