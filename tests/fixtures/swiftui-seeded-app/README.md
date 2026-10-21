# The SwiftUI seeded app

Qahwa (the SwiftUI contract app) with 16 planted problems, for test C on SwiftUI: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../swiftui-contract-app/` (so `build/`, `DerivedData/`, `xcuserdata/`, `.motif/` and screenshots never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts swiftui-seeded-app <empty folder>
```

The copy builds on a Mac with Xcode 16 or newer (`xcodebuild -scheme Qahwa -destination "generic/platform=iOS Simulator" build`), and `motif shot` needs a Mac with Xcode and an iOS simulator. The design guide, the Xcode project, the string catalogue and `design/states/Setup.swift` are Qahwa's, unchanged; the generated theme is Qahwa's with S-07's one hand edit.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| S-01 | exact (check) | A collected stamp filled with a typed brown, `Color(red: 0.54, green: 0.29, blue: 0.16)` | `Components/StampGrid.swift:34` |
| S-02 | exact (check) | Off-scale padding `.padding(18)` on a drink's page | `Features/Drink/DrinkScreen.swift:74` |
| S-03 | exact (check) | Off-scale corner `RoundedRectangle(cornerRadius: 10)` on every card | `Components/Card.swift:14` |
| S-04 | exact (check) | The member number in `.font(.system(size: 15))` | `Features/Loyalty/LoyaltyScreen.swift:43` |
| S-05 | exact (check) | Sign in's title hard-codes `.font(.custom("Georgia", size: 26))` | `Features/SignIn/SignInScreen.swift:22` |
| S-06 | exact (check) | A raw `.easeInOut(duration: 0.3)` for "Added to your order", which no longer asks for Reduce Motion | `Features/Drink/DrinkScreen.swift:56` |
| S-07 | exact (check) | The generated theme edited by hand (`MotifRadius.md` 12 → 14) | `Design/MotifTheme.swift` |
| S-08 | exact (shot) | Sign in's line under the title faded to 50%: hard to read | Sign in, `SignInScreen.swift:28` |
| S-09 | exact (shot) | The loyalty card's Copy button is as small as its word | Loyalty card, `LoyaltyScreen.swift:49` |
| S-10 | exact (shot) | A drink's heart button has no name | Drink, `DrinkScreen.swift:40` |
| S-11 | exact (shot) | The cup beside "Your card" pulses forever, whatever Reduce Motion says | Loyalty card, `LoyaltyScreen.swift:31` |
| S-12 | judgement | The drink cards force left to right, so they don't mirror in Arabic | `/` and Menu, `DrinkCard.swift:33` |
| S-13 | judgement | Sign out is the loyalty card's primary action | Loyalty card, `LoyaltyScreen.swift:62` |
| S-14 | judgement | The menu's sections have no space between heading and cards | `/` and Menu, `MenuScreen.swift:37` |
| S-15 | judgement | Add to order is a stock `.bordered` button, unlike every other main action | Drink, `DrinkScreen.swift:60` |
| S-16 | judgement | Sign in's button says "Submit", with no Arabic | Sign in, `SignInScreen.swift:39` |

Paths are under `Qahwa/`.

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false. `wholeFile` on S-07 means a finding anywhere in `MotifTheme.swift` counts.

A SwiftUI app's screens are its root and its previews: `motif shot` with no `--screen` draws `/` (the root, the menu once `design/states/Setup.swift` has signed the member in), then every `#Preview`, named by its title (Drink, Loyalty card, Menu, Sign in). SwiftUI's navigation has no addresses, so a drink's page and the loyalty card are drawn only from their previews. `screen` is the root or a preview's name, `screens` lists the other screens a problem shows on, and a finding on any of them counts as on the problem's screen.

S-01's typed brown is in the loyalty card's stamps. The stamps are pictures, which the audit doesn't judge, but on the menu the card is a button whose label holds them, and the audit takes the brown for the button's text colour: about 2.3:1 on the dark card, so it reports the card on `/` and Menu in dark mode, in both variants. Those are its declared consequences.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-swiftui.test.ts` checks, on every change, that `motif check` reports exactly the seven check problems at their lines (S-07 as a warning on the generated file's first line) and nothing else, that `motif validate` finds nothing, and that every pinned line holds its anchor. On a Mac with Xcode, it also checks that `motif shot --sizes 390 --audit --variant all --rtl` (no `--screen`: the root and the four previews) reports S-08, S-09, S-10 and S-11 and nothing that isn't one of them or S-01's consequences, and that Qahwa itself has no findings on any of the five screens.

The audit was checked by hand on 2026-10-22 with Xcode 27 and the iOS 27 simulator: S-08 is 2.16:1 in light mode and 3.2:1 in dark (2.19:1 and 3.19:1 in the Evening variant), in both directions; S-09 is reported once per language ("Copy member number", 34×17 points, and "نسخ رقم العضوية", 28×18), S-10 as `Button(heart)`, and S-11 as `View(35×26)`, the cup, in the 390-point light shot with Reduce Motion on. S-01's consequence is 2.32:1 (2.34:1 in the Evening variant). The judgement problems were looked at in the screenshots: S-12's cards, in Arabic, keep their text at the left and their chevron pointing right under right-aligned headings; S-13's Sign out is the screen's cinnamon button; S-14's cards touch each other and their heading; S-15's Add to order is a small tinted capsule; S-16's button says "Submit" in both languages.

What the SwiftUI audit can't see shaped two problems, and what SwiftUI does shaped a third ([checks](../../../skill/adapters/swiftui/checks.md#target-size), decision 0010 §18). S-09's small target is a text button, not an icon: an icon-only plain button whose symbol reaches the edges of its frame (`doc.on.doc`) is taken for a button drawn on a shape, and isn't flagged, which the first version of S-09 showed. S-11's movement is a scale, not a fade: the audit counts movement only. S-12 was first `Image(systemName: "chevron.right")`, which the guide says doesn't mirror, but in the iOS 27 simulator SwiftUI drew it pointing left in Arabic, as `chevron.forward`: there was nothing to see, so the card forces left to right instead.
