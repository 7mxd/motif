// The eval cases (spec §13.2 and the plain web spec §11): test B's features on copies of the contract app and site, test C's reviews of the seeded app and site,
// and test D's three new apps from briefs. Each prompt switches approvals off in the skill's own words.

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
}

export const UNATTENDED =
  "Don't stop for approval on this task, and don't ask me anything: choose the recommended option whenever there's a choice, carry on through every step that would wait for me, and show me everything at the end. If something can't be done here (no browser for screenshots, say), skip only that part and keep going.";

/** A case on a plain web site: nothing to install or build. */
export const isPlain = (c: EvalCase): boolean => c.fixture?.startsWith("plain-") ?? false;

/** Whether grading needs a browser: C and D always, and B on a plain site, whose new page is checked in one. */
export const needsBrowser = (c: EvalCase): boolean => c.test !== "B" || isPlain(c);

const feature = (id: string, title: string, route: string, what: string): EvalCase => ({
  id, test: "B", title, fixture: "react-contract-app", routes: [route],
  prompt: `/motif:feature ${what}\n\n${UNATTENDED}`,
  maxTurns: 200, maxBudgetUsd: 40, minutes: 90,
});

const newApp = (brief: string, title: string): EvalCase => ({
  id: `d-${brief}`, test: "D", title, brief, routes: ["/", "/sign-in", "/home"],
  prompt: `/motif:init Build the app described in brief.md in this folder; it has my answers to your questions. Put the welcome page at /, sign-in at /sign-in and home at /home.\n\n${UNATTENDED}`,
  maxTurns: 400, maxBudgetUsd: 80, minutes: 180,
});

export const CASES: EvalCase[] = [
  feature("b-settings", "Settings screen", "/settings",
    "Build out the settings screen at /settings: it so far has only a partner store look switch under Appearance. Add switches for order-update and offer notifications, the delivery address with a way to change it, appearance choice (system, light or dark) next to the existing switch, and a sign-out button. Link to it from the app's navigation as well as from Home."),
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
  newApp("stride", "New app: Stride (a running club)"),
  newApp("ledgerly", "New app: Ledgerly (invoicing)"),
  newApp("bloom", "New app: Bloom (plant care)"),
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
