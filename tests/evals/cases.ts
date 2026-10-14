// The eval cases (spec §13.2): test B's five features on copies of the contract app, test C's review of the seeded app,
// and test D's three new apps from briefs. Each prompt switches approvals off in the skill's own words.

export type TestId = "B" | "C" | "D";

export interface EvalCase {
  id: string;
  test: TestId;
  title: string;
  /** B and C: the fixture app copied for the session. */
  fixture?: "react-contract-app" | "react-seeded-app";
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
    "Add a settings screen at /settings: switches for order-update and offer notifications, the delivery address with a way to change it, appearance (system, light or dark), and a sign-out button. Link to it from the app's navigation."),
  feature("b-search", "Search with an empty state", "/search",
    "Add product search at /search: a search field, matching products as a list, a state for when nothing matches that suggests another search, and a state for before anything is typed."),
  feature("b-profile", "Profile edit form with validation", "/profile/edit",
    "Add a profile edit form at /profile/edit: name, email and phone, with validation messages when a field is left and when the form is sent, a saving state and a success message. Pretend to save; there's no back end."),
  feature("b-notifications", "Notifications list", "/notifications",
    "Add a notifications list at /notifications: order and offer notifications grouped by day, unread markers, a mark-all-as-read action, and an empty state."),
  feature("b-checkout", "Checkout summary", "/checkout",
    "Add a checkout summary at /checkout: the basket's items with quantities and prices, the subtotal, delivery fee and total, a choice of delivery slot, and a place-order button with a confirmation state. Mock data only."),
  {
    id: "c-review", test: "C", title: "Review of the seeded app", fixture: "react-seeded-app", routes: ["/", "/products", "/products/oats"],
    prompt: `/motif:review Review the whole app: its screens are /, /products and /products/oats (a product). Write the report only: stop after the report step and don't change the app's code.\n\n${UNATTENDED}`,
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
