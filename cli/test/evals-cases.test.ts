import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, isAngular, isCompose, isFlutter, isPlain, isReactNative, isSvelte, isSwiftUI, isVue, macOnly, needsAngular22, needsBrowser, needsSvelteKit3, needsVite8, selectCases, UNATTENDED, type EvalCase } from "../../tests/evals/cases";

const REPO = join(import.meta.dir, "../..");
const ids = (r: EvalCase[] | { error: string }) => ("error" in r ? r : r.map((c) => c.id));

describe("the eval cases (spec §13.2)", () => {
  test("twenty features for B, nine reviews for C and ten new apps for D", () => {
    expect(CASES.filter((c) => c.test === "B").map((c) => c.id)).toEqual([
      "b-settings", "b-search", "b-profile", "b-notifications", "b-checkout", "b-plain", "b-flutter-reserve", "b-flutter-search",
      "b-compose-reminder", "b-compose-stats", "b-rn-orders", "b-rn-favourites", "b-vue-history", "b-vue-settings", "b-svelte-history", "b-svelte-settings", "b-angular-history", "b-angular-settings", "b-swiftui-orders", "b-swiftui-rewards",
    ]);
    expect(CASES.filter((c) => c.test === "C").map((c) => c.id)).toEqual(["c-review", "c-plain", "c-flutter", "c-compose", "c-rn", "c-vue", "c-svelte", "c-angular", "c-swiftui"]);
    expect(CASES.filter((c) => c.test === "D").map((c) => c.id)).toEqual(["d-stride", "d-ledgerly", "d-bloom", "d-sahm", "d-nabta", "d-rihla", "d-darb", "d-nuzha", "d-sanad", "d-masar"]);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  test("B adds a page to a contract fixture; C reviews a seeded one; D starts from a brief that exists", () => {
    for (const c of CASES.filter((x) => x.test === "B")) {
      expect(["react-contract-app", "plain-contract-site", "flutter-contract-app", "compose-contract-app", "rn-contract-app", "vue-contract-app", "svelte-contract-app", "angular-contract-app", "swiftui-contract-app"]).toContain(c.fixture!);
      expect(c.routes).toHaveLength(1);
      // A SwiftUI screen has no address: the feature's page is the #Preview the prompt names.
      expect(c.prompt).toContain(isSwiftUI(c) ? `#Preview titled "${c.routes[0]}"` : ` ${c.routes[0]}:`);
    }
    expect(CASES.find((c) => c.id === "b-plain")!).toMatchObject({ fixture: "plain-contract-site", routes: ["/history.html"] });
    expect(CASES.find((c) => c.id === "c-review")!.fixture).toBe("react-seeded-app");
    expect(CASES.find((c) => c.id === "c-plain")!).toMatchObject({ fixture: "plain-seeded-site", routes: ["/"] });
    for (const c of CASES.filter((x) => x.test === "D")) {
      expect(existsSync(join(REPO, "tests/fixtures/briefs", `${c.brief}.md`))).toBe(true);
      expect(c.routes).toEqual(c.id === "d-rihla" ? ["/", "/sign-in", "/trips"] : c.id === "d-darb" ? ["/", "/sign-in", "/meetups"] : c.id === "d-nuzha" ? ["/", "/sign-in", "/trails"] : c.id === "d-sanad" ? ["/", "/sign-in", "/requests"] : c.id === "d-masar" ? ["/", "Sign in", "Home"] : ["/", "/sign-in", "/home"]);
      for (const r of c.routes.slice(1)) expect(c.prompt).toContain(r);
    }
  });

  test("plain cases install nothing; B on Larder and every Flutter, Compose and SwiftUI case need no browser, the rest (React Native too) do", () => {
    expect(CASES.filter(isPlain).map((c) => c.id)).toEqual(["b-plain", "c-plain"]);
    expect(CASES.filter((c) => !needsBrowser(c)).map((c) => c.id)).toEqual([
      "b-settings", "b-search", "b-profile", "b-notifications", "b-checkout", "b-flutter-reserve", "b-flutter-search", "b-compose-reminder", "b-compose-stats",
      "b-swiftui-orders", "b-swiftui-rewards", "c-flutter", "c-compose", "c-swiftui", "d-sahm", "d-nabta", "d-masar",
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

  test("the Compose cases: two features on Rafiq, the seeded review, and Nabta from a brief", () => {
    expect(CASES.filter(isCompose).map((c) => c.id)).toEqual(["b-compose-reminder", "b-compose-stats", "c-compose", "d-nabta"]);
    for (const c of CASES) expect(c.stack === "compose").toBe(isCompose(c));
    const reminder = CASES.find((c) => c.id === "b-compose-reminder")!;
    expect(reminder).toMatchObject({ test: "B", fixture: "compose-contract-app", routes: ["/reminders"], minutes: 120 });
    expect(reminder.prompt).toContain("reminder time");
    expect(reminder.prompt).toContain("saved");
    const stats = CASES.find((c) => c.id === "b-compose-stats")!;
    expect(stats).toMatchObject({ test: "B", fixture: "compose-contract-app", routes: ["/stats"] });
    expect(stats.prompt).toContain("empty state");
    const review = CASES.find((c) => c.id === "c-compose")!;
    expect(review).toMatchObject({ test: "C", fixture: "compose-seeded-app" });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    const nabta = CASES.find((c) => c.id === "d-nabta")!;
    expect(nabta).toMatchObject({ test: "D", brief: "nabta", routes: ["/", "/sign-in", "/home"] });
    expect(nabta.prompt).toContain("welcome screen");
  });

  test("the React Native cases: two features on Dukkan, the seeded review, and Rihla from a brief; all need a browser", () => {
    expect(CASES.filter(isReactNative).map((c) => c.id)).toEqual(["b-rn-orders", "b-rn-favourites", "c-rn", "d-rihla"]);
    for (const c of CASES) expect(c.stack === "react-native").toBe(isReactNative(c));
    for (const c of CASES.filter(isReactNative)) expect(needsBrowser(c)).toBe(true);
    const orders = CASES.find((c) => c.id === "b-rn-orders")!;
    expect(orders).toMatchObject({ test: "B", fixture: "rn-contract-app", routes: ["/orders"] });
    expect(orders.prompt).toContain("empty state");
    const fav = CASES.find((c) => c.id === "b-rn-favourites")!;
    expect(fav).toMatchObject({ test: "B", fixture: "rn-contract-app", routes: ["/favourites"] });
    expect(fav.prompt).toContain("product's page");
    const review = CASES.find((c) => c.id === "c-rn")!;
    expect(review).toMatchObject({ test: "C", fixture: "rn-seeded-app", routes: ["/", "/products/oat-milk", "/basket", "/sign-in"] });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    const rihla = CASES.find((c) => c.id === "d-rihla")!;
    expect(rihla).toMatchObject({ test: "D", brief: "rihla", routes: ["/", "/sign-in", "/trips"] });
    expect(rihla.prompt).toContain("welcome screen at /");
    expect(readFileSync(join(REPO, "tests/fixtures/briefs/rihla.md"), "utf8")).toContain("Expo");
  });

  test("the Vue cases: two features on Bustan, the seeded review, and Darb from a brief; web cases, so a browser and npm", () => {
    expect(CASES.filter(isVue).map((c) => c.id)).toEqual(["b-vue-history", "b-vue-settings", "c-vue", "d-darb"]);
    for (const c of CASES) expect(c.stack === "vue").toBe(isVue(c));
    for (const c of CASES.filter(isVue)) {
      expect(needsBrowser(c)).toBe(true);
      expect(c.mac).toBeUndefined();
    }
    // The feature is asked for as a product owner would, in the skill's feature mode, and the page is a route of its own.
    const history = CASES.find((c) => c.id === "b-vue-history")!;
    expect(history).toMatchObject({ test: "B", fixture: "vue-contract-app", routes: ["/history"], minutes: 120 });
    expect(history.prompt).toStartWith("/motif:feature ");
    expect(history.prompt).toContain("empty state");
    const settings = CASES.find((c) => c.id === "b-vue-settings")!;
    expect(settings).toMatchObject({ test: "B", fixture: "vue-contract-app", routes: ["/settings"], minutes: 120 });
    expect(settings.prompt).toContain("harvest look");
    const review = CASES.find((c) => c.id === "c-vue")!;
    expect(review).toMatchObject({ test: "C", fixture: "vue-seeded-app", routes: ["/", "/plots/by-the-gate", "/harvest", "/sign-in"] });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    const darb = CASES.find((c) => c.id === "d-darb")!;
    expect(darb).toMatchObject({ test: "D", brief: "darb", routes: ["/", "/sign-in", "/meetups"] });
    expect(darb.prompt).toContain("welcome page at /");
    const brief = readFileSync(join(REPO, "tests/fixtures/briefs/darb.md"), "utf8");
    expect(brief).toContain("Vue");
    expect(brief).toContain("Arabic");
  });

  test("the Svelte cases: two features on Adawat, the seeded review, and Nuzha from a brief; web cases, so a browser and npm", () => {
    expect(CASES.filter(isSvelte).map((c) => c.id)).toEqual(["b-svelte-history", "b-svelte-settings", "c-svelte", "d-nuzha"]);
    for (const c of CASES) expect(c.stack === "svelte").toBe(isSvelte(c));
    for (const c of CASES.filter(isSvelte)) {
      expect(needsBrowser(c)).toBe(true);
      expect(c.mac).toBeUndefined();
    }
    const history = CASES.find((c) => c.id === "b-svelte-history")!;
    expect(history).toMatchObject({ test: "B", fixture: "svelte-contract-app", routes: ["/history"], minutes: 120 });
    expect(history.prompt).toStartWith("/motif:feature ");
    expect(history.prompt).toContain("empty state");
    const settings = CASES.find((c) => c.id === "b-svelte-settings")!;
    expect(settings).toMatchObject({ test: "B", fixture: "svelte-contract-app", routes: ["/settings"], minutes: 120 });
    expect(settings.prompt).toContain("repair-weekend look");
    const review = CASES.find((c) => c.id === "c-svelte")!;
    expect(review).toMatchObject({ test: "C", fixture: "svelte-seeded-app", routes: ["/", "/tools/cordless-drill", "/loans", "/sign-in"] });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    const nuzha = CASES.find((c) => c.id === "d-nuzha")!;
    expect(nuzha).toMatchObject({ test: "D", brief: "nuzha", routes: ["/", "/sign-in", "/trails"] });
    expect(nuzha.prompt).toContain("welcome page at /");
    const brief = readFileSync(join(REPO, "tests/fixtures/briefs/nuzha.md"), "utf8");
    expect(brief).toContain("SvelteKit");
    expect(brief).toContain("Arabic");
    expect(brief).toContain("no design files");
  });

  test("the Angular cases: two features on Ataa, the seeded review, and Sanad from a brief; web cases, so a browser and npm", () => {
    expect(CASES.filter(isAngular).map((c) => c.id)).toEqual(["b-angular-history", "b-angular-settings", "c-angular", "d-sanad"]);
    for (const c of CASES) expect(c.stack === "angular").toBe(isAngular(c));
    for (const c of CASES.filter(isAngular)) {
      expect(needsBrowser(c)).toBe(true);
      expect(c.mac).toBeUndefined();
    }
    const history = CASES.find((c) => c.id === "b-angular-history")!;
    expect(history).toMatchObject({ test: "B", fixture: "angular-contract-app", routes: ["/history"], minutes: 120 });
    expect(history.prompt).toStartWith("/motif:feature ");
    expect(history.prompt).toContain("empty state");
    expect(history.prompt).toContain("shift");
    const settings = CASES.find((c) => c.id === "b-angular-settings")!;
    expect(settings).toMatchObject({ test: "B", fixture: "angular-contract-app", routes: ["/settings"], minutes: 120 });
    expect(settings.prompt).toContain("harvest-night look");
    // Ataa's seeded README's four pages, a shift's by the id its audit uses.
    const review = CASES.find((c) => c.id === "c-angular")!;
    expect(review).toMatchObject({ test: "C", fixture: "angular-seeded-app", routes: ["/", "/shifts/pack-sunday", "/my-shifts", "/sign-in"], minutes: 120 });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    const sanad = CASES.find((c) => c.id === "d-sanad")!;
    expect(sanad).toMatchObject({ test: "D", brief: "sanad", routes: ["/", "/sign-in", "/requests"] });
    expect(sanad.prompt).toContain("welcome page at /");
    const brief = readFileSync(join(REPO, "tests/fixtures/briefs/sanad.md"), "utf8");
    expect(brief).toContain("Angular");
    expect(brief).toContain("Arabic");
    expect(brief).toContain("no design files");
  });

  test("the Node.js floors: Vite 8 for Vue and the Svelte fixtures, SvelteKit 3 for the new Svelte app, Angular 22 for the new Angular app", () => {
    expect(CASES.filter(needsVite8).map((c) => c.id)).toEqual(["b-vue-history", "b-vue-settings", "b-svelte-history", "b-svelte-settings", "c-vue", "c-svelte", "d-darb"]);
    expect(CASES.filter(needsSvelteKit3).map((c) => c.id)).toEqual(["d-nuzha"]);
    expect(CASES.filter(needsAngular22).map((c) => c.id)).toEqual(["d-sanad"]);
  });

  test("the welcome view is a page on the web and a screen on Flutter, Compose and Expo, said by one parameter", () => {
    const noun = (id: string) => CASES.find((c) => c.id === id)!.prompt.match(/the welcome (\w+) at \//)?.[1];
    expect(["d-stride", "d-darb", "d-nuzha", "d-sanad"].map(noun)).toEqual(["page", "page", "page", "page"]);
    expect(["d-sahm", "d-nabta", "d-rihla"].map(noun)).toEqual(["screen", "screen", "screen"]);
  });

  test("the SwiftUI cases: two features on Qahwa, the seeded review, and Masar from a brief; Mac only, no browser", () => {
    expect(CASES.filter(isSwiftUI).map((c) => c.id)).toEqual(["b-swiftui-orders", "b-swiftui-rewards", "c-swiftui", "d-masar"]);
    for (const c of CASES) {
      expect(c.stack === "swiftui").toBe(isSwiftUI(c));
      // Only the SwiftUI cases need a Mac.
      expect(c.mac === true).toBe(isSwiftUI(c));
    }
    for (const c of CASES.filter(isSwiftUI)) expect(needsBrowser(c)).toBe(false);
    const orders = CASES.find((c) => c.id === "b-swiftui-orders")!;
    expect(orders).toMatchObject({ test: "B", fixture: "swiftui-contract-app", routes: ["Orders"], minutes: 120 });
    expect(orders.prompt).toContain("empty state");
    expect(orders.prompt).toContain("newest first");
    expect(orders.prompt).toContain("from the menu");
    const rewards = CASES.find((c) => c.id === "b-swiftui-rewards")!;
    expect(rewards).toMatchObject({ test: "B", fixture: "swiftui-contract-app", routes: ["Rewards history"], minutes: 120 });
    expect(rewards.prompt).toContain("grouped by month");
    expect(rewards.prompt).toContain("from the loyalty card");
    // Qahwa's root and its four previews, as its seeded README lists them.
    const review = CASES.find((c) => c.id === "c-swiftui")!;
    expect(review).toMatchObject({ test: "C", fixture: "swiftui-seeded-app", routes: ["/", "Menu", "Drink", "Loyalty card", "Sign in"], minutes: 120 });
    expect(review.prompt).toContain("don't change the app's code");
    for (const r of review.routes) expect(review.prompt).toContain(r);
    const masar = CASES.find((c) => c.id === "d-masar")!;
    expect(masar).toMatchObject({ test: "D", brief: "masar", starter: "swiftui-starter-masar", routes: ["/", "Sign in", "Home"] });
    // Only Masar starts from a project: an Xcode project has no command-line starter, and the skill says not to write one by hand.
    expect(CASES.filter((c) => c.starter).map((c) => c.id)).toEqual(["d-masar"]);
    expect(masar.prompt).toContain("root view");
    for (const r of ["Sign in", "Home"]) expect(masar.prompt).toContain(`"${r}"`);
    expect(readFileSync(join(REPO, "tests/fixtures/briefs/masar.md"), "utf8")).toContain("SwiftUI");
  });

  test("every prompt starts a Motif command and switches approvals off in the skill's own words", () => {
    expect(readFileSync(join(REPO, "skill/SKILL.md"), "utf8")).toContain("don't stop for approval");
    expect(UNATTENDED.toLowerCase()).toContain("don't stop for approval");
    // A session that ends its turn to wait on a job it put in the background is over: the run ends and kills the job (2H c-swiftui).
    expect(UNATTENDED).toContain("Don't end your turn while a command you started is still running");
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
    expect(ids(selectCases(CASES, { tests: ["c"] }))).toEqual(["c-review", "c-plain", "c-flutter", "c-compose", "c-rn", "c-vue", "c-svelte", "c-angular", "c-swiftui"]);
    expect(ids(selectCases(CASES, { ids: ["d-bloom", "b-search"] }))).toEqual(["b-search", "d-bloom"]);
    expect(ids(selectCases(CASES, { ids: ["d-sahm", "b-flutter-search"] }))).toEqual(["b-flutter-search", "d-sahm"]);
    expect(ids(selectCases(CASES, {}))).toHaveLength(39);
  });

  test("off a Mac, the Mac-only cases are set aside with the reason; on a Mac nothing is", () => {
    const picked = selectCases(CASES, { ids: ["b-search", "b-swiftui-orders", "c-swiftui"] }) as EvalCase[];
    for (const platform of ["win32", "linux"] as const) {
      const r = macOnly(picked, platform);
      expect(r.run.map((c) => c.id)).toEqual(["b-search"]);
      expect(r.skipped.map((c) => c.id)).toEqual(["b-swiftui-orders", "c-swiftui"]);
      expect(r.reason).toBe(
        "Skipping b-swiftui-orders and c-swiftui: they need a Mac with Xcode, since SwiftUI apps build and draw only on macOS. Run them on a Mac: bun tests/evals/run.ts --cases b-swiftui-orders,c-swiftui",
      );
    }
    expect(macOnly(picked, "darwin")).toEqual({ run: picked, skipped: [], reason: "" });
    expect(macOnly(selectCases(CASES, { ids: ["d-masar"] }) as EvalCase[], "win32").reason).toStartWith("Skipping d-masar: it needs a Mac with Xcode");
  });

  test("names what doesn't exist, and refuses an empty choice", () => {
    expect(selectCases(CASES, { tests: ["E"] })).toEqual({ error: expect.stringContaining('"E"') });
    expect(selectCases(CASES, { ids: ["b-nope"] })).toEqual({ error: expect.stringContaining('"b-nope"') });
    expect(selectCases(CASES, { tests: ["B"], ids: ["c-review"] })).toEqual({ error: expect.any(String) });
  });
});
