// The names of Flutter's own icons (Icons.star, CupertinoIcons.heart), so an audit finding about an icon can say which
// one it is. They're read from the SDK's icons.dart files, only when a finding is about an icon.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCES: { file: string[]; font: string; owner: string; pattern: RegExp }[] = [
  {
    file: ["packages", "flutter", "lib", "src", "material", "icons.dart"],
    font: "MaterialIcons",
    owner: "Icons",
    pattern: /static const IconData (\w+) = IconData\(\s*0x([0-9a-fA-F]+),\s*fontFamily: 'MaterialIcons'/g,
  },
  {
    file: ["packages", "flutter", "lib", "src", "cupertino", "icons.dart"],
    font: "CupertinoIcons",
    owner: "CupertinoIcons",
    pattern: /static const IconData (\w+) = IconData\(\s*0x([0-9a-fA-F]+),\s*fontFamily: iconFont/g,
  },
];

/** Code point and font (U+E5F9 in MaterialIcons) as a key. */
const key = (font: string, code: number) => `${font}|${code}`;

/**
 * Flutter's icons by font and code point, from the SDK at `sdk`: the first name each glyph has (Icons.star). Empty when
 * the files can't be read.
 */
export function sdkIconNames(sdk: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const source of SOURCES) {
    let text: string;
    try {
      text = readFileSync(join(sdk, ...source.file), "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(source.pattern)) {
      const k = key(source.font, Number.parseInt(m[2]!, 16));
      if (!names.has(k)) names.set(k, `${source.owner}.${m[1]}`);
    }
  }
  return names;
}

/** An icon's name (Icons.star) from its code point ("U+E5F9") and font, or undefined when it isn't one of Flutter's. */
export function iconName(names: Map<string, string>, code: string, font: string | undefined): string | undefined {
  const m = /^U\+([0-9A-F]+)$/i.exec(code);
  if (!m || !font) return undefined;
  return names.get(key(font, Number.parseInt(m[1]!, 16)));
}
