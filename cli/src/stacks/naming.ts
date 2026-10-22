/** Words a native language won't take as an identifier: a variant called "default" becomes defaultVariant. */
export const RESERVED: { dart: Set<string>; kotlin: Set<string>; swift: Set<string> } = {
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
  // Kotlin's hard keywords: soft ones (data, value, open…) are fine as names.
  kotlin: new Set([
    "as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface", "is", "null",
    "object", "package", "return", "super", "this", "throw", "true", "try", "typealias", "typeof", "val", "var",
    "when", "while",
  ]),
  // Swift's keywords in declarations, statements and expressions.
  swift: new Set([
    "associatedtype", "class", "deinit", "enum", "extension", "fileprivate", "func", "import", "init", "inout", "internal",
    "let", "open", "operator", "private", "precedencegroup", "protocol", "public", "rethrows", "static", "struct",
    "subscript", "typealias", "var", "break", "case", "catch", "continue", "default", "defer", "do", "else", "fallthrough",
    "for", "guard", "if", "in", "repeat", "return", "throw", "switch", "where", "while", "Any", "as", "await", "false",
    "is", "nil", "self", "Self", "super", "throws", "true", "try",
    // Members every enum has, which a case of the same name would clash with.
    "allCases", "rawValue", "hashValue",
  ]),
};

/**
 * A role name as a lowerCamelCase member: words joined (on-action-primary → onActionPrimary), "p" for a point between
 * digits (0-5 → 0p5), and the lead letter in front of a leading digit (2xl → r2xl).
 */
export function lowerCamel(name: string, lead: string): string {
  const words = name.replace(/(\d)[-_](?=\d)/g, "$1p").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const id = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
  return id === "" || /^[0-9]/.test(id) ? `${lead}${id}` : id;
}

/** "partner-store" becomes partnerStore. A Dart keyword gets "Variant" added: default becomes defaultVariant. */
export function dartIdentifier(id: string): string {
  const name = camelCase(id);
  return RESERVED.dart.has(name) ? `${name}Variant` : name;
}

/** Dashes dropped, the letter after each one raised: dark-blue-2 becomes darkBlue2. */
export function camelCase(id: string): string {
  return id.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/-+$/, "");
}

/** "partner-store" becomes PartnerStore; a1 becomes A1. */
export function kotlinIdentifier(id: string): string {
  const name = camelCase(id);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "partner-store" becomes partnerStore. A Swift keyword gets "Variant" added: default becomes defaultVariant. */
export function swiftIdentifier(id: string): string {
  const name = camelCase(id);
  return RESERVED.swift.has(name) ? `${name}Variant` : name;
}
