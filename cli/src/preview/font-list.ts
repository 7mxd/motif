/** The fonts of the 8 starting styles, shipped with Motif: Latin letters, variable weight, from Fontsource (SIL Open Font License 1.1). */
export interface ListedFont {
  family: string;
  slug: string;
  /** The variable font's weight range. */
  weight: [number, number];
}

export const FONT_LIST: ListedFont[] = [
  { family: "Archivo", slug: "archivo", weight: [100, 900] },
  { family: "DM Sans", slug: "dm-sans", weight: [100, 1000] },
  { family: "Fraunces", slug: "fraunces", weight: [100, 900] },
  { family: "Fredoka", slug: "fredoka", weight: [300, 700] },
  { family: "IBM Plex Sans", slug: "ibm-plex-sans", weight: [100, 700] },
  { family: "Inter", slug: "inter", weight: [100, 900] },
  { family: "Nunito", slug: "nunito", weight: [200, 1000] },
  { family: "Playfair Display", slug: "playfair-display", weight: [400, 900] },
  { family: "Source Sans 3", slug: "source-sans-3", weight: [200, 900] },
  { family: "Source Serif 4", slug: "source-serif-4", weight: [200, 900] },
  { family: "Space Grotesk", slug: "space-grotesk", weight: [300, 700] },
];

export const FONTS_CSS_HEADER =
  "/* The fonts of Motif's 8 starting styles: Latin letters, variable weight, from Fontsource. Each is under the SIL Open Font License 1.1 (see LICENSE-<font>.txt). Written by cli/scripts/vendor-fonts.ts. */";

/** One @font-face per font; `url` turns a file name into the address the page loads it from. */
export function fontFaceCss(url: (file: string) => string): string {
  const faces = FONT_LIST.map((f) =>
    [
      "@font-face {",
      `  font-family: "${f.family}";`,
      "  font-style: normal;",
      "  font-display: swap;",
      `  font-weight: ${f.weight[0]} ${f.weight[1]};`,
      `  src: url("${url(`${f.slug}.woff2`)}") format("woff2");`,
      "}",
    ].join("\n"),
  );
  return `${faces.join("\n\n")}\n`;
}

export function isBundledFamily(family: string): boolean {
  const key = family.trim().toLowerCase();
  return FONT_LIST.some((f) => f.family.toLowerCase() === key);
}
