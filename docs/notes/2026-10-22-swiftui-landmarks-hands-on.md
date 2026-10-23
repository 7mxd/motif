# Hands-on test: Motif on Apple's Landmarks (SwiftUI)

- **Date:** 2026-10-22
- **Plan:** [2H SwiftUI](../plans/2026-10-21-motif-2h-swiftui.md), Task 15 (spec §11 of [Part 2](../specs/2026-10-19-motif-part2-all-stacks-design.md))
- **Motif:** branch `plan/2h-swiftui` at `22062f8`, run from source (`bun ~/motif-2h/cli/src/main.ts …`) on the Mac mini (Apple silicon, macOS 27, Xcode 27.0, Swift 6.4, the iOS 27.0 simulator runtime). `ADAPTERS_AVAILABLE` had `"swiftui"` added in that checkout for the run (the change of the commit that marks SwiftUI supported), so `doctor` says what a release will say; nothing else differed from the branch until the fixes below.
- **Landmarks:** Apple's "Landmarks: Building an app with Liquid Glass" (<https://developer.apple.com/documentation/swiftui/landmarks-building-an-app-with-liquid-glass>), downloaded without signing in from <https://docs-assets.developer.apple.com/published/a88428e6793e/LandmarksBuildingAnAppWithLiquidGlass.zip> (336 MB, SHA-256 `f19ed0effbe8af975536034b2b5af98002f06f5d600854a95efb62ccc8303f41`). The zip holds the sample's own git repository, at `d4acf4ada7727b7374b6e67529863340d438bedc` ("Updates icon.", 2026-06-12). The SwiftUI tutorial's own completed Landmarks project asks for a sign-in (its download goes to developer.apple.com/download/), so this one, Apple's current Landmarks, was used.

Landmarks is one multiplatform target for iPhone, iPad and the Mac (`SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx"`), with iOS 26 and macOS 26 deployment targets, Swift 6, Xcode 16's synchronized folder (object version 77) and 37 Swift files: a split view (Landmarks, Map, Collections), a featured header, horizontal lists of photos by continent, a landmark's detail with an inspector and a map, collections that can be edited, and badges. Its strings are in string catalogues with Arabic. Its asset catalogue has two colour sets, `AccentColor` (the system's `systemIndigoColor`) and `badgeShowHideColor` (black, white in dark), and the photos. Its sizes are in a `Constants` struct. It uses Liquid Glass throughout (toolbar buttons, the badge button, the sidebar).

This is the record of the test until the pull request exists. The eval cases are run by the controller after the final review.

## What was changed in the scratch copy

Only these, and only in the copy, in a temporary folder on the Mac (since removed): a git branch to see what Motif adds; `DESIGN.md` (ten short sections); `design/tokens.json` (the draft, with the colour roles set by hand, as a reviewer of the draft would, and a second variant, `teal`, which changes `action-primary` and `focus`, so that `--variant all` has two to draw); `.motifTheme()` on the root view in `LandmarksApp.swift`, as `motif tokens` asked; and what Motif wrote itself (`design/motif.json`, `design/tokens.draft.json`, `design/extract-report.json`, `Landmarks/Landmarks/Design/MotifTheme.swift`, `design/shots/`). A state file that wrote out the accessibility tree was used while looking into the audit's findings, and removed. Landmarks's views still use their own colours: the test is Motif's theme beside the app's, so a variant shows only in the tint `.motifTheme()` sets.

No screenshots are kept with this note: the sample's licence covers its code, not its photographs, which are on most screens.

## Results

| Step | Result |
|---|---|
| 1. `doctor` | Passed |
| 2. `extract`, then a guide that validates | Passed with corrections by hand: the accent colour (a system colour) was skipped without a word (problem 6, fixed), and the only text colour found was the white over photos, so the draft's text on its white background failed 14 contrast checks (problem 7) |
| 3. `tokens`, registered as its note says | Passed: one line in `LandmarksApp.swift`; the theme builds with the app for the iOS simulator and the Mac, with no warnings from it |
| 4. `check` | Passed: 17 problems in 9 files, all real but one detail (problem 9); sizes kept in `Constants` aren't seen (problem 8) |
| 5. `shot --audit --variant all --rtl` | Passed: 384 screenshots of 12 screens in 444 s. The pictures were right but for the root, drawn without its featured header (problem 2), and the audit had false findings (problems 1 to 3). After the follow-up's fixes, all three are fixed: see "The follow-up" below |
| 5b. The same on the Mac (`--sizes 1440,900`) | Partly at first: four previews were drawn at their content's size, one as only its title bar (problem 4). After the follow-up, all 192 screenshots are the windows' size |

### 1. doctor

```
Motif doctor
  ✓ Motif tool — Version 0.4.2 (darwin-arm64).
  ✓ App (Landmarks) — Full support for SwiftUI.
  ✓ Screenshots and previews — Using Chrome.
  ✓ Xcode — Xcode 27.0 (Swift 6.4), with the iOS 27.0 simulator.
  ○ Design guide — None yet — /design will create one.
  ○ Design sources — None connected. Everything works without them; you can add them later with "motif connect".
```

Run from the repository's top, which holds the `Configuration/` folder the project uses: the app is found one folder deeper (`Landmarks/`, with the `.xcodeproj`), and `motif shot` copies the whole top, so the project's `../Configuration/SampleCode.xcconfig` is inside the copy. Run from `Landmarks/` it would be refused as a project that uses files outside its folder, with what to do.

### 2. extract

```
✓ Draft theme values written to design/tokens.draft.json (from 42 files).
  Colours: 2 found, grouped into 2
  Spacing: 2 values, 1 off a 4px scale
  Corners: 1 size · Text sizes: 0 · Fonts: none found · Animation timings: 0
• Dark-mode colours were copied from light mode. Review them before turning on dark mode.
• Your Swift theme code sets 1 colour (asset catalogue colour sets and Color constants); design/extract-report.json shows the role each matches.
• No colour was found for background, border, action-primary, success, warning, danger, info, so Motif used defaults.
• 1 spacing value wasn't on a 4px scale; the report shows the nearest step for each.
```

- **The accent colour was skipped without a word** (problem 6). `AccentColor` names `systemIndigoColor`, with no value in the catalogue. Now a note says so and which role to give a value.
- **The text roles were white.** The views' only typed colour is `.white` (8 uses, all on photos), so `text-primary` and `text-secondary` became `#FFFFFF` on the default `#F9FAFB` background, and `motif validate` failed 14 pairs (problem 7). Landmarks's text is the system's `.primary` and `.secondary`, which aren't values to read.
- **`badgeShowHideColor`** (black, white in dark) was read as a variable with both, matching no role.
- **No type sizes, fonts or motion:** Landmarks uses the system's text styles (`.title2`, `.caption`) and default animations. Right.
- **What I changed to validate it:** iOS's label colours by hand (`text-primary` black and white, `text-secondary` `#5B5B60` and `#AEAEB2`, `background` white and black, `surface` `#F2F2F7` and `#1C1C1E`, `border`, `action-secondary`) and the indigo accent (`#5856D6`, `#5E5CE6` in dark), plus the `teal` variant (`#0F766E`). `motif validate`: "valid — 94 theme values and 52 readability checks (light + dark, 2 variants) passed."

### 3. tokens

```
✓ Theme code is ready:
  created    Landmarks/Landmarks/Design/MotifTheme.swift
  created    design/motif.json
• Next: apply .motifTheme() to your root view in LandmarksApp.swift (WindowGroup { ContentView().motifTheme() }), then read colours in your views with @Environment(\.motifColors) private var colors, type with .motifFont(.body) and sizes with MotifSpace. Xcode already builds Landmarks/Landmarks/Design/MotifTheme.swift into the Landmarks target: Landmarks is a synchronized folder. Your guide has design variants (Default and Teal): .motifTheme(variant: .defaultVariant) chooses one (.defaultVariant and .teal; .defaultVariant when you pass none). To switch at runtime, keep the variant's rawValue in @AppStorage and pass MotifVariant(rawValue: stored) ?? .defaultVariant to .motifTheme(variant:).
```

- The note is right for this project: the synchronized folder needs no step in Xcode, and nothing else was registered (no fonts). Landmarks's root is `LandmarksSplitView()`, not the template's `ContentView()`, which the example names; adding `.motifTheme()` after its `.environment(modelData)` was obvious.
- `MotifTheme.swift` (462 lines) built with the app: `xcodebuild … -destination "generic/platform=iOS Simulator" build` in 8 s and `-destination "platform=macOS"` in 6 s, `** BUILD SUCCEEDED **`, Swift 6 mode, no warnings from Motif's file (the build's one warning is AppIntents' metadata step).

### 4. check

`motif check` found 17 problems in 9 files, in 0.1 s, and each is real:

- **14 raw colours:** `.white` on text and symbols over photos (8), `.indigo`, `.gray` and `.red` on symbols, and `Color(uiColor: .systemGray5)`/`.systemGray3` in `LandmarkCollection.swift`.
- **1 reduced-motion:** `BadgesView.swift:34`, `withAnimation { isExpanded.toggle() }` without reading Reduce Motion.
- **1 off-scale:** `CollectionDetailEditingView.swift:53`, `.padding(.bottom, -2)`, reported as "Spacing 2pt" (problem 9).
- **What it doesn't see:** the sizes in `Constants` (`cornerRadius` 15, `standardPadding` 14, `leadingContentInset` 26, `safeAreaPadding` 30), which every view uses by name (problem 8).

### 5. shot

**`motif shot --audit --variant all --rtl`**: "✓ 384 screenshots of 12 screens (three phone sizes and a tablet, light and dark, right to left in ar, 2 design variants)", in 444 s: the root (`/`) and 11 of the 22 previews, the others named in the note with `--screen` as the way to choose. The build took little of it (Landmarks builds in seconds); about 1.15 s a screenshot with the audit. Motif kept the build (459.5 MB in `~/.motif/swiftui/`) and said so; the simulator it made was gone afterwards, and nothing was left in Xcode's DerivedData.

**The pictures I looked at** (22, downscaled, with the full-size ones for the findings I checked pixel by pixel: the root at 390 and on the tablet, light, dark, right to left and teal; the split view's preview; the collection's display, editing, item, grid and list previews; the menu, badge, inspector and map previews; and three Mac windows): the real app as iOS 27 draws it, with Liquid Glass (the glass toolbar buttons, the sidebar toggle, the badge button), SF Symbols, the photos and the map. Right to left in Arabic, the layouts mirror (the horizontal lists start at the right, the sidebar's back button points right, the detail's text aligns right), the string catalogue's Arabic is used ("جبل فوجي", "تعديل", "المجموعات", "4 عناصر"), and data that isn't translated (collection names, "They're chilly, but amazing!") stays English. Dark is the system's dark. In the teal variant the buttons `.motifTheme()` tints are teal ("تعديل", "Learn More" on the Mac); nothing else changes, as expected with views that don't read Motif's colours.

- **The root has no featured header** (problem 2). Landmarks's home starts with a header half the window tall (Mount Fuji, "Learn More"), sized from `modelData.windowSize`, which the root's `.onGeometryChange` sets. In every `/` picture the list starts at "Asia", under the toolbar's blur. The `LandmarksSplitView` preview, which holds its model in `@Previewable @State`, draws the header. Cause: the `App` keeps `ModelData` in `@State`, and outside a view SwiftUI makes a new one each time it is read (decision 0010, §4, saw its warning), so the size went to a model nobody reads.
- **Previews show what their `#Preview` gives.** `CollectionsView`'s preview has no `NavigationStack`, so its `NavigationLink`s are disabled and drawn faded, and on the tablet its first title sits under the scroll edge's blur. That is how Xcode's canvas shows that preview; the guide already says to give a preview what its view needs.
- **The map is MapKit's:** some shots show Apple Maps' tiles (Japan for Fuji, South America for the Uyuni preview), and the inspector at 360 in light shows its placeholder grid, the tiles not yet loaded when the screen settled. Which one a shot gets depends on the network and timing.

**Audit, first run: 13 critical, 37 major, 4 minor (54).** After the fix for problem 1, the same command found 9 critical, 36 major, 4 minor (49). How I judged them, against decision 0010, §18:

- **Real, the app's own (21):** `.secondary` text under 4.5:1 on white (the editing view's "Title", "Description" and "Landmarks" at 3.4–3.7:1, the inspector's "Map" and "Metadata" headers at 3.3–3.6:1, "4 items" at 3.8:1: iOS's secondary label is about 3.4:1 on white); the indigo tint as text on dark ("Edit", "Select", "Collections" at 3.2–4.4:1: the system's own dark indigo); the `TextEditor` for a collection's description, which has no name; the plain "Select" button, 48×22 on a phone.
- **Real, from my test variant (9):** teal on dark, 2.9–4.3:1. My variant's dark value was too dark; `motif validate` doesn't pair `action-primary` as text on the background, so only the audit could see it.
- **False, and fixed (problem 1):** "Hide Sidebar" and the tablet's "Edit" (glass buttons) at 1.03:1, and the inspector's segmented "Map" at 1.15:1, and 1.03:1 in dark: the audit took a second background for the text's colour. They were in the first run only; the counts here are the second run's 49.
- **False, the root's missing header (2, problem 2):** "Featured Landmark, Mount Fuji" at 1.9:1, the header's text drawn over the list at no height.
- **Not the app's to fix (13, problem 3):** MapKit's own "Legal" link at 2.6–4.2:1 (9), the split view's two column separators as unnamed sliders on the iPad root (2), and on a phone the `Collections` menu preview's button, 111×22, which in the app is a toolbar item the system sizes but in its preview stands alone (2, a preview without its toolbar; the ruling flags a menu as a plain button).
- **The preview's own context (4):** `CollectionsView`'s first title under the scroll edge's blur on the tablet, 1.5–1.7:1. The picture is right; the screen in the app has a navigation bar above it.

**The Mac (`--sizes 1440,900 --audit --variant all --rtl`)**: 192 screenshots in 449 s, the first macOS build included; the app's window showed for a moment at each launch. The root and most previews are right: the sidebar, the glass search field, the photos, the window's title bar, light and dark, and the layout mirrored right to left (the sidebar on the right). But four previews were drawn at their own size, not the window's (problem 4): `BadgesView` at 74×72 pt (the picture is the title bar's traffic lights and nothing else), the collections menu at 99–108×56 pt, the collection item at 830×900 pt and the inspector at 900×900 pt in the 1440 window; twelve notes said the window server gave a picture of another size, one per size. Right to left, the traffic lights stay at the left, over the content (problem 5). The audit: 3 critical, 3 major. The badge button's "1.25:1" was judged on the broken picture; the editing view's grey labels (3.9:1) and the indigo and teal "Select" are real; the map preview's "Uyuni Salt Flat element keeps moving" is MapKit's marker (problem 3).

## Problems found in Motif

Severity: **Critical**, a step can't be done; **Important**, a wrong result someone would act on; **Moderate**, a result a person has to correct by hand; **Minor**, wording, or a rare case.

| # | Severity | Problem | Status |
|---|---|---|---|
| 1 | Important | **The audit took a second background for a text's colour.** A segmented control's selected segment holds more of the grey track than of any one shade of its black label, and a glass button's sheen more than any one shade of its indigo text, so the colour found was the track's or the sheen's: critical findings at 1.03–1.16:1 for text anyone can read. | Fixed: "fix(shot): a SwiftUI text over a second background isn't judged by that background's colour" (`b095ace`). Such a text isn't judged, and the run says to check it by eye; the planted screen has a segmented picker, the simulator's e2e failed on it before the fix, and both e2e tests pass after |
| 2 | Important | **The root is drawn with a model the App never keeps.** An `App` that holds its model in `@State` (Apple's own pattern since iOS 17) gets a new model each time Motif's root reads it, so what the root's modifiers write (Landmarks's window size) is lost: the home screen is drawn without its header on iOS and the Mac, and the audit judges the collapsed header. | Fixed in the follow-up: "fix(shot): the App's own @State is kept for the root view" (`08d9154`). The App is made once per launch and its `@State` installed for each root view, so Landmarks's header is drawn; a `@State` that can't be kept is named in a note. The guide's line (`b77b1f1`) now says so |
| 3 | Moderate | **Parts the system draws are judged as the app's.** MapKit's "Legal" link (contrast, 9 findings), UIKit's split-view column separators (`_UISplitViewControllerAdaptiveColumnSeparatorView`, adjustable with no label: "the element has no name", twice on the iPad root), and a MapKit marker's movement on the Mac. The app can't change any of them. | Fixed in the follow-up: "fix(shot): what the system draws itself is left out of the SwiftUI audit" (`98cfe4e`), by class (MapKit's views, UIKit's own split-view divider), with one note; decision 0010 §18 |
| 4 | Important | **On the Mac, a small preview sizes the window to itself.** Four of Landmarks's twelve screens were drawn at their content's size, not 1440×900 or 900×700, and named as if they were (`badges-view-1.desktop.png` is 148×144 px: the title bar alone). The notes blamed the window server, once per size (12 lines), and the audit judged the broken picture. | Fixed in the follow-up: "fix(shot): a Mac window keeps the shot's size whatever its screen's own size" (`6abe679`); the Mac e2e checks every screenshot's size |
| 5 | Minor | **On the Mac, right to left moves the content but not the window's buttons.** The traffic lights stay at the left, over the mirrored content; on a Mac in Arabic they are at the right. | Fixed in the v0.5.0 sweep: "fix(shot): a right-to-left Mac window mirrors its title bar". The harness answers the window's title-bar direction with the shot's, so the buttons are at the top right; the Mac e2e checks it (decision 0010 §17) |
| 6 | Moderate | **A colour set that is a system colour was skipped without a word.** Landmarks's accent colour is `systemIndigoColor`; the draft said only that no colour was found for `action-primary`. | Fixed: "fix(extract): a SwiftUI colour set that is a system colour is named in a note" (`a7bf735`) |
| 7 | Moderate | **The draft's text colours can fail on the draft's own background.** The only text colour found was `.white` on photos, so both text roles became white on a white background, and the guide failed 14 checks until edited by hand. The draft logic is shared by every stack. | Open. Recommendation: when a found text colour fails the drafted background, keep the default for that role and say which colour was found and where |
| 8 | Minor | **Sizes kept in a constants type aren't seen** by `extract` or `check`: Landmarks's 14 pt padding, 26 pt inset and 15 pt corners are used everywhere by name. The other stacks are the same with their constants. | Fixed in the v0.5.0 sweep (`744ffbf`): `extract` samples such a constant (its name says padding, spacing, inset, gap, margin, radius or corner) once where it is defined, with a note; the guide says `check` can't see their uses and to replace them with the theme's roles |
| 9 | Minor | **`check` drops a negative padding's sign:** `.padding(.bottom, -2)` is "Spacing 2pt isn't on your spacing scale". | Fixed in the v0.5.0 sweep (`d7e1a09`): the message keeps the sign ("Spacing -2pt"), and −N is on the scale when N is, as the other stacks judge a negative margin |
| 10 | Minor | **A Mac run left `<bundle id>.motif-shots.savedState` in the temporary folder** (`$TMPDIR`), where macOS 27 keeps an app's window state; Motif removed only the one under `Library/Saved Application State`. Seen after the Landmarks run and the Mac e2e. | Fixed: "fix(shot): a macOS run removes the window state macOS kept in the temporary folder" (`ac37294`) |

## The follow-up

The controller ruled that problems 2, 3 and 4 be fixed, and doctor's line for a Swift package app. Each fix was made test-first and proven on a new scratch copy of Landmarks (the same zip and commit), with the same guide and `.motifTheme()` line:

- **Problem 2 (`08d9154`).** The cause: the harness made a new `App` for each root screenshot and read its `WindowGroup` outside any view, where SwiftUI makes an App's `@State` model again on every read (`LazyState`'s thunk on Xcode 27's SDK). The App is now made once per launch and, declared a `DynamicProperty` in the run's own file, held by a view whose `ImageRenderer` is kept until the next root view, so SwiftUI installs its `@State`. One model for the whole launch was tried first: on the iPad the model then carried what the first layout wrote (the inspector shown) into every later screenshot of the root, so 3 of 4 tablet shots drew the inspector's column; each root screenshot now starts from the model as the app starts with it. Landmarks's home shows its featured header (Mount Fuji, "Learn More") on the phones, the tablet and the Mac, light and dark, in Arabic and in the teal variant. The simulator e2e's App store, which the root's `.onAppear` opens, failed on "Store ready" before the fix and reads "Store opened" after.
- **Problem 4 (`6abe679`).** The Mac window's minimum and maximum sizes are the shot's, the screen fills it, and a window resized anyway is put back. All 192 Mac screenshots are 2880×1800 or 1800×1400, no "drawn by AppKit alone" notes, and the badge preview is the whole window with its badge in the middle. The Mac e2e's 60 pt preview failed before the fix (a 120×168 px picture) and passes after.
- **Problem 3 (`98cfe4e`).** Findings on MapKit's views and UIKit's own split-view divider are left out, with one note ("The audit left out what the system draws itself (UIKit's split view, MapKit), which the app can't change.").
- **Problem 1 on CI's floor (`404d576`).** The first CI run after the follow-up (39719894880, Xcode 16.4, iOS 18.5, macOS 15) still failed the planted segmented picker ("Map" 2.51:1 in the simulator's dark; "Map" 2.21:1 and 2.63:1 and "Activities" 2:1 on the Mac): on those systems the selected segment's fill and the track are 2–3:1 apart, beyond `b095ace`'s rule. A segment of a segmented control is now judged only by its own colour, as a switch's label is; on the Mac it is told by AppKit's segment element (`c85d778`), as the next run (39725246821) showed.
- **Doctor (`65158a2`).** A Swift package app's line is "Full support for SwiftUI but for screenshots:", followed by `motif shot`'s own words for a package.

**After the fixes** (`--audit --variant all --rtl`, 452 s): 5 critical, 27 major, 4 minor (36, from 49). Gone: the root's header finding, the 9 "Legal" findings and the 2 dividers. Left, as judged above: the app's own 21, my teal variant's 9, the preview-context ones (`CollectionsView`'s blurred title ×4, the Collections menu's targets ×2). **The Mac** (`--sizes 1440,900 --audit --variant all --rtl`, 330 s with the first macOS build): 1 critical, 2 major, all real (the editing view's grey labels, indigo and teal "Select"); the badge's false "1.25:1" and the marker's motion are gone.

## Timings

On the Mac mini, a shared machine with nothing else running at the time.

| What | Time |
|---|---|
| `motif doctor` | 1.0 s |
| `motif extract` (42 files) | 0.05 s |
| `motif tokens` | 0.06 s |
| `motif check` | 0.1 s |
| `xcodebuild` of the copy with the theme, iOS simulator / Mac | 8 s / 6 s |
| `motif shot --audit --variant all --rtl` (384 shots, 12 screens), first run, with the build | 444 s |
| The same, after the fix for problem 1 (the build kept) | 448 s |
| `motif shot` of 2 previews at 360 and 768 with the audit and a state (32 shots), warm | 52 s |
| `motif shot --sizes 1440,900 --audit --variant all --rtl` (192 shots), with the first macOS build | 449 s |
| `swiftui-shot-e2e.test.ts` (problem 1: failing, then passing) | 211 s, 208 s |
| `swiftui-mac-shot-e2e.test.ts` (after the fix) | 214 s |
| Follow-up: `shot --audit --variant all --rtl` after the fixes (384 shots) | 452 s |
| Follow-up: the Mac run after the fixes (192 shots, with the first macOS build) | 330 s |
| Follow-up: `swiftui-shot-e2e.test.ts` failing, then passing / `swiftui-mac-shot-e2e.test.ts` failing, then passing | 269 s, 228 s / 228 s, 233 s |

A warm run costs about a second a screenshot with the audit, most of it the settle and motion checks, so `--variant all --rtl` at every size is minutes for an app of a dozen screens. A quick look is `--sizes 390` and one variant.

## Afterwards

The scratch copy, its DerivedData, Motif's kept builds of Landmarks (979 MB) and the two `.savedState` folders (problem 10) were removed from the Mac. No simulator was left (Motif deletes its own; the Mac's 11 devices were as before), and Xcode's DerivedData was empty.

## Not covered

- The eval cases: run by the controller after the final review; the result goes in [docs/parity.md](../parity.md) (the SwiftUI Evals row).
- The generated theme read by the app's views: Landmarks wasn't changed to use `MotifColors` or `.motifFont`, so the variant showed only in the tint.
- A device: the simulator and the Mac only.
- iPadOS beyond the tablet size, and Xcode 16.4 (CI's floor job draws on it; this Mac has Xcode 27 only).
