# The Flutter seeded app

Maktaba (the Flutter contract app) with 14 planted problems, for test C on Flutter: Motif's `review` mode is run on a copy in report-only mode, and its report is graded against [seeded-issues.json](seeded-issues.json).

## How it's built

`tests/fixtures/assemble.ts` copies the files git keeps in `../flutter-contract-app/` (so `.dart_tool/`, `build/`, `.motif/`, screenshots and the generated translations never come along), then the overlay's files on top. Nothing is removed (`remove` is empty).

```bash
bun tests/fixtures/assemble.ts flutter-seeded-app <empty folder>
```

Then run `flutter pub get` in the copy (it also writes the translations) before `flutter analyze` or `motif shot`. The design guide, the generated theme, `design/states/setup.dart` and `design/states/http.json` are Maktaba's, unchanged.

## The problems

| Id | Kind | What | Where |
|---|---|---|---|
| F-01 | exact (check) | "On the shelf" in a typed green, `Color(0xFF2E7D32)` | `lib/widgets/availability_label.dart:23` |
| F-02 | exact (check) | Off-scale padding `EdgeInsets.all(18)` on the book page | `lib/features/books/book_screen.dart:74` |
| F-03 | exact (check) | Off-scale corner `BorderRadius.circular(12)` on book covers | `lib/widgets/book_cover.dart:23` |
| F-04 | exact (check) | A typed `fontSize: 15` on the book's summary | `lib/features/books/book_screen.dart:121` |
| F-05 | exact (check) | A raw `Curves.easeIn` in the skeleton's pulse | `lib/widgets/skeleton.dart:49` |
| F-06 | exact (shot) | The lost-card caption faded to 50%: unreadable | `/sign-in`, `sign_in_screen.dart:108` |
| F-07 | exact (shot) | A 32×32 "See all books" icon button | `/`, `home_screen.dart:43` |
| F-08 | exact (shot) | A refresh icon button with no tooltip, so no name | `/books`, `books_screen.dart:24` |
| F-09 | judgement | Loans crammed into one tight row each | `/loans` |
| F-10 | judgement | Sign in's main action is a stock `ElevatedButton`, unlike every other (and near-black on near-black in dark mode) | `/sign-in`, `sign_in_screen.dart:100` |
| F-11 | judgement | Loans has no empty state | `/loans` |
| F-12 | judgement | `EdgeInsets.only(left:` in a book row: wrong side in Arabic | `/books`, `book_row.dart:56` |
| F-13 | judgement | A failed load shows the raw exception, with no Try again | `/loans`, `loans_screen.dart:47` |
| F-14 | judgement | No back button on the book page; only the Books tab or the system back gesture lead back | `/books/:id`, `book_screen.dart:26` |

## How a grader reads the list

As for the [React seeded app](../react-seeded-app/README.md#how-a-grader-reads-the-list): `location` with `file` and `line` must be pointed at (the line holds the issue's `anchor`), `file` alone means anywhere in that file, `screen` is a route (`:id` matches any value, so `/books/season-of-migration` is `/books/:id`), `categories` are the review categories that count (the first is the expected one), and `consequences` are findings a correct review also reports because of a problem, which count as correct rather than false.

F-01's typed green passes in light mode (5.1:1 on white) but is about 3.4:1 on the dark surfaces, so the audit reports every "copies on the shelf" label on `/`, `/books` and a book's page in dark mode, in both variants and both directions; those are its declared consequences.

## Changing it

Change the overlay and the list together, then run `dart format` on the overlay so its lines match what a developer's editor would write. `cli/test/fixtures-flutter.test.ts` checks, on every change, that `motif check` reports exactly the five check problems at their lines and nothing else, that `motif validate` finds nothing, and that every pinned line holds its anchor. Where Flutter is installed, it also checks that `flutter analyze` passes on the copy and that `motif shot --sizes 390 --audit --variant all --rtl` on `/`, `/sign-in`, `/loans`, `/books` and `/books/season-of-migration` reports F-06, F-07 and F-08 and nothing that isn't one of them or F-01's consequences.

The audit was checked by hand on 2026-10-20 with Flutter 3.44.8: F-06 is 2.22:1 in light mode and 2.83:1 in dark (both variants, both directions); F-07 is reported once per direction ("See all books" and "كل الكتب"); F-08 once, on `/books`. The judgement problems were looked at in the screenshots: F-09's rows sit 8 px from the screen's edge with 4 px between lines, and in F-12's right-to-left rows the titles touch their covers.
