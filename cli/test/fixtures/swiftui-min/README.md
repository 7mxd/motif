# swiftui-min

The smallest SwiftUI app for iOS, written by hand and modelled on Xcode 16's iOS "App" template: an Xcode project
(objectVersion 77) whose `SwiftUIMin` folder is a file-system synchronized group, the template's build settings
(Swift 5, `GENERATE_INFOPLIST_FILE`), an iOS 17 deployment target, `SwiftUIMinApp.swift` and an asset catalogue with
`AccentColor` and `AppIcon`. `swiftui-compile.test.ts` builds it on a Mac with Motif's theme code in
`SwiftUIMin/Design/`, and `tokens-swiftui.test.ts` runs `motif tokens` on its shape (plan 2H, Task 3).

Task 6 grew it into two screens, as `compose-min` has:

- `ContentView.swift` holds the app's `NavigationStack`: `HomeScreen` (`Screens/HomeScreen.swift`), and
  `SettingsScreen` (`Screens/SettingsScreen.swift`) behind `Route.settings`. Each file has a `#Preview`; the settings
  one is named ("Settings").
- `Localizable.xcstrings` has the English strings and their Arabic (`ar` is in the project's `knownRegions`).
- `Fonts/NotoNaskhArabic.ttf` is Noto Naskh Arabic (the variable `wght` font), under the SIL Open Font License 1.1
  (`Fonts/OFL.txt`), from https://github.com/google/fonts/tree/ad2e6647e3d97ad5a8b6b5f95042f99161af5915/ofl/notonaskharabic
  (`NotoNaskhArabic[wght].ttf`, renamed). It is registered by `SwiftUIMin/Info.plist` (`UIAppFonts`), which the
  target's `INFOPLIST_FILE` names and the synchronized folder leaves out of the bundle's resources, as Xcode does when a
  key is added in the target's Info tab. `HomeScreen` draws an Arabic line in it.

`swiftui-render.test.ts` draws it in the iOS simulator (decision 0010).
