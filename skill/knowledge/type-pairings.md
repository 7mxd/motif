# Type pairings

Fonts are one of the first things that make a site look generated: most sites built by coding agents use the same handful. This guide lists checked pairings by mood, each with a text font, a heading font and an Arabic companion, and the fonts and colour looks to leave out unless the developer asks for them.

## How to use it

- In init's directions, give each direction a different pairing from the mood that fits the brief, and say in one line why it suits the brand.
- When the app may show Arabic (an Arabic-speaking audience, Arabic names, or text people type), put the Arabic companion second in both font lists, such as `["Onest", "Readex Pro", "system-ui", "sans-serif"]`. Arabic letters use it and Latin letters keep the main font. Apps download it only when a page shows Arabic text. The starting styles all have one; take it out for an app that never will.
- The developer's own fonts (a brand font, a font they name) always come first.
- Mockups load fonts outside the starting styles from Google Fonts. Apps load every font with its Fontsource package, as the stack guide's Fonts section says.

## Overused: leave these out unless asked

**Fonts:** Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Space Grotesk, DM Sans, Manrope, Outfit, Plus Jakarta Sans, Geist, IBM Plex Sans, Bricolage Grotesque, Syne, Fraunces, Playfair Display, Instrument Serif, Instrument Sans, Newsreader, Crimson Pro, Lora, Cormorant and DM Serif. Also a monospace font for labels and headings when the product isn't a code tool.

**Colour looks:** purple or indigo accents and purple-to-blue gradients; a cream background with a terracotta accent and serif headings; near-black with one neon cyan or green accent; Tailwind's default colours used as they are, such as blue-600 buttons on slate or zinc greys.

These are fine when the developer asks for them or the brand already uses them. Otherwise they make a product look like a template before anyone reads a word.

## Pairings by mood

### Calm and precise (tools, dashboards, developer products)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Onest | Onest | Readex Pro | Open shapes and tabular figures. The Minimal style's pair. It has no italic, so avoid long italic passages. |
| Hanken Grotesk | Hanken Grotesk | Mada | A quiet grotesk with true italics. |
| Libre Franklin | Libre Franklin | Readex Pro | A classic American gothic, firm at small sizes. |

### Loud and modern (marketing, launches, sports, media)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Zalando Sans | Zalando Sans Expanded | Alexandria | Wide headlines from the same family. The Bold style's pair. Latin letters only: no Cyrillic or Greek. |
| Archivo | Archivo | Beiruti | A compact, punchy grotesk with heavy weights for big headlines. |
| Libre Franklin | Big Shoulders | Alexandria | Tall, condensed headlines for sports and posters. |

### Technical (developer tools, AI products, analytics)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Geologica | TASA Orbiter | Changa | Even texture at small sizes, and a futuristic heading without game-screen clichés. The Dark Tech style's pair. |
| Funnel Sans | Funnel Display | Kufam | Engineered shapes with a distinct display cut. |
| Golos Text | Golos Text | Changa | Neutral and very legible in dense tables, with Cyrillic. |

### Earthy and crafted (food, hospitality, travel, handmade goods)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Merriweather Sans | Vollkorn | El Messiri | A large, open text font with true italics under a warm book serif. The Warm style's pair. Vollkorn's figures are old-style by default: use lining figures for prices. |
| Commissioner | Besley | Markazi Text | A friendly grotesk under a sturdy, inky serif. |

### Literary (publishing, long reads, portfolios)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Source Serif 4 | Noto Serif Display | Markazi Text | A reading serif under a refined, high-contrast display serif. The Editorial style's pair. |
| Source Serif 4 | Eczar | Markazi Text | Livelier, more confident headings (no Cyrillic). |
| Literata | Literata | Noto Naskh Arabic | A reading face made for e-books, with a classic Naskh. |

### Reassuring (banking, insurance, healthcare, government)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Public Sans | Public Sans | Mada | Made for government services; its tailed l keeps I, l and 1 apart in account numbers. The Trust style's pair. Latin letters only. |
| Atkinson Hyperlegible Next | Atkinson Hyperlegible Next | Mada | Made for readers with low vision: every letter is distinct. |
| Source Sans 3 | Source Sans 3 | Readex Pro | When Cyrillic or Greek is needed. Common in generated sites, so give it a palette of its own. |

### Gentle (wellness, journaling, community)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Nunito | Nunito | Rubik | Rounded and friendly. The Soft style's pair. It has no tabular figures, so avoid it in tables of numbers. |
| Lexend | Lexend | Readex Pro | Made for easy reading; Readex Pro is its Arabic sibling. |
| Rubik | Rubik | None needed | Soft corners, and Rubik itself covers Latin and Arabic. |

### Playful (games, learning, kids, social)

| Text | Headings | Arabic | Why |
|---|---|---|---|
| Nunito | Fredoka | Baloo Bhaijaan 2 | Round, bouncy headings. The Playful style's pair. |
| Gabarito | Gabarito | Lemonada | A bouncy geometric with heavy weights. |
| Baloo 2 | Baloo 2 | Baloo Bhaijaan 2 | One design across Latin and Arabic. |

## Checking a pairing

- Both fonts have the weights the type roles use: 400, 500, 600 and 700.
- Numbers in tables, prices and timers use tabular, lining figures: `font-variant-numeric: tabular-nums lining-nums`.
- Text stays readable at 14–16 px: a tall x-height, open shapes, and I, l and 1 easy to tell apart.
- It covers the scripts the app needs: Cyrillic, Greek, Vietnamese, Arabic.
- Fontsource has it (`fontsource.org/fonts/<name>`), so the app can serve it itself.
