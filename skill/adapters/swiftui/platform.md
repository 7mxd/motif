# Platform rules

What to get right on every SwiftUI app: Apple's conventions on iPhone, iPad and the Mac, safe areas, right-to-left languages, Dynamic Type, layouts for each size, and accessibility. Where the app differs between platforms or apps on purpose, write it in `DESIGN.md` section 8, the platform notes.

## iOS and the Mac

The app should feel at home on Apple's platforms: **Apple's Human Interface Guidelines**, with the guide's look. SwiftUI's own views already follow them: the back button and the swipe back in a `NavigationStack`, large titles, sheets, alerts, menus, swipe actions on list rows, and text selection. Keep them, and add:

- **Navigation**: a `NavigationStack` with the system's back button; never hide it to draw your own. A `TabView` for three to five top-level places on iPhone, and a `NavigationSplitView` with a sidebar on iPad and the Mac.
- **Sheets, alerts and menus**: `.sheet` (with `.presentationDetents` for a half-height one), `.alert`, `.confirmationDialog` and `Menu`, as the system draws them.
- **Touch targets**: at least 44 by 44 points, Apple's size. System controls have it; Motif's audit reports smaller ones on phones and tablets ([checks](checks.md#target-size)).
- **Type**: the guide's fonts through `.motifFont`, not San Francisco on top of them.
- **Haptics**: `.sensoryFeedback(.success, trigger: saved)` when something finishes or a toggle changes; never on every tap.

**The Mac** is used with a pointer and a keyboard: controls are smaller and need hover states, menus belong in the menu bar (`.commands`), frequent actions get `.keyboardShortcut`, and settings go in a `Settings` scene. Windows resize, so the layout works from the 900-point window up ([checks](checks.md#a-macos-app)).

`motif shot` draws an iOS app in an iOS simulator, at the phone and tablet sizes, on the version of iOS your Xcode builds for. The tablet size is drawn on the phone simulator with the regular size class: decide layouts by size class or width, not by `UIDevice.current.userInterfaceIdiom`, which says phone there. Check on a device when something depends on the hardware (the camera, Face ID).

## Safe areas

SwiftUI keeps content clear of the status bar, the Dynamic Island and the home indicator by itself, and a `.background(colors.background)` already reaches the screen's edges. So:

- Never put `.ignoresSafeArea()` on content with text or buttons; only on a background or a full-bleed picture.
- A bar you add at the bottom or top goes in `.safeAreaInset(edge:)`, so the scrolling content above it stops short of it instead of hiding under it.
- A form scrolls (`ScrollView`, or a `Form`), so the field being typed in stays above the keyboard; `.scrollDismissesKeyboard(.interactively)` lets people put the keyboard away.

```swift
import SwiftUI

struct CheckoutScreen: View {
    @Environment(\.motifColors) private var colors

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MotifSpace.s4) {
                Text("Your order").motifFont(.title)
            }
            .padding(MotifSpace.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(colors.background)
        .safeAreaInset(edge: .bottom) {
            AppButton(title: "Pay") {}
                .padding(MotifSpace.s4)
                .frame(maxWidth: .infinity)
                .background(colors.surface)
        }
    }
}
```

`motif shot` gives phone screenshots a 47-point safe area at the top and 34 at the bottom, so content that ignores the safe area shows under where the status bar and the home indicator would be. The status bar itself isn't drawn. The tablet and the Mac's windows have none.

## Right to left

Arabic and Hebrew read right to left. SwiftUI mirrors a screen by itself when the app's language is one of them, as long as the layout is written in terms of *leading* and *trailing*, which SwiftUI's own words already are (`.padding(.leading)`, `alignment: .leading`, `HStack`'s order). What doesn't mirror:

| Instead of | Use |
|---|---|
| `Image(systemName: "chevron.right")` | `Image(systemName: "chevron.forward")` |
| `Image(systemName: "arrow.left")` | `Image(systemName: "arrow.backward")` |
| A picture of your own that points | `.flipsForRightToLeftLayoutDirection(true)` on it |
| `.offset(x: 8)` | `.padding(.leading, MotifSpace.s2)` |
| `.position(x: …)`, a `Path` or a `Canvas` | Draw it the other way when `@Environment(\.layoutDirection)` is `.rightToLeft` |

```swift
import SwiftUI

struct TotalRow: View {
    let amount: String

    var body: some View {
        HStack(spacing: MotifSpace.s2) {
            Text("Total")
                .motifFont(.label)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(amount).motifFont(.body)
            Image(systemName: "chevron.forward")
                .accessibilityHidden(true)
        }
        .padding(.leading, MotifSpace.s4)
        .padding(.trailing, MotifSpace.s2)
    }
}

#Preview("Total, Arabic") {
    TotalRow(amount: "١٢٫٥٠")
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, Locale(identifier: "ar"))
        .motifTheme()
}
```

- `.environment(\.layoutDirection, .rightToLeft)` with an Arabic `\.locale` is how a preview shows the screen right to left. Don't set them on the app: the system sets both from the language.
- Numbers, phone numbers and Latin names inside Arabic text keep their own direction; the system handles it, so don't reverse strings by hand.
- The Arabic font comes from the theme's fonts, chosen by language ([theme code](tokens.md#text-and-the-arabic-companion)).
- Check it with `motif shot --rtl` ([checks](checks.md#right-to-left)).

## Languages

Text goes in the string catalogue, `Localizable.xcstrings`, never in code as the only copy: `Text("Total")` is looked up in it by itself, and `String(localized: "Total")` does the same outside a `Text`. Add Arabic in the project's **Info › Localizations**, then translate in the catalogue. iOS picks the language from the device, and offers a choice per app in Settings once the app has more than one. Without Arabic in the catalogue, an Arabic device gets the default strings (still laid out right to left), and `motif shot --rtl` says so.

## Dynamic Type

Text grows when people raise the text size, past 300 percent at the accessibility sizes. The theme's roles in a named font scale with it. A role in the system font keeps its size: when the guide's fonts are the system font, the theme's text doesn't follow Dynamic Type, so tell the developer once. Either way:

- Don't give text a fixed height or a fixed-size container, and let it wrap; where it can't, end it with `.lineLimit(2)`, not by cutting it off.
- A row of text and a value that no longer fits side by side becomes a column at the accessibility sizes.
- Check the screens at the largest size with `.dynamicTypeSize(.accessibility3)` in a preview: nothing is cut off, overlaps or becomes untappable. `motif shot` draws at the default size.

```swift
import SwiftUI

struct PriceRow: View {
    let title: String
    let price: String
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        let layout = size.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: MotifSpace.s1))
            : AnyLayout(HStackLayout(spacing: MotifSpace.s2))
        layout {
            Text(title)
                .motifFont(.body)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(price).motifFont(.label)
        }
    }
}
```

## iPhone, iPad and the Mac

`motif shot` draws three phone widths (360, 390 and 430 points) and a tablet (768) for an iOS app, and two windows for a Mac app (1440 by 900 and 900 by 700). Lay out from the space the screen gets, with the size class (`@Environment(\.horizontalSizeClass)`, regular from 600 points wide in the screenshots):

```swift
import SwiftUI

enum Place: String, CaseIterable, Identifiable {
    case home = "Home"
    case settings = "Settings"
    var id: Self { self }
    var icon: String { self == .home ? "house" : "gearshape" }
}

struct AppShell: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var selected: Place? = .home

    var body: some View {
        if sizeClass == .regular {
            NavigationSplitView {
                List(Place.allCases, selection: $selected) { place in
                    Label(place.rawValue, systemImage: place.icon)
                }
            } detail: {
                Text(selected?.rawValue ?? "").motifFont(.title)
            }
        } else {
            TabView {
                ForEach(Place.allCases) { place in
                    NavigationStack {
                        Text(place.rawValue).motifFont(.title)
                    }
                    .tabItem { Label(place.rawValue, systemImage: place.icon) }
                }
            }
        }
    }
}
```

The phone's tab bar becomes a sidebar on the tablet and the Mac. A single column of content that stretches across a wide window gets a maximum width (`.frame(maxWidth: 640)`), not wider lines.

## Accessibility

- Names: [components](components.md#names-and-touch-targets). Every control has one, and `motif shot --audit` reports ones without ([checks](checks.md#names)).
- `.accessibilityElement(children: .combine)` makes a row of an icon and its text one stop; `.accessibilityHidden(true)` hides decoration; `.accessibilityAddTraits(.isHeader)` marks a section's title, so VoiceOver users can jump between them.
- Colour is never the only signal: an error has text, a selected tab has a filled icon or a weight change too.
- Contrast is the guide's job and the audit's ([checks](checks.md#contrast)); use the text role the guide pairs with the surface.
- Reduce Motion: [motion](motion.md#reduced-motion).
- Dark mode follows the system: the theme's colours read `\.colorScheme`. Never force a scheme.
