import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, isFlutter, isPlain, needsBrowser, selectCases, UNATTENDED, type EvalCase } from "../../tests/evals/cases";

const REPO = join(import.meta.dir, "../..");
const ids = (r: EvalCase[] | { error: string }) => ("error" in r ? r : r.map((c) => c.id));

describe("the eval cases (spec §13.2)", () => {
  test("eight features for B, three reviews for C and four new apps for D", () => {
    expect(CASES.filter((c) => c.test === "B").map((c) => c.id)).toEqual(["b-settings", "b-search", "b-profile", "b-notifications", "b-checkout", "b-plain", "b-flutter-reserve", "b-flutter-search"]);
    expect(CASES.filter((c) => c.test === "C").map((c) => c.id)).toEqual(["c-review", "c-plain", "c-flutter"]);
    expect(CASES.filter((c) => c.test === "D").map((c) => c.id)).toEqual(["d-stride", "d-ledgerly", "d-bloom", "d-sahm"]);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  test("B adds a page to a contract fixture; C reviews a seeded one; D starts from a brief that exists", () => {
    for (const c of CASES.filter((x) => x.test === "B")) {
      expect(["react-contract-app", "plain-contract-site", "flutter-contract-app"]).toContain(c.fixture!);
      expect(c.routes).toHaveLength(1);
      expect(c.prompt).toContain(` ${c.routes[0]}:`);
    }
    expect(CASES.find((c) => c.id === "b-plain")!).toMatchObject({ fixture: "plain-contract-site", routes: ["/history.html"] });
    expect(CASES.find((c) => c.id === "c-review")!.fixture).toBe("react-seeded-app");
    expect(CASES.find((c) => c.id === "c-plain")!).toMatchObject({ fixture: "plain-seeded-site", routes: ["/"] });
    for (const c of CASES.filter((x) => x.test === "D")) {
      expect(existsSync(join(REPO, "tests/fixtures/briefs", `${c.brief}.md`))).toBe(true);
      expect(c.routes).toEqual(["/", "/sign-in", "/home"]);
      for (const r of ["/sign-in", "/home"]) expect(c.prompt).toContain(r);
    }
  });

  test("plain cases install nothing; B on Larder and every Flutter case need no browser, the rest do", () => {
    expect(CASES.filter(isPlain).map((c) => c.id)).toEqual(["b-plain", "c-plain"]);
    expect(CASES.filter((c) => !needsBrowser(c)).map((c) => c.id)).toEqual([
      "b-settings", "b-search", "b-profile", "b-notifications", "b-checkout", "b-flutter-reserve", "b-flutter-search", "c-flutter", "d-sahm",
    ]);
  });

  test("the Flutter cases: two features on Maktaba, the review of its seeded copy, and Sahm from a brief", () => {
    expect(CASES.filter(isFlutter).map((c) => c.id)).toEqual(["b-flutter-reserve", "b-flutter-search", "c-flutter", "d-sahm"]);
    for (const c of CASES) expect(c.stack === "flutter").toBe(isFlutter(c));
    // /books/reserve would be taken by go_router's /books/:id when listed after it, so the flow has a route of its own.
    const reserve = CASES.find((c) => c.id === "b-flutter-reserve")!;
    expect(reserve).toMatchObject({ test: "B", fixture: "flutter-contract-app", routes: ["/reserve"] });
    expect(reserve.prompt).toContain("confirmation");
    const search = CASES.find((c) => c.id === "b-flutter-search")!;
    expect(search).toMatchObject({ test: "B", fixture: "flutter-contract-app", routes: ["/search"] });
    expect(search.prompt).toContain("before anything is typed");
    expect(search.prompt).toContain("nothing matches");
    const review = CASES.find((c) => c.id === "c-flutter")!;
    expect(review).toMatchObject({ test: "C", fixture: "flutter-seeded-app", routes: ["/", "/books", "/books/season-of-migration", "/loans", "/sign-in"] });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    expect(CASES.find((c) => c.id === "d-sahm")!).toMatchObject({ test: "D", brief: "sahm", routes: ["/", "/sign-in", "/home"] });
  });

  test("every prompt starts a Motif command and switches approvals off in the skill's own words", () => {
    expect(readFileSync(join(REPO, "skill/SKILL.md"), "utf8")).toContain("don't stop for approval");
    expect(UNATTENDED.toLowerCase()).toContain("don't stop for approval");
    expect(UNATTENDED).not.toContain("skip previews"); // mockups are part of what's evaluated
    for (const c of CASES) {
      expect(c.prompt).toMatch(/^\/motif:(feature|review|init) /);
      expect(c.prompt).toContain(UNATTENDED);
    }
  });

  test("the review is report-only and names the screens", () => {
    const p = CASES.find((c) => c.id === "c-review")!.prompt;
    expect(p).toContain("don't change the app's code");
    for (const r of ["/products", "/products/oats"]) expect(p).toContain(r);
    const plain = CASES.find((c) => c.id === "c-plain")!.prompt;
    expect(plain).toContain("don't change the site's code");
    expect(plain).toContain("after a postcard is sent");
  });

  test("every case is capped", () => {
    for (const c of CASES) {
      expect(c.maxTurns).toBeGreaterThan(0);
      expect(c.maxBudgetUsd).toBeGreaterThan(0);
      expect(c.minutes).toBeGreaterThan(0);
    }
  });
});

describe("choosing cases", () => {
  test("by test and by id; everything by default", () => {
    expect(ids(selectCases(CASES, { tests: ["c"] }))).toEqual(["c-review", "c-plain", "c-flutter"]);
    expect(ids(selectCases(CASES, { ids: ["d-bloom", "b-search"] }))).toEqual(["b-search", "d-bloom"]);
    expect(ids(selectCases(CASES, { ids: ["d-sahm", "b-flutter-search"] }))).toEqual(["b-flutter-search", "d-sahm"]);
    expect(ids(selectCases(CASES, {}))).toHaveLength(15);
  });

  test("names what doesn't exist, and refuses an empty choice", () => {
    expect(selectCases(CASES, { tests: ["E"] })).toEqual({ error: expect.stringContaining('"E"') });
    expect(selectCases(CASES, { ids: ["b-nope"] })).toEqual({ error: expect.stringContaining('"b-nope"') });
    expect(selectCases(CASES, { tests: ["B"], ids: ["c-review"] })).toEqual({ error: expect.any(String) });
  });
});
