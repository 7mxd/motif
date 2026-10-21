# SwiftUI

How Motif works with an iPhone or Mac app built with SwiftUI: what it expects, how to start one, where things live, and how to build and run it. Motif's theme code for SwiftUI is one Swift file in the app target's folder, beside your views; Motif never edits the Xcode project, `Info.plist`, `Package.swift` or the asset catalogues.

## What Motif expects

- An app in Swift with SwiftUI: an Xcode project whose app target has the `@main` `App` struct, for iOS, macOS or both (Xcode's Multiplatform template). Motif's generated theme is applied to the root view with `.motifTheme()`.
- These versions or newer:
  - **Xcode 16**, with **Swift 5.9** language mode or Swift 6. The theme uses the `@Entry` macro, which Xcode 16 brings.
  - A deployment target of **iOS 17** and **macOS 14**. The theme's springs are `Animation.spring(duration:bounce:)`, which arrived there. With an older target the app doesn't build: Xcode says `spring(duration:bounce:)` is only available in iOS 17.0 or newer. Raise **Minimum Deployments** in the target's **General** tab.
- **A Mac for screenshots.** Theme code, checks and drafts work on any computer; `motif shot` draws the screens in an iOS simulator, or in a window on the Mac for a macOS app, so it needs a Mac with Xcode.
- One design guide for the whole project. An app for iPhone and the Mac shares one theme; [platform rules](platform.md) says what to keep different on purpose.

## How Motif recognises it

A folder is a SwiftUI app when it holds an Xcode project (`.xcodeproj`) with an application target whose Swift files import SwiftUI, or a `Package.swift` with an executable target that does. The target's folder is the one named after it, the one its synchronized folder names (Xcode 16), or, for the Multiplatform template, `Shared/`. A test target is never the app, and a target for the watch, the TV or Vision Pro alone is taken only when there is no other. The platforms come from the target's build settings (`SDKROOT`, `SUPPORTED_PLATFORMS`), else the project's, else iOS. An Xcode workspace beside the project is looked through for the apps in the folders around it too. `motif doctor --json` lists the app with the stack `swiftui`. For an app without a design guide, `motif extract` drafts one from its asset catalogues' colour sets (light and dark; parallel sets become design variants), its `extension Color` constants, and the sizes, fonts and animations its views type.

`motif doctor` also checks the toolchain, and tells the developer what it finds in one line, `Xcode`:

- On a Mac, ok: "Xcode 16.4 (Swift 6.1.2), with the iOS 18.5 simulator." For a macOS app: "Xcode 16.4 (Swift 6.1.2). A macOS app needs no simulator."
- Not on a Mac: "SwiftUI screenshots need a Mac with Xcode. Theme code, checks and drafts work here."
- Without Xcode: "Xcode isn't installed. Theme code, checks and drafts work without it; screenshots need it: install Xcode from the App Store." With only the command-line tools: "Screenshots need Xcode, not only its command-line tools: install Xcode from the App Store, then run sudo xcode-select -s /Applications/Xcode.app."
- An old one: "Xcode 15.4 is older than 16, which Motif's theme code needs. Update Xcode from the App Store."
- An iOS app without a simulator: "Xcode 16.4 has no iOS simulator, which an iOS app's screenshots need: install an iOS simulator in Xcode › Settings › Components."

`motif doctor` doesn't read the deployment target: check that **Minimum Deployments** is iOS 17 (macOS 14) or newer.

## Starting a new project

An Xcode project has no command-line starter, and its project file isn't text you should write by hand. Ask the developer to create it in Xcode, from its **App** template:

1. **File › New › Project**, then **iOS › App** (or **Multiplatform › App** for iPhone and the Mac, **macOS › App** for the Mac alone).
2. Name the app, and set the organization identifier to their own reverse-domain name (`com.example` only for a test). Keep **SwiftUI** and **Swift**, and **None** for storage unless the brief needs saved data.
3. Save it in a new folder named after the app. Xcode makes `MyApp/MyApp.xcodeproj` and the app's code in `MyApp/MyApp/`.

The outer `MyApp` folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`.

`swift package init --type executable` makes a Swift package, not an app project. Offer it only when the developer asks for a package: Motif writes its theme code and checks it, but `motif shot` can't draw a package's screens, and says to make an Xcode App project that uses the package instead.

## Folders

Inside the app target's folder (`MyApp/` beside `MyApp.xcodeproj`):

- **Theme code:** `Design/MotifTheme.swift`, written by `motif tokens`. Never edit it by hand ([theme code](tokens.md)).
- **Reusable views:** `Components/`; a feature's own screens and views go in `Features/<Feature>/` ([components](components.md)).
- **Fonts the theme brings:** `Fonts/`, copied there by `motif tokens` ([theme code](tokens.md#fonts)).
- **Text:** `Localizable.xcstrings`, the string catalogue, with English and Arabic ([platform rules](platform.md#languages)).
- **The design guide:** `DESIGN.md` and `design/` in the project folder. Screenshot helpers live in `design/states/` ([checks](checks.md#screens-behind-a-form-or-a-tap)).

In a project made by Xcode 16 the app's folder is a **synchronized folder**: every file in it is built, so a new file needs no step in Xcode. An older project lists its files in groups instead: a new file (the theme, a view, a font) has to be added to the target (in Xcode: **File › Add Files to "MyApp"…**, with the target ticked). `motif tokens` says which applies.

`design/motif.json` can name a different theme folder: `themeDir` is a folder inside the app target's folder, written from the project's top. For a Swift package it must be inside the target's folder (`Sources/MyApp/…`), or Swift Package Manager won't build it, and `motif tokens` says so.

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "swiftui", "themeDir": "MyApp/Theme" }] }
```

## Monorepos

Real projects often hold several apps. Say a pnpm workspace has a web dashboard in `dashboard/`, and `mobile/ios/` holds the Xcode project. `motif doctor` finds `dashboard` and `mobile/ios`. Keep **one guide for the web dashboard and the iPhone app**: one `DESIGN.md` and one `design/tokens.json` at the project's top. `DESIGN.md`'s platform notes say, per app, what differs on purpose (the iPhone app uses a tab bar, the dashboard a sidebar), as section 8 of the template asks.

`motif tokens` writes each app's theme code: the iPhone app's goes to `mobile/ios/MyApp/Design/MotifTheme.swift`. Run a command for one app with `--app`:

```bash
motif shot --app mobile/ios --audit
```

Each app can have its own screenshot setup: `mobile/ios/design/states/Setup.swift` is used when it exists, and the project's `design/states/Setup.swift` otherwise ([checks](checks.md#the-setup-file)).

## Build, type-check and run

Run these on a Mac, from the folder with the `.xcodeproj`:

- `xcodebuild -scheme MyApp -destination "generic/platform=iOS Simulator" build`: the compiler, as a type check. Run it after every change; it must end with `** BUILD SUCCEEDED **`. For a Mac app, use `-destination "platform=macOS"`. `xcodebuild -list` names the schemes.
- In Xcode, **Product › Run** runs the app in a simulator or on the Mac, and the canvas shows each `#Preview`.
- On Windows or Linux nothing builds the app: write the code, run `motif check`, and ask the developer to build it on their Mac.

`motif shot` builds a copy of the app with a test of its own, so the app must build for the iOS simulator (or the Mac). It never builds inside the project folder, and it refuses three kinds of app, each with what to do: a Swift package (`Package.swift`), an app that gets its libraries from CocoaPods (a `Podfile`), and a project that uses files outside the folder `motif` runs in.

- `/` is the app's root view, the content of the `App`'s `WindowGroup`. SwiftUI's navigation has no addresses, so no other route can be opened: the other screens are drawn from their `#Preview`s ([checks](checks.md#screens-that-arent-the-root)).
- Without `--screen`, a run takes 12 screens: `/` first, then the previews, and the note names the ones left out.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, wiring it in, fonts, the Arabic companion and switching variants.
- [Components](components.md): building views the SwiftUI way, button styles, every state, and the starter set.
- [Motion](motion.md): the motion roles in SwiftUI's animations, springs and Reduce Motion.
- [Platform rules](platform.md): iOS and Mac conventions, right to left, Dynamic Type, safe areas and accessibility.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and the screenshot helper files.
