export type PaletteRole =
  | "background" | "surface" | "surface-raised" | "border" | "text-primary" | "text-secondary"
  | "action-primary" | "action-secondary" | "success" | "warning" | "danger" | "info" | "focus"
  | "brand" | "brand-soft";

export type Palette = Record<PaletteRole, string>;

export interface PresetSpec {
  id: string;
  title: string;
  words: string[];
  bestFor: string;
  avoidFor: string;
  motionNote: string;
  fonts: { body: string[]; display: string[] };
  sizes: { display: number; title: number; heading: number; body: number; label: number; caption: number };
  radius: { sm: number; md: number; lg: number };
  /** How strong the shadows are (1 = Motif's default); they take the light text colour, never plain black. */
  shadow: number;
  durations: { fast: number; base: number; slow: number };
  easing: [number, number, number, number];
  springs: { snappy: [number, number]; smooth: [number, number]; bouncy: [number, number] };
  light: Palette;
  dark: Palette;
}

export const PRESETS: PresetSpec[] = [
  {
    id: "minimal", title: "Minimal", words: ["calm", "precise", "quiet", "focused"],
    bestFor: "productivity tools, dashboards and developer products", avoidFor: "playful consumer apps and kids' products",
    motionNote: "quick and steady",
    fonts: { body: ["Onest", "Readex Pro", "system-ui", "sans-serif"], display: ["Onest", "Readex Pro", "system-ui", "sans-serif"] },
    sizes: { display: 40, title: 28, heading: 20, body: 16, label: 14, caption: 12 },
    radius: { sm: 3, md: 6, lg: 10 }, shadow: 0.6, durations: { fast: 120, base: 200, slow: 320 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.25, 0], smooth: [0.4, 0.1], bouncy: [0.5, 0.3] },
    light: { background: "#F6F9F7", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#DCE1DE", "text-primary": "#181D1B", "text-secondary": "#575E5B", "action-primary": "#212825", "action-secondary": "#EAEFED", success: "#237742", warning: "#A45D25", danger: "#B6322D", info: "#2F6094", focus: "#28302C", brand: "#181D1B", "brand-soft": "#EAEFED" },
    dark: { background: "#101412", surface: "#171A19", "surface-raised": "#1F2422", border: "#303533", "text-primary": "#ECF0EE", "text-secondary": "#A8AEAB", "action-primary": "#E8ECEA", "action-secondary": "#242927", success: "#7ECE94", warning: "#F0C16E", danger: "#F28881", info: "#84B9E6", focus: "#DADFDD", brand: "#65706B", "brand-soft": "#1F2422" },
  },
  {
    id: "soft", title: "Soft", words: ["gentle", "friendly", "warm", "approachable"],
    bestFor: "wellness, journaling, community and lifestyle apps", avoidFor: "dense data tools and finance dashboards",
    motionNote: "slow and gentle",
    fonts: { body: ["Nunito", "Rubik", "system-ui", "sans-serif"], display: ["Nunito", "Rubik", "system-ui", "sans-serif"] },
    sizes: { display: 36, title: 26, heading: 20, body: 16, label: 14, caption: 12 },
    radius: { sm: 8, md: 14, lg: 24 }, shadow: 1, durations: { fast: 160, base: 260, slow: 400 }, easing: [0.25, 0.1, 0.25, 1],
    springs: { snappy: [0.3, 0], smooth: [0.5, 0.15], bouncy: [0.6, 0.35] },
    light: { background: "#F5FAFA", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D7E2E1", "text-primary": "#1B292B", "text-secondary": "#556567", "action-primary": "#2E7577", "action-secondary": "#FBE6DE", success: "#247A4B", warning: "#A45D25", danger: "#B73F28", info: "#256E9B", focus: "#2E7577", brand: "#2E7577", "brand-soft": "#DDF0EE" },
    dark: { background: "#0D1A1B", surface: "#122123", "surface-raised": "#192A2C", border: "#2A3D3F", "text-primary": "#EAF2F1", "text-secondary": "#A5B7B6", "action-primary": "#7FCFC4", "action-secondary": "#3C2826", success: "#88D1A2", warning: "#F0C374", danger: "#F59485", info: "#88BFE6", focus: "#7FCFC4", brand: "#4F7C7D", "brand-soft": "#122F31" },
  },
  {
    id: "playful", title: "Playful", words: ["bright", "bouncy", "energetic", "fun"],
    bestFor: "consumer social apps, games, learning and kids' products", avoidFor: "banking, healthcare and enterprise tools",
    motionNote: "lively and springy",
    fonts: { body: ["Nunito", "Baloo Bhaijaan 2", "system-ui", "sans-serif"], display: ["Fredoka", "Baloo Bhaijaan 2", "Nunito", "system-ui", "sans-serif"] },
    sizes: { display: 44, title: 30, heading: 22, body: 16, label: 14, caption: 12 },
    radius: { sm: 10, md: 18, lg: 28 }, shadow: 1, durations: { fast: 140, base: 240, slow: 380 }, easing: [0.34, 1.2, 0.64, 1],
    springs: { snappy: [0.25, 0.1], smooth: [0.45, 0.25], bouncy: [0.55, 0.45] },
    light: { background: "#F5FBFF", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D4E0E7", "text-primary": "#291A24", "text-secondary": "#6A5562", "action-primary": "#C2126D", "action-secondary": "#FBEFC0", success: "#078050", warning: "#9D6C26", danger: "#B93F35", info: "#2F62AC", focus: "#C2126D", brand: "#C2126D", "brand-soft": "#FCE4EF" },
    dark: { background: "#221118", surface: "#2C1820", "surface-raised": "#38212A", border: "#4D333D", "text-primary": "#F9F1F4", "text-secondary": "#C9B2BC", "action-primary": "#FD87B2", "action-secondary": "#4A3F1A", success: "#7CD591", warning: "#F8B65D", danger: "#F98A74", info: "#83BDF5", focus: "#FD87B2", brand: "#BD4279", "brand-soft": "#3D1A2A" },
  },
  {
    id: "editorial", title: "Editorial", words: ["refined", "literary", "confident", "timeless"],
    bestFor: "publishing, portfolios, long reads and premium brands", avoidFor: "busy dashboards and tap-heavy utility apps",
    motionNote: "restrained and smooth",
    fonts: { body: ["Source Serif 4", "Markazi Text", "Georgia", "serif"], display: ["Noto Serif Display", "Markazi Text", "Georgia", "serif"] },
    sizes: { display: 48, title: 32, heading: 22, body: 18, label: 15, caption: 13 },
    radius: { sm: 0, md: 2, lg: 4 }, shadow: 0.4, durations: { fast: 120, base: 220, slow: 360 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.25, 0], smooth: [0.4, 0], bouncy: [0.5, 0.15] },
    light: { background: "#FAF7F5", surface: "#FFFDFD", "surface-raised": "#F5F2F0", border: "#DDD8D6", "text-primary": "#1F1716", "text-secondary": "#615956", "action-primary": "#852535", "action-secondary": "#F0E9E7", success: "#2C6D3E", warning: "#916508", danger: "#B54531", info: "#295F8A", focus: "#1F1716", brand: "#852535", "brand-soft": "#F3E6E3" },
    dark: { background: "#161312", surface: "#1E1A18", "surface-raised": "#282321", border: "#3B3534", "text-primary": "#F1EEEA", "text-secondary": "#B4AEA9", "action-primary": "#E5848C", "action-secondary": "#2D2826", success: "#88CA95", warning: "#EABC6E", danger: "#F78E64", info: "#89BAE4", focus: "#F1EEEA", brand: "#A15B63", "brand-soft": "#2D2224" },
  },
  {
    id: "bold", title: "Bold", words: ["loud", "decisive", "high-contrast", "modern"],
    bestFor: "marketing sites, launches, sports and media", avoidFor: "calm reading experiences and wellness apps",
    motionNote: "fast and punchy",
    fonts: { body: ["Zalando Sans", "Alexandria", "system-ui", "sans-serif"], display: ["Zalando Sans Expanded", "Alexandria", "Zalando Sans", "system-ui", "sans-serif"] },
    sizes: { display: 52, title: 32, heading: 22, body: 16, label: 14, caption: 12 },
    radius: { sm: 2, md: 6, lg: 12 }, shadow: 0.8, durations: { fast: 100, base: 180, slow: 300 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.2, 0], smooth: [0.35, 0.1], bouncy: [0.45, 0.3] },
    light: { background: "#FFFFFF", surface: "#F8F5F3", "surface-raised": "#FFFFFF", border: "#D2CDC9", "text-primary": "#16110F", "text-secondary": "#534B47", "action-primary": "#D83A1A", "action-secondary": "#16110F", success: "#1D7635", warning: "#A45D25", danger: "#9B2A4B", info: "#205F9F", focus: "#B13C11", brand: "#D83A1A", "brand-soft": "#FBE3DA" },
    dark: { background: "#191513", surface: "#221D1A", "surface-raised": "#2D2724", border: "#48413D", "text-primary": "#F9F6F3", "text-secondary": "#C3BCB7", "action-primary": "#F8633F", "action-secondary": "#F9F6F3", success: "#73D083", warning: "#F1C45E", danger: "#E97294", info: "#7FB2EC", focus: "#F8633F", brand: "#CB4325", "brand-soft": "#3A221A" },
  },
  {
    id: "dark-tech", title: "Dark Tech", words: ["technical", "sleek", "focused", "futuristic"],
    bestFor: "developer tools, AI products, analytics and crypto", avoidFor: "family, food and lifestyle apps",
    motionNote: "crisp and snappy",
    fonts: { body: ["Geologica", "Changa", "system-ui", "sans-serif"], display: ["TASA Orbiter", "Changa", "Geologica", "system-ui", "sans-serif"] },
    sizes: { display: 40, title: 28, heading: 20, body: 15, label: 13, caption: 12 },
    radius: { sm: 2, md: 4, lg: 8 }, shadow: 0.5, durations: { fast: 90, base: 160, slow: 260 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.2, 0], smooth: [0.3, 0.05], bouncy: [0.4, 0.2] },
    light: { background: "#F2F1EE", surface: "#FEFCFB", "surface-raised": "#FFFFFF", border: "#DBD7D2", "text-primary": "#1B1611", "text-secondary": "#5D5751", "action-primary": "#A45803", "action-secondary": "#E7E4E0", success: "#207963", warning: "#7F6A03", danger: "#B52332", info: "#136B94", focus: "#A45803", brand: "#1B1611", "brand-soft": "#F6E7D6" },
    dark: { background: "#15110D", surface: "#1F1A16", "surface-raised": "#27221D", border: "#38322C", "text-primary": "#F1ECE4", "text-secondary": "#B2ABA2", "action-primary": "#FB9F44", "action-secondary": "#2B2520", success: "#71D6A3", warning: "#E6DD5A", danger: "#F07683", info: "#76BBE2", focus: "#FB9F44", brand: "#7A6E62", "brand-soft": "#2E241A" },
  },
  {
    id: "warm", title: "Warm", words: ["earthy", "welcoming", "crafted", "natural"],
    bestFor: "food, hospitality, travel, home and handmade goods", avoidFor: "enterprise software and developer tools",
    motionNote: "relaxed and soft",
    fonts: { body: ["Merriweather Sans", "El Messiri", "system-ui", "sans-serif"], display: ["Vollkorn", "El Messiri", "Georgia", "serif"] },
    sizes: { display: 42, title: 30, heading: 21, body: 16, label: 14, caption: 12 },
    radius: { sm: 6, md: 10, lg: 16 }, shadow: 1, durations: { fast: 150, base: 250, slow: 380 }, easing: [0.25, 0.1, 0.25, 1],
    springs: { snappy: [0.3, 0], smooth: [0.45, 0.12], bouncy: [0.55, 0.3] },
    light: { background: "#F5F8F1", surface: "#FCFDFA", "surface-raised": "#FFFFFF", border: "#DBDCD1", "text-primary": "#252117", "text-secondary": "#625D51", "action-primary": "#596517", "action-secondary": "#F4E6D2", success: "#357855", warning: "#A45D25", danger: "#B63132", info: "#2B6991", focus: "#596517", brand: "#596517", "brand-soft": "#EEF0DC" },
    dark: { background: "#171610", surface: "#1F1E17", "surface-raised": "#28271F", border: "#3A382F", "text-primary": "#F1EFE6", "text-secondary": "#B8B4A6", "action-primary": "#B1C16D", "action-secondary": "#312A20", success: "#7ED1B7", warning: "#EBC070", danger: "#F68678", info: "#85BCE2", focus: "#B1C16D", brand: "#6F7A45", "brand-soft": "#2A2C1C" },
  },
  {
    id: "trust", title: "Trust", words: ["reliable", "clear", "professional", "reassuring"],
    bestFor: "banking, insurance, healthcare and government services", avoidFor: "games and playful social apps",
    motionNote: "calm and predictable",
    fonts: { body: ["Public Sans", "Mada", "Segoe UI", "system-ui", "sans-serif"], display: ["Public Sans", "Mada", "Segoe UI", "system-ui", "sans-serif"] },
    sizes: { display: 38, title: 28, heading: 20, body: 16, label: 14, caption: 12 },
    radius: { sm: 6, md: 8, lg: 12 }, shadow: 0.9, durations: { fast: 120, base: 200, slow: 300 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.25, 0], smooth: [0.4, 0.05], bouncy: [0.5, 0.2] },
    light: { background: "#F5F9FB", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D6E0E4", "text-primary": "#10212F", "text-secondary": "#4C5D6A", "action-primary": "#006C97", "action-secondary": "#E2EDF3", success: "#1E7546", warning: "#A45D25", danger: "#B23641", info: "#147175", focus: "#006C97", brand: "#0B3550", "brand-soft": "#E2EDF3" },
    dark: { background: "#0C1721", surface: "#131F2A", "surface-raised": "#1A2834", border: "#2D3C49", "text-primary": "#E9F0F5", "text-secondary": "#A7B7C3", "action-primary": "#6ABCE6", "action-secondary": "#1C2B37", success: "#7ED09C", warning: "#F0C374", danger: "#F28881", info: "#80C5C9", focus: "#6ABCE6", brand: "#4C7899", "brand-soft": "#1C2B37" },
  },
];
