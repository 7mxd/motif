# The Compose seeded app

Rafiq (the Compose contract app) with 15 planted problems, for test C on Jetpack Compose: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../compose-contract-app/` (so `.gradle/`, `build/`, `.kotlin/`, `.motif/`, `local.properties` and screenshots never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts compose-seeded-app <empty folder>
```

The copy builds with its own Gradle wrapper (`./gradlew :app:compileDebugKotlin`), and `motif shot` needs a JDK and the Android SDK. The design guide and `design/states/Setup.kt` are Rafiq's, unchanged; the generated theme is Rafiq's with J-07's one hand edit.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| J-01 | exact (check) | The streak badge's words in a typed brown, `Color(0xFF8A4B00)` | `ui/components/StreakBadge.kt:42` |
| J-02 | exact (check) | Off-scale padding `padding(18.dp)` on a habit's page | `ui/habit/HabitScreen.kt:69` |
| J-03 | exact (check) | Off-scale corner `RoundedCornerShape(12.dp)` on habit rows | `ui/components/HabitRow.kt:56` |
| J-04 | exact (check) | A typed `fontSize = 15.sp` on the best streak | `ui/habit/HabitScreen.kt:76` |
| J-05 | exact (check) | A raw `FastOutSlowInEasing` in a row's border change | `ui/components/HabitRow.kt:49` |
| J-06 | exact (check) | Sign in's title hard-codes `FontFamily.Serif` | `ui/signin/SignInScreen.kt:72` |
| J-07 | exact (check) | The generated theme edited by hand (`MotifRadius.md` 14 → 16 dp) | `ui/motif/MotifTheme.kt` |
| J-08 | exact (shot) | Sign in's line under the title faded to 50%: hard to read | `/sign-in` and SignInPreview, `SignInScreen.kt:76` |
| J-09 | exact (shot) | A 32 dp "Add a habit" icon button beside Sign out | `/`, TodayPreview and TodayEmptyPreview, `TodayScreen.kt:84` |
| J-10 | exact (shot) | Sign out's icon has `contentDescription = null`, so no name | `/`, TodayPreview and TodayEmptyPreview, `TodayScreen.kt:88` |
| J-11 | judgement | Habit rows crammed: no padding above or below, names cut to one line | `/` and TodayPreview, `HabitRow.kt:63` (and `:68`) |
| J-12 | judgement | Add a habit's main action is a stock `OutlinedButton`, unlike every other | `/add` and AddHabitPreview, `AddHabitScreen.kt:95` |
| J-13 | judgement | Today has no empty state | `/` and TodayEmptyPreview, `TodayScreen.kt` |
| J-14 | judgement | `Modifier.absolutePadding(left = …)` on a habit's streak: wrong side in Arabic | `/habit/:id` and HabitPreview, `HabitScreen.kt:74` |
| J-15 | judgement | The back arrow is `Icons.Filled.ArrowBack`, which doesn't mirror in Arabic | `/habit/:id`, `/add`, HabitPreview and AddHabitPreview, `BackTopBar.kt:29` |

Paths are under `app/src/main/java/dev/motif/rafiq/`.

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `screen` is a route (`:id` matches any value, so `/habit/walk` is `/habit/:id`), `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false. `wholeFile` on J-07 means a finding anywhere in `MotifTheme.kt` counts, and `also` on J-11 is a second line that is the problem too (the name cut to one line).

A Compose app's screens are its routes and its previews: `motif shot` with no `--routes` draws `/sign-in`, `/` and `/add`, then every preview, named by its function (TodayPreview, TodayEmptyPreview, HabitPreview, AddHabitPreview, SignInPreview). A habit's page (`/habit/{id}`) needs a value, so a default run shows it only as HabitPreview. `screens` lists the other screens a problem shows on besides `location.screen`, and a consequence's `screens` may name previews too; a finding on any of them counts as on the problem's screen.

J-01's typed brown passes in light mode (on the light sand) but is about 2:1 on the dark sand, so the audit reports every streak on `/` and TodayPreview in dark mode, in both variants and both directions; those are its declared consequences.

## Changing it

Change the overlay and the list together. `cli/test/fixtures-compose.test.ts` checks, on every change, that `motif check` reports exactly the seven check problems at their lines (J-07 as a warning on the generated file's first line) and nothing else, that `motif validate` finds nothing, and that every pinned line holds its anchor. Where a JDK and the Android SDK are found, it also checks that `motif shot --sizes 390 --audit --variant all --rtl` (no `--routes`: the three routes and the five previews) reports J-08, J-09 and J-10 and nothing that isn't one of them or J-01's consequences, and that Rafiq itself has no findings on any of the eight screens.

The audit was checked by hand on 2026-10-20 with Compose UI 1.9.0 and Robolectric: J-08 is 2.11:1 in light mode and 3.09:1 in dark (2.81:1 and 4.41:1 in the High contrast variant), in both directions, on `/sign-in` and SignInPreview; J-09 is reported once per direction ("Add a habit" and "أضف عادة", 40×48 dp where people can tap it) and J-10 once, each on `/`, TodayPreview and TodayEmptyPreview. The judgement problems were looked at in the screenshots: J-11's rows have their text against the row's edges, J-14's streak number touches its words right to left, and J-15's back arrow, right to left, points forward instead of back on `/add`, `/habit/walk`, HabitPreview and AddHabitPreview.
