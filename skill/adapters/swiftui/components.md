# Components

How to build views in a SwiftUI app the Motif way: where they live, how to write one, every state it needs, and the starter set. Every example uses only theme values ([theme code](tokens.md)).

## Where views live

Inside the app target's folder (`MyApp/`):

- `Components/`: views used by more than one feature. One view per file, named after it (`AppButton.swift` holds `AppButton`, and its `AppButtonStyle`).
- `Features/<Feature>/`: a feature's screens, the views only it uses, and its model (`Features/Orders/OrdersScreen.swift`, `Features/Orders/OrderRow.swift`). Move a view to `Components/` the moment a second feature needs it.

**The rule: `private` views are parts of a screen, not components.** A `private struct Header: View` that one file uses to keep its screen readable can stay private and doesn't count as part of the design system. When a second place wants it, take `private` off, give it a file in `Components/`, and give it every state below. This is also how the component list is found: the `feature` mode lists the views that aren't private in `Components/` and the feature folders, and compares them with section 5 of `DESIGN.md`. Reuse before you build, and extend a view with a new option before you create another.

## Building a view

1. Start from SwiftUI's own control for the job (`Button`, `Toggle`, `TextField`, `Picker`, `NavigationLink`), so VoiceOver, Dynamic Type, the keyboard and the pointer come built in. `.motifTheme()` already gives it the guide's accent colour.
2. Values in, actions out: a view takes `let title: String`, a `@Binding var isOn: Bool` for a value it changes, and `let action: () -> Void` for what happens. The screen (its `@State`, or an `@Observable` model) owns the state; the component only shows it. This keeps every state reachable from a `#Preview` and from Motif's screenshots.
3. Change how a control looks with a style (`ButtonStyle`, `ToggleStyle`, `LabelStyle`), not by rebuilding it from shapes and `.onTapGesture`. Add options the design uses (`kind`, `isLoading`), not a parameter per colour.
4. Give it every state, a name VoiceOver can say, and a target of at least 44 by 44 points where people tap it.

## Every state

A component handles all of these that apply:

| State | How SwiftUI says it | Notes |
|---|---|---|
| Default | | |
| Pressed | `configuration.isPressed` in a `ButtonStyle` | Show it in the first frame of the touch. |
| Focused | `@FocusState` for fields; the system's focus ring for buttons | Keyboards on iPad and the Mac, and Full Keyboard Access. Never remove the ring (`.focusEffectDisabled()`). |
| Hovered | `.hoverEffect()`, or `.onHover { }` on the Mac | The pointer on iPad and the Mac. Never the only way to see something. |
| Disabled | `.disabled(true)`; inside a style, `@Environment(\.isEnabled)` | Still readable; say why in nearby text when it isn't obvious. |
| Loading | (your own flag) | Keep the size and the name; ignore taps. |
| Error | Text and an icon below the field | Not colour alone. |

Here is a button with them. The style draws the pressed and disabled looks and keeps a 44-point height; the button keeps its size and its name while it loads:

```swift
import SwiftUI

struct AppButtonStyle: ButtonStyle {
    var isLoading = false
    @Environment(\.motifColors) private var colors
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        // Loading ignores taps but keeps the primary colours.
        let active = isEnabled || isLoading
        configuration.label
            .motifFont(.label)
            .foregroundStyle(active ? colors.onActionPrimary : colors.onActionSecondary)
            .padding(.horizontal, MotifSpace.s6)
            .frame(minWidth: 44, minHeight: 44)
            .background(active ? colors.actionPrimary : colors.actionSecondary, in: RoundedRectangle(cornerRadius: MotifRadius.md))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .contentShape(Rectangle())
    }
}

struct AppButton: View {
    let title: String
    var isLoading = false
    let action: () -> Void
    @Environment(\.motifColors) private var colors

    var body: some View {
        Button(action: action) {
            // The title stays in the layout while the spinner shows, so the button keeps its size.
            ZStack {
                Text(title).opacity(isLoading ? 0 : 1)
                if isLoading {
                    ProgressView().tint(colors.onActionPrimary)
                }
            }
        }
        .buttonStyle(AppButtonStyle(isLoading: isLoading))
        .disabled(isLoading)
        .accessibilityLabel(title)
    }
}
```

The disabled look is `onActionSecondary` on `actionSecondary`, a pair the guide checks for contrast, so a disabled button stays readable. Where the design is happy with Apple's buttons, `.buttonStyle(.borderedProminent)` with the theme's tint is a fine primary button: it already has every state and Apple's size.

## Names and touch targets

Every control has a name VoiceOver can say. Text inside a control is its name. A button that shows only an SF Symbol needs one: SwiftUI names the symbol itself ("Gear Shape"), which says what it looks like, not what it does. Give it `.accessibilityLabel`, or use a `Label`, which names the button with its title and can show the icon alone:

```swift
import SwiftUI

struct CloseButton: View {
    let action: () -> Void
    @Environment(\.motifColors) private var colors

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .foregroundStyle(colors.textSecondary)
                // Inside the label: a frame outside the Button doesn't grow what can be tapped.
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
    }
}

struct SettingsButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Settings", systemImage: "gearshape")
                .labelStyle(.iconOnly)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
    }
}
```

Apple's minimum is 44 by 44 points. A button in a system style (`.bordered`, `.borderedProminent`), a `Toggle`, a `TextField` and a `Picker` already have it. A plain or borderless button, a `Link` and an icon are as small as what they show: give the label `.frame(minWidth: 44, minHeight: 44)` and `.contentShape(Rectangle())`, so the whole frame takes taps. A view with `.onTapGesture` isn't a button to VoiceOver at all: make it a `Button`.

Something drawn from several pieces (icons, numbers) gets one name:

```swift
import SwiftUI

struct Rating: View {
    let stars: Int
    @Environment(\.motifColors) private var colors

    var body: some View {
        HStack(spacing: MotifSpace.s1) {
            ForEach(0..<5, id: \.self) { index in
                Image(systemName: index < stars ? "star.fill" : "star")
                    .foregroundStyle(index < stars ? colors.actionPrimary : colors.border)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rated \(stars) out of 5")
    }
}
```

`.accessibilityElement(children: .combine)` instead keeps the pieces' own words and reads them as one stop, which suits a row of an icon and its text. A picture that only decorates gets `.accessibilityHidden(true)` (or `Image(decorative:)`); one that carries meaning (an avatar, a product photo) gets a label.

A card that opens something is a `Button` (or a `NavigationLink`) with a style of its own, so it has the button's name, focus and press:

```swift
import SwiftUI

struct CardButtonStyle: ButtonStyle {
    @Environment(\.motifColors) private var colors

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(MotifSpace.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(colors.textPrimary)
            .background(colors.surfaceRaised, in: RoundedRectangle(cornerRadius: MotifRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: MotifRadius.lg)
                    .strokeBorder(configuration.isPressed ? colors.textSecondary : colors.border)
            )
            .contentShape(Rectangle())
    }
}
```

## A field with its states

Use a `TextField` (or `SecureField`) whose title is the field's name, with the label shown above it, so the name stays when typing starts. Never use the prompt as the only label: it disappears. `@FocusState` knows which field has the keyboard, for the focus border and for moving on. Errors are text with an icon:

```swift
import SwiftUI

struct AppField: View {
    let label: String
    @Binding var text: String
    var helper: String? = nil
    var error: String? = nil
    @FocusState private var focused: Bool
    @Environment(\.motifColors) private var colors

    var body: some View {
        VStack(alignment: .leading, spacing: MotifSpace.s1) {
            // The field says its own name, so VoiceOver doesn't read the label twice.
            Text(label)
                .motifFont(.label)
                .foregroundStyle(colors.textSecondary)
                .accessibilityHidden(true)
            TextField(label, text: $text)
                .motifFont(.body)
                .foregroundStyle(colors.textPrimary)
                .focused($focused)
                .padding(MotifSpace.s3)
                .background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: MotifRadius.md)
                        .strokeBorder(error != nil ? colors.danger : focused ? colors.focus : colors.border, lineWidth: focused ? 2 : 1)
                )
            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .motifFont(.caption)
                    .foregroundStyle(colors.danger)
            } else if let helper {
                Text(helper)
                    .motifFont(.caption)
                    .foregroundStyle(colors.textSecondary)
            }
        }
    }
}
```

In a form, give the screen a `@FocusState` over an enum of its fields, and move it on `.onSubmit`, so Return goes to the next field.

## The starter set

For a new app, build these, each with the states above and the options its screens use. Start from what the middle column names:

| Component | Starts from | Notes |
|---|---|---|
| `Button` | `Button` with `AppButtonStyle`, or `.borderedProminent` | One view with `kind` (primary, secondary, quiet) and `isLoading`. |
| `IconButton` | `Button` with a `Label` and `.labelStyle(.iconOnly)` | Its title is its name; a 44-point frame on the label. |
| `Field` | `TextField`, `SecureField` | Label, helper, error; a password field also has a show/hide button with a label. |
| `Checkbox` | `Toggle` with a `ToggleStyle` of your own (`.toggleStyle(.checkbox)` on the Mac) | iOS has no checkbox: the whole row is the toggle, and its title is its name. |
| `Switch` | `Toggle("Notifications", isOn: $on)` | The title is the name, at the leading side. |
| `Card` | `Button` or `NavigationLink` with `CardButtonStyle` | Above; `surfaceRaised` with a border or a shadow, not both. |
| `ListItem` | A row of `List`, `LabeledContent` | Title, detail, leading icon; a `NavigationLink` row shows the chevron. |
| `TopBar` | `.navigationTitle` and `.toolbar` in a `NavigationStack` | The system's back button ([platform](platform.md#ios-and-the-mac)); toolbar buttons with labels. |
| `TabBar` | `TabView` | Three to five places, each with an icon and a title. |
| `Sidebar` | `NavigationSplitView` | For iPad and the Mac; an iPhone uses the tab bar. |
| `Sheet` | `.sheet` with `.presentationDetents` | A close button with a label. |
| `Dialog` | `.alert` or `.confirmationDialog` | Buttons named by what they do ("Delete order"), with `role: .destructive` where it fits, not "OK". |
| `Toast` | A view in an `.overlay(alignment: .bottom)` | Short, with an action when there is one; announce it with `AccessibilityNotification.Announcement`. |
| `Skeleton` | A `RoundedRectangle` in `border` | Pulses, and stays still under Reduce Motion ([motion](motion.md#skeletons)). |
| `EmptyState` | `ContentUnavailableView` | An icon, one line of why, one action. |
| `ErrorState` | `ContentUnavailableView` with a retry button | What went wrong in plain words. |
| `Avatar` | Initials or a picture in a `Circle` clip | The person's name as its label. |
| `Badge` | `.badge(_:)` on a tab or a list row | A count; its number is part of its owner's name. |

System controls take the theme's tint, so they need no colours of their own. Pass colours only where the design guide asks for something else, and then from `colors`.

## A screen's states

A screen that shows data has a branch for loading, empty and error, besides the data itself. Mock data loads at once and is never empty, so write the branches anyway. Loading shows skeleton rows in the final layout (`Skeleton` is in [motion](motion.md#skeletons)), as [the empty, loading and error pattern](../../knowledge/ux-patterns/empty-loading-error.md) asks; a spinner is only for a small wait inside a control:

```swift
import SwiftUI

enum OrdersState {
    case loading
    case loaded([String])
    case failed
}

struct OrdersBody: View {
    let state: OrdersState
    let retry: () -> Void

    var body: some View {
        switch state {
        case .failed:
            ContentUnavailableView {
                Label("We couldn't load your orders", systemImage: "exclamationmark.triangle")
            } actions: {
                AppButton(title: "Try again", action: retry)
            }
        case .loading:
            VStack(spacing: MotifSpace.s3) {
                ForEach(0..<4, id: \.self) { _ in
                    Skeleton().frame(height: MotifSpace.s12)
                }
            }
            .padding(MotifSpace.s4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading orders")
        case .loaded(let orders) where orders.isEmpty:
            ContentUnavailableView("No orders yet", systemImage: "bag")
        case .loaded(let orders):
            List(orders, id: \.self) { title in
                Text(title).motifFont(.body)
            }
        }
    }
}
```

Use mock data from one clearly named file (`MockData.swift`), never a back end.

## Mockups

`motif preview` works the same on every stack: write the mockup in HTML with [the preview kit](../../preview-kit/README.md) in a phone frame (`mk-phone` with `mk-ios`; `mk-browser` for a Mac app's window), and build the SwiftUI screen to match it. `motif shot --against` puts them side by side.
