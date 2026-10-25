import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../../tests/evals/cases";
import { addedComponents, angularBuildErrors, angularComponents, collectB, collectC, collectD, componentFacts, designSections, composeComponents, flutterComponents, reactComponents, recordedIn, rnComponents, stoppedByTypeErrors, svelteComponents, swiftUIComponents, vueComponents } from "../../tests/evals/collect";
import { gradeB, gradeD } from "../../tests/evals/grade";
import { Paused, type JudgeFn } from "../../tests/evals/judge";
import type { SeededIssue } from "../../tests/evals/match";
import { runCmd, type MotifResult, type Run } from "../../tests/evals/tools";
import { assemble } from "../../tests/fixtures/assemble";
import { prepareWorkspace } from "../../tests/evals/workspace";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = join(import.meta.dir, "../..");
const byId = (id: string) => CASES.find((c) => c.id === id)!;
const commands: string[][] = [];
// Real git; installs, builds and type checks are stubbed (exit 0) and recorded.
const run: Run = async (cmd, cwd, t, env) => {
  if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
  commands.push(cmd);
  return { code: 0, stdout: "ok", stderr: "", timedOut: false };
};
const outputs: Record<string, any> = {
  check: { command: "check", ok: true, exitCode: 0, summary: { files: 40, violations: 0, exceptions: 1, warnings: 0 } },
  validate: { command: "validate", ok: true, exitCode: 0, findings: [], summary: { errors: 0, warnings: 0 } },
  shot: {
    command: "shot", ok: false, exitCode: 1, shots: [], findings: [{ id: "F-001" }],
    routes: [{ route: "/", status: 200, shots: [] }, { route: "/sign-in", status: 200, shots: [] }, { route: "/home", status: 200, pageErrors: ["TypeError: x"], shots: [] }],
  },
};
const motif = async (args: string[]): Promise<MotifResult> => ({ code: 0, json: outputs[args[0]!], output: "" });
const noJudge: JudgeFn = async () => ({ error: "the grader wasn't expected here" });

describe("DESIGN.md's sections", () => {
  const ALL = ["1. Brief", "2. Direction", "3. Foundations", "4. Motion", "5. Components", "6. Patterns", "7. Accessibility", "8. Platform notes", "9. Do / Don't", "10. Change log"];
  const md = (body: Record<string, string>) => ["---", "motifContract: 1", "---", "", "Summary.", "", ...Object.entries(body).flatMap(([h, t]) => [`## ${h}`, "", t, ""])].join("\n");

  test("all there and filled in", () => {
    expect(designSections(md(Object.fromEntries(ALL.map((h) => [h, "Text."]))))).toEqual({ missing: [], empty: [] });
  });

  test("missing and empty ones are named; a comment or sub-heading alone is empty", () => {
    const body = Object.fromEntries(ALL.filter((h) => h !== "6. Patterns").map((h) => [h, "Text."]));
    body["4. Motion"] = "<!-- Fill this in -->\n### Springs";
    expect(designSections(md(body))).toEqual({ missing: ["Patterns"], empty: ["Motion"] });
  });

  test("the contract fixture's guide is complete", () => {
    expect(designSections(readFileSync(join(REPO, "tests/fixtures/react-contract-app/DESIGN.md"), "utf8"))).toEqual({ missing: [], empty: [] });
  });
});

describe("test B's measurements", () => {
  test("the page, new components (and which the design guide records), check, validate, build and type check", async () => {
    const ws = await prepareWorkspace(byId("b-settings"), join(tempDir("motif-col-"), "b"), run);
    mkdirSync(join(ws.app, "src/app/settings"), { recursive: true });
    writeFileSync(join(ws.app, "src/app/settings/page.tsx"), "export default function Settings() { return null; }\n");
    writeFileSync(join(ws.app, "src/components/SettingsRow.tsx"), "export function SettingsRow() { return <div className=\"row\" />; }\n");
    writeFileSync(join(ws.app, "src/components/AddressCard.tsx"), "export function AddressCard() { return <address />; }\n");
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-14 — Added AddressCard for saved addresses — approved by the eval\n`);
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-settings"), ws, { run, motif, judge: noJudge }, out);
    expect(f).toMatchObject({ route: "/settings", pageExists: true, check: { violations: 0, exceptions: 1, warnings: 0 }, validate: { errors: 0 }, build: { code: 0 }, typecheck: { code: 0 } });
    expect([...f.newComponents].sort()).toEqual(["AddressCard", "SettingsRow"]);
    expect(f.recorded).toEqual(["AddressCard"]);
    expect(commands.some((c) => c.join(" ") === "npm run build")).toBe(true);
    expect(commands.some((c) => c.join(" ") === "npx --no tsc --noEmit")).toBe(true);
    for (const file of ["check.json", "validate.json", "diff.patch", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("new components count wherever they are under src/, but not route files, tests, stories or a screen's own parts", async () => {
    const ws = await prepareWorkspace(byId("b-checkout"), join(tempDir("motif-col-"), "b3"), run);
    const files: Record<string, string> = {
      "src/app/checkout/page.tsx": "export default function Checkout() { return null; }\n",
      "src/app/checkout/layout.tsx": "export default function L({ children }: { children: React.ReactNode }) { return children; }\n",
      "src/app/checkout/_components/Summary.tsx": "export function Summary() { return <section>Total</section>; }\n",
      "src/app/checkout/SlotPicker.tsx": "export function SlotPicker() { return <ul><li>9 to 10</li></ul>; }\n",
      "src/app/checkout/CheckoutScreen.tsx": "import { Button } from \"@/components/Button\";\nexport function CheckoutScreen() { return <Button>Pay</Button>; }\n",
      "src/components/Switch.test.tsx": "export {};\n",
      "src/components/Card.stories.tsx": "export {};\n",
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(ws.app, path, ".."), { recursive: true });
      writeFileSync(join(ws.app, path), text);
    }
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-14 — Added Summary for the order total — approved by the eval\n`);
    const f = await collectB(byId("b-checkout"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect([...f.newComponents].sort()).toEqual(["SlotPicker", "Summary"]);
    expect(f.recorded).toEqual(["Summary"]);
    // Built from the app's own Button, in the checkout's folder: part of that screen.
    expect(f.screenParts).toEqual(["CheckoutScreen"]);
  });

  test("no page at the feature's route", async () => {
    const ws = await prepareWorkspace(byId("b-search"), join(tempDir("motif-col-"), "b2"), run);
    expect((await collectB(byId("b-search"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("test C's measurements", () => {
  const seeded: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/react-seeded-app/seeded-issues.json"), "utf8")).issues;
  const perfect = seeded.map((i, n) => ({
    id: `F-${String(n + 1).padStart(3, "0")}`, severity: i.severity, category: i.categories[0], source: i.kind,
    location: i.location.app ? { screen: "/" } : i.location, summary: i.summary, fix: "Fix it.",
  }));
  const writeReport = (app: string, findings: unknown[]) => {
    mkdirSync(join(app, "design/reviews"), { recursive: true });
    writeFileSync(join(app, "design/reviews/2026-10-14-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-14", findings }));
    writeFileSync(join(app, "design/reviews/2026-10-14-whole-app.md"), "# Review\n");
  };
  const confirmAll: JudgeFn = async (input) => ({
    verdict: {
      issues: Object.fromEntries(input.issues.map((x) => [x.issue.id, { findings: x.candidates.map((f) => f.id), why: "" }])),
      unmatched: Object.fromEntries(input.unmatched.map((f) => [f.id, { verdict: "real" as const, why: "" }])),
      notes: [],
    },
  });

  test("a review that reports every planted problem finds them all, with nothing false", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c"), run);
    writeReport(ws.app, perfect);
    const out = join(ws.dir, "results");
    const f = await collectC(byId("c-review"), ws, { run, motif, judge: confirmAll }, out);
    expect(f.exact.missed).toEqual([]);
    expect(f.judgement.missed).toEqual([]);
    expect(f.falseFindings).toEqual([]);
    expect(f.changedCode).toEqual([]);
    expect(f.report).toEqual({ findings: seeded.length, problems: [] });
    for (const file of ["review.json", "review.md", "grading.json", "diff.patch"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("a finding the grader calls false counts, and changes to the code are listed", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c2"), run);
    writeReport(ws.app, [...perfect, { id: "F-999", severity: "critical", category: "navigation", source: "judgement", location: { screen: "/settings" }, summary: "Settings can't be reached.", fix: "Add it." }]);
    writeFileSync(join(ws.app, "src/app/page.tsx"), "export default function Home() { return null; }\n");
    const judge: JudgeFn = async (input, cwd) => {
      const r = await confirmAll(input, cwd);
      if ("verdict" in r) r.verdict.unmatched["F-999"] = { verdict: "false", why: "There's no settings page in this app." };
      return r;
    };
    const f = await collectC(byId("c-review"), ws, { run, motif, judge }, join(ws.dir, "results"));
    expect(f.falseFindings).toEqual(["F-999"]);
    expect(f.changedCode).toEqual(["src/app/page.tsx"]);
  });

  test("an exact problem named only by its screen counts when the grader confirms it, and not otherwise", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c5"), run);
    const s12 = seeded.findIndex((i) => i.id === "S-12");
    const byScreen = { id: "F-900", severity: "critical", category: "contrast", source: "exact", location: { screen: "/", scheme: "light", selector: "p.opacity-40" }, summary: "The promo's small print is unreadable.", fix: "Use text-secondary at full opacity." };
    writeReport(ws.app, [...perfect.filter((_, n) => n !== s12), byScreen]);
    const out = join(ws.dir, "results");
    expect((await collectC(byId("c-review"), ws, { run, motif, judge: confirmAll }, out)).exact.missed).toEqual([]);
    const decline: JudgeFn = async (input, cwd) => {
      const r = await confirmAll(input, cwd);
      if ("verdict" in r) r.verdict.issues["S-12"] = { findings: [], why: "That finding is about the caption text." };
      return r;
    };
    expect((await collectC(byId("c-review"), ws, { run, motif, judge: decline }, out)).exact.missed).toEqual(["S-12"]);
  });

  test("no report: everything missed", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c3"), run);
    const f = await collectC(byId("c-review"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.report).toEqual({ error: expect.stringContaining("No review report") });
    expect(f.exact.found).toEqual([]);
    expect(f.judgement.missed).toHaveLength(10);
  });

  test("the grader meeting the usage limit pauses grading; a grader that fails is an error", async () => {
    const ws = await prepareWorkspace(byId("c-review"), join(tempDir("motif-col-"), "c4"), run);
    writeReport(ws.app, perfect);
    const out = join(ws.dir, "results");
    await expect(collectC(byId("c-review"), ws, { run, motif, judge: async () => ({ paused: { resetsAt: 1 } }) }, out)).rejects.toBeInstanceOf(Paused);
    await expect(collectC(byId("c-review"), ws, { run, motif, judge: async () => ({ error: "timed out" }) }, out)).rejects.toThrow("timed out");
  });
});

describe("test D's measurements", () => {
  test("finds the new app and measures it, screens included", async () => {
    const ws = await prepareWorkspace(byId("d-stride"), join(tempDir("motif-col-"), "d"), run);
    const app = join(ws.app, "stride");
    mkdirSync(join(app, "node_modules"), { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/react-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const out = join(ws.dir, "results");
    const before = commands.length;
    const f = await collectD(byId("d-stride"), ws, { run, motif, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.sections).toEqual({ missing: [], empty: [] });
    expect(f.screens).toEqual([{ route: "/", status: 200, pageErrors: 0 }, { route: "/sign-in", status: 200, pageErrors: 0 }, { route: "/home", status: 200, pageErrors: 1 }]);
    expect(f.auditFindings).toBe(1);
    expect(commands.slice(before).some((c) => c[1] === "install")).toBe(false); // its packages were installed
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });

  test("installs the packages when the session didn't", async () => {
    const ws = await prepareWorkspace(byId("d-ledgerly"), join(tempDir("motif-col-"), "d3"), run);
    writeFileSync(join(ws.app, "DESIGN.md"), "");
    const before = commands.length;
    await collectD(byId("d-ledgerly"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(commands.slice(before)).toContainEqual(["npm", "install"]);
  });

  test("no app found", async () => {
    const ws = await prepareWorkspace(byId("d-bloom"), join(tempDir("motif-col-"), "d2"), run);
    expect((await collectD(byId("d-bloom"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).app).toBeNull();
  });
});

// Diffs as git writes them: a new file, and an edit of an existing one.
const newFile = (path: string, text: string) => {
  const lines = text.split("\n");
  return [`diff --git a/${path} b/${path}`, "new file mode 100644", "index 0000000..1111111", "--- /dev/null", `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join("\n");
};
const edit = (path: string, removed: string[], added: string[]) =>
  [`diff --git a/${path} b/${path}`, "index 1111111..2222222 100644", `--- a/${path}`, `+++ b/${path}`, "@@ -1 +1 @@", ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join("\n");

describe("new components on React web, from the session's diff (fourth eval run)", () => {
  test("a file in a route folder built from the app's own components is part of that screen, not a new component", () => {
    // b-settings split its page into SettingsScreen and AddressSheet, both made of the app's components.
    const diff = [
      newFile("src/app/settings/SettingsScreen.tsx", 'import { Button } from "@/components/Button";\nimport { Switch } from "@/components/Switch";\nexport function SettingsScreen() {\n  return <div><Switch /><Button>Save</Button></div>;\n}'),
      newFile("src/app/settings/AddressSheet.tsx", 'import { Sheet } from "../../components/Sheet";\nexport function AddressSheet() {\n  return <Sheet><form /></Sheet>;\n}'),
    ].join("\n");
    expect(reactComponents(diff)).toEqual({ newComponents: [], screenParts: ["SettingsScreen", "AddressSheet"], notUi: [] });
  });

  test("a route file that reuses nothing, only icons, or only components this change adds still counts", () => {
    const diff = [
      newFile("src/app/checkout/SlotPicker.tsx", 'import { ClockIcon } from "@/components/icons";\nexport function SlotPicker() {\n  return <button className="slot"><ClockIcon /></button>;\n}'),
      newFile("src/app/checkout/Summary.tsx", 'import { PriceTag } from "@/components/PriceTag";\nexport function Summary() {\n  return <PriceTag />;\n}'),
      newFile("src/components/PriceTag.tsx", "export function PriceTag() {\n  return <span className=\"price\" />;\n}"),
    ].join("\n");
    expect(reactComponents(diff).newComponents).toEqual(["SlotPicker", "Summary", "PriceTag"]);
  });

  test("a new file among the shared components counts, even when it's built from others", () => {
    const diff = newFile("src/components/NotificationBell.tsx", 'import { IconLink } from "./IconButton";\nexport function NotificationBell() {\n  return <IconLink href="/notifications" />;\n}');
    expect(reactComponents(diff).newComponents).toEqual(["NotificationBell"]);
  });

  test("a file that draws no UI isn't a component: state shared through a context; type arguments aren't tags", () => {
    // b-notifications kept which notifications are read in a context, rendered the React 19 way.
    const diff = [
      newFile("src/app/notifications-state.tsx", 'import { createContext, useState, type ReactNode } from "react";\nconst NotificationsContext = createContext<NotificationsState | null>(null);\nexport function NotificationsProvider({ children }: { children: ReactNode }) {\n  const [read] = useState<Set<string>>(new Set());\n  return <NotificationsContext value={{ read }}>{children}</NotificationsContext>;\n}'),
      newFile("src/basket-state.tsx", 'import { createContext } from "react";\nconst Basket = createContext(0);\nexport const BasketProvider = ({ children }: { children: React.ReactNode }) => <Basket.Provider value={1}>{children}</Basket.Provider>;'),
    ].join("\n");
    expect(reactComponents(diff)).toEqual({ newComponents: [], screenParts: [], notUi: ["notifications-state", "basket-state"] });
  });

  test("names in the design guide count only as written, in lines the session really added", () => {
    // b-checkout's change log said "the checkout's delivery slots", which recorded Checkout; and a guide saved with other
    // line endings looked fully rewritten, so every name already in it looked recorded.
    const diff = edit("DESIGN.md", ["| Button | Actions | primary |\r", "| Sheet | A task from the bottom | — |\r"], [
      "| Button | Actions | primary |",
      "| Sheet | A task from the bottom | — |",
      "| RadioList | One choice from a few options | — |",
      "- 2026-10-17 — Added RadioList for the checkout's delivery slots — not yet approved",
    ]);
    expect(recordedIn(diff, ["RadioList", "Checkout", "Sheet"])).toEqual(["RadioList"]);
  });
});

describe("test B on a plain site", () => {
  test("new components are new Component: lines; an edited one isn't new", () => {
    const diff = [
      "diff --git a/components.css b/components.css",
      "--- a/components.css",
      "+++ b/components.css",
      "-/* Component: Button — actions: primary (default), secondary */",
      "+/* Component: Button — actions: primary (default), secondary, ghost */",
      "+/* Component: MonthGroup — a month's heading and its rows */",
      "+/* Component: Stat — a number with a label */",
    ].join("\n");
    expect(addedComponents(diff)).toEqual(["MonthGroup", "Stat"]);
  });

  test("the page, the page loading in a browser, new components (and which the guide records), check and validate; nothing built", async () => {
    const ws = await prepareWorkspace(byId("b-plain"), join(tempDir("motif-col-"), "bp"), run);
    const before = commands.length;
    writeFileSync(join(ws.app, "history.html"), "<!doctype html><title>History</title>\n");
    writeFileSync(join(ws.app, "components.css"), `${readFileSync(join(ws.app, "components.css"), "utf8")}\n/* Component: MonthGroup — a month's heading and its rows */\n.month-group { display: grid; }\n`);
    writeFileSync(join(ws.app, "DESIGN.md"), `${readFileSync(join(ws.app, "DESIGN.md"), "utf8")}\n- 2026-10-15 — Added MonthGroup for the history page — approved by the eval\n`);
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/history.html", status: 200, shots: [] }] };
    try {
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-plain"), ws, { run, motif, judge: noJudge }, out);
      expect(f).toMatchObject({ route: "/history.html", pageExists: true, render: { route: "/history.html", status: 200, pageErrors: 0 }, newComponents: ["MonthGroup"], recorded: ["MonthGroup"] });
      expect(f.build).toBeUndefined();
      expect(commands.slice(before).some((c) => c.includes("build") || c.includes("tsc") || c[0] === "npm")).toBe(false);
      expect(existsSync(join(out, "shot.json"))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });
});

describe("test C on the plain seeded site", () => {
  test("is graded against the site's own list", async () => {
    const seededSite: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/plain-seeded-site/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-plain"), join(tempDir("motif-col-"), "cp"), run);
    const p01 = seededSite.find((i) => i.id === "P-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-15-whole-site.json"), JSON.stringify({ motifReview: 1, scope: "whole site", date: "2026-10-15", findings: [
      { id: "F-001", severity: "major", category: "raw-value", source: "exact", location: p01.location, summary: p01.summary, fix: "Use the border role." },
    ] }));
    const f = await collectC(byId("c-plain"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["P-01"]);
    expect(f.exact.missed).toHaveLength(seededSite.filter((i) => i.kind === "exact").length - 1);
    expect(f.judgement.missed).toHaveLength(seededSite.filter((i) => i.kind === "judgement").length);
  });
});

describe("new components on a plain site (backlog)", () => {
  test("a Component: line for a component the site already has isn't a new one", () => {
    const diff = ["--- a/components.css", "+++ b/components.css", "+/* Component: Card — a group of related content, now with a footer */", "+/* Component: Stat — a number with a label */"].join("\n");
    expect(addedComponents(diff, new Set(["Card"]))).toEqual(["Stat"]);
    const plain = CASES.find((c) => c.id === "b-plain")!;
    const full = [
      "diff --git a/components.css b/components.css", "index 1111111..2222222 100644", "--- a/components.css", "+++ b/components.css", "@@ -1 +1,2 @@",
      "+/* Component: Card — a group of related content, now with a footer */", "+/* Component: Stat — a number with a label */",
    ].join("\n");
    expect(componentFacts(plain, full).newComponents).toEqual(["Stat"]);
  });
});

describe("new components on Flutter, from the session's diff", () => {
  test("public widget classes under lib/ count; private ones are a screen's parts; the page a route shows, lib/design/, moved classes and tests don't count", () => {
    const diff = [
      newFile("lib/features/search/search_screen.dart", [
        "class SearchScreen extends ConsumerStatefulWidget {",
        "  const SearchScreen({super.key});",
        "}",
        "class _SearchScreenState extends ConsumerState<SearchScreen> {}",
        "class _EmptyQuery extends StatelessWidget {",
        "  const _EmptyQuery();",
        "}",
      ].join("\n")),
      // dart format puts a long extends clause on its own line.
      newFile("lib/widgets/result_tile.dart", "class ResultTile\n    extends StatelessWidget {\n  const ResultTile({super.key});\n}"),
      newFile("lib/widgets/filters.dart", "class Filters extends HookWidget {}\nclass QueueCard extends ConsumerWidget {}\nclass SearchQuery extends Notifier<String> {}"),
      newFile("lib/design/search_theme.dart", "class SearchSwatch extends StatelessWidget {}"),
      newFile("test/search_test.dart", "class FakeTile extends StatelessWidget {}"),
      edit("lib/widgets/book_row.dart", ["class BookRow extends StatefulWidget {"], []),
      newFile("lib/widgets/rows/book_row.dart", "class BookRow extends StatefulWidget {}"),
      edit("lib/app.dart", [], ["          GoRoute(", "            path: '/search',", "            builder: (context, state) => const SearchScreen(),", "          ),"]),
    ].join("\n");
    expect(flutterComponents(diff)).toEqual({ newComponents: ["ResultTile", "Filters", "QueueCard"], screens: ["SearchScreen"], screenParts: ["_EmptyQuery"] });
  });

  test("a page built through pageBuilder is a page too; a widget an item builder draws isn't", () => {
    const diff = [
      newFile("lib/features/reserve/reserve_screen.dart", "class ReserveScreen extends StatelessWidget {}\nclass QueuePlace extends StatelessWidget {}"),
      edit("lib/app.dart", [], [
        "GoRoute(path: '/reserve', pageBuilder: (context, state) => const NoTransitionPage(child: ReserveScreen())),",
        "ListView.builder(itemBuilder: (context, index) => QueuePlace(index: index));",
      ]),
    ].join("\n");
    expect(flutterComponents(diff)).toEqual({ newComponents: ["QueuePlace"], screens: ["ReserveScreen"], screenParts: [] });
  });

  test("only a GoRoute's or ShellRoute's builder shows a page: a widget a LayoutBuilder or FutureBuilder returns still counts", () => {
    const diff = [
      newFile("lib/features/search/search_screen.dart", [
        "class SearchScreen extends StatelessWidget {}",
        "class WideResults extends StatelessWidget {}",
        "class LoadedResults extends StatelessWidget {}",
        "class Pulse extends StatelessWidget {}",
        "Widget body() => LayoutBuilder(",
        "  builder: (context, constraints) => const WideResults(),",
        ");",
        "Widget later() => FutureBuilder(future: f, builder: (context, snapshot) => LoadedResults(snapshot: snapshot));",
        "Widget pulse() => AnimatedBuilder(animation: a, builder: (context, child) {",
        "  return Pulse(child: child);",
        "});",
      ].join("\n")),
      edit("lib/app.dart", [], ["          GoRoute(path: '/search', builder: (context, state) => const SearchScreen()),"]),
    ].join("\n");
    expect(flutterComponents(diff)).toEqual({ newComponents: ["WideResults", "LoadedResults", "Pulse"], screens: ["SearchScreen"], screenParts: [] });
  });

  test("a route builder with a block body shows its page too, and so does a ShellRoute's pageBuilder", () => {
    const diff = [
      newFile("lib/features/reserve/reserve_screen.dart", "class ReserveScreen extends ConsumerWidget {}\nclass ReserveShell extends StatelessWidget {}"),
      edit("lib/app.dart", [], [
        "          GoRoute(",
        "            path: '/reserve',",
        "            builder: (context, state) {",
        "              final id = state.uri.queryParameters['book'];",
        "              return ReserveScreen(bookId: id);",
        "            },",
        "          ),",
        "      ShellRoute(",
        "        pageBuilder: (context, state, child) => NoTransitionPage(child: ReserveShell(child: child)),",
        "        routes: [],",
        "      ),",
      ]),
    ].join("\n");
    expect(flutterComponents(diff)).toEqual({ newComponents: [], screens: ["ReserveScreen", "ReserveShell"], screenParts: [] });
  });

  test("componentFacts uses the Flutter rule for a Flutter case, and the guide's lines for what's recorded", () => {
    const diff = [
      newFile("lib/widgets/queue_badge.dart", "class QueueBadge extends StatelessWidget {}"),
      newFile("lib/widgets/branch_picker.dart", "class BranchPicker extends StatelessWidget {}"),
      edit("DESIGN.md", [], ["| QueueBadge | A place in the reservation queue | — | — |"]),
    ].join("\n");
    expect(componentFacts(byId("b-flutter-reserve"), diff)).toEqual({ newComponents: ["QueueBadge", "BranchPicker"], screens: [], screenParts: [], recorded: ["QueueBadge"] });
  });
});

describe("test B on Flutter", () => {
  test("the page (from go_router), flutter analyze for the type check, the page drawn at 390, new components; nothing built", async () => {
    const ws = await prepareWorkspace(byId("b-flutter-search"), join(tempDir("motif-col-"), "bf"), run);
    expect(commands.at(-1)).toEqual(["flutter", "pub", "get"]);
    mkdirSync(join(ws.app, "lib/features/search"), { recursive: true });
    writeFileSync(
      join(ws.app, "lib/features/search/search_screen.dart"),
      "import 'package:flutter/material.dart';\n\nclass SearchScreen extends StatelessWidget {\n  const SearchScreen({super.key});\n\n  @override\n  Widget build(BuildContext context) => const _NoResults();\n}\n\nclass _NoResults extends StatelessWidget {\n  const _NoResults();\n\n  @override\n  Widget build(BuildContext context) => const SizedBox();\n}\n",
    );
    const appDart = readFileSync(join(ws.app, "lib/app.dart"), "utf8").replace(/\r\n/g, "\n");
    const routed = appDart.replace("          GoRoute(\n            path: '/loans',", "          GoRoute(\n            path: '/search',\n            builder: (context, state) => const SearchScreen(),\n          ),\n          GoRoute(\n            path: '/loans',");
    expect(routed).not.toBe(appDart);
    writeFileSync(join(ws.app, "lib/app.dart"), routed);
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/search", status: 200, shots: [] }] };
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    try {
      const before = commands.length;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-flutter-search"), ws, { run, motif: recording, judge: noJudge }, out);
      expect(f).toMatchObject({
        route: "/search", pageExists: true, typecheck: { code: 0, command: "flutter analyze" }, render: { route: "/search", status: 200, pageErrors: 0 },
        newComponents: [], screens: ["SearchScreen"], screenParts: ["_NoResults"],
      });
      expect(f.build).toBeUndefined();
      expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["flutter pub get", "flutter analyze --no-fatal-infos"]);
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/search", "--sizes", "390"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "pub-get.log", "analyze.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });

  test("when flutter pub get fails, the type check fails and says why, even if flutter analyze passes", async () => {
    const ws = await prepareWorkspace(byId("b-flutter-search"), join(tempDir("motif-col-"), "bf3"), run);
    const brokenPub: Run = async (cmd, cwd, t, env) =>
      cmd.join(" ") === "flutter pub get" ? { code: 1, stdout: "", stderr: "Because maktaba depends on nope, version solving failed.", timedOut: false } : run(cmd, cwd, t, env);
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-flutter-search"), ws, { run: brokenPub, motif, judge: noJudge }, out);
    expect(f.typecheck).toMatchObject({ code: 1, command: "flutter analyze", detail: "flutter pub get failed (see pub-get.log), so the type check couldn't run properly." });
    expect(readFileSync(join(out, "pub-get.log"), "utf8")).toContain("version solving failed");
    expect(existsSync(join(out, "analyze.log"))).toBe(true);
  });

  test("no page at the feature's route: /books/:id isn't /reserve", async () => {
    const ws = await prepareWorkspace(byId("b-flutter-reserve"), join(tempDir("motif-col-"), "bf2"), run);
    expect((await collectB(byId("b-flutter-reserve"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("test C on the Flutter seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/flutter-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-flutter"), join(tempDir("motif-col-"), "cf"), run);
    const f01 = seededApp.find((i) => i.id === "F-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-20-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-20", findings: [
      { id: "F-001", severity: "major", category: f01.categories[0], source: "exact", location: f01.location, summary: f01.summary, fix: "Use the success role." },
    ] }));
    const f = await collectC(byId("c-flutter"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["F-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on Flutter", () => {
  test("gets the packages, runs flutter analyze and draws the starter screens at 390; nothing built", async () => {
    const ws = await prepareWorkspace(byId("d-sahm"), join(tempDir("motif-col-"), "df"), run);
    const app = join(ws.app, "sahm");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/flutter-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "pubspec.yaml"), "name: sahm\n");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const before = commands.length;
    const out = join(ws.dir, "results");
    const f = await collectD(byId("d-sahm"), ws, { run, motif: recording, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.build).toBeUndefined();
    expect(f.typecheck).toEqual({ code: 0, timedOut: false, command: "flutter analyze" });
    expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["flutter pub get", "flutter analyze --no-fatal-infos"]);
    expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/,/sign-in,/home", "--sizes", "390"]);
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "pub-get.log", "analyze.log"]) expect(existsSync(join(out, file))).toBe(true);
  });
});

const GRADLE = "./gradlew :app:compileDebugKotlin";

describe("new components on Compose, from the session's diff", () => {
  const UI = "app/src/main/java/dev/motif/rafiq/ui";
  test("public @Composable functions under ui/ count; private ones, *Screen entry points, their Content, previews and the generated theme don't", () => {
    const diff = [
      newFile(`${UI}/reminders/RemindersScreen.kt`, [
        "@Composable", "fun RemindersScreen(onBack: () -> Unit) {}",
        "@Composable", "fun RemindersContent(state: Int) {}",
        "@Composable", "private fun TimeRow(time: String) {}",
        "@Preview", "@Composable", "fun RemindersPreview() {}",
        "@Composable @Preview(name = \"dark\")", "fun RemindersDarkPreview() {}",
        "fun notComposable() {}",
      ].join("\n")),
      newFile(`${UI}/components/TimeChip.kt`, "@Composable\nfun TimeChip(time: String, modifier: Modifier = Modifier) {}\n@Composable\ninternal fun <T> Pill(x: T) {}\n@Composable\nfun Modifier.Weird() {}"),
      newFile(`${UI}/motif/MotifTheme.kt`, "// Generated by Motif — edit design/tokens.json instead, then run \"motif tokens\".\n@Composable\nfun MotifTheme(content: @Composable () -> Unit) {}"),
      newFile(`${UI}/motif/Extras.kt`, "@Composable\nfun MotifExtras() {}"),
      newFile("app/src/main/java/dev/motif/rafiq/data/Thing.kt", "@Composable\nfun NotUi() {}"),
      newFile("app/src/test/java/dev/motif/rafiq/ui/FakeTest.kt", "@Composable\nfun Fake() {}"),
      edit(`${UI}/components/HabitRow.kt`, ["@Composable", "fun HabitRow(h: Int) {}"], []),
      newFile(`${UI}/habit/HabitRow.kt`, "@Composable\nfun HabitRow(h: Int) {}"),
    ].join("\n");
    expect(composeComponents(diff)).toEqual({
      newComponents: ["TimeChip", "Pill", "Weird"], screens: ["RemindersScreen", "RemindersContent"], screenParts: ["TimeRow"],
    });
  });

  test("componentFacts uses the Compose rule for a Compose case, and the guide's lines for what's recorded", () => {
    const diff = [
      newFile(`${UI}/components/TimeChip.kt`, "@Composable\nfun TimeChip() {}"),
      newFile(`${UI}/components/BarChart.kt`, "@Composable\nfun BarChart() {}"),
      edit("DESIGN.md", [], ["| TimeChip | A reminder time | — | — |"]),
    ].join("\n");
    expect(componentFacts(byId("b-compose-stats"), diff)).toEqual({ newComponents: ["TimeChip", "BarChart"], screens: [], screenParts: [], recorded: ["TimeChip"] });
  });
});

describe("test B on Compose", () => {
  const android = () => ({ java: "/jdk/bin/java", javaHome: "/jdk", sdk: "/sdk" });
  const calls: { cmd: string[]; env?: Record<string, string | undefined> }[] = [];
  const recordingRun: Run = async (cmd, cwd, t, env) => {
    if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
    calls.push({ cmd, env });
    return { code: 0, stdout: "ok", stderr: "", timedOut: false };
  };
  const addRoute = (app: string, route: string, screen: string) => {
    const main = join(app, "app/src/main/java/dev/motif/rafiq/MainActivity.kt");
    const text = readFileSync(main, "utf8");
    const routed = text.replace("composable(Routes.ADD) {", `composable("${route}") {\n                ${screen}()\n            }\n            composable(Routes.ADD) {`);
    expect(routed).not.toBe(text);
    writeFileSync(main, routed);
  };
  const withShot = async <T,>(shot: any, body: () => Promise<T>) => {
    const saved = outputs.shot;
    outputs.shot = shot;
    try {
      return await body();
    } finally {
      outputs.shot = saved;
    }
  };

  test("the page (a navigation route), compileDebugKotlin for the type check, the page drawn at 390, new components; nothing built", async () => {
    const ws = await prepareWorkspace(byId("b-compose-reminder"), join(tempDir("motif-col-"), "bc"), recordingRun);
    const ui = join(ws.app, "app/src/main/java/dev/motif/rafiq/ui/reminders");
    mkdirSync(ui, { recursive: true });
    writeFileSync(join(ui, "RemindersScreen.kt"), "package dev.motif.rafiq.ui.reminders\n\n@Composable\nfun RemindersScreen() {}\n\n@Composable\nprivate fun TimeRow() {}\n");
    addRoute(ws.app, "reminders", "RemindersScreen");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/reminders", status: 200, shots: [] }] };
    await withShot(shot, async () => {
      calls.length = 0;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-compose-reminder"), ws, { run: recordingRun, motif: recording, judge: noJudge, android }, out);
      expect(f).toMatchObject({
        route: "/reminders", pageExists: true, typecheck: { code: 0, command: GRADLE }, render: { route: "/reminders", status: 200, pageErrors: 0 },
        newComponents: [], screens: ["RemindersScreen"], screenParts: ["TimeRow"],
      });
      expect(f.build).toBeUndefined();
      expect(calls).toHaveLength(1);
      const { cmd, env } = calls[0]!;
      expect(cmd[0]).toBe("/jdk/bin/java");
      expect(cmd.slice(cmd.indexOf("org.gradle.wrapper.GradleWrapperMain") + 1)).toEqual([":app:compileDebugKotlin", "--console=plain"]);
      expect(env).toMatchObject({ JAVA_HOME: "/jdk", ANDROID_HOME: "/sdk" });
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/reminders", "--sizes", "390"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "compile.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
    });
  });

  test("a screen that is only a preview exists, and is drawn with --screen", async () => {
    const ws = await prepareWorkspace(byId("b-compose-stats"), join(tempDir("motif-col-"), "bc2"), recordingRun);
    const ui = join(ws.app, "app/src/main/java/dev/motif/rafiq/ui/stats");
    mkdirSync(ui, { recursive: true });
    writeFileSync(join(ui, "StatsScreen.kt"), "package dev.motif.rafiq.ui.stats\n\n@Preview\n@Composable\nfun StatsScreenPreview() {\n}\n");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "StatsScreenPreview", status: 200, shots: [] }] };
    await withShot(shot, async () => {
      const f = await collectB(byId("b-compose-stats"), ws, { run: recordingRun, motif: recording, judge: noJudge, android }, join(ws.dir, "results"));
      expect(f).toMatchObject({ route: "/stats", pageExists: true, render: { route: "StatsScreenPreview", status: 200, pageErrors: 0 } });
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--screen", "StatsScreenPreview", "--sizes", "390"]);
    });
  });

  test("no screen at the route: the type check still runs, and the page can't be drawn", async () => {
    const ws = await prepareWorkspace(byId("b-compose-stats"), join(tempDir("motif-col-"), "bc3"), recordingRun);
    const f = await withShot({ command: "shot", ok: false, exitCode: 1, error: "nothing", routes: [] }, () =>
      collectB(byId("b-compose-stats"), ws, { run: recordingRun, motif, judge: noJudge, android }, join(ws.dir, "results")));
    expect(f.pageExists).toBe(false);
    expect(f.typecheck).toMatchObject({ code: 0, command: GRADLE });
    expect(f.render).toEqual({ error: expect.any(String) });
  });

  test("without a JDK or an SDK the type check fails and says why", async () => {
    const ws = await prepareWorkspace(byId("b-compose-stats"), join(tempDir("motif-col-"), "bc4"), recordingRun);
    calls.length = 0;
    const f = await collectB(byId("b-compose-stats"), ws, { run: recordingRun, motif, judge: noJudge, android: () => ({ problem: "No JDK found." }) }, join(ws.dir, "results"));
    expect(f.typecheck).toMatchObject({ code: 1, command: GRADLE, detail: "No JDK found." });
    expect(calls).toHaveLength(0);
  });

  test("a failed compile keeps Gradle's words in compile.log", async () => {
    const ws = await prepareWorkspace(byId("b-compose-stats"), join(tempDir("motif-col-"), "bc5"), recordingRun);
    const failing: Run = async (cmd, cwd, t, env) =>
      cmd[0] === "/jdk/bin/java" ? { code: 1, stdout: "", stderr: "e: RemindersScreen.kt:3:1 Unresolved reference: Foo", timedOut: false } : recordingRun(cmd, cwd, t, env);
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-compose-stats"), ws, { run: failing, motif, judge: noJudge, android }, out);
    expect(f.typecheck).toMatchObject({ code: 1, command: GRADLE });
    expect(readFileSync(join(out, "compile.log"), "utf8")).toContain("Unresolved reference");
  });
});

describe("test C on the Compose seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/compose-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-compose"), join(tempDir("motif-col-"), "cc"), run);
    const j01 = seededApp.find((i) => i.id === "J-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-20-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-20", findings: [
      { id: "F-001", severity: "major", category: j01.categories[0], source: "exact", location: j01.location, summary: j01.summary, fix: "Use the on-action-secondary role." },
    ] }));
    const f = await collectC(byId("c-compose"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["J-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on Compose", () => {
  test("runs compileDebugKotlin and draws the starter screens at 390; nothing built, nothing installed", async () => {
    const calls: string[][] = [];
    const recordingRun: Run = async (cmd, cwd, t, env) => {
      if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
      calls.push(cmd);
      return { code: 0, stdout: "ok", stderr: "", timedOut: false };
    };
    const ws = await prepareWorkspace(byId("d-nabta"), join(tempDir("motif-col-"), "dc"), recordingRun);
    const app = join(ws.app, "nabta");
    assemble("compose-contract-app", app);
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const out = join(ws.dir, "results");
    const f = await collectD(byId("d-nabta"), ws, { run: recordingRun, motif: recording, judge: noJudge, android: () => ({ java: "/jdk/bin/java", javaHome: "/jdk" }) }, out);
    expect(f.app).toBe(app);
    expect(f.build).toBeUndefined();
    expect(f.typecheck).toEqual({ code: 0, timedOut: false, command: GRADLE });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.slice(-2)).toEqual([":app:compileDebugKotlin", "--console=plain"]);
    expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/,/sign-in,/home", "--sizes", "390"]);
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "compile.log"]) expect(existsSync(join(out, file))).toBe(true);
  });
});

describe("new components on React Native, from the session's diff", () => {
  test("an exported function component under components/ is new; the route file's default export is the screen, its private components are parts of it", () => {
    const diff = [
      newFile("components/order-card.tsx", 'import { View, Text } from "react-native";\nexport function OrderCard() {\n  return <View><Text>x</Text></View>;\n}'),
      newFile("components/badge.tsx", 'import { View } from "react-native";\nexport const Badge = () => <View />;\nexport default Badge;'),
      newFile("app/orders.tsx", 'import { OrderCard } from "../components/order-card";\nexport default function OrdersScreen() {\n  return <Group />;\n}\nfunction Group() {\n  return <OrderCard />;\n}\nconst Header = () => <OrderCard />;'),
    ].join("\n");
    expect(rnComponents(diff)).toEqual({ newComponents: ["OrderCard", "Badge"], screens: ["OrdersScreen"], screenParts: ["Group", "Header"], notUi: [] });
  });

  test("memo and forwardRef components count; hooks, types and anything outside components/ and app/ don't", () => {
    const diff = [
      newFile("components/price.tsx", 'export const Price = React.memo(function Price() {\n  return <Text />;\n});\nexport const Field = forwardRef<View, Props>((props, ref) => <View ref={ref} />);\nexport function usePrice() {\n  return 1;\n}\nexport type PriceProps = {};'),
      newFile("design/motif-theme.tsx", 'export function ThemeProvider({ children }) {\n  return <Ctx.Provider value={1}>{children}</Ctx.Provider>;\n}'),
      newFile("state/favourites.tsx", 'export function FavouritesProvider({ children }) {\n  return <Ctx value={1}>{children}</Ctx>;\n}'),
      newFile("components/order-card.test.tsx", 'export function Fixture() {\n  return <View />;\n}'),
    ].join("\n");
    expect(rnComponents(diff)).toEqual({ newComponents: ["Price", "Field"], screens: [], screenParts: [], notUi: [] });
  });

  test("a capitalised function that draws nothing is not UI; a route layout is navigation, not a screen", () => {
    const diff = [
      newFile("components/format.tsx", 'export function Money(value: number) {\n  return String(value);\n}'),
      newFile("app/orders/_layout.tsx", 'export default function Layout() {\n  return <Stack />;\n}'),
    ].join("\n");
    expect(rnComponents(diff)).toEqual({ newComponents: [], screens: [], screenParts: [], notUi: ["Money", "_layout"] });
  });

  test("a route file with an anonymous default export is named by its file; only a new route file is a new screen", () => {
    const diff = [
      newFile("app/favourites.tsx", "export default () => <View />;"),
      edit("app/index.tsx", ["export default function Home() { return <A />; }"], ["export default function Home() { return <B />; }"]),
    ].join("\n");
    expect(rnComponents(diff)).toEqual({ newComponents: [], screens: ["favourites"], screenParts: [], notUi: [] });
  });

  test("an edit that adds an export to an existing components file counts; one that only restyles, or moves a component, doesn't", () => {
    const diff = [
      edit("components/stock-label.tsx", ["  padding: 4,"], ["  padding: 8,"]),
      edit("components/product-row.tsx", ["export function Old() { return <View />; }"], ["export function Old() { return <View />; }", "export function ProductHeart() { return <View />; }"]),
      edit("components/app-button.tsx", ["export function Moved() { return <View />; }"], []),
      newFile("components/moved.tsx", "export function Moved() {\n  return <View />;\n}"),
    ].join("\n");
    expect(rnComponents(diff).newComponents).toEqual(["ProductHeart"]);
  });

  test("comments and strings that look like components don't count; src/ is looked through", () => {
    const diff = newFile("src/components/note.tsx", '// export function Fake() { return <View />; }\nconst x = "export function AlsoFake() { return <View />; }";\nexport function Real() {\n  return <View />;\n}');
    expect(rnComponents(diff).newComponents).toEqual(["Real"]);
  });

  test("componentFacts uses it for a React Native case, and says which the design guide records", () => {
    const diff = [
      newFile("components/order-card.tsx", "export function OrderCard() {\n  return <View />;\n}"),
      newFile("components/order-tag.tsx", "export function OrderTag() {\n  return <View />;\n}"),
      newFile("app/orders.tsx", "export default function Orders() {\n  return <View />;\n}"),
      edit("DESIGN.md", [], ["| OrderTag | A status on an order | — |"]),
    ].join("\n");
    expect(componentFacts(byId("b-rn-orders"), diff)).toEqual({ newComponents: ["OrderCard", "OrderTag"], screens: ["Orders"], screenParts: [], notUi: [], recorded: ["OrderTag"] });
  });
});

describe("test B on React Native", () => {
  test("the page (from Expo Router), tsc for the type check, the page drawn at 390 through the web target; nothing built", async () => {
    const ws = await prepareWorkspace(byId("b-rn-orders"), join(tempDir("motif-col-"), "brn"), run);
    expect(commands.at(-1)).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    mkdirSync(join(ws.app, "components"), { recursive: true });
    writeFileSync(join(ws.app, "app/orders.tsx"), 'import { OrderCard } from "../components/order-card";\nexport default function OrdersScreen() {\n  return <OrderCard />;\n}\n');
    writeFileSync(join(ws.app, "components/order-card.tsx"), "export function OrderCard() {\n  return <View />;\n}\n");
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/orders", status: 200, shots: [] }] };
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    try {
      const before = commands.length;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-rn-orders"), ws, { run, motif: recording, judge: noJudge }, out);
      expect(f).toMatchObject({
        route: "/orders", pageExists: true, typecheck: { code: 0, command: "tsc" }, render: { route: "/orders", status: 200, pageErrors: 0 },
        newComponents: ["OrderCard"], screens: ["OrdersScreen"],
      });
      expect(f.build).toBeUndefined();
      expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npx tsc --noEmit"]);
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/orders", "--sizes", "390"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "typecheck.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });

  test("no page at the feature's route: Dukkan has no /favourites", async () => {
    const ws = await prepareWorkspace(byId("b-rn-favourites"), join(tempDir("motif-col-"), "brn2"), run);
    expect((await collectB(byId("b-rn-favourites"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("new components on Vue, from the session's diff", () => {
  test("a new .vue file under components/ counts; one under views/ is the page itself", () => {
    const diff = [
      newFile("src/components/HistoryRow.vue", "<script setup lang=\"ts\"></script>\n<template>\n  <li />\n</template>"),
      newFile("src/components/SeasonTag.vue", "<template><span /></template>"),
      newFile("src/views/HistoryView.vue", "<template><main /></template>"),
    ].join("\n");
    expect(vueComponents(diff)).toEqual({ newComponents: ["HistoryRow", "SeasonTag"], screens: ["HistoryView"], screenParts: [], notUi: [] });
  });

  test("Nuxt's folders: pages/ are screens (index is its folder), layouts are navigation, nested components count", () => {
    const diff = [
      newFile("app/pages/settings/index.vue", "<template><main /></template>"),
      newFile("app/pages/history.vue", "<template><main /></template>"),
      newFile("app/layouts/garden.vue", "<template><slot /></template>"),
      newFile("app/components/history/Row.vue", "<template><li /></template>"),
      newFile("components/Toggle.vue", "<template><button /></template>"),
    ].join("\n");
    expect(vueComponents(diff)).toEqual({ newComponents: ["Row", "Toggle"], screens: ["settings", "history"], screenParts: [], notUi: ["garden"] });
  });

  test("a component with no template draws nothing; tests, stories, the generated theme and edits to existing files never count; a moved component isn't new", () => {
    const diff = [
      newFile("src/components/useBooking.vue", "<script setup lang=\"ts\">\nexport const x = 1;\n</script>"),
      newFile("src/components/Row.test.vue", "<template><i /></template>"),
      newFile("src/components/Row.stories.vue", "<template><i /></template>"),
      newFile("src/styles/motif.css", ":root { --motif-x: 1; }"),
      newFile("src/design/motion.ts", "export const m = 1;"),
      newFile("src/components/Moved.vue", "<template><i /></template>"),
      "diff --git a/src/components/old/Moved.vue b/src/components/old/Moved.vue\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/src/components/old/Moved.vue\n+++ /dev/null\n@@ -1 +0,0 @@\n-<template><i /></template>",
      edit("src/components/AppButton.vue", ["<template><button /></template>"], ["<template><button class=\"x\" /></template>"]),
      newFile("src/App.vue", "<template><RouterView /></template>"),
    ].join("\n");
    expect(vueComponents(diff)).toEqual({ newComponents: [], screens: [], screenParts: [], notUi: ["useBooking"] });
  });

  test("componentFacts routes a Vue case here and records the names DESIGN.md mentions", () => {
    const diff = [
      newFile("src/components/HistoryRow.vue", "<template><li /></template>"),
      newFile("src/components/SeasonTag.vue", "<template><span /></template>"),
      newFile("src/views/HistoryView.vue", "<template><main /></template>"),
      newFile("DESIGN.md", "- **Components:** SeasonTag, a chip for a season."),
    ].join("\n");
    expect(componentFacts(byId("b-vue-history"), diff)).toEqual({ newComponents: ["HistoryRow", "SeasonTag"], screens: ["HistoryView"], screenParts: [], notUi: [], recorded: ["SeasonTag"] });
  });
});

describe("test B on Vue", () => {
  test("the page (from Vue Router), the build, vue-tsc and the page drawn at 390 and 1440", async () => {
    const ws = await prepareWorkspace(byId("b-vue-history"), join(tempDir("motif-col-"), "bvue"), run);
    expect(commands.at(-1)).toEqual(["npm", "ci", "--no-audit", "--no-fund"]);
    const router = join(ws.app, "src/router/index.ts");
    writeFileSync(router, readFileSync(router, "utf8").replace('{ path: "/harvest"', '{ path: "/history", name: "history", component: () => import("../views/HistoryView.vue") },\n    { path: "/harvest"'));
    writeFileSync(join(ws.app, "src/views/HistoryView.vue"), "<template>\n  <main />\n</template>\n");
    writeFileSync(join(ws.app, "src/components/HistoryRow.vue"), "<template>\n  <li />\n</template>\n");
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/history", status: 200, shots: [] }] };
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    try {
      const before = commands.length;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-vue-history"), ws, { run, motif: recording, judge: noJudge }, out);
      expect(f).toMatchObject({
        route: "/history", pageExists: true, build: { code: 0 }, typecheck: { code: 0 }, render: { route: "/history", status: 200, pageErrors: 0 },
        newComponents: ["HistoryRow"], screens: ["HistoryView"],
      });
      expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm run build", "npx vue-tsc --noEmit"]);
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/history", "--sizes", "390,1440"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "build.log", "typecheck.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });

  test("no page at the feature's route: Bustan has no /settings", async () => {
    const ws = await prepareWorkspace(byId("b-vue-settings"), join(tempDir("motif-col-"), "bvue2"), run);
    expect((await collectB(byId("b-vue-settings"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("test C on the Vue seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/vue-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-vue"), join(tempDir("motif-col-"), "cvue"), run);
    const v01 = seededApp.find((i) => i.id === "V-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-24-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-24", findings: [
      { id: "F-001", severity: "major", category: v01.categories[0], source: "exact", location: v01.location, summary: v01.summary, fix: "Use the success role." },
    ] }));
    const f = await collectC(byId("c-vue"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["V-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on Vue", () => {
  test("installs the packages when the session didn't, builds, runs vue-tsc and draws the starter screens at 390 and 1440", async () => {
    const ws = await prepareWorkspace(byId("d-darb"), join(tempDir("motif-col-"), "dvue"), run);
    const app = join(ws.app, "darb");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/vue-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const before = commands.length;
    const out = join(ws.dir, "results");
    const f = await collectD(byId("d-darb"), ws, { run, motif: recording, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.build).toEqual({ code: 0, timedOut: false });
    expect(f.typecheck).toEqual({ code: 0, timedOut: false });
    expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm install", "npm run build", "npx vue-tsc --noEmit"]);
    expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/,/sign-in,/meetups", "--sizes", "390,1440"]);
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "install.log", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });
});

describe("a build that stopped at its type check", () => {
  test("TypeScript errors with no bundler output after them; anything else is the build's own failure", () => {
    expect(stoppedByTypeErrors("src/views/A.vue(4,7): error TS2322: Type 'string' is not assignable to type 'number'.\n")).toBe(true);
    expect(stoppedByTypeErrors("error TS2322: bad\nvite v8.0.0 building for production...\ntransforming...\nerror during build:")).toBe(false);
    expect(stoppedByTypeErrors("Error: Cannot find module './x'\n")).toBe(false);
    expect(stoppedByTypeErrors("")).toBe(false);
  });

  /** collectD on a new app whose build and type check exit with these codes and outputs (git and the rest as usual). */
  async function measured(id: string, folder: string, contract: string, build: { code: number; stdout: string }, typecheckCode: number) {
    const failing: Run = async (cmd, cwd, t, env) => {
      if (cmd[0] !== "git" && cmd.join(" ") === "npm run build") return { ...build, stderr: "", timedOut: false };
      if (cmd[0] !== "git" && cmd.includes("--noEmit")) return { code: typecheckCode, stdout: "error TS2322: bad", stderr: "", timedOut: false };
      return run(cmd, cwd, t, env);
    };
    const ws = await prepareWorkspace(byId(id), join(tempDir("motif-col-"), `${folder}-${build.code}`), failing);
    const app = join(ws.app, folder);
    mkdirSync(join(app, "node_modules"), { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, `tests/fixtures/${contract}/DESIGN.md`), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    return collectD(byId(id), ws, { run: failing, motif, judge: noJudge }, join(ws.dir, "results"));
  }
  const TYPE_ERRORS = "> vue-tsc --noEmit && vite build\n\nsrc/views/A.vue(4,7): error TS2322: Type 'string' is not assignable to type 'number'.\n";

  test("collect marks a build that stopped at the type check's errors, and the grade counts them once, as the type check's", async () => {
    const f = await measured("d-darb", "darb", "vue-contract-app", { code: 1, stdout: TYPE_ERRORS }, 2);
    expect(f.build).toEqual({ code: 1, timedOut: false, typeErrorsOnly: true });
    expect(f.typecheck).toEqual({ code: 2, timedOut: false });
    const ids = gradeD(f).criteria.map((c) => c.id);
    expect(ids).toContain("typecheck");
    expect(ids).not.toContain("build");
  });

  test("a build that failed in the bundler is the build's own failure, type errors or not", async () => {
    const bundler = `${TYPE_ERRORS}vite v8.0.0 building for production...\ntransforming...\nerror during build:\n[vite]: Rollup failed to resolve import "x"\n`;
    const f = await measured("d-darb", "darb", "vue-contract-app", { code: 1, stdout: bundler }, 2);
    expect(f.build).toEqual({ code: 1, timedOut: false });
    expect(gradeD(f).criteria.find((c) => c.id === "build")?.pass).toBe(false);
  });

  test("the same for any web app whose build script type-checks first: React's tsc -b && vite build", async () => {
    const react = "> tsc -b && vite build\n\nsrc/App.tsx(3,7): error TS2322: Type 'string' is not assignable to type 'number'.\n";
    const f = await measured("d-stride", "stride", "react-contract-app", { code: 2, stdout: react }, 2);
    expect(f.build).toEqual({ code: 2, timedOut: false, typeErrorsOnly: true });
  });
});

describe("new components on Svelte, from the session's diff", () => {
  const markup = "<script lang=\"ts\">\n  let { label } = $props();\n</script>\n\n<span>{label}</span>\n";
  test("a new .svelte file under src/lib/ counts; a +page.svelte is the page itself", () => {
    const diff = [
      newFile("src/lib/components/HistoryRow.svelte", markup),
      newFile("src/lib/SeasonTag.svelte", "<b>x</b>"),
      newFile("src/routes/history/+page.svelte", "<main />"),
      newFile("src/routes/history/+page.ts", "export const load = () => ({});"),
    ].join("\n");
    expect(svelteComponents(diff)).toEqual({ newComponents: ["HistoryRow", "SeasonTag"], screens: ["history"], screenParts: [], notUi: [] });
  });

  test("a layout or error page is navigation; a component with no markup, a test and a moved file never count", () => {
    const diff = [
      newFile("src/routes/settings/+layout.svelte", "<slot />"),
      newFile("src/routes/+error.svelte", "<h1>Oops</h1>"),
      newFile("src/routes/+page.svelte", "<main />"),
      newFile("src/lib/components/state.svelte", "<script lang=\"ts\">\n  export const x = 1;\n</script>\n<style>\n  p { color: red }\n</style>\n<!-- <b>commented</b> -->"),
      newFile("src/lib/components/Row.test.svelte", "<i />"),
      newFile("src/lib/components/Moved.svelte", "<i />"),
      "diff --git a/src/lib/old/Moved.svelte b/src/lib/old/Moved.svelte\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/src/lib/old/Moved.svelte\n+++ /dev/null\n@@ -1 +0,0 @@\n-<i />",
      edit("src/lib/components/Button.svelte", ["<button />"], ["<button class=\"x\" />"]),
      newFile("src/App.svelte", "<main />"),
      newFile("src/lib/design/motion.ts", "export const x = 1;"),
    ].join("\n");
    expect(svelteComponents(diff)).toEqual({ newComponents: [], screens: ["home"], screenParts: [], notUi: ["settings/+layout", "routes/+error", "state"] });
  });

  test("a component beside a route, or in a components/ folder elsewhere, counts", () => {
    const diff = [
      newFile("src/routes/tools/[id]/LoanPanel.svelte", "<section />"),
      newFile("src/components/Chip.svelte", "<span />"),
    ].join("\n");
    expect(svelteComponents(diff).newComponents).toEqual(["LoanPanel", "Chip"]);
  });

  test("componentFacts routes a Svelte case here and records the names DESIGN.md mentions", () => {
    const diff = [
      newFile("src/lib/components/HistoryRow.svelte", "<li />"),
      newFile("src/lib/components/SeasonTag.svelte", "<span />"),
      newFile("src/routes/history/+page.svelte", "<main />"),
      newFile("DESIGN.md", "| SeasonTag | A season label |"),
    ].join("\n");
    expect(componentFacts(byId("b-svelte-history"), diff)).toMatchObject({ newComponents: ["HistoryRow", "SeasonTag"], screens: ["history"], screenParts: [], notUi: [], recorded: ["SeasonTag"] });
  });
});

describe("test B on Svelte", () => {
  test("the page (from SvelteKit's routes), the build, svelte-check and the page drawn at 390 and 1440", async () => {
    const ws = await prepareWorkspace(byId("b-svelte-history"), join(tempDir("motif-col-"), "bsvelte"), run);
    mkdirSync(join(ws.app, "src/routes/history"), { recursive: true });
    writeFileSync(join(ws.app, "src/routes/history/+page.svelte"), "<main />\n");
    writeFileSync(join(ws.app, "src/lib/components/HistoryRow.svelte"), "<li />\n");
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/history", status: 200, shots: [] }] };
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    try {
      const before = commands.length;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-svelte-history"), ws, { run, motif: recording, judge: noJudge }, out);
      expect(f).toMatchObject({
        route: "/history", pageExists: true, build: { code: 0 }, typecheck: { code: 0 }, render: { route: "/history", status: 200, pageErrors: 0 },
        newComponents: ["HistoryRow"], screens: ["history"],
      });
      expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm run build", "npx svelte-check --fail-on-warnings"]);
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/history", "--sizes", "390,1440"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "build.log", "typecheck.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });

  test("no page at the feature's route: Adawat has no /settings", async () => {
    const ws = await prepareWorkspace(byId("b-svelte-settings"), join(tempDir("motif-col-"), "bsvelte2"), run);
    expect((await collectB(byId("b-svelte-settings"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });
});

describe("test C on the Svelte seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/svelte-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-svelte"), join(tempDir("motif-col-"), "csvelte"), run);
    const s01 = seededApp.find((i) => i.id === "S-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-24-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-24", findings: [
      { id: "F-001", severity: "major", category: s01.categories[0], source: "exact", location: s01.location, summary: s01.summary, fix: "Use the success role." },
    ] }));
    const f = await collectC(byId("c-svelte"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["S-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on Svelte", () => {
  test("installs the packages when the session didn't, builds, runs svelte-check and draws the starter screens at 390 and 1440", async () => {
    const ws = await prepareWorkspace(byId("d-nuzha"), join(tempDir("motif-col-"), "dsvelte"), run);
    const app = join(ws.app, "nuzha");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/svelte-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const before = commands.length;
    const out = join(ws.dir, "results");
    const f = await collectD(byId("d-nuzha"), ws, { run, motif: recording, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.build).toEqual({ code: 0, timedOut: false });
    expect(f.typecheck).toEqual({ code: 0, timedOut: false });
    expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm install", "npm run build", "npx svelte-check --fail-on-warnings"]);
    expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/,/sign-in,/trails", "--sizes", "390,1440"]);
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "install.log", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });
});

describe("an Angular build's errors", () => {
  // As ng build's application builder prints them (esbuild's format), and as the older webpack builder did.
  const typeError = "✘ [ERROR] TS2322: Type 'string' is not assignable to type 'number'. [plugin angular-compiler]\n\n    src/app/history/history.ts:12:2:\n      12 │   count: number = 'a';\n         ╵   ^\n";
  const templateError = "✘ [ERROR] NG8002: Can't bind to 'shfit' since it isn't a known property of 'app-shift-card'. [plugin angular-compiler]\n\n    src/app/history/history.html:4:18:\n";
  const resolveError = "✘ [ERROR] Could not resolve \"./missing\"\n\n    src/app/history/history.ts:3:22:\n";
  test("TypeScript and template type errors are the type check's; anything else is the build's own", () => {
    expect(angularBuildErrors(`Application bundle generation failed. [2.1 seconds]\n\n${typeError}\n${templateError}`)).toEqual({
      typeErrors: ["TS2322: Type 'string' is not assignable to type 'number'.", "NG8002: Can't bind to 'shfit' since it isn't a known property of 'app-shift-card'."],
      otherErrors: [],
    });
    expect(angularBuildErrors(`${typeError}\n${resolveError}`)).toEqual({ typeErrors: ["TS2322: Type 'string' is not assignable to type 'number'."], otherErrors: ["Could not resolve \"./missing\""] });
    expect(angularBuildErrors("Error: src/app/app.ts:3:5 - error TS2304: Cannot find name 'x'.\nError: src/app/app.html:2:3 - error NG8001: 'app-row' is not a known element.\n").typeErrors).toEqual([
      "TS2304: Cannot find name 'x'.", "NG8001: 'app-row' is not a known element.",
    ]);
    expect(angularBuildErrors("Initial chunk files | Names | Raw size\nmain.js | main | 200 kB\nApplication bundle generation complete.")).toEqual({ typeErrors: [], otherErrors: [] });
  });

  // Angular CLI 21.2's own output, piped (not a terminal): it is coloured all the same.
  const REAL = {
    ts: "Application bundle generation failed. [10.586 seconds] - 2026-10-25T16:45:31.892Z\n\n\u001b[1m\u001b[31m\u001b[31mX \u001b[41;31m[\u001b[41;97mERROR\u001b[41;31m]\u001b[0m \u001b[1mTS2322: Type 'string' is not assignable to type 'number'.\u001b[0m \u001b[1m\u001b[35m[plugin angular-compiler]\u001b[0m\n\n    src/app/app.ts:14:13:\n\u001b[37m      14 │ export const \u001b[32mbroken\u001b[37m: number = \"not a number\";\n         ╵              \u001b[32m~~~~~~\u001b[0m\n\n\u001b[39m\u001b[22m\n",
    template: "Application bundle generation failed. [2.424 seconds] - 2026-10-25T16:45:47.881Z\n\n\u001b[1m\u001b[31m\u001b[31mX \u001b[41;31m[\u001b[41;97mERROR\u001b[41;31m]\u001b[0m \u001b[1mTS2339: Property 'missingThing' does not exist on type 'App'.\u001b[0m \u001b[1m\u001b[35m[plugin angular-compiler]\u001b[0m\n\n    src/app/app.html:7:6:\n\u001b[37m      7 │ <p>{{ \u001b[32mmissingThing\u001b[37m.value }}</p>\n        ╵       \u001b[32m~~~~~~~~~~~~\u001b[0m\n\n  Error occurs in the template of component App.\n\n    src/app/app.ts:7:15:\n\u001b[37m      7 │   templateUrl: \u001b[32m'./app.html'\u001b[37m,\n        ╵                \u001b[32m~~~~~~~~~~~~\u001b[0m\n\n\u001b[39m\u001b[22m\n",
    bundle: "Application bundle generation failed. [2.169 seconds] - 2026-10-25T16:45:51.721Z\n\n\u001b[1m\u001b[31m\u001b[31mX \u001b[41;31m[\u001b[41;97mERROR\u001b[41;31m]\u001b[0m \u001b[1mCould not resolve \"./does-not-exist\"\u001b[0m\n\n    src/app/app.ts:3:7:\n\u001b[37m      3 │ import \u001b[32m'./does-not-exist'\u001b[37m;\n        ╵        \u001b[32m~~~~~~~~~~~~~~~~~~\u001b[0m\n\n\u001b[39m\u001b[22m\n",
  };
  test("ng build's real output, colour codes and all: a TypeScript error, a template's (TS2339 in a template), and a missing import", () => {
    expect(angularBuildErrors(REAL.ts)).toEqual({ typeErrors: ["TS2322: Type 'string' is not assignable to type 'number'."], otherErrors: [] });
    expect(angularBuildErrors(REAL.template)).toEqual({ typeErrors: ["TS2339: Property 'missingThing' does not exist on type 'App'."], otherErrors: [] });
    expect(angularBuildErrors(REAL.bundle)).toEqual({ typeErrors: [], otherErrors: ["Could not resolve \"./does-not-exist\""] });
  });

  test("graded from those logs: a type error counts once, as the type check's; a missing import is the build's alone", async () => {
    const failing = (output: string): Run => async (cmd, cwd, t, env) => {
      if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
      return cmd.join(" ") === "npm run build" ? { code: 1, stdout: output, stderr: "", timedOut: false } : { code: 0, stdout: "ok", stderr: "", timedOut: false };
    };
    const ws = await prepareWorkspace(byId("b-angular-history"), join(tempDir("motif-col-"), "bngreal"), run);
    const failed = async (output: string, name: string) => {
      const f = await collectB(byId("b-angular-history"), ws, { run: failing(output), motif, judge: noJudge }, join(ws.dir, name));
      return gradeB(f).criteria.filter((c) => !c.pass && c.id !== "feature" && c.id !== "renders").map((c) => c.id);
    };
    expect(await failed(REAL.ts, "ts")).toEqual(["typecheck"]);
    expect(await failed(REAL.template, "template")).toEqual(["typecheck"]);
    expect(await failed(REAL.bundle, "bundle")).toEqual(["build"]);
  });
});

describe("new components on Angular, from the session's diff", () => {
  const component = (cls: string, extra = "") =>
    `import { Component } from '@angular/core';\n\n@Component({\n  selector: 'app-x',\n  template: \`<p (click)="go()">Open (3</p>\`,\n})\nexport ${extra}class ${cls} {\n  go() {}\n}\n`;
  const routes = (added: string[]) => edit("src/app/app.routes.ts", [], added);

  test("a new @Component class under src/app/ counts; one the routes show is the page itself", () => {
    const diff = [
      newFile("src/app/history/history.ts", component("ShiftHistory")),
      newFile("src/app/history/history.html", "<main></main>"),
      newFile("src/app/history-row/history-row.ts", component("HistoryRow")),
      newFile("src/app/season-tag.ts", `${component("SeasonTag")}\n@Component({ selector: 'app-y', template: '<b>y</b>' })\nexport class SeasonDot {}\n`),
      routes(["  { path: 'history', loadComponent: () => import('./history/history').then((m) => m.ShiftHistory) },"]),
    ].join("\n");
    expect(angularComponents(diff)).toEqual({ newComponents: ["HistoryRow", "SeasonTag", "SeasonDot"], screens: ["ShiftHistory"], screenParts: [], notUi: [] });
  });

  test("a page by component:, by a destructured import, or by a default export; a service, a test, a moved class and a commented-out one never count", () => {
    const diff = [
      newFile("src/app/settings/settings.ts", component("Settings")),
      newFile("src/app/about/about.ts", component("About")),
      newFile("src/app/help/help.ts", component("Help", "default ")),
      newFile("src/app/state/settings.service.ts", "import { Injectable } from '@angular/core';\n@Injectable({ providedIn: 'root' })\nexport class SettingsService {}\n"),
      newFile("src/app/row/row.spec.ts", component("RowSpec")),
      newFile("src/app/moved/chip.ts", component("Chip")),
      "diff --git a/src/app/old/chip.ts b/src/app/old/chip.ts\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/src/app/old/chip.ts\n+++ /dev/null\n@@ -1,3 +0,0 @@\n-@Component({ selector: 'app-chip', template: '' })\n-export class Chip {}\n-",
      newFile("src/app/note.ts", "// @Component({ template: '' })\n// export class Note {}\nexport const note = 1;\n"),
      newFile("src/app/design/motion.ts", "export const x = 1;"),
      newFile("e2e/page.ts", component("E2ePage")),
      edit("src/app/button/button.ts", ["export class Button {"], ["export class Button {", "  wide = false;"]),
      routes([
        "  { path: 'settings', component: Settings },",
        "  { path: 'about', loadComponent: () => import('./about/about').then(({ About }) => About) },",
        "  { path: 'help', loadComponent: () => import('./help/help') },",
      ]),
    ].join("\n");
    expect(angularComponents(diff)).toEqual({ newComponents: [], screens: ["Settings", "About", "Help"], screenParts: [], notUi: [] });
  });

  test("a route written over several lines (as prettier wraps it), and a default export by .then(m => m.default) or no .then at all", () => {
    const diff = [
      newFile("src/app/history/history.ts", component("History")),
      newFile("src/app/reports/reports.ts", component("Reports", "default ")),
      newFile("src/app/help/help.ts", component("Help", "default ")),
      // Not the page: the same name in another folder.
      newFile("src/app/widgets/help.ts", component("HelpWidget", "default ")),
      routes([
        "  {",
        "    path: 'history',",
        "    loadComponent: () =>",
        "      import('./history/history').then(",
        "        (m) => m.History,",
        "      ),",
        "  },",
        "  { path: 'reports', loadComponent: () => import('./reports/reports').then((m) => m.default) },",
        "  {",
        "    path: 'help',",
        "    loadComponent: () => import('./help/help'),",
        "  },",
      ]),
    ].join("\n");
    expect(angularComponents(diff)).toEqual({ newComponents: ["HelpWidget"], screens: ["History", "Reports", "Help"], screenParts: [], notUi: [] });
  });

  test("componentFacts routes an Angular case here and records the names DESIGN.md mentions", () => {
    const diff = [
      newFile("src/app/history/history.ts", component("ShiftHistory")),
      newFile("src/app/history-row/history-row.ts", component("HistoryRow")),
      newFile("src/app/season-tag/season-tag.ts", component("SeasonTag")),
      routes(["  { path: 'history', loadComponent: () => import('./history/history').then((m) => m.ShiftHistory) },"]),
      newFile("DESIGN.md", "| SeasonTag | A season label |"),
    ].join("\n");
    expect(componentFacts(byId("b-angular-history"), diff)).toMatchObject({ newComponents: ["HistoryRow", "SeasonTag"], screens: ["ShiftHistory"], screenParts: [], notUi: [], recorded: ["SeasonTag"] });
  });
});

describe("test B on Angular", () => {
  const addHistory = (app: string) => {
    const file = join(app, "src/app/app.routes.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("  { path: '**'", "  { path: 'history', loadComponent: () => import('./history/history').then((m) => m.ShiftHistory) },\n  { path: '**'"));
    mkdirSync(join(app, "src/app/history"), { recursive: true });
    writeFileSync(join(app, "src/app/history/history.ts"), "import { Component } from '@angular/core';\n@Component({ selector: 'app-history', template: '<main></main>' })\nexport class ShiftHistory {}\n");
    mkdirSync(join(app, "src/app/history-row"), { recursive: true });
    writeFileSync(join(app, "src/app/history-row/history-row.ts"), "import { Component } from '@angular/core';\n@Component({ selector: 'app-history-row', template: '<li></li>' })\nexport class HistoryRow {}\n");
  };

  test("the page (from Angular's routes), ng build as the build and the type check, and the page drawn at 390 and 1440", async () => {
    const ws = await prepareWorkspace(byId("b-angular-history"), join(tempDir("motif-col-"), "bng"), run);
    addHistory(ws.app);
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/history", status: 200, shots: [] }] };
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    try {
      const before = commands.length;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-angular-history"), ws, { run, motif: recording, judge: noJudge }, out);
      expect(f).toMatchObject({
        route: "/history", pageExists: true, build: { code: 0 }, typecheck: { code: 0, command: "ng build" }, render: { route: "/history", status: 200, pageErrors: 0 },
        newComponents: ["HistoryRow"], screens: ["ShiftHistory"],
      });
      // ng build type-checks the templates in strict mode: no second type check is run.
      expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm run build"]);
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/history", "--sizes", "390,1440"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "build.log", "typecheck.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
    } finally {
      outputs.shot = saved;
    }
  });

  test("a build that stopped at type errors fails the type check alone; one that failed for its own reasons fails both", async () => {
    const failing = (output: string): Run => async (cmd, cwd, t, env) => {
      if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
      return cmd.join(" ") === "npm run build" ? { code: 1, stdout: "", stderr: output, timedOut: false } : { code: 0, stdout: "ok", stderr: "", timedOut: false };
    };
    const typeError = "✘ [ERROR] NG9: Property 'shfit' does not exist on type 'ShiftHistory'. [plugin angular-compiler]\n\n    src/app/history/history.html:3:10:\n";
    const ws = await prepareWorkspace(byId("b-angular-history"), join(tempDir("motif-col-"), "bng2"), run);
    addHistory(ws.app);
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-angular-history"), ws, { run: failing(`Application bundle generation failed.\n${typeError}`), motif, judge: noJudge }, out);
    expect(f.build).toMatchObject({ code: 1, typeErrorsOnly: true });
    expect(f.typecheck).toMatchObject({ code: 1, command: "ng build" });
    expect(f.typecheck!.detail).toContain("NG9: Property 'shfit' does not exist on type 'ShiftHistory'.");
    expect(readFileSync(join(out, "typecheck.log"), "utf8")).toContain("NG9: Property 'shfit'");
    expect(gradeB(f).criteria.filter((c) => !c.pass).map((c) => c.id)).toEqual(["typecheck", "renders"]);

    const results = (n: number) => {
      const dir = join(ws.dir, `results${n}`);
      mkdirSync(dir, { recursive: true });
      return dir;
    };
    const g = await collectB(byId("b-angular-history"), ws, { run: failing(`${typeError}\n✘ [ERROR] Could not resolve "./missing"\n`), motif, judge: noJudge }, results(2));
    expect(g.build).toEqual({ code: 1, timedOut: false });
    expect(g.typecheck).toMatchObject({ code: 1 });
    // No type errors among the build's: the type check passed, whatever else stopped the build.
    const h = await collectB(byId("b-angular-history"), ws, { run: failing("✘ [ERROR] Could not resolve \"./missing\"\n"), motif, judge: noJudge }, results(3));
    expect([h.build!.code, h.typecheck!.code]).toEqual([1, 0]);
    // Nothing the builder printed: it didn't get as far as its type check.
    const i = await collectB(byId("b-angular-history"), ws, { run: failing("'ng' is not recognized as an internal or external command"), motif, judge: noJudge }, results(4));
    expect(i.typecheck).toMatchObject({ code: 1, detail: expect.stringContaining("didn't get as far as its type check") });
  });

  test("no page at the feature's route: Ataa has no /settings", async () => {
    const ws = await prepareWorkspace(byId("b-angular-settings"), join(tempDir("motif-col-"), "bng3"), run);
    expect((await collectB(byId("b-angular-settings"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"))).pageExists).toBe(false);
  });

  test("under a hash router the page is listed as /#/settings, and is drawn there", async () => {
    const ws = await prepareWorkspace(byId("b-angular-settings"), join(tempDir("motif-col-"), "bng4"), run);
    const config = join(ws.app, "src/app/app.config.ts");
    writeFileSync(config, readFileSync(config, "utf8").replace("withComponentInputBinding }", "withComponentInputBinding, withHashLocation }").replace("withComponentInputBinding())", "withComponentInputBinding(), withHashLocation())"));
    const file = join(ws.app, "src/app/app.routes.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("  { path: '**'", "  { path: 'settings', loadComponent: () => import('./sign-in/sign-in').then((m) => m.SignIn) },\n  { path: '**'"));
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/#/settings", status: 200, shots: [] }] };
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    try {
      const f = await collectB(byId("b-angular-settings"), ws, { run, motif: recording, judge: noJudge }, join(ws.dir, "results"));
      expect(f).toMatchObject({ route: "/settings", pageExists: true, render: { route: "/#/settings", status: 200, pageErrors: 0 } });
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--routes", "/#/settings", "--sizes", "390,1440"]);
    } finally {
      outputs.shot = saved;
    }
  });
});

describe("test C on the Angular seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/angular-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-angular"), join(tempDir("motif-col-"), "cng"), run);
    const s01 = seededApp.find((i) => i.id === "S-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-25-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-25", findings: [
      { id: "F-001", severity: "major", category: s01.categories[0], source: "exact", location: s01.location, summary: s01.summary, fix: "Use the secondary text role." },
    ] }));
    const f = await collectC(byId("c-angular"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["S-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on Angular", () => {
  test("installs the packages when the session didn't, builds with ng build (its type check too) and draws the starter pages at 390 and 1440", async () => {
    const ws = await prepareWorkspace(byId("d-sanad"), join(tempDir("motif-col-"), "dng"), run);
    const app = join(ws.app, "sanad");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/angular-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const before = commands.length;
    const out = join(ws.dir, "results");
    const f = await collectD(byId("d-sanad"), ws, { run, motif: recording, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.build).toEqual({ code: 0, timedOut: false });
    expect(f.typecheck).toMatchObject({ code: 0, command: "ng build" });
    expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm install", "npm run build"]);
    expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/,/sign-in,/requests", "--sizes", "390,1440"]);
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "install.log", "build.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });
});

describe("test C on the React Native seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/rn-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-rn"), join(tempDir("motif-col-"), "crn"), run);
    const e01 = seededApp.find((i) => i.id === "E-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-20-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-20", findings: [
      { id: "F-001", severity: "major", category: e01.categories[0], source: "exact", location: e01.location, summary: e01.summary, fix: "Use the success role." },
    ] }));
    const f = await collectC(byId("c-rn"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["E-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on React Native", () => {
  test("installs the packages when the session didn't, runs tsc and draws the starter screens at 390; nothing built", async () => {
    const ws = await prepareWorkspace(byId("d-rihla"), join(tempDir("motif-col-"), "drn"), run);
    const app = join(ws.app, "rihla");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/rn-contract-app/DESIGN.md"), "utf8"));
    writeFileSync(join(app, "package.json"), "{}");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const before = commands.length;
    const out = join(ws.dir, "results");
    const f = await collectD(byId("d-rihla"), ws, { run, motif: recording, judge: noJudge }, out);
    expect(f.app).toBe(app);
    expect(f.build).toBeUndefined();
    expect(f.typecheck).toEqual({ code: 0, timedOut: false, command: "tsc" });
    expect(commands.slice(before).map((c) => c.join(" "))).toEqual(["npm install", "npx tsc --noEmit"]);
    expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/,/sign-in,/trips", "--sizes", "390"]);
    for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "install.log", "typecheck.log"]) expect(existsSync(join(out, file))).toBe(true);
  });
});

const XCODEBUILD = "xcodebuild build";

describe("new components on SwiftUI, from the session's diff", () => {
  const APP = "Qahwa";
  test("new View structs outside the theme count; private and nested ones are parts, screens a preview or navigation shows don't count", () => {
    const diff = [
      newFile(`${APP}/Features/Orders/OrdersScreen.swift`, [
        "import SwiftUI",
        "",
        "struct OrdersScreen: View {",
        "    var body: some View { List { OrderRow(order: .sample) } }",
        "",
        "    struct Header: View {",
        "        var body: some View { Text(\"Your orders\") }",
        "    }",
        "}",
        "",
        "private struct EmptyOrders: View {",
        "    var body: some View { Text(\"No orders yet\") }",
        "}",
        "",
        "fileprivate struct Divider2: View { var body: some View { Rectangle() } }",
        "",
        "struct OrderRow: View {",
        "    let order: Order",
        "    var body: some View { Text(order.title) }",
        "}",
        "",
        "// struct Commented: View {}",
        "let s = \"struct Quoted: View {\"",
        "struct Order: Hashable { let title: String }",
        "struct OrderButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label } }",
        "struct Faded: ViewModifier { func body(content: Content) -> some View { content } }",
        "",
        "#Preview(\"Orders\") {",
        "    NavigationStack {",
        "        OrdersScreen()",
        "    }",
        "    .motifTheme()",
        "}",
      ].join("\n")),
      newFile(`${APP}/Components/StampBadge.swift`, "public struct StampBadge: View {\n    var body: some View { Text(\"3\") }\n}\n\n#Preview {\n    StampBadge()\n}"),
      newFile(`${APP}/Components/Pill.swift`, "struct Pill<Label: View>: View {\n    let label: Label\n    var body: some View { label }\n}\n\n@MainActor struct Banner: View, Equatable {\n    var body: some View { Text(\"b\") }\n}"),
      // Named like a screen, but nothing shows it as one: a component.
      newFile(`${APP}/Components/RewardRowView.swift`, "struct RewardRowView: View {\n    var body: some View { Text(\"r\") }\n}"),
      newFile(`${APP}/Features/Rewards/RewardsHistoryView.swift`, "struct RewardsHistoryView: View {\n    var body: some View { Text(\"h\") }\n}"),
      edit(`${APP}/Features/Loyalty/LoyaltyScreen.swift`, [], ["            NavigationLink(destination: RewardsHistoryView()) {", "                Text(\"Rewards history\")", "            }"]),
      newFile(`${APP}/Design/Extras.swift`, "struct ThemeSwatch: View {\n    var body: some View { Color.clear }\n}"),
      newFile(`${APP}/Generated.swift`, "// Generated by Motif — edit design/tokens.json instead, then run \"motif tokens\".\nstruct MotifThing: View {\n    var body: some View { EmptyView() }\n}"),
      newFile("QahwaTests/OrdersTests.swift", "struct FakeView: View {\n    var body: some View { EmptyView() }\n}"),
      newFile(".motif/shots/MotifShots/Host.swift", "struct HostView: View {\n    var body: some View { EmptyView() }\n}"),
      // DrinkCard moved from Components/ to the menu's folder: not new.
      edit(`${APP}/Components/DrinkCard.swift`, ["struct DrinkCard: View {"], []),
      newFile(`${APP}/Features/Menu/DrinkCard.swift`, "struct DrinkCard: View {\n    let drink: Drink\n    var body: some View { Text(drink.name) }\n}"),
    ].join("\n");
    expect(swiftUIComponents(diff)).toEqual({
      newComponents: ["OrderRow", "StampBadge", "Pill", "Banner", "RewardRowView"],
      screens: ["OrdersScreen", "RewardsHistoryView"],
      screenParts: ["Header", "EmptyOrders", "Divider2"],
    });
  });

  test("a screen is one the app's root, a tab, a sheet or a navigation destination shows, as well as a preview", () => {
    const diff = [
      newFile(`${APP}/Features/Orders/OrdersScreen.swift`, "struct OrdersScreen: View {\n    var body: some View { Text(\"o\") }\n}"),
      newFile(`${APP}/Features/Rewards/RewardsScreen.swift`, "struct RewardsScreen: View {\n    var body: some View { Text(\"r\") }\n}"),
      newFile(`${APP}/Features/Welcome/WelcomeView.swift`, "struct WelcomeView: View {\n    var body: some View { Text(\"w\") }\n}"),
      newFile(`${APP}/Features/Receipt/ReceiptScreen.swift`, "struct ReceiptScreen: View {\n    var body: some View { Text(\"r\") }\n}"),
      edit(`${APP}/ContentView.swift`, [], [
        "        TabView {",
        "            MenuScreen().tabItem { Label(\"Menu\", systemImage: \"cup.and.saucer\") }",
        "            OrdersScreen().tabItem { Label(\"Orders\", systemImage: \"list.bullet\") }",
        "        }",
        "        .navigationDestination(for: Route.self) { route in",
        "            RewardsScreen()",
        "        }",
        "        .sheet(isPresented: $showReceipt) { ReceiptScreen() }",
      ]),
      edit(`${APP}/QahwaApp.swift`, [], ["        WindowGroup {", "            WelcomeView()", "        }"]),
    ].join("\n");
    expect(swiftUIComponents(diff)).toEqual({ newComponents: [], screens: ["OrdersScreen", "RewardsScreen", "WelcomeView", "ReceiptScreen"], screenParts: [] });
  });

  test("a preview alone makes a screen only of a *Screen struct or the case's own page: a row with its own preview is a component", () => {
    const diff = [
      newFile(`${APP}/Components/OrderRowView.swift`, "struct OrderRowView: View {\n    var body: some View { Text(\"o\") }\n}\n\n#Preview {\n    OrderRowView()\n}"),
      newFile(`${APP}/Features/Orders/OrdersView.swift`, "struct OrdersView: View {\n    var body: some View { Text(\"o\") }\n}\n\n#Preview(\"Orders\") {\n    OrdersView()\n}"),
      newFile(`${APP}/Features/Rewards/RewardsScreen.swift`, "struct RewardsScreen: View {\n    var body: some View { Text(\"r\") }\n}\n\n#Preview {\n    RewardsScreen()\n}"),
    ].join("\n");
    // OrdersView is b-swiftui-orders' page ("Orders"); for any other case it's a component like OrderRowView.
    expect(swiftUIComponents(diff, "Orders")).toEqual({ newComponents: ["OrderRowView"], screens: ["OrdersView", "RewardsScreen"], screenParts: [] });
    expect(swiftUIComponents(diff)).toEqual({ newComponents: ["OrderRowView", "OrdersView"], screens: ["RewardsScreen"], screenParts: [] });
    expect(componentFacts(byId("b-swiftui-orders"), diff)).toMatchObject({ newComponents: ["OrderRowView"], screens: ["OrdersView", "RewardsScreen"] });
  });

  test("nesting is read from braces, not indentation: a struct under #if DEBUG is still top level, one in an extension isn't", () => {
    const diff = newFile(`${APP}/Features/Orders/OrdersScreen.swift`, [
      "#if DEBUG",
      "    struct DebugBadge: View {",
      "        var body: some View { Text(\"debug\") }",
      "    }",
      "#else",
      "struct ReleaseBadge: View { var body: some View { Text(\"{\") } }",
      "#endif",
      "",
      "extension OrdersScreen {",
      "struct Row: View {",
      "    var body: some View { Text(\"}\") }",
      "}",
      "}",
      "",
      "// }",
      "struct AfterAll: View { var body: some View { EmptyView() } }",
    ].join("\n"));
    expect(swiftUIComponents(diff)).toEqual({ newComponents: ["DebugBadge", "ReleaseBadge", "AfterAll"], screens: [], screenParts: ["Row"] });
  });

  test("each hunk is read from depth 0: a brace hunk 1's context leaves open doesn't make a top-level struct in hunk 2 a part", () => {
    const path = `${APP}/Features/Menu/MenuScreen.swift`;
    const diff = [
      `diff --git a/${path} b/${path}`, "index 1111111..2222222 100644", `--- a/${path}`, `+++ b/${path}`,
      "@@ -9,3 +9,4 @@",
      " struct MenuScreen: View {",
      "     var card = LoyaltyCard.current",
      "+    @State private var showOrders = false",
      "     var drinks = MenuData.drinks",
      "@@ -70,2 +71,6 @@",
      " // The menu's own previews are above.",
      " ",
      "+struct OrdersLink: View {",
      "+    var body: some View { NavigationLink(\"Orders\") { Text(\"o\") } }",
      "+}",
      "+",
    ].join("\n");
    expect(swiftUIComponents(diff)).toEqual({ newComponents: ["OrdersLink"], screens: [], screenParts: [] });
    // Within one hunk the braces still count: a struct added inside the type the hunk opens is its part.
    const inside = diff.replace("+    @State private var showOrders = false", "+    struct Badge: View { var body: some View { Text(\"b\") } }");
    expect(swiftUIComponents(inside)).toEqual({ newComponents: ["OrdersLink"], screens: [], screenParts: ["Badge"] });
  });

  test("componentFacts uses the SwiftUI rule for a SwiftUI case, and the guide's lines for what's recorded", () => {
    const diff = [
      newFile(`${APP}/Components/OrderRow.swift`, "struct OrderRow: View {\n    var body: some View { Text(\"o\") }\n}"),
      newFile(`${APP}/Components/MonthHeader.swift`, "struct MonthHeader: View {\n    var body: some View { Text(\"m\") }\n}"),
      edit("DESIGN.md", [], ["| OrderRow | One past order | — | — |"]),
    ].join("\n");
    expect(componentFacts(byId("b-swiftui-rewards"), diff)).toEqual({ newComponents: ["OrderRow", "MonthHeader"], screens: [], screenParts: [], recorded: ["OrderRow"] });
  });
});

describe("test B on SwiftUI", () => {
  const calls: { cmd: string[]; cwd: string }[] = [];
  const recordingRun: Run = async (cmd, cwd, t, env) => {
    if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
    calls.push({ cmd, cwd });
    return { code: 0, stdout: "ok", stderr: "", timedOut: false };
  };
  const withShot = async <T,>(shot: any, body: () => Promise<T>) => {
    const saved = outputs.shot;
    outputs.shot = shot;
    try {
      return await body();
    } finally {
      outputs.shot = saved;
    }
  };
  const xcodebuild = (ws: { dir: string }) => [
    "xcodebuild", "build", "-project", "Qahwa.xcodeproj", "-scheme", "Qahwa", "-destination", "generic/platform=iOS Simulator",
    "-derivedDataPath", join(ws.dir, "DerivedData"), "-quiet", "CODE_SIGNING_ALLOWED=NO",
  ];
  const ORDERS = [
    "import SwiftUI",
    "",
    "struct OrdersScreen: View {",
    "    var body: some View { List { Text(\"Flat white\") } }",
    "}",
    "",
    "private struct EmptyOrders: View {",
    "    var body: some View { Text(\"No orders yet\") }",
    "}",
    "",
    "#Preview(\"Orders\") {",
    "    NavigationStack { OrdersScreen() }",
    "        .motifTheme()",
    "}",
    "",
  ].join("\n");

  test("the page (the #Preview the prompt names), xcodebuild build for the type check, the page drawn at 390 with --screen, new components; nothing else built", async () => {
    const ws = await prepareWorkspace(byId("b-swiftui-orders"), join(tempDir("motif-col-"), "bs"), recordingRun);
    mkdirSync(join(ws.app, "Qahwa/Features/Orders"), { recursive: true });
    writeFileSync(join(ws.app, "Qahwa/Features/Orders/OrdersScreen.swift"), ORDERS);
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "OrdersScreen.swift:11", status: 200, shots: [] }] };
    await withShot(shot, async () => {
      calls.length = 0;
      const out = join(ws.dir, "results");
      const f = await collectB(byId("b-swiftui-orders"), ws, { run: recordingRun, motif: recording, judge: noJudge }, out);
      expect(f).toMatchObject({
        route: "Orders", pageExists: true, typecheck: { code: 0, command: XCODEBUILD }, render: { route: "OrdersScreen.swift:11", status: 200, pageErrors: 0 },
        newComponents: [], screens: ["OrdersScreen"], screenParts: ["EmptyOrders"],
      });
      expect(f.build).toBeUndefined();
      // The type check builds into the case's folder, outside the app: nothing goes to Xcode's own DerivedData.
      expect(calls).toEqual([{ cmd: xcodebuild(ws), cwd: ws.app }]);
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--screen", "OrdersScreen.swift:11", "--sizes", "390"]);
      for (const file of ["check.json", "validate.json", "diff.patch", "xcodebuild.log", "shot.json"]) expect(existsSync(join(out, file))).toBe(true);
      expect(gradeB(f).pass).toBe(true);
    });
  });

  test("an untitled preview of the screen counts as its page", async () => {
    const ws = await prepareWorkspace(byId("b-swiftui-rewards"), join(tempDir("motif-col-"), "bs2"), recordingRun);
    mkdirSync(join(ws.app, "Qahwa/Features/Rewards"), { recursive: true });
    writeFileSync(join(ws.app, "Qahwa/Features/Rewards/RewardsHistoryScreen.swift"), "import SwiftUI\n\nstruct RewardsHistoryScreen: View {\n    var body: some View { Text(\"h\") }\n}\n\n#Preview {\n    RewardsHistoryScreen()\n}\n");
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "RewardsHistoryScreen.swift:7", status: 200, shots: [] }] };
    await withShot(shot, async () => {
      const f = await collectB(byId("b-swiftui-rewards"), ws, { run: recordingRun, motif: recording, judge: noJudge }, join(ws.dir, "results"));
      expect(f).toMatchObject({ route: "Rewards history", pageExists: true, render: { route: "RewardsHistoryScreen.swift:7", status: 200, pageErrors: 0 } });
      expect(seen.find((a) => a[0] === "shot")).toEqual(["shot", "--screen", "RewardsHistoryScreen.swift:7", "--sizes", "390"]);
    });
  });

  test("a screen the app reaches but with no preview exists, and can't be drawn on its own; nothing is drawn", async () => {
    const ws = await prepareWorkspace(byId("b-swiftui-orders"), join(tempDir("motif-col-"), "bs3"), recordingRun);
    mkdirSync(join(ws.app, "Qahwa/Features/Orders"), { recursive: true });
    writeFileSync(join(ws.app, "Qahwa/Features/Orders/OrdersScreen.swift"), "import SwiftUI\n\nstruct OrdersScreen: View {\n    var body: some View { Text(\"o\") }\n}\n");
    const menu = join(ws.app, "Qahwa/Features/Menu/MenuScreen.swift");
    writeFileSync(menu, readFileSync(menu, "utf8").replace("#Preview(\"Menu\") {", "private let ordersLink = NavigationLink(\"Orders\") { OrdersScreen() }\n\n#Preview(\"Menu\") {"));
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const f = await collectB(byId("b-swiftui-orders"), ws, { run: recordingRun, motif: recording, judge: noJudge }, join(ws.dir, "results"));
    expect(f.pageExists).toBe(true);
    expect(f.render).toEqual({ error: "OrdersScreen has no #Preview titled \"Orders\", so motif shot can't draw it on its own." });
    expect(seen.some((a) => a[0] === "shot")).toBe(false);
  });

  test("no screen at all: the type check still runs, and nothing is drawn", async () => {
    const ws = await prepareWorkspace(byId("b-swiftui-orders"), join(tempDir("motif-col-"), "bs4"), recordingRun);
    calls.length = 0;
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    const f = await collectB(byId("b-swiftui-orders"), ws, { run: recordingRun, motif: recording, judge: noJudge }, join(ws.dir, "results"));
    expect(f.pageExists).toBe(false);
    expect(f.typecheck).toMatchObject({ code: 0, command: XCODEBUILD });
    expect(calls).toHaveLength(1);
    expect(f.render).toEqual({ error: "The app has no #Preview titled \"Orders\" (or one showing OrdersScreen or OrdersView), so there's no screen to draw." });
    expect(seen.some((a) => a[0] === "shot")).toBe(false);
    expect(gradeB(f).criteria.find((k) => k.id === "feature")).toMatchObject({ pass: false, detail: "There's no page at Orders." });
  });

  test("a failed build names the compiler's first errors, and keeps xcodebuild's words in xcodebuild.log", async () => {
    const ws = await prepareWorkspace(byId("b-swiftui-orders"), join(tempDir("motif-col-"), "bs5"), recordingRun);
    const file = `${ws.app}/Qahwa/Features/Orders/OrdersScreen.swift`;
    const output = [
      "Command SwiftCompile failed with a nonzero exit code",
      `${file}:4:27: error: cannot find 'Foo' in scope`,
      `${file}:9:5: error: missing return in closure expected to return 'some View'`,
      `${file}:4:27: error: cannot find 'Foo' in scope`,
      `${file}:12:1: error: expected '}' in struct`,
      `${file}:13:1: error: extraneous '}' at top level`,
      "** BUILD FAILED **",
    ].join("\n");
    const failing: Run = async (cmd, cwd, t, env) => (cmd[0] === "xcodebuild" ? { code: 65, stdout: "", stderr: output, timedOut: false } : recordingRun(cmd, cwd, t, env));
    const out = join(ws.dir, "results");
    const f = await collectB(byId("b-swiftui-orders"), ws, { run: failing, motif, judge: noJudge }, out);
    expect(f.typecheck).toEqual({
      code: 65, timedOut: false, command: XCODEBUILD,
      detail:
        "The type check (xcodebuild build) failed (exit code 65): Qahwa/Features/Orders/OrdersScreen.swift:4:27: error: cannot find 'Foo' in scope; Qahwa/Features/Orders/OrdersScreen.swift:9:5: error: missing return in closure expected to return 'some View'; Qahwa/Features/Orders/OrdersScreen.swift:12:1: error: expected '}' in struct (and 1 more in xcodebuild.log).",
    });
    expect(readFileSync(join(out, "xcodebuild.log"), "utf8")).toContain("extraneous '}'");
  });

  test("a folder with no SwiftUI app fails the type check and says why, running nothing", async () => {
    const ws = await prepareWorkspace(byId("b-swiftui-orders"), join(tempDir("motif-col-"), "bs6"), recordingRun);
    rmSync(join(ws.app, "Qahwa.xcodeproj"), { recursive: true, force: true });
    calls.length = 0;
    const f = await collectB(byId("b-swiftui-orders"), ws, { run: recordingRun, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.typecheck).toEqual({ code: 1, command: XCODEBUILD, detail: "There's no Xcode project (or Swift package) with a SwiftUI app here, so the app couldn't be built." });
    expect(calls).toHaveLength(0);
  });
});

describe("test C on the SwiftUI seeded app", () => {
  test("is graded against its own list", async () => {
    const seededApp: SeededIssue[] = JSON.parse(readFileSync(join(REPO, "tests/fixtures/swiftui-seeded-app/seeded-issues.json"), "utf8")).issues;
    const ws = await prepareWorkspace(byId("c-swiftui"), join(tempDir("motif-col-"), "cs"), run);
    const s01 = seededApp.find((i) => i.id === "S-01")!;
    mkdirSync(join(ws.app, "design/reviews"), { recursive: true });
    writeFileSync(join(ws.app, "design/reviews/2026-10-22-whole-app.json"), JSON.stringify({ motifReview: 1, scope: "whole app", date: "2026-10-22", findings: [
      { id: "F-001", severity: "major", category: s01.categories[0], source: "exact", location: s01.location, summary: s01.summary, fix: "Use colors.actionPrimary." },
    ] }));
    const f = await collectC(byId("c-swiftui"), ws, { run, motif, judge: noJudge }, join(ws.dir, "results"));
    expect(f.exact.found).toEqual(["S-01"]);
    expect(f.exact.missed).toHaveLength(seededApp.filter((i) => i.kind === "exact").length - 1);
    expect(f.judgement.missed).toHaveLength(seededApp.filter((i) => i.kind === "judgement").length);
    expect(f.changedCode).toEqual([]);
  });
});

describe("test D on SwiftUI", () => {
  const screen = (type: string, title: string) => `import SwiftUI\n\nstruct ${type}: View {\n    var body: some View { Text("${title}") }\n}\n\n#Preview("${title}") {\n    ${type}()\n}\n`;
  async function masar(withHome: boolean) {
    const calls: { cmd: string[]; cwd: string }[] = [];
    const recordingRun: Run = async (cmd, cwd, t, env) => {
      if (cmd[0] === "git") return runCmd(cmd, cwd, t, env);
      calls.push({ cmd, cwd });
      return { code: 0, stdout: "ok", stderr: "", timedOut: false };
    };
    const ws = await prepareWorkspace(byId("d-masar"), join(tempDir("motif-col-"), "ds"), recordingRun);
    // What the session leaves: a design guide beside the starter project, and the screens the prompt names.
    const app = ws.app;
    writeFileSync(join(app, "DESIGN.md"), readFileSync(join(REPO, "tests/fixtures/swiftui-contract-app/DESIGN.md"), "utf8"));
    mkdirSync(join(app, "Masar/Features/SignIn"), { recursive: true });
    writeFileSync(join(app, "Masar/Features/SignIn/SignInScreen.swift"), screen("SignInScreen", "Sign in"));
    if (withHome) {
      mkdirSync(join(app, "Masar/Features/Home"), { recursive: true });
      writeFileSync(join(app, "Masar/Features/Home/HomeScreen.swift"), screen("HomeScreen", "Home"));
    }
    const seen: string[][] = [];
    const recording = async (args: string[]) => {
      seen.push(args);
      return motif(args);
    };
    return { ws, app, calls, seen, recordingRun, recording };
  }

  test("builds with xcodebuild, draws the root and the previews the prompt names at 390, each screen under its own name; nothing installed", async () => {
    const m = await masar(true);
    const saved = outputs.shot;
    outputs.shot = {
      command: "shot", ok: false, exitCode: 1, shots: [], findings: [{ id: "F-001" }, { id: "F-002" }],
      routes: [
        { route: "/", status: 200, shots: [] },
        { route: "SignInScreen.swift:7", status: 200, shots: [] },
        { route: "HomeScreen.swift:7", status: 200, pageErrors: ["HomeScreen stopped the app"], shots: [] },
      ],
    };
    try {
      const out = join(m.ws.dir, "results");
      const f = await collectD(byId("d-masar"), m.ws, { run: m.recordingRun, motif: m.recording, judge: noJudge }, out);
      expect(f.app).toBe(m.app);
      expect(f.build).toBeUndefined();
      expect(f.typecheck).toEqual({ code: 0, timedOut: false, command: XCODEBUILD });
      expect(m.calls).toEqual([{
        cmd: [
          "xcodebuild", "build", "-project", "Masar.xcodeproj", "-scheme", "Masar", "-destination", "generic/platform=iOS Simulator",
          "-derivedDataPath", join(m.ws.dir, "DerivedData"), "-quiet", "CODE_SIGNING_ALLOWED=NO",
        ],
        cwd: m.app,
      }]);
      expect(m.seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/", "--screen", "SignInScreen.swift:7,HomeScreen.swift:7", "--sizes", "390"]);
      expect(f.screens).toEqual([
        { route: "/", status: 200, pageErrors: 0 },
        { route: "Sign in", status: 200, pageErrors: 0 },
        { route: "Home", status: 200, pageErrors: 1 },
      ]);
      expect(f.auditFindings).toBe(2);
      for (const file of ["DESIGN.md", "validate.json", "check.json", "shot.json", "xcodebuild.log"]) expect(existsSync(join(out, file))).toBe(true);
      expect(gradeD(f).criteria.find((k) => k.id === "screens")).toMatchObject({ pass: false, detail: "Didn't render: Home (status 200, 1 page errors)." });
    } finally {
      outputs.shot = saved;
    }
  });

  test("a screen with no preview isn't asked for, and is reported as not captured", async () => {
    const m = await masar(false);
    const saved = outputs.shot;
    outputs.shot = { command: "shot", ok: true, exitCode: 0, shots: [], routes: [{ route: "/", status: 200, shots: [] }, { route: "SignInScreen.swift:7", status: 200, shots: [] }] };
    try {
      const f = await collectD(byId("d-masar"), m.ws, { run: m.recordingRun, motif: m.recording, judge: noJudge }, join(m.ws.dir, "results"));
      expect(m.seen.find((a) => a[0] === "shot")).toEqual(["shot", "--audit", "--routes", "/", "--screen", "SignInScreen.swift:7", "--sizes", "390"]);
      expect(gradeD(f).criteria.find((k) => k.id === "screens")).toMatchObject({ pass: false, detail: "Didn't render: Home (not captured)." });
    } finally {
      outputs.shot = saved;
    }
  });
});
