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
