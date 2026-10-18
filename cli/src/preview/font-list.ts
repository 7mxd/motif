/**
 * The fonts of the 8 starting styles, shipped with Motif: each style's Latin fonts (variable weight), and only the Arabic
 * letters of each style's Arabic companion. From Fontsource, under the SIL Open Font License 1.1.
 */
export interface ListedFont {
  family: string;
  slug: string;
  /** The variable font's weight range. */
  weight: [number, number];
  /** Only its Arabic letters ship: a companion second in a style's font list, used for Arabic text. */
  arabic?: boolean;
}

/** The Arabic letters' range, as Fontsource declares it for each companion's Arabic file. */
export const ARABIC_RANGE =
  "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1";

export const FONT_LIST: ListedFont[] = [
  { family: "Alexandria", slug: "alexandria", weight: [100, 900], arabic: true },
  { family: "Archivo", slug: "archivo", weight: [100, 900] },
  { family: "Baloo Bhaijaan 2", slug: "baloo-bhaijaan-2", weight: [400, 800], arabic: true },
  { family: "Changa", slug: "changa", weight: [200, 800], arabic: true },
  { family: "DM Sans", slug: "dm-sans", weight: [100, 1000] },
  { family: "El Messiri", slug: "el-messiri", weight: [400, 700], arabic: true },
  { family: "Fraunces", slug: "fraunces", weight: [100, 900] },
  { family: "Fredoka", slug: "fredoka", weight: [300, 700] },
  { family: "Geologica", slug: "geologica", weight: [100, 900] },
  { family: "IBM Plex Sans", slug: "ibm-plex-sans", weight: [100, 700] },
  { family: "Inter", slug: "inter", weight: [100, 900] },
  { family: "Mada", slug: "mada", weight: [200, 900], arabic: true },
  { family: "Markazi Text", slug: "markazi-text", weight: [400, 700], arabic: true },
  { family: "Merriweather Sans", slug: "merriweather-sans", weight: [300, 800] },
  { family: "Noto Serif Display", slug: "noto-serif-display", weight: [100, 900] },
  { family: "Nunito", slug: "nunito", weight: [200, 1000] },
  { family: "Onest", slug: "onest", weight: [100, 900] },
  { family: "Playfair Display", slug: "playfair-display", weight: [400, 900] },
  { family: "Public Sans", slug: "public-sans", weight: [100, 900] },
  { family: "Readex Pro", slug: "readex-pro", weight: [160, 700], arabic: true },
  { family: "Rubik", slug: "rubik", weight: [300, 900], arabic: true },
  { family: "Source Sans 3", slug: "source-sans-3", weight: [200, 900] },
  { family: "Source Serif 4", slug: "source-serif-4", weight: [200, 900] },
  { family: "Space Grotesk", slug: "space-grotesk", weight: [300, 700] },
  { family: "TASA Orbiter", slug: "tasa-orbiter", weight: [400, 800] },
  { family: "Vollkorn", slug: "vollkorn", weight: [400, 900] },
  { family: "Zalando Sans", slug: "zalando-sans", weight: [200, 900] },
  { family: "Zalando Sans Expanded", slug: "zalando-sans-expanded", weight: [200, 900] },
];

export const FONTS_CSS_HEADER =
  "/* The fonts of Motif's 8 starting styles (variable weight), and the Arabic letters of each style's Arabic companion, from Fontsource. Each is under the SIL Open Font License 1.1 (see LICENSE-<font>.txt). Written by cli/scripts/vendor-fonts.ts. */";

/** The kit's file for a font: its Latin file, or only its Arabic letters. */
export const fontFile = (f: ListedFont) => `${f.slug}${f.arabic ? "-arabic" : ""}.woff2`;

/** One @font-face per font; `url` turns a file name into the address the page loads it from. */
export function fontFaceCss(url: (file: string) => string): string {
  const faces = FONT_LIST.map((f) =>
    [
      "@font-face {",
      `  font-family: "${f.family}";`,
      "  font-style: normal;",
      "  font-display: swap;",
      `  font-weight: ${f.weight[0]} ${f.weight[1]};`,
      `  src: url("${url(fontFile(f))}") format("woff2");`,
      ...(f.arabic ? [`  unicode-range: ${ARABIC_RANGE};`] : []),
      "}",
    ].join("\n"),
  );
  return `${faces.join("\n\n")}\n`;
}

/** "full" when the kit has the font's Latin file, "arabic" when it has only its Arabic letters, null when it has neither. */
export function bundledCoverage(family: string): "full" | "arabic" | null {
  const key = family.trim().toLowerCase();
  const font = FONT_LIST.find((f) => f.family.toLowerCase() === key);
  return font ? (font.arabic ? "arabic" : "full") : null;
}

export function isBundledFamily(family: string): boolean {
  return bundledCoverage(family) === "full";
}
