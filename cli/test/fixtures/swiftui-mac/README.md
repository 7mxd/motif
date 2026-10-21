# swiftui-mac

The smallest SwiftUI app for macOS, written by hand and modelled on Xcode 16's macOS "App" template (plan 2H, Task 9):
an Xcode project (objectVersion 77) whose `SwiftUIMac` folder is a file-system synchronized group, with `SDKROOT =
macosx` and a macOS 14 deployment target on the project only (as the template sets them), and the template's App
Sandbox and hardened runtime on the target.

- `ContentView.swift` is a `NavigationSplitView`: a sidebar `List` (Home, Settings) and the chosen screen.
- `Screens/HomeScreen.swift` and `Screens/SettingsScreen.swift` each have a `#Preview`; the settings one is named
  ("Settings") and is a grouped `Form` with a `Toggle`, a `TextField` and a button.
- `Localizable.xcstrings` has the English strings and their Arabic, as swiftui-min's.
- `Fonts/NotoNaskhArabic.ttf` is swiftui-min's Noto Naskh Arabic (SIL Open Font License 1.1, `Fonts/OFL.txt`),
  registered the macOS way: `SwiftUIMac/Info.plist` sets `ATSApplicationFontsPath` to `.` (the app's Resources
  folder), and the target's `INFOPLIST_FILE` names it. `HomeScreen` draws an Arabic line in it.

`swiftui-mac-shot-e2e.test.ts` draws it on the Mac (decision 0010, §17), and draws a multiplatform copy of it (its
target made `SDKROOT = auto` for iPhone, iPad and Mac) through its macOS destination. `shot-swiftui.test.ts` uses it
with stand-ins for xcodebuild.
