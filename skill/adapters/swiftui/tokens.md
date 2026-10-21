# Theme code

What `motif tokens` writes for a SwiftUI app, how to wire it in, how views read it, how the theme's fonts load and how to switch between design variants.

## What `motif tokens` writes

One Swift file: `MotifTheme.swift` in `Design/` inside the app target's folder (`MyApp/Design/MotifTheme.swift`), or in the folder `themeDir` names in `design/motif.json` (see the [README](README.md)). Never edit it; change `design/tokens.json` and run `motif tokens` again. `motif check` reports a hand edit as `generated-edited`. It holds:

| Name | What it is | Use it as |
|---|---|---|
| `.motifTheme()` | The modifier that applies the guide's theme: the accent colour and the design variant | On the root view, inside the `WindowGroup` |
| `@Environment(\.motifColors)` | Every colour role for the colour scheme and the variant here (a `MotifColors`) | `colors.textSecondary` |
| `MotifSpace` | The spacing scale, in points (`CGFloat`) | `MotifSpace.s4` (16) |
| `MotifRadius` | Corner radii, in points | `RoundedRectangle(cornerRadius: MotifRadius.md)` |
| `MotifShadows` | Shadows, as lists of layers | `.motifShadow(MotifShadows.md)` |
| `MotifType` | The type roles: font, line spacing and letter spacing, with the Arabic companion | `.motifFont(.body)` |
| `MotifDurations`, `MotifCurves`, `MotifSprings` | The motion roles ([motion](motion.md)) | `MotifSprings.snappy` |
| `MotifMotion` | The Reduce Motion helper | `MotifMotion.animation(MotifCurves.standard, reduceMotion: reduceMotion)` |
| `MotifVariant` | The design variants, when the guide has them | `.motifTheme(variant: .men)` |

Names are the guide's roles in lowerCamelCase (`text-secondary` is `textSecondary`). A spacing step starts with `s` (`4` is `s4`, `0-5` is `s0p5`). A name Swift reserves, or one the type already uses, gets `Value` added. The file lists exactly the roles the guide has: read it when unsure which exist; don't guess one.

Besides the file, `motif tokens` may copy the guide's font files into the target's `Fonts/` folder ([fonts](#fonts)). It never edits the Xcode project, `Info.plist` or the asset catalogues: what they need, it prints as one step for the developer.

## Wiring it in

Apply the theme once, to the root view inside the `App`'s `WindowGroup`:

```swift
import SwiftUI

@main
struct MyAppApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .motifTheme()
        }
    }
}
```

`.motifTheme()` is a view modifier, so it goes on the root view inside the `WindowGroup`; a scene has none. What the app gives its scene (`.environment(store)`, `.modelContainer(container)`) reaches the views as usual, and Motif's screenshots give it to the root view too. Two things don't reach the screenshots: SwiftData's `.modelContainer(for:)` on the scene (the run's note says so: make the container yourself and pass `.modelContainer(container)`, or give it inside the `WindowGroup`), and what the `App` sets up in its `init` or `.onAppear` (do that in `design/states/Setup.swift`, [checks](checks.md#the-setup-file)). In a project made before Xcode 16, add `MotifTheme.swift` to the app target first, as `motif tokens` says.

Add `.motifTheme()` to each `#Preview` too, so Xcode's canvas shows the guide's look. Motif's screenshots add it themselves.

`.motifTheme()` sets the views' tint from the guide's `actionPrimary`, so buttons, toggles, links and pickers take the guide's colour. Motif doesn't change the asset catalogue: a view outside `.motifTheme()` still shows its `AccentColor` (the system blue in a new project). The colours follow the system's appearance, light or dark, by themselves; never force one with `.preferredColorScheme` unless the guide asks for it.

## Reading theme values in views

Views read the colours from the environment. `colors` follows light, dark and the variant by itself, so a view never asks which one it is in:

```swift
import SwiftUI

struct PriceTag: View {
    let label: String
    @Environment(\.motifColors) private var colors

    var body: some View {
        Text(label)
            .motifFont(.label)
            .foregroundStyle(colors.textPrimary)
            .padding(.horizontal, MotifSpace.s3)
            .padding(.vertical, MotifSpace.s1)
            .background(colors.surfaceRaised, in: RoundedRectangle(cornerRadius: MotifRadius.md))
            .motifShadow(MotifShadows.sm)
    }
}
```

- Colours: only roles, paired as the guide pairs them (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). No `Color(red:…)`, `Color.white` or `.foregroundStyle(.blue)`, and not SwiftUI's own `.primary`, `.secondary` or `Color(.systemBackground)` either: they are Apple's colours, not the guide's.
- Sizes: `MotifSpace.sN` for padding and `spacing:`; `MotifRadius` for corners. Sizes that aren't spacing (an avatar's 40-point frame, a 1-point border) can stay numbers.
- Shadows: `.motifShadow(MotifShadows.<role>)` after the background. A card has a border or a shadow, not both.
- Text: `.motifFont(.<role>)` (`display`, `title`, `heading`, `body`, `label`, `caption`, or whatever the guide names), which sets the font, its line spacing and its letter spacing, scaled with Dynamic Type. Use it first. Where only a `Font` will do (`Text` pieces joined with `+`, say), `MotifType.body.font()`, which sets neither spacing. The roles carry no colour: set it with `.foregroundStyle(colors.<role>)`. Never `.font(.system(size:))` or `Font.custom(…)` yourself.

A role's line spacing is the guide's line height less the font's own line height, which `.motifFont` reads from the font when it draws, so a font with a taller line of its own (many Arabic fonts) gets the line height the guide asks for, unless the guide asks for less than the font's own line: SwiftUI can't tighten lines, so the font's own line is used then. Only a font the app can't load (a Google family it doesn't bundle yet) is taken to be 1.2 times its size, as San Francisco is.

## Text and the Arabic companion

When a role's font list has an **Arabic companion** (the second font), `.motifFont(.<role>)` switches to it whenever the layout is right to left or the locale's language is written in Arabic script (Arabic, Persian, Urdu and the like). Text set with `.motifFont` changes fonts with the language by itself. `MotifType.body.font()` alone always gives the first font; `MotifType.body.font(arabic: true)` gives the companion.

`.motifFont` scales every role with Dynamic Type, relative to the nearest of Apple's text styles, the system font's roles too, and its line spacing and letter spacing with it. `MotifType.body.font()` alone scales a role in a named font, but not one in the system font: another reason to reach for `.motifFont` ([platform rules](platform.md#dynamic-type)).

## Fonts

SwiftUI finds a font by its family name when it draws, so the theme's fonts have to be in the app:

- **Project fonts** (files in the guide's font files): `motif tokens` copies each `.ttf` and `.otf` that isn't already in the target's folder into its `Fonts/` folder, and prints the one step that registers them. For an iOS app that is **Fonts provided by application** (`UIAppFonts`) in the target's **Info** tab, with one item per file, or the same lines in its `Info.plist`; for a Mac app, **Application fonts resource path** (`ATSApplicationFontsPath`) set to `.`. In a project made before Xcode 16 the `Fonts` folder is added to the target too. Motif never edits these files itself: show the developer the exact lines and wait for their go-ahead, or ask them to add them in Xcode. Apple's platforms can't use WOFF2: the guide needs a `.ttf` or `.otf` of the family.
- **Google Fonts:** SwiftUI has no Google Fonts package, so until the app bundles the family the theme draws it in the system font, and `motif tokens` says so. Download its `.ttf` files from fonts.google.com, add them to the guide's font files (the fonts list in `design/tokens.json`) and run `motif tokens` again: they are then project fonts, copied and registered as above. When Motif's screenshots of another stack already downloaded the family, the note gives its files and the exact entry to add. `motif shot` doesn't add Google fonts the app lacks, so the screenshots show what the app shows.
- **An Arabic companion** loads the same way as the first font, and is used by language as above.
- **A Swift package** has no `Info.plist`: `motif tokens` says to add `resources: [.copy("Fonts")]` to the target in `Package.swift` and register each font with `CTFontManagerRegisterFontsForURL` when the app starts.

## Switching variants

When the guide has design variants, `motif tokens` also writes `enum MotifVariant`, a colour set per variant, and a `variant` argument on `.motifTheme`. Each variant's id becomes a case in lowerCamelCase (`partner-store` is `partnerStore`; an id Swift reserves gets `Variant` added, so `default` is `defaultVariant`), and the default variant comes first: the one the guide marks `"default": true`, whatever its id. `motif tokens` names the cases and the default in its output. The examples below use a guide whose variants are `women` (the default) and `men`, as in [the format](../../contract/spec.md#variants); use your guide's own cases. The default is used when you pass nothing: `.motifTheme()` is `.motifTheme(variant: .women)` there. Another is chosen by its case:

```swift
import SwiftUI

struct MenRoot: View {
    var body: some View {
        ContentView()
            .motifTheme(variant: .men)
    }
}
```

To let people change it, keep the choice in `@AppStorage`, which saves it and reads it back before the first frame, so no one sees the default flash before their own variant appears:

```swift
import SwiftUI

@main
struct MyAppApp: App {
    @AppStorage("variant") private var variant = MotifVariant.women.rawValue

    var body: some Scene {
        WindowGroup {
            ContentView()
                .motifTheme(variant: MotifVariant(rawValue: variant) ?? .women)
        }
    }
}

struct LookPicker: View {
    @AppStorage("variant") private var variant = MotifVariant.women.rawValue

    var body: some View {
        Picker("Look", selection: $variant) {
            Text("Women").tag(MotifVariant.women.rawValue)
            Text("Men").tag(MotifVariant.men.rawValue)
        }
    }
}
```

Views don't need to know the variant: `colors` follows it. A view that must (to show which one is chosen) reads `@Environment(\.motifVariant)`. Offer the choice as [the variants guide](../../knowledge/variants.md) says: a neutral label for each variant, easy to change.

- **Variants change colours only on SwiftUI.** The theme code gives each variant its own colours; fonts, corners, spacing and motion stay the default's. When a variant changes any of those, `motif tokens` says so in its output. Tell the developer once, and keep SwiftUI variants to colours.
- `MotifTheme.debugVariantOverride` is set by `motif shot` to draw each variant. Leave it `nil` in the app.
- `motif shot` draws every variant through `.motifTheme`, also for an app that passes its own `variant`. An app that switches its own palettes (not through `.motifTheme`) is shot through `design/states/Setup.swift`, which is told the variant ([checks](checks.md#the-setup-file)).
