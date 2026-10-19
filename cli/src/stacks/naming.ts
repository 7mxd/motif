/** Words a native language won't take as an identifier: a variant called "default" becomes defaultVariant. */
export const RESERVED: { dart: Set<string> } = {
  dart: new Set([
    // Reserved words
    "assert", "break", "case", "catch", "class", "const", "continue", "default", "do", "else", "enum", "extends",
    "false", "final", "finally", "for", "if", "in", "is", "new", "null", "rethrow", "return", "super", "switch",
    "this", "throw", "true", "try", "var", "void", "while", "with",
    // Built-in identifiers and contextual keywords
    "abstract", "as", "covariant", "deferred", "dynamic", "export", "extension", "external", "factory", "Function",
    "get", "implements", "import", "interface", "late", "library", "mixin", "operator", "part", "required", "set",
    "static", "typedef", "await", "yield",
  ]),
};

/** "partner-store" becomes partnerStore. A Dart keyword gets "Variant" added: default becomes defaultVariant. */
export function dartIdentifier(id: string): string {
  const name = camelCase(id);
  return RESERVED.dart.has(name) ? `${name}Variant` : name;
}

/** Dashes dropped, the letter after each one raised: dark-blue-2 becomes darkBlue2. */
export function camelCase(id: string): string {
  return id.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/-+$/, "");
}
