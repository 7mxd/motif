# swiftui-xcode26

Xcode 26's iOS "App" template with Storage set to SwiftData, written by hand (xcodebuild can't create projects) for
`swiftui-render.test.ts` (decision 0010):

- the target's build settings are the template's new ones: `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (every type is
  main-actor by default), `SWIFT_APPROACHABLE_CONCURRENCY`, `SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY` and
  `STRING_CATALOG_GENERATE_SYMBOLS`, in an object-version-77 project whose `SwiftUI26` folder is synchronized;
- the deployment target is iOS 18.0, not the template's 26.0, so that CI's floor (Xcode 16.4, iOS 18) builds it; Xcode
  16.4 ignores the settings it doesn't know, so the main actor by default is only proven on Xcode 26 and later;
- `SwiftUI26App` holds an `@Observable` model in `@State`, gives it to `ContentView` with `.environment(model)`, and puts
  the template's `ModelContainer` on the `WindowGroup` with `.modelContainer(…)`, a scene modifier the harness doesn't
  apply to the root it draws; the `WindowGroup` has a title ("SwiftUI 26"), which the harness must not draw instead of
  the content;
- `ContentView` reads the model and a SwiftData `@Query`, and has an `@Previewable @State` preview;
- `BrokenPreview.swift`'s preview stops the app (an `@EnvironmentObject` nobody provides): the harness fails that screen
  with SwiftUI's reason and draws the others in a new launch.
