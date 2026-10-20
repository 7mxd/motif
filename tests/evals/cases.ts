// The eval cases (spec §13.2 and the plain web spec §11): test B's features on copies of the contract apps and site, test C's reviews of the seeded apps and site,
// and test D's new apps from briefs; on React web, plain web, Flutter and Jetpack Compose. Each prompt switches approvals off in the skill's own words.

import type { StackId } from "../../cli/src/detect/stacks";
import type { FixtureName } from "../fixtures/assemble";

export type TestId = "B" | "C" | "D";

export interface EvalCase {
  id: string;
  test: TestId;
  title: string;
  /** B and C: the fixture copied for the session. */
  fixture?: FixtureName;
  /** D: tests/fixtures/briefs/<brief>.md, copied into the empty folder as brief.md. */
  brief?: string;
  /** B: the feature's page. C: the screens reviewed. D: the starter screens. */
  routes: string[];
  prompt: string;
  maxTurns: number;
  /** Claude Code's --max-budget-usd, at its API-price estimate; the developer's plan pays, not an API account. */
  maxBudgetUsd: number;
  minutes: number;
  /** The app's stack when it isn't a web one: a Flutter case is type-checked with flutter analyze and drawn by Flutter, a Compose case with Gradle and drawn by Robolectric. */
  stack?: StackId;
}

export const UNATTENDED =
  "Don't stop for approval on this task, and don't ask me anything: choose the recommended option whenever there's a choice, carry on through every step that would wait for me, and show me everything at the end. If something can't be done here (no browser for screenshots, say), skip only that part and keep going.";

/** A case on a plain web site: nothing to install or build. */
export const isPlain = (c: EvalCase): boolean => c.fixture?.startsWith("plain-") ?? false;

/** A case on a Flutter app: Flutter needs to be installed for it. */
export const isFlutter = (c: EvalCase): boolean => c.stack === "flutter";

/** A case on a Jetpack Compose app: it needs a JDK and the Android SDK. */
export const isCompose = (c: EvalCase): boolean => c.stack === "compose";

/**
 * Whether grading needs a browser: C and D always, and B on a plain site, whose new page is checked in one. Flutter and
 * Compose draw their own screens, so their cases never do.
 */
export const needsBrowser = (c: EvalCase): boolean => !isFlutter(c) && !isCompose(c) && (c.test !== "B" || isPlain(c));

const feature = (id: string, title: string, route: string, what: string): EvalCase => ({
  id, test: "B", title, fixture: "react-contract-app", routes: [route],
  prompt: `/motif:feature ${what}\n\n${UNATTENDED}`,
  maxTurns: 200, maxBudgetUsd: 40, minutes: 90,
});

/** A feature on Maktaba. Every screenshot builds the app with flutter test, so these get longer than Larder's. */
const flutterFeature = (id: string, title: string, route: string, what: string): EvalCase => ({
  ...feature(id, title, route, what), fixture: "flutter-contract-app", stack: "flutter", minutes: 120,
});

/** A feature on Rafiq. Every screenshot runs Gradle, so these get as long as Maktaba's. */
const composeFeature = (id: string, title: string, route: string, what: string): EvalCase => ({
  ...feature(id, title, route, what), fixture: "compose-contract-app", stack: "compose", minutes: 120,
});

const newApp = (brief: string, title: string, stack?: StackId): EvalCase => ({
  id: `d-${brief}`, test: "D", title, brief, routes: ["/", "/sign-in", "/home"],
  prompt: `/motif:init Build the app described in brief.md in this folder; it has my answers to your questions. Put the welcome ${stack ? "screen" : "page"} at /, sign-in at /sign-in and home at /home.\n\n${UNATTENDED}`,
  maxTurns: 400, maxBudgetUsd: 80, minutes: 180,
  ...(stack ? { stack } : {}),
});

export const CASES: EvalCase[] = [
  feature("b-settings", "Settings screen", "/settings",
    "Add a settings screen at /settings: switches for order-update and offer notifications, the delivery address with a way to change it, appearance (system, light or dark), and a sign-out button. Link to it from the app's navigation."),
  feature("b-search", "Search with an empty state", "/search",
    "Add product search at /search: a search field, matching products as a list, a state for when nothing matches that suggests another search, and a state for before anything is typed."),
  feature("b-profile", "Profile edit form with validation", "/profile/edit",
    "Add a profile edit form at /profile/edit: name, email and phone, with validation messages when a field is left and when the form is sent, a saving state and a success message. Pretend to save; there's no back end."),
  feature("b-notifications", "Notifications list", "/notifications",
    "Add a notifications list at /notifications: order and offer notifications grouped by day, unread markers, a mark-all-as-read action, and an empty state."),
  feature("b-checkout", "Checkout summary", "/checkout",
    "Add a checkout summary at /checkout: the basket's items with quantities and prices, the subtotal, delivery fee and total, a choice of delivery slot, and a place-order button with a confirmation state. Mock data only."),  {
    id: "b-plain", test: "B", title: "History page on a plain site", fixture: "plain-contract-site", routes: ["/history.html"],
    prompt: `/motif:feature Add a history page at /history.html: every postcard sent so far, newest first and grouped by month, each with who it went to, the day it was sent and its status, plus an empty state for before the first postcard. Link to it from the main page.\n\n${UNATTENDED}`,
    maxTurns: 200, maxBudgetUsd: 40, minutes: 90,
  },
  // Not /books/reserve: go_router would give that to the book page's /books/:id whenever the new route is listed after it.
  flutterFeature("b-flutter-reserve", "Reserve a book (Flutter)", "/reserve",
    "Add a way to reserve a book at /reserve: pick one of the books with no copy on the shelf, choose how to hear when it's ready (a notification or an email), check a summary, then reserve it, with a confirmation state that says their place in the queue. Link to it from a book's page when no copy is on the shelf. Pretend to reserve; there's no back end."),
  flutterFeature("b-flutter-search", "Search with an empty state (Flutter)", "/search",
    "Add book search at /search: a search field, matching books (by title or author) as a list, a state for before anything is typed, and a state for when nothing matches that suggests another search. Link to it from the Books screen."),

  composeFeature("b-compose-reminder", "Habit reminders (Compose)", "/reminders",
    "Add a reminders screen at /reminders: every habit with a reminder time the person can set, and a save button that shows a saved confirmation. Link to it from the Today screen. Pretend to save; there's no back end."),
  composeFeature("b-compose-stats", "Weekly stats with an empty state (Compose)", "/stats",
    "Add a weekly stats screen at /stats: how many habits were done on each day of the past week, the week's best streak, and an empty state for a week with nothing done yet. Link to it from the Today screen."),

  {
    id: "c-review", test: "C", title: "Review of the seeded app", fixture: "react-seeded-app", routes: ["/", "/products", "/products/oats"],
    prompt: `/motif:review Review the whole app: its screens are /, /products and /products/oats (a product). Write the report only: stop after the report step and don't change the app's code.\n\n${UNATTENDED}`,
    maxTurns: 150, maxBudgetUsd: 40, minutes: 90,
  },
  {
    id: "c-plain", test: "C", title: "Review of the seeded plain site", fixture: "plain-seeded-site", routes: ["/"],
    prompt: `/motif:review Review the whole site: it's one page (/), including what it shows after a postcard is sent. Write the report only: stop after the report step and don't change the site's code.\n\n${UNATTENDED}`,
    maxTurns: 150, maxBudgetUsd: 40, minutes: 90,
  },
  {
    id: "c-flutter", test: "C", title: "Review of the seeded Flutter app", fixture: "flutter-seeded-app", stack: "flutter",
    routes: ["/", "/books", "/books/season-of-migration", "/loans", "/sign-in"],
    prompt: `/motif:review Review the whole app: its screens are /, /books, /books/season-of-migration (a book), /loans and /sign-in. Write the report only: stop after the report step and don't change the app's code.\n\n${UNATTENDED}`,
    maxTurns: 150, maxBudgetUsd: 40, minutes: 120,
  },
  {
    id: "c-compose", test: "C", title: "Review of the seeded Compose app", fixture: "compose-seeded-app", stack: "compose",
    routes: ["/", "/sign-in", "/add", "TodayPreview", "TodayEmptyPreview", "HabitPreview", "AddHabitPreview", "SignInPreview"],
    prompt: `/motif:review Review the whole app: its screens are the routes / (Today), /sign-in and /add, and the previews TodayPreview, TodayEmptyPreview, HabitPreview (a habit's page), AddHabitPreview and SignInPreview. Write the report only: stop after the report step and don't change the app's code.

${UNATTENDED}`,
    maxTurns: 150, maxBudgetUsd: 40, minutes: 120,
  },
  newApp("stride", "New app: Stride (a running club)"),
  newApp("ledgerly", "New app: Ledgerly (invoicing)"),
  newApp("bloom", "New app: Bloom (plant care)"),
  newApp("sahm", "New Flutter app: Sahm (university carpools)", "flutter"),
  newApp("nabta", "New Compose app: Nabta (plant care)", "compose"),
];

export function selectCases(all: EvalCase[], pick: { tests?: string[]; ids?: string[] }): EvalCase[] | { error: string } {
  const tests = (pick.tests ?? []).map((t) => t.toUpperCase());
  const badTest = tests.find((t) => !["B", "C", "D"].includes(t));
  if (badTest) return { error: `There's no test "${badTest}". Tests: B, C, D.` };
  const badId = (pick.ids ?? []).find((id) => !all.some((c) => c.id === id));
  if (badId) return { error: `There's no case "${badId}". Cases: ${all.map((c) => c.id).join(", ")}.` };
  const chosen = all.filter((c) => (tests.length === 0 || tests.includes(c.test)) && (!pick.ids?.length || pick.ids.includes(c.id)));
  return chosen.length > 0 ? chosen : { error: "Those options leave no cases to run." };
}
