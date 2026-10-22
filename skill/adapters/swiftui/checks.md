# Checks and screenshots

What `motif check` and `motif shot --audit` report in a SwiftUI app, how to fix each finding, and the files that let `motif shot` reach screens behind a tap or a sign-in. `motif check` works on any computer; `motif shot` needs a Mac with Xcode.

`motif check` reads the Swift (`.swift`) of the app. Comments and the insides of strings are not code, so a colour in a comment is fine; code inside `\(…)` in a string is read. Every finding names the file, line and column. These aren't read: `build/`, `DerivedData/`, `.build/`, `.motif/`, test targets' folders (`…Tests/`, `…UITests/`), `Pods/`, `Carthage/`, `Package.swift`, `*.generated.swift`, and Motif's own `MotifTheme.swift`.

A value that truly must stay as it is (a colour the user picks, a partner's brand colour) gets a `// motif-ok: <reason>` comment on its line or the line above. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason:

```swift
import SwiftUI

// motif-ok: the partner's brand colour, fixed by their licence
let partnerBlue = Color(red: 0, green: 0.34, blue: 0.72)
```

Each rule below shows what `motif check` reports (the example starting `// Reported as`) and the fix.

## `raw-color`

A colour typed into Swift.

- Example: `Color(red: 0.54, green: 0.54, blue: 0.54)`, `Color(white: 0, opacity: 0.5)`, `Color(hex: "#1A73E8")`, `Color.white`, `.foregroundStyle(.blue)`, `UIColor.systemRed`, `#colorLiteral(…)`.
- Fix: the colour role it stands for, `colors.<role>` from `@Environment(\.motifColors)`. Each finding names the nearest role.
- Not reported, but still not the guide's: SwiftUI's own `.primary`, `.secondary` and `Color.accentColor`, the system's `Color(.systemBackground)`, and the asset catalogue's colours (`Color("Brand")`). Move them to roles too; `motif extract` reads the asset catalogue's colour sets when drafting a guide.
- The app's own palette (an `extension Color` of `static let` colours, an enum of colour constants) is typed colours by nature, so its colours are flagged too, and `motif check` adds one line for the file: `<file> is your own theme's palette: once the app uses Motif's theme, remove it, or list its folder under "ignore" in design/motif.json.` Don't rewrite the palette with Motif's roles: move the views to `colors`, then delete it, or list its folder under `"ignore"` while both themes live side by side.

```swift
// Reported as raw-color: colours typed in.
import SwiftUI

struct TaxNote: View {
    var body: some View {
        Text("Prices include tax")
            .foregroundStyle(Color(red: 0.54, green: 0.54, blue: 0.54))
            .background(.white)
    }
}
```

```swift
import SwiftUI

struct TaxNote: View {
    @Environment(\.motifColors) private var colors

    var body: some View {
        Text("Prices include tax")
            .motifFont(.caption)
            .foregroundStyle(colors.textSecondary)
            .background(colors.surface)
    }
}
```

## `off-scale`

A spacing, corner or text size that isn't on the theme's scales. A number that is on a scale (`.padding(16)`) is seen but allowed, since the build stays correct; still prefer the role, so a change to the guide arrives everywhere.

- Example: `.padding(13)`, `.padding(.horizontal, 18)`, `VStack(spacing: 6)`, `EdgeInsets(top: 18, …)`, `RoundedRectangle(cornerRadius: 10)`, `.cornerRadius(10)`, `.font(.system(size: 15))`.
- Fix: the nearest step, `MotifSpace.s4`, `MotifRadius.md`, or a type role (`.motifFont(.body)`). If the design truly needs a new step, propose a change to the design guide instead. Sizes that aren't spacing (`.frame(width: 40)`, a border's `lineWidth`) aren't read.
- A negative spacing (`.padding(.bottom, -2)`, which pulls a view closer) is reported with its sign ("Spacing -2pt") and judged by its size, as the other stacks judge a negative margin: `-4` is on a scale that has 4. Its fix is the step with a minus, `-MotifSpace.s1`.
- Sizes kept in a constants type (`enum Constants { static let standardPadding: CGFloat = 14 }`, used as `.padding(Constants.standardPadding)`) aren't reported: `motif check` can't see where the views use it. `motif extract` reads such a constant when its name says padding, spacing, inset, gap, margin, radius or corner, as one sample where it is defined. Once the app uses Motif's theme, replace each constant with the theme's role (`.padding(MotifSpace.s4)`, `MotifRadius.md`) at every use, then delete it, so `motif check` sees the sizes and a change to the guide reaches them.

```swift
// Reported as off-scale: a spacing and a corner that aren't the guide's.
import SwiftUI

struct ShippedNote: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("Order shipped")
        }
        .padding(13)
        .background(.background, in: RoundedRectangle(cornerRadius: 10))
    }
}
```

```swift
import SwiftUI

struct ShippedNote: View {
    @Environment(\.motifColors) private var colors

    var body: some View {
        VStack(spacing: MotifSpace.s2) {
            Text("Order shipped").motifFont(.body)
        }
        .padding(MotifSpace.s3)
        .background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.md))
    }
}
```

## `raw-font`

A font family typed into Swift.

- Example: `Font.custom("Lato", size: 16)`, `.font(.custom("Lato", size: 16))`, `UIFont(name: "Lato", size: 16)`.
- Fix: a type role, `.motifFont(.<role>)`, which already has the theme's fonts and their Arabic companion. For a code font, the guide's `font.mono` role; if the theme has none, propose adding it as a design guide change.

```swift
// Reported as raw-font: a family typed in.
import SwiftUI

struct OrderNumber: View {
    let number: String

    var body: some View {
        Text(number).font(.custom("Lato", size: 16))
    }
}
```

```swift
import SwiftUI

struct OrderNumber: View {
    let number: String

    var body: some View {
        Text(number).motifFont(.label)
    }
}
```

## `raw-motion`

A curve, duration or spring typed into an animation.

- Example: `.easeInOut(duration: 0.3)`, `.easeOut`, `.linear`, `.timingCurve(0.4, 0, 0.2, 1)`, `.spring(response: 0.3, dampingFraction: 0.8)`, `.spring(duration: 0.4, bounce: 0.2)`, `.bouncy(duration: 0.5)`, `withAnimation(.default)`.
- Fix: `MotifCurves.<role>`, or `MotifCurves.<role>(over: MotifDurations.<role>)` for another of the guide's durations, and `MotifSprings.<role>` ([motion](motion.md)).
- Not findings: `.spring()` with SwiftUI's own values, `.linear` given to something that isn't an animation (`.progressViewStyle(.linear)`), a `Task.sleep`, and how long a message stays up.

```swift
// Reported as raw-motion: a curve and a duration typed in.
import SwiftUI

struct SavedLabel: View {
    let visible: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Text("Saved")
            .opacity(visible ? 1 : 0)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: visible)
    }
}
```

```swift
import SwiftUI

struct SavedLabel: View {
    let visible: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Text("Saved")
            .motifFont(.label)
            .opacity(visible ? 1 : 0)
            .animation(MotifMotion.animation(MotifCurves.standard, reduceMotion: reduceMotion), value: visible)
    }
}
```

## `reduced-motion`

The app animates (`withAnimation`, `.animation(`, `.repeatForever(`, a phase or keyframe animator, `.matchedGeometryEffect`), but nothing in its own code reads Reduce Motion.

- Fix: read `@Environment(\.accessibilityReduceMotion)` and pass it to `MotifMotion.animation(…, reduceMotion:)`, or skip the animation when it's true ([motion](motion.md#reduced-motion)). Reading `UIAccessibility.isReduceMotionEnabled` counts too. One use anywhere in the app's code satisfies the check; the audit below looks at each screen.

```swift
// Reported as reduced-motion: it animates, and never asks.
import SwiftUI

struct PressScale: View {
    @State private var pressed = false

    var body: some View {
        Text("Add")
            .scaleEffect(pressed ? 0.96 : 1)
            .onTapGesture {
                withAnimation(MotifSprings.snappy) { pressed.toggle() }
            }
    }
}
```

```swift
import SwiftUI

struct PressScale: View {
    @State private var pressed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button("Add") {
            withAnimation(MotifMotion.animation(MotifSprings.snappy, reduceMotion: reduceMotion)) { pressed.toggle() }
        }
        .scaleEffect(pressed ? 0.96 : 1)
    }
}
```

## `generated-edited`

`MotifTheme.swift` was edited by hand, or is out of date.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Contrast

From `motif shot --audit`: text measured as drawn below 4.5:1 (3:1 for large text: 24 points, or 18.66 points bold). Motif reads each text's frame from VoiceOver's view of the screen, and its colours from the screenshot's pixels. An icon in a control is held to 3:1.

- Fix: use the text role the design guide pairs with that surface (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). If a pair itself fails, `motif validate` reports it too, and the role values need changing. A system colour (the default tint, `.secondary`) is replaced with `.foregroundStyle(…)` on the text, or `.tint(…)` on a button or link, from `colors`.
- Not judged: a disabled control, a field's prompt, and text with no letter or digit. Text over a photo or a gradient has no single colour behind it: a note counts those for each screen, so look at them by eye, as with glass, which shows what's under it.

```swift
import SwiftUI

struct DeliveryNote: View {
    @Environment(\.motifColors) private var colors

    var body: some View {
        Text("Delivery times are estimates")
            .motifFont(.caption)
            .foregroundStyle(colors.textSecondary)
    }
}
```

## Target size

From `motif shot --audit`: a control smaller than 44×44 points where people tap it, on the phone and tablet sizes, in light. What the app sizes itself is checked: a plain or borderless `Button` (the default `Button("Greet")` is 43×22), a `Menu`, a `Link`, and a view with a tap gesture that says it's a button. What the system sizes isn't: text fields, toggles, sliders, steppers, pickers, and buttons in a style with a shape (`.bordered`, `.borderedProminent`). A Mac app gets no tap-target check: it's clicked with a pointer.

- Fix: a system style, or `.frame(minWidth: 44, minHeight: 44)` and `.contentShape(Rectangle())` on the label, inside the `Button`: a frame outside it doesn't grow what can be tapped. A link gets `.frame(minHeight: 44)` and `.contentShape(Rectangle())`; a link inside a sentence of `Text` needs none.
- What the audit can't see, so check it by eye: a view with `.onTapGesture` and no button trait (VoiceOver doesn't know it's a control: make it a `Button`), a plain button with a background or a style of its own that draws a shape, and a plain button between about 1.2 times its text plus 12 points and 44 points tall (`.frame(height: 40)`), which it takes for a styled one.

```swift
import SwiftUI

struct RemoveButton: View {
    let remove: () -> Void

    var body: some View {
        Button(action: remove) {
            Image(systemName: "xmark")
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Remove")
    }
}
```

## Names

From `motif shot --audit`: a button, link, toggle, field or slider with no name VoiceOver can say, or one named only by its SF Symbol (SwiftUI calls an unlabelled `gearshape` "Gear Shape", which says what it looks like, not what it does). The finding is reported in the review format under the category `accessibility`, with the control (`Button(gearshape)`, `TextField("Code")`).

- Fix: a visible title (`Label("Settings", systemImage: "gearshape")`, which can show the icon alone), or `.accessibilityLabel("…")`. A field is named by its title or prompt; a `Toggle` and a `Slider` by their title.
- One false finding to know: a control the app really calls by a lowercase word that is also a symbol's name (a button labelled "star") is taken for an unnamed symbol. Use a fuller name ("Add to favourites").

```swift
import SwiftUI

struct NotificationsRow: View {
    @Binding var isOn: Bool

    var body: some View {
        Toggle("Notifications", isOn: $isOn)
            .motifFont(.body)
    }
}
```

## Reduced motion

From `motif shot --audit`: with Reduce Motion on, something on the screen keeps moving. Motif draws the 390-point light screenshot (the 1440 window on the Mac) with the setting on, both for the system (what `UIAccessibility.isReduceMotionEnabled` reads, or the Mac's `NSWorkspace` setting) and for SwiftUI's `accessibilityReduceMotion`. It waits 2 seconds and compares the next frames; only movement counts, not fading. The finding names the view that moves (`View(40×40)` when it has no name). The system's spinner and a field's caret are left out. SwiftUI doesn't stop animations by itself, so what's reported is usually a `.repeatForever(` loop or a `PhaseAnimator`.

- Fix: don't start it, or show its still frame, when `@Environment(\.accessibilityReduceMotion)` is true; `MotifMotion.animation(…, reduceMotion:)` gives no animation then ([motion](motion.md#reduced-motion)).
- When Motif could turn on only SwiftUI's value, the finding says so: an animation that reads the system's setting was drawn with it off, so check that one by eye.

## Screens behind a form or a tap

`motif shot` draws each screen as it first appears. A screen that only appears after someone fills in a form or taps a button needs a **state** (a few lines of Swift that get the screen there), and may need the setup file below. Keep states in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.swift` for each.

A state defines `@MainActor func motifState(_ app: MotifHarness) async throws`. Motif runs it on each screen once the screen has settled, then lets the screen settle again and draws it as the state left it:

```swift
// design/states/sent.swift: the contact screen after the form is sent.
@MainActor func motifState(_ app: MotifHarness) async throws {
    guard app.exists("Email") else { return } // Only the contact screen has the field.
    try await app.type("maya@example.com", into: "Email")
    try await app.tap("Send")
    try await app.waitFor("Thanks, we'll be in touch")
}
```

```bash
motif shot --screen Contact --state design/states/sent.swift
```

`MotifHarness` finds things the way VoiceOver does: by their accessibility label (a button's or a field's title, a text's words, an `.accessibilityLabel`), then their `.accessibilityIdentifier`, then the label in any case.

- `app.tap("Send")` taps it, waiting up to 5 seconds for it to appear (`timeout:` changes that), then lets the screen settle. On the Mac it's a click.
- `app.type("maya@example.com", into: "Email")` types into the field with that name: its title, or on iOS its prompt when it shows one, unless the field has an `.accessibilityLabel` ([components](components.md#a-field-with-its-states)); without `into:`, into the field being edited, else the first.
- `app.waitFor("…")` waits for something to appear; `app.exists("…")` says whether it's there now; `app.wait(1)` lets the screen run for a second; `app.settle()` waits for it to stop changing.
- `app.labels` lists what the screen's elements are called, in VoiceOver's order: when a tap can't find its target, the error lists them too. `app.variant`, `app.locale`, `app.dark` and `app.window` describe the screenshot.

- It runs on every screen `motif shot` draws: start with a guard that returns on the others, or capture only its screen with `--screen`.
- Screenshots are named after the screen and the state (`contact@sent.mobile.png`), each starting from a freshly drawn screen. Use the same `--state` options for `--save` and `--against`.
- A state has 15 seconds. An error it throws is the screen's error ("State "sent": …"), and the screenshot is still taken. A state that runs out of time is stopped, and everything it asks for after that fails.
- States and the setup are compiled into Motif's test of the app, each with `import Foundation` and `@testable import` of the app's module in front, so the app's own types can be used; add `import SwiftUI` when the file needs it. They are compiled together: a top-level helper in one state file is seen by the others, and two with the same name don't compile, so make helpers `private`. A file that doesn't compile is named with the compiler's errors.
- The keyboard isn't drawn: a field's editing ends before the picture, so there is no caret and no keyboard.
- A screen that loads its data later (a `.task`) is drawn once its views stop moving, at most 5 seconds; a change that moves nothing (new text of the same size) can be missed. Wait for what it shows with `app.waitFor("…")`.
- Mock data only.

### The setup file

`design/states/Setup.swift` runs before each screenshot's view is made (each size, scheme, variant and direction). It is how a screen is reached that depends on who is signed in, what is stored, or which palette a variant is. It defines `func motifSetup(variant: String, locale: Locale, dark: Bool)`, which may also be `async` or `throws`:

```swift
// design/states/Setup.swift
import Foundation

func motifSetup(variant: String, locale: Locale, dark: Bool) {
    UserDefaults.standard.set(true, forKey: "signedIn")
    // An app that switches its own palette sets it here: variant is the variant's id ("" with no variants).
}
```

- It has 15 seconds. If it fails, that screenshot fails: "design/states/Setup.swift failed: …".
- The app really launches first, as the host of Motif's test, and then each screen is made again on its own. The scene's modifiers (`.environment(store)`, `.modelContainer(container)`) are given to the root view, but SwiftData's `.modelContainer(for:)` on the scene isn't, and the run's note names it. Motif makes a new `App` for each screenshot of `/`, so the `App`'s `init` runs before each screenshot of the root, as at a launch, and its own `@State` (`@State private var model = AppModel()`) is kept for that root view: each screenshot starts from the model as the app starts with it, and what the root's modifiers write into it (a window size from `.onGeometryChange`, an `.onAppear`) reaches the views that read it. So the `init` runs several times in one process, after the app's own launch: work in it that can't run twice stops the app at the root's screenshot (`FirebaseApp.configure()` raises "Default app has already been configured" on its second call), and the screen's error says so. Guard it (`if FirebaseApp.app() == nil { FirebaseApp.configure() }`), or move it to the app's delegate, which runs once. What the app's delegate (`@UIApplicationDelegateAdaptor`, `@NSApplicationDelegateAdaptor`) sets up when the app launches doesn't reach the screenshots: give it inside the `WindowGroup` ([theme code](tokens.md#wiring-it-in)) or here. Previews don't make the `App` at all: a preview gets what it needs in its `#Preview` block. Where SwiftUI wouldn't keep it, it would make a new model each time it is read outside a view, and the run's note names the `@State` that wasn't kept; draw that screen from a `#Preview` that holds the model itself (`@Previewable @State var model = AppModel()`). A screen that stops the app (an `@EnvironmentObject` nobody gives, a missing `modelContext`) fails alone, says what to give, and the other screens are drawn.
- Motif doesn't answer network requests: point the app at its mock data here, never at a back end.
- The app is built without signing, so its capabilities (iCloud, App Groups, Keychain sharing, push notifications) aren't there; the run's notes name them. Fake what they give here.
- On the Mac the app runs as a copy of its own (its bundle id with `.motif-shots` added, its home in Motif's work folder), so `UserDefaults` and `@AppStorage` written here never reach the developer's own app, and Motif deletes them afterwards. The Keychain is still the developer's: fake it rather than write to it.

In a project with several apps, give each app its own: `motif shot --app mobile/ios` uses `mobile/ios/design/states/Setup.swift` when it exists, and the project's `design/states/Setup.swift` otherwise. `--state` files are used from the path you give.

### Screens that aren't the root

`/` is the root view. Any other screen is drawn from its `#Preview`:

```bash
motif shot --screen Settings
```

Name a preview by its title (`#Preview("Settings")`), as `<File>-<n>` for an untitled one (`SettingsScreen-1`, the file's first), or by its file and line (`SettingsScreen.swift:20`, the line of `#Preview`). A `PreviewProvider` isn't drawn: put its view in a `#Preview` block. A preview is drawn at the screenshot's size, whatever its traits, wrapped in `.motifTheme()`; what its view needs (a model, a container) is given in the `#Preview` block:

```swift
import SwiftUI

#Preview("Settings") {
    SettingsScreen()
        .environment(SettingsModel.preview)
        .motifTheme()
}
```

## Right to left

`motif shot --rtl` takes every screenshot a second time in Arabic, right to left (`--rtl he` for Hebrew), named with `.rtl`, and the audit covers them too. Without Arabic in the string catalogue, the screenshots show the default strings laid out right to left, and `motif shot` says so ([platform](platform.md#languages)). A text field keeps its Latin text at the left in these screenshots, though the rest mirrors.

```bash
motif shot --audit --rtl
```

## A macOS app

A Mac app is drawn on the Mac itself, in the app, as whole windows with their title bar, toolbar and sidebar, at 2×: a 1440×900 window and a 900×700 one, named `desktop` and `desktop-900`. `--sizes 1440` or `--sizes 900` takes one; a phone's width is refused. An app for iPhone and the Mac is drawn on iOS by default, and on the Mac when `--sizes` names only windows (`--sizes 1440`); asking for both in one run is refused, with one run each as the way. No simulator is needed. The app's window shows for about a second as it launches. The audit checks contrast and names in both windows, and reduced motion in the 1440 window. Right to left, the whole window mirrors, its title bar too: the window's buttons are at the top right, as on a Mac in Arabic. A window's title stays in the app's own language in Arabic screenshots.

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the view and a screenshot. Fix what they report, then run them again until both are clean; the `xcodebuild … build` type check from the [README](README.md#build-type-check-and-run) too.

How `motif shot` runs on a SwiftUI app:

- It needs a Mac, Xcode 16 or newer, and an iOS simulator for an iOS app; without them it stops and gives `motif doctor`'s line.
- It works on a copy of the app in Motif's own folder (`~/.motif/swiftui/`), adds a test target to the copy only, and deletes the copy when the run ends, whatever happens. It never builds inside the project folder and never edits the project. An iOS app is drawn in a simulator Motif creates and deletes, without opening Simulator; its iOS version is the one Xcode builds for, and when that isn't installed the note says which was used.
- The first run says: "The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build." For a Mac app: "The first SwiftUI screenshots of a macOS app build it, which takes a few minutes; later runs reuse the build." The build is kept for that; one unused for 14 days is removed, and only the 3 most recent apps' builds are kept. The app's Swift packages are fetched on the first run, which needs the internet. A warm run of an iOS app takes about half a minute, most of it starting the simulator; a Mac app's, seconds.
- It refuses, saying what to do: a Swift package (`Package.swift`), an app that gets libraries from CocoaPods (a `Podfile`), a project that uses files outside the folder `motif` runs in, and a second run on the same app while one is drawing.
- A screen that doesn't settle within 5 seconds is drawn as it is. A run has 10 minutes, plus 5 seconds per screenshot; a screen that never finishes stops the run, which names it and keeps the screenshots before it. A screen that stops the app fails alone, with the reason.
- Google fonts the app doesn't bundle aren't added, so the screenshots show the system font where the app does ([theme code](tokens.md#fonts)).
