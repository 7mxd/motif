# swiftui-min

The smallest SwiftUI app for iOS, written by hand and modelled on Xcode 16's iOS "App" template: an Xcode project
(objectVersion 77) whose `SwiftUIMin` folder is a file-system synchronized group, the template's build settings
(Swift 5, `GENERATE_INFOPLIST_FILE`), an iOS 17 deployment target, `SwiftUIMinApp.swift`, `ContentView.swift` with a
`#Preview`, and an asset catalogue with `AccentColor` and `AppIcon`. `swiftui-compile.test.ts` builds it on a Mac with
Motif's theme code in `SwiftUIMin/Design/`, and `tokens-swiftui.test.ts` runs `motif tokens` on its shape (plan 2H,
Task 3). Task 6 grows it.
