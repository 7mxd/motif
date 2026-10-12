import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandResult } from "../cli/output";
import { checkContrast } from "../contract/contrast";
import { checkDesignMd } from "../contract/design-md";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { formatFindings, type Finding } from "../findings";

export const DESIGN_MD = "DESIGN.md";
export const TOKENS_JSON = "design/tokens.json";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runValidate(cwd: string): Promise<CommandResult> {
  const mdPath = join(cwd, DESIGN_MD);
  const tokensPath = join(cwd, "design", "tokens.json");
  const missing = [
    ...(existsSync(mdPath) ? [] : [DESIGN_MD]),
    ...(existsSync(tokensPath) ? [] : [TOKENS_JSON]),
  ];
  if (missing.length > 0) {
    return {
      command: "validate",
      exitCode: 2,
      text: `No design guide found in this folder (missing ${missing.join(" and ")}).\nStart one with /design, or run this inside your app's folder.`,
      data: { error: "no-contract", missing },
    };
  }

  const { doc, findings: loadFindings } = loadTokenDocument(TOKENS_JSON, readFileSync(tokensPath, "utf8"));
  const findings: Finding[] = [...loadFindings];
  let contrastChecks = 0;
  if (doc) {
    findings.push(...validateTokens(doc), ...checkRoles(doc));
    const contrast = checkContrast(doc);
    findings.push(...contrast.findings);
    contrastChecks = contrast.checked;
  }
  findings.push(...checkDesignMd(DESIGN_MD, readFileSync(mdPath, "utf8")));

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const tokens = doc?.tokens.size ?? 0;

  let text: string;
  if (errors > 0) {
    text = `✗ Your design guide has ${plural(errors, "problem", "problems")}${warnings ? ` and ${plural(warnings, "suggestion", "suggestions")}` : ""}:\n`
      + `${formatFindings(findings)}\n`
      + `Fix these, or ask your agent: "fix my design guide".`;
  } else {
    text = `✓ Your design guide is valid — ${tokens} theme values and ${contrastChecks} readability checks (light + dark) passed.`
      + (warnings ? `\n${plural(warnings, "suggestion", "suggestions")}:\n${formatFindings(findings)}` : "");
  }

  return {
    command: "validate",
    exitCode: errors > 0 ? 1 : 0,
    text,
    data: { findings, summary: { errors, warnings, tokens, contrastChecks } },
  };
}
