import { describe, expect, test } from "bun:test";
import { gradeB, gradeC, gradeD, type BFacts, type CFacts, type DFacts, type Grade, type ScreenFacts } from "../../tests/evals/grade";

const failing = (g: Grade) => g.criteria.filter((c) => !c.pass).map((c) => c.id);

const okB: BFacts = {
  route: "/settings", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
  build: { code: 0 }, typecheck: { code: 0 }, newComponents: [], recorded: [],
};

describe("test B", () => {
  test("passes when everything holds", () => {
    expect(gradeB(okB).pass).toBe(true);
    expect(failing(gradeB(okB))).toEqual([]);
  });

  test("each requirement can fail it", () => {
    expect(failing(gradeB({ ...okB, pageExists: false }))).toEqual(["feature"]);
    expect(failing(gradeB({ ...okB, check: { violations: 1, exceptions: 0, warnings: 0 } }))).toEqual(["check"]);
    expect(failing(gradeB({ ...okB, check: { violations: 0, exceptions: 0, warnings: 1 } }))).toEqual(["check"]);
    expect(failing(gradeB({ ...okB, check: { violations: 0, exceptions: 3, warnings: 0 } }))).toEqual(["exceptions"]);
    expect(failing(gradeB({ ...okB, check: { error: "no-contract" } }))).toEqual(["check"]);
    expect(failing(gradeB({ ...okB, validate: { errors: 1, warnings: 0, missingSections: [] } }))).toEqual(["validate"]);
    expect(failing(gradeB({ ...okB, build: { code: 1 } }))).toEqual(["build"]);
    expect(failing(gradeB({ ...okB, typecheck: { code: 2 } }))).toEqual(["typecheck"]);
  });

  test("two motif-ok exceptions are allowed", () => {
    expect(gradeB({ ...okB, check: { violations: 0, exceptions: 2, warnings: 0 } }).pass).toBe(true);
  });

  test("one new component is fine; more must be recorded in the design guide", () => {
    expect(gradeB({ ...okB, newComponents: ["SettingsRow"] }).pass).toBe(true);
    expect(failing(gradeB({ ...okB, newComponents: ["SettingsRow", "AddressCard"] }))).toEqual(["components"]);
    expect(gradeB({ ...okB, newComponents: ["SettingsRow", "AddressCard"], recorded: ["AddressCard"] }).pass).toBe(true);
  });
});

const okC: CFacts = {
  report: { findings: 30, problems: [] },
  exact: { found: ["S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-10", "S-11", "S-12"], missed: ["S-13"] },
  judgement: { found: ["S-14", "S-15", "S-16", "S-17", "S-18", "S-19", "S-20"], missed: ["S-21", "S-22", "S-23"] },
  serious: 10, falseFindings: ["F-030"], changedCode: [],
};

describe("test C", () => {
  test("passes at the thresholds: 12 of 13 exact (92.3%), 7 of 10 judgement, 1 false in 10 serious", () => {
    expect(gradeC(okC).pass).toBe(true);
    expect(gradeC(okC).metrics).toEqual({ exactRecall: 92.3, judgementRecall: 70, falseRate: 10 });
  });

  test("fails below them", () => {
    expect(failing(gradeC({ ...okC, exact: { found: okC.exact.found.slice(1), missed: ["S-01", "S-13"] } }))).toEqual(["exact-recall"]);
    expect(failing(gradeC({ ...okC, judgement: { found: okC.judgement.found.slice(1), missed: ["S-14", "S-21", "S-22", "S-23"] } }))).toEqual(["judgement-recall"]);
    expect(failing(gradeC({ ...okC, falseFindings: ["F-029", "F-030"] }))).toEqual(["false-findings"]);
  });

  test("no serious findings means none are false", () => {
    expect(failing(gradeC({ ...okC, serious: 0, falseFindings: [] }))).toEqual([]);
  });

  test("changing the app's code, or writing no report, fails it", () => {
    expect(failing(gradeC({ ...okC, changedCode: ["src/app/page.tsx"] }))).toEqual(["report-only"]);
    expect(failing(gradeC({ ...okC, report: { error: "No review report was written." } }))).toEqual(["report"]);
  });
});

const screens: ScreenFacts[] = [{ route: "/", status: 200, pageErrors: 0 }, { route: "/sign-in", status: 200, pageErrors: 0 }, { route: "/home", status: 200, pageErrors: 0 }];
const okD: DFacts = {
  app: "/w/stride", validate: { errors: 0, warnings: 1, missingSections: [] }, check: { violations: 0, exceptions: 1, warnings: 0 },
  sections: { missing: [], empty: [] }, build: { code: 0 }, typecheck: { code: 0 }, screens, routes: ["/", "/sign-in", "/home"], auditFindings: 2,
};

describe("test D", () => {
  test("passes when the new app is complete", () => {
    expect(gradeD(okD).pass).toBe(true);
  });

  test("no app, a broken screen, an empty section or a failed build fails it", () => {
    expect(failing(gradeD({ ...okD, app: null }))).toEqual(["app"]);
    expect(failing(gradeD({ ...okD, screens: [screens[0]!, { route: "/sign-in", status: 500, pageErrors: 0 }] }))).toEqual(["screens"]);
    expect(failing(gradeD({ ...okD, screens: screens.map((s) => ({ ...s, pageErrors: s.route === "/home" ? 1 : 0 })) }))).toEqual(["screens"]);
    expect(failing(gradeD({ ...okD, screens: { error: "needs-browser" } }))).toEqual(["screens"]);
    expect(failing(gradeD({ ...okD, sections: { missing: [], empty: ["Patterns"] } }))).toEqual(["sections"]);
    expect(failing(gradeD({ ...okD, validate: { errors: 1, warnings: 0, missingSections: ['Your design guide is missing the "Motion" section.'] } }))).toEqual(["validate"]);
    expect(failing(gradeD({ ...okD, build: { code: 1, timedOut: true } }))).toEqual(["build"]);
  });

  test("says which screens didn't render, and why", () => {
    const g = gradeD({ ...okD, screens: [screens[0]!, { route: "/sign-in", status: 500, pageErrors: 0 }] });
    expect(g.criteria.find((c) => c.id === "screens")!.detail).toContain("/sign-in (status 500)");
    expect(g.criteria.find((c) => c.id === "screens")!.detail).toContain("/home (not captured)");
  });
});

describe("test B on a plain site", () => {
  const okPlain: BFacts = {
    route: "/history.html", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
    render: { route: "/history.html", status: 200, pageErrors: 0 }, newComponents: [], recorded: [],
  };
  test("passes when the page loads with no page errors; there's nothing to build", () => {
    const g = gradeB(okPlain);
    expect(g.pass).toBe(true);
    expect(g.criteria.map((c) => c.id)).toEqual(["feature", "check", "exceptions", "validate", "renders", "components"]);
  });
  test("fails when the page has errors, isn't served, or couldn't be captured", () => {
    expect(failing(gradeB({ ...okPlain, render: { route: "/history.html", status: 200, pageErrors: 1 } }))).toEqual(["renders"]);
    expect(failing(gradeB({ ...okPlain, render: { route: "/history.html", status: 404, pageErrors: 0 } }))).toEqual(["renders"]);
    expect(failing(gradeB({ ...okPlain, render: { error: "No Chrome or Edge found." } }))).toEqual(["renders"]);
  });
});

describe("test B on Flutter", () => {
  const okFlutter: BFacts = {
    route: "/search", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
    typecheck: { code: 0, command: "flutter analyze" }, render: { route: "/search", status: 200, pageErrors: 0 }, newComponents: [], recorded: [],
  };
  test("flutter analyze stands for the type check and the page is drawn by motif shot; there's no build", () => {
    const g = gradeB(okFlutter);
    expect(g.pass).toBe(true);
    expect(g.criteria.map((c) => c.id)).toEqual(["feature", "check", "exceptions", "validate", "typecheck", "renders", "components"]);
    expect(g.criteria.find((c) => c.id === "typecheck")!.detail).toBe("The type check (flutter analyze) passed.");
  });
  test("an analyzer problem, a screen Flutter couldn't draw, or a missing page fails it", () => {
    expect(failing(gradeB({ ...okFlutter, typecheck: { code: 1, command: "flutter analyze" } }))).toEqual(["typecheck"]);
    expect(gradeB({ ...okFlutter, typecheck: { code: 1, command: "flutter analyze" } }).criteria.find((c) => c.id === "typecheck")!.detail).toBe("The type check (flutter analyze) failed (exit code 1).");
    expect(failing(gradeB({ ...okFlutter, render: { route: "/search", status: 0, pageErrors: 1 } }))).toEqual(["renders"]);
    expect(failing(gradeB({ ...okFlutter, pageExists: false }))).toEqual(["feature"]);
  });
  test("a type check that couldn't run properly says why", () => {
    const g = gradeB({ ...okFlutter, typecheck: { code: 1, command: "flutter analyze", detail: "flutter pub get failed (see pub-get.log), so the type check couldn't run properly." } });
    expect(failing(g)).toEqual(["typecheck"]);
    expect(g.criteria.find((c) => c.id === "typecheck")!.detail).toBe("flutter pub get failed (see pub-get.log), so the type check couldn't run properly.");
  });

  test("the screen a route shows isn't a new component, and the details say so", () => {
    const g = gradeB({ ...okFlutter, newComponents: ["ResultTile"], screens: ["SearchScreen"], screenParts: ["_EmptyQuery"] });
    expect(g.pass).toBe(true);
    expect(g.criteria.find((c) => c.id === "components")!.detail).toBe(
      "New: ResultTile. The page a route shows, not counted: SearchScreen. Part of a screen, not counted: _EmptyQuery.",
    );
  });
});

describe("test D on Flutter", () => {
  test("no build criterion: flutter analyze and the screens", () => {
    const { build: _, ...rest } = okD;
    const g = gradeD({ ...rest, typecheck: { code: 0, command: "flutter analyze" } });
    expect(g.pass).toBe(true);
    expect(g.criteria.map((c) => c.id)).toEqual(["app", "validate", "check", "exceptions", "sections", "typecheck", "screens"]);
    expect(failing(gradeD({ ...rest, typecheck: { code: 3, command: "flutter analyze" } }))).toEqual(["typecheck"]);
  });
});

describe("test B and D on Compose", () => {
  const gradle = { code: 0, command: "./gradlew :app:compileDebugKotlin" };
  const okCompose: BFacts = {
    route: "/reminders", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
    typecheck: gradle, render: { route: "/reminders", status: 200, pageErrors: 0 }, newComponents: [], recorded: [],
  };
  test("compileDebugKotlin stands for the type check and the page is drawn by motif shot; there's no build", () => {
    const g = gradeB(okCompose);
    expect(g.pass).toBe(true);
    expect(g.criteria.map((c) => c.id)).toEqual(["feature", "check", "exceptions", "validate", "typecheck", "renders", "components"]);
    expect(g.criteria.find((c) => c.id === "typecheck")!.detail).toBe("The type check (./gradlew :app:compileDebugKotlin) passed.");
    expect(failing(gradeB({ ...okCompose, typecheck: { ...gradle, code: 1 } }))).toEqual(["typecheck"]);
    expect(failing(gradeB({ ...okCompose, render: { error: "Gradle stopped before drawing it." } }))).toEqual(["renders"]);
  });
  test("D has no build criterion either", () => {
    const { build: _, ...rest } = okD;
    const g = gradeD({ ...rest, typecheck: gradle });
    expect(g.criteria.map((c) => c.id)).toEqual(["app", "validate", "check", "exceptions", "sections", "typecheck", "screens"]);
  });
});

describe("test B on React Native", () => {
  const okRn: BFacts = {
    route: "/orders", pageExists: true, check: { violations: 0, exceptions: 0, warnings: 0 }, validate: { errors: 0, warnings: 0, missingSections: [] },
    typecheck: { code: 0, command: "tsc" }, render: { route: "/orders", status: 200, pageErrors: 0 }, newComponents: [], recorded: [],
  };
  test("tsc stands for the type check and the page is drawn through the web target; there's no build", () => {
    const g = gradeB({ ...okRn, newComponents: ["OrderCard"], screens: ["OrdersScreen"], screenParts: ["Group"] });
    expect(g.pass).toBe(true);
    expect(g.criteria.map((c) => c.id)).toEqual(["feature", "check", "exceptions", "validate", "typecheck", "renders", "components"]);
    expect(g.criteria.find((c) => c.id === "typecheck")!.detail).toBe("The type check (tsc) passed.");
    expect(failing(gradeB({ ...okRn, typecheck: { code: 2, command: "tsc" } }))).toEqual(["typecheck"]);
    expect(failing(gradeB({ ...okRn, render: { route: "/orders", status: 200, pageErrors: 2 } }))).toEqual(["renders"]);
  });
});
