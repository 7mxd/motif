import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { CommandResult } from "../cli/output";
import { checkContrastAll } from "../contract/contrast";
import { checkDesignMd } from "../contract/design-md";
import { checkProjectFontFiles, readProjectFonts } from "../contract/fonts";
import { loadTokenDocument } from "../contract/load";
import { checkRoles } from "../contract/roles";
import { validateTokens } from "../contract/tokens";
import { checkVariants, readVariants } from "../contract/variants";
import { formatFindings, type Finding } from "../findings";
import { plural } from "../text";

export const DESIGN_MD = "DESIGN.md";
export const TOKENS_JSON = "design/tokens.json";


export async function runValidate(cwd: string, opts: { tokens?: string } = {}): Promise<CommandResult> {
  if (opts.tokens !== undefined) return validateTokensFile(cwd, opts.tokens);
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
  const variants = doc ? readVariants(doc).variants : [];
  if (doc) {
    findings.push(...validateTokens(doc), ...checkRoles(doc), ...checkVariants(doc));
    const contrast = checkContrastAll(doc);
    findings.push(...contrast.findings);
    contrastChecks = contrast.checked;
    const project = readProjectFonts(doc);
    findings.push(...project.findings, ...checkProjectFontFiles(cwd, project.fonts, doc));
  }
  findings.push(...checkDesignMd(DESIGN_MD, readFileSync(mdPath, "utf8"), { variants }));

  // Spec §5.4: a newer format is refused outright — other checks would only add noise.
  const newer = findings.filter((f) => f.code === "newer-format");
  if (newer.length > 0) {
    return {
      command: "validate",
      exitCode: 2,
      text: newer.map((f) => f.message).join("\n"),
      data: { error: "newer-format", findings: newer },
    };
  }

  const errors =findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const tokens = doc?.tokens.size ?? 0;

  let text: string;
  if (errors > 0) {
    text = `✗ Your design guide has ${plural(errors, "problem", "problems")}${warnings ? ` and ${plural(warnings, "suggestion", "suggestions")}` : ""}:\n`
      + `${formatFindings(findings)}\n`
      + `Fix these, or ask your agent: "fix my design guide".`;
  } else {
    text = `✓ Your design guide is valid — ${tokens} theme values and ${contrastChecks} readability checks (${variants.length > 0 ? `light + dark, ${plural(variants.length, "variant", "variants")}` : "light + dark"}) passed.`
      + (warnings ? `\n${plural(warnings, "suggestion", "suggestions")}:\n${formatFindings(findings)}` : "");
  }

  return {
    command: "validate",
    exitCode: errors > 0 ? 1 : 0,
    text,
    data: { findings, summary: { errors, warnings, tokens, contrastChecks } },
  };
}

/** One theme values file on its own (a design direction): format, roles and every readability pair. */
function validateTokensFile(cwd: string, arg: string): CommandResult {
  const abs = resolve(cwd, arg);
  const rel = relative(cwd, abs).split(sep).join("/");
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { command: "validate", exitCode: 2, text: `Couldn't find ${arg}.`, data: { error: "no-such-file", file: arg } };
  }
  const { doc, findings: loadFindings } = loadTokenDocument(rel, readFileSync(abs, "utf8"));
  const findings: Finding[] = [...loadFindings];
  let contrastChecks = 0;
  if (doc) {
    findings.push(...validateTokens(doc), ...checkRoles(doc), ...checkVariants(doc));
    const contrast = checkContrastAll(doc);
    findings.push(...contrast.findings);
    contrastChecks = contrast.checked;
    const project = readProjectFonts(doc);
    findings.push(...project.findings, ...checkProjectFontFiles(cwd, project.fonts, doc));
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const tokens = doc?.tokens.size ?? 0;
  const text = errors > 0
    ? `✗ ${rel} has ${plural(errors, "problem", "problems")}:\n${formatFindings(findings)}`
    : `✓ ${rel} is valid: ${plural(tokens, "value", "values")}, ${plural(contrastChecks, "readability check", "readability checks")} passed.${warnings ? `\n${formatFindings(findings)}` : ""}`;
  return { command: "validate", exitCode: errors > 0 ? 1 : 0, text, data: { file: rel, findings, summary: { errors, warnings, tokens, contrastChecks } } };
}
