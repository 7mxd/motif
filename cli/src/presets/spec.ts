export type PaletteRole =
  | "background" | "surface" | "surface-raised" | "border" | "text-primary" | "text-secondary"
  | "action-primary" | "action-secondary" | "success" | "warning" | "danger" | "info" | "focus";

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
  durations: { fast: number; base: number; slow: number };
  easing: [number, number, number, number];
  springs: { snappy: [number, number]; smooth: [number, number]; bouncy: [number, number] };
  light: Palette;
  dark: Palette;
}

const STATUS_LIGHT = { success: "#15803D", warning: "#B45309", danger: "#B91C1C", info: "#1D4ED8" };

export const PRESETS: PresetSpec[] = [
  {
    id: "minimal", title: "Minimal", words: ["calm", "precise", "quiet", "focused"],
    bestFor: "productivity tools, dashboards and developer products", avoidFor: "playful consumer apps and kids' products",
    motionNote: "quick and steady",
    fonts: { body: ["Inter", "system-ui", "sans-serif"], display: ["Inter", "system-ui", "sans-serif"] },
    sizes: { display: 40, title: 28, heading: 20, body: 16, label: 14, caption: 12 },
    radius: { sm: 4, md: 8, lg: 12 }, durations: { fast: 120, base: 200, slow: 320 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.25, 0], smooth: [0.4, 0.1], bouncy: [0.5, 0.3] },
    light: { background: "#FAFAFA", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#E4E4E7", "text-primary": "#18181B", "text-secondary": "#52525B", "action-primary": "#18181B", "action-secondary": "#F4F4F5", ...STATUS_LIGHT, focus: "#2563EB" },
    dark: { background: "#09090B", surface: "#18181B", "surface-raised": "#27272A", border: "#3F3F46", "text-primary": "#FAFAFA", "text-secondary": "#A1A1AA", "action-primary": "#FAFAFA", "action-secondary": "#27272A", success: "#4ADE80", warning: "#FBBF24", danger: "#F87171", info: "#60A5FA", focus: "#60A5FA" },
  },
  {
    id: "soft", title: "Soft", words: ["gentle", "friendly", "warm", "approachable"],
    bestFor: "wellness, journaling, community and lifestyle apps", avoidFor: "dense data tools and finance dashboards",
    motionNote: "slow and gentle",
    fonts: { body: ["Nunito", "system-ui", "sans-serif"], display: ["Nunito", "system-ui", "sans-serif"] },
    sizes: { display: 36, title: 26, heading: 20, body: 16, label: 14, caption: 12 },
    radius: { sm: 8, md: 16, lg: 24 }, durations: { fast: 160, base: 260, slow: 400 }, easing: [0.25, 0.1, 0.25, 1],
    springs: { snappy: [0.3, 0], smooth: [0.5, 0.15], bouncy: [0.6, 0.35] },
    light: { background: "#FBF7F4", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#EDE4DD", "text-primary": "#2B2523", "text-secondary": "#6B5E57", "action-primary": "#7C3AED", "action-secondary": "#F1E9FE", success: "#047857", warning: "#B45309", danger: "#BE123C", info: "#0369A1", focus: "#7C3AED" },
    dark: { background: "#1A1523", surface: "#231C2E", "surface-raised": "#2D2439", border: "#3D3249", "text-primary": "#F5F0FA", "text-secondary": "#BBAEC9", "action-primary": "#C4B5FD", "action-secondary": "#2D2439", success: "#6EE7B7", warning: "#FCD34D", danger: "#FDA4AF", info: "#7DD3FC", focus: "#C4B5FD" },
  },
  {
    id: "playful", title: "Playful", words: ["bright", "bouncy", "energetic", "fun"],
    bestFor: "consumer social apps, games, learning and kids' products", avoidFor: "banking, healthcare and enterprise tools",
    motionNote: "lively and springy",
    fonts: { body: ["Nunito", "system-ui", "sans-serif"], display: ["Fredoka", "Nunito", "system-ui", "sans-serif"] },
    sizes: { display: 44, title: 30, heading: 22, body: 16, label: 14, caption: 12 },
    radius: { sm: 10, md: 18, lg: 28 }, durations: { fast: 140, base: 240, slow: 380 }, easing: [0.34, 1.2, 0.64, 1],
    springs: { snappy: [0.25, 0.1], smooth: [0.45, 0.25], bouncy: [0.55, 0.45] },
    light: { background: "#FFFBF0", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#F5E6C8", "text-primary": "#1F1A14", "text-secondary": "#5C5246", "action-primary": "#BE185D", "action-secondary": "#FEF3C7", ...STATUS_LIGHT, focus: "#BE185D" },
    dark: { background: "#17121F", surface: "#211A2C", "surface-raised": "#2B2238", border: "#3E3150", "text-primary": "#FFF7ED", "text-secondary": "#D6C7B8", "action-primary": "#F9A8D4", "action-secondary": "#2B2238", success: "#86EFAC", warning: "#FDE047", danger: "#FCA5A5", info: "#93C5FD", focus: "#F9A8D4" },
  },
  {
    id: "editorial", title: "Editorial", words: ["refined", "literary", "confident", "timeless"],
    bestFor: "publishing, portfolios, long reads and premium brands", avoidFor: "busy dashboards and tap-heavy utility apps",
    motionNote: "restrained and smooth",
    fonts: { body: ["Source Serif 4", "Georgia", "serif"], display: ["Playfair Display", "Georgia", "serif"] },
    sizes: { display: 48, title: 32, heading: 22, body: 18, label: 15, caption: 13 },
    radius: { sm: 2, md: 4, lg: 6 }, durations: { fast: 120, base: 220, slow: 360 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.25, 0], smooth: [0.4, 0], bouncy: [0.5, 0.15] },
    light: { background: "#FFFFFF", surface: "#FFFFFF", "surface-raised": "#F7F7F5", border: "#E7E5E0", "text-primary": "#111111", "text-secondary": "#555555", "action-primary": "#B91C1C", "action-secondary": "#F2F0EB", success: "#166534", warning: "#92400E", danger: "#991B1B", info: "#1E40AF", focus: "#111111" },
    dark: { background: "#0F0F0F", surface: "#171717", "surface-raised": "#1F1F1F", border: "#333333", "text-primary": "#F5F5F2", "text-secondary": "#A8A8A3", "action-primary": "#F87171", "action-secondary": "#262626", success: "#86EFAC", warning: "#FCD34D", danger: "#FCA5A5", info: "#93C5FD", focus: "#F5F5F2" },
  },
  {
    id: "bold", title: "Bold", words: ["loud", "decisive", "high-contrast", "modern"],
    bestFor: "marketing sites, launches, sports and media", avoidFor: "calm reading experiences and wellness apps",
    motionNote: "fast and punchy",
    fonts: { body: ["Inter", "system-ui", "sans-serif"], display: ["Archivo", "Inter", "system-ui", "sans-serif"] },
    sizes: { display: 52, title: 32, heading: 22, body: 16, label: 14, caption: 12 },
    radius: { sm: 6, md: 10, lg: 16 }, durations: { fast: 100, base: 180, slow: 300 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.2, 0], smooth: [0.35, 0.1], bouncy: [0.45, 0.3] },
    light: { background: "#FFFFFF", surface: "#F8FAFC", "surface-raised": "#FFFFFF", border: "#CBD5E1", "text-primary": "#0F172A", "text-secondary": "#334155", "action-primary": "#2563EB", "action-secondary": "#0F172A", success: "#15803D", warning: "#C2410C", danger: "#B91C1C", info: "#1D4ED8", focus: "#2563EB" },
    dark: { background: "#020617", surface: "#0F172A", "surface-raised": "#1E293B", border: "#334155", "text-primary": "#F8FAFC", "text-secondary": "#CBD5E1", "action-primary": "#60A5FA", "action-secondary": "#F8FAFC", success: "#4ADE80", warning: "#FB923C", danger: "#F87171", info: "#93C5FD", focus: "#60A5FA" },
  },
  {
    id: "dark-tech", title: "Dark Tech", words: ["technical", "sleek", "focused", "futuristic"],
    bestFor: "developer tools, AI products, analytics and crypto", avoidFor: "family, food and lifestyle apps",
    motionNote: "crisp and snappy",
    fonts: { body: ["IBM Plex Sans", "system-ui", "sans-serif"], display: ["Space Grotesk", "IBM Plex Sans", "system-ui", "sans-serif"] },
    sizes: { display: 40, title: 28, heading: 20, body: 15, label: 13, caption: 12 },
    radius: { sm: 4, md: 6, lg: 10 }, durations: { fast: 90, base: 160, slow: 260 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.2, 0], smooth: [0.3, 0.05], bouncy: [0.4, 0.2] },
    light: { background: "#F4F6F8", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D5DCE3", "text-primary": "#0B1220", "text-secondary": "#475467", "action-primary": "#0E7490", "action-secondary": "#E4E9EE", success: "#047857", warning: "#B45309", danger: "#B42318", info: "#175CD3", focus: "#0E7490" },
    dark: { background: "#05080D", surface: "#0B1018", "surface-raised": "#121925", border: "#1F2A3A", "text-primary": "#E6F1FF", "text-secondary": "#8FA3BF", "action-primary": "#22D3EE", "action-secondary": "#121925", success: "#34D399", warning: "#FBBF24", danger: "#F87171", info: "#60A5FA", focus: "#22D3EE" },
  },
  {
    id: "warm", title: "Warm", words: ["earthy", "welcoming", "crafted", "natural"],
    bestFor: "food, hospitality, travel, home and handmade goods", avoidFor: "enterprise software and developer tools",
    motionNote: "relaxed and soft",
    fonts: { body: ["DM Sans", "system-ui", "sans-serif"], display: ["Fraunces", "Georgia", "serif"] },
    sizes: { display: 42, title: 30, heading: 21, body: 16, label: 14, caption: 12 },
    radius: { sm: 6, md: 12, lg: 20 }, durations: { fast: 150, base: 250, slow: 380 }, easing: [0.25, 0.1, 0.25, 1],
    springs: { snappy: [0.3, 0], smooth: [0.45, 0.12], bouncy: [0.55, 0.3] },
    light: { background: "#FBF6EF", surface: "#FFFDF9", "surface-raised": "#FFFFFF", border: "#E8DCCB", "text-primary": "#2A1F17", "text-secondary": "#6B5544", "action-primary": "#B4441C", "action-secondary": "#F1E4D3", success: "#3F6212", warning: "#92400E", danger: "#9F1239", info: "#1E40AF", focus: "#B4441C" },
    dark: { background: "#17110C", surface: "#211912", "surface-raised": "#2B2118", border: "#3D3024", "text-primary": "#F8EEE3", "text-secondary": "#C9B6A2", "action-primary": "#F4A27C", "action-secondary": "#2B2118", success: "#A3E635", warning: "#FCD34D", danger: "#FDA4AF", info: "#93C5FD", focus: "#F4A27C" },
  },
  {
    id: "trust", title: "Trust", words: ["reliable", "clear", "professional", "reassuring"],
    bestFor: "banking, insurance, healthcare and government services", avoidFor: "games and playful social apps",
    motionNote: "calm and predictable",
    fonts: { body: ["Source Sans 3", "Segoe UI", "system-ui", "sans-serif"], display: ["Source Sans 3", "Segoe UI", "system-ui", "sans-serif"] },
    sizes: { display: 38, title: 28, heading: 20, body: 16, label: 14, caption: 12 },
    radius: { sm: 6, md: 8, lg: 12 }, durations: { fast: 120, base: 200, slow: 300 }, easing: [0.2, 0, 0, 1],
    springs: { snappy: [0.25, 0], smooth: [0.4, 0.05], bouncy: [0.5, 0.2] },
    light: { background: "#F7F9FC", surface: "#FFFFFF", "surface-raised": "#FFFFFF", border: "#D9E1EC", "text-primary": "#0B1F3A", "text-secondary": "#4A5B73", "action-primary": "#0B57D0", "action-secondary": "#E8EEF7", success: "#0F7B3F", warning: "#A15C00", danger: "#B3261E", info: "#0B57D0", focus: "#0B57D0" },
    dark: { background: "#0A1220", surface: "#0F1A2C", "surface-raised": "#16243A", border: "#26364F", "text-primary": "#EAF1FB", "text-secondary": "#A7B6CC", "action-primary": "#8AB4F8", "action-secondary": "#16243A", success: "#6DD58C", warning: "#F9C26B", danger: "#F2B8B5", info: "#8AB4F8", focus: "#8AB4F8" },
  },
];
