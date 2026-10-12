import { getNodeValue, parseTree, printParseErrorCode, type Node, type ParseError } from "jsonc-parser";
import type { Finding } from "../findings";
import type { FlatToken, TokenDocument } from "./types";

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function prop(obj: Node, name: string): Node | undefined {
  for (const p of obj.children ?? []) {
    const [key, value] = p.children ?? [];
    if (key?.value === name) return value;
  }
  return undefined;
}

export function loadTokenDocument(
  file: string,
  rawText: string,
): { doc: TokenDocument | null; findings: Finding[] } {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length > 0 || !root) {
    const first = errors[0];
    return {
      doc: null,
      findings: [{
        code: "invalid-json",
        severity: "error",
        file,
        line: first ? lineAt(text, first.offset) : 1,
        message: `This file isn't valid JSON (${first ? printParseErrorCode(first.error) : "the file is empty"}). Fix the line shown, or ask your agent to repair it.`,
      }],
    };
  }
  if (root.type !== "object") {
    return {
      doc: null,
      findings: [{ code: "invalid-json", severity: "error", file, line: 1, message: "Your theme values file must contain a JSON object at the top level." }],
    };
  }

  const findings: Finding[] = [];
  const tokens = new Map<string, FlatToken>();

  const walk = (group: Node, segs: string[], inherited: string | null): void => {
    for (const p of group.children ?? []) {
      const [keyNode, valueNode] = p.children ?? [];
      const key = String(keyNode?.value);
      if (key.startsWith("$")) continue;
      const path = [...segs, key].join(".");
      const line = lineAt(text, p.offset);
      if (/[.{}]/.test(key)) {
        findings.push({ code: "bad-name", severity: "error", file, line, path, message: `The name "${key}" can't contain ".", "{" or "}".` });
        continue;
      }
      if (!valueNode || valueNode.type !== "object") {
        findings.push({ code: "not-object", severity: "error", file, line, path, message: `"${path}" must be an object: either a theme value (with "$value") or a group of them.` });
        continue;
      }
      const typeNode = prop(valueNode, "$type");
      const ownType = typeNode ? String(getNodeValue(typeNode)) : null;
      const valueProp = prop(valueNode, "$value");
      if (valueProp) {
        const extNode = prop(valueNode, "$extensions");
        tokens.set(path, {
          path,
          type: ownType ?? inherited,
          value: getNodeValue(valueProp),
          extensions: extNode ? getNodeValue(extNode) : undefined,
          line,
        });
      } else if (prop(valueNode, "$ref")) {
        findings.push({ code: "unsupported-ref", severity: "error", file, line, path, message: `"${path}" uses "$ref", which Motif doesn't support yet. Use an alias like "{primitive.color.gray.900}" instead.` });
      } else {
        walk(valueNode, [...segs, key], ownType ?? inherited);
      }
    }
  };

  const rootType = prop(root, "$type");
  walk(root, [], rootType ? String(getNodeValue(rootType)) : null);
  const rootExt = prop(root, "$extensions");
  return { doc: { file, tokens, rootExtensions: rootExt ? getNodeValue(rootExt) : undefined }, findings };
}
