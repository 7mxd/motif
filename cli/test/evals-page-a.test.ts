import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchBrowser } from "../src/browser/cdp";
import { findBrowser } from "../src/detect/browser";
import { CASES } from "../../tests/evals/cases";
import type { Grade } from "../../tests/evals/grade";
import { ownerPairs, ownerPicks, readVotes, serveOwner, sideOrder, writePage, type OwnerVote } from "../../tests/evals/page-a";
import type { Pair } from "../../tests/evals/pairs";
import { scoreRun } from "../../tests/evals/score-a";
import { writeReport } from "../../tests/evals/run";
import type { CaseState, RunState } from "../../tests/evals/state";
import { encodePng } from "./png-pixels";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const REPO = resolve(import.meta.dir, "..", "..");
const BRIEFS = [...new Set(CASES.filter((c) => c.brief).map((c) => c.brief!))];

/** What would tell the sides apart, or name the cases, in a page or a response before the reveal. */
function tells(text: string, run?: string): string[] {
  const found: string[] = [];
  if (/motif/i.test(text)) found.push('"motif"');
  if (/baseline/i.test(text)) found.push('"baseline"');
  for (const b of BRIEFS) {
    if (new RegExp(`\\b[ad]-${b}\\b`, "i").test(text)) found.push(`a case id of ${b}`);
    // The brief's folder name; its display title ("Nuzha") is shared by both sides and allowed.
    if (text.includes(b)) found.push(`the folder name ${b}`);
  }
  if (run && (text.includes(run) || text.includes(run.replace(/\\/g, "/")) || text.includes(run.replace(/\\/g, "\\\\")))) found.push("the run folder");
  return found;
}

const grade = (built: boolean): Grade => ({ pass: built, criteria: [{ id: "build", label: "Builds", pass: built, detail: built ? "ok" : "failed" }], metrics: {} });
const graded = (built: boolean): CaseState => ({ status: "graded", attempts: 1, grade: grade(built) });

/** 12 random-looking hex digits, never spelling anything. */
let next = 0x1f3c5a7e9b00;
const hex = () => (next++).toString(16).padStart(12, "0");

/**
 * A run folder: Nuzha's pairs (three with both sides, one with each side alone, one with neither) and Stride's, whose
 * app built without Motif failed, so its pairs are decided without the owner.
 */
function fixture() {
  const run = tempDir("page-a-");
  mkdirSync(join(run, "a", "img"), { recursive: true });
  const img = (shade: number, w = 39, h = 84) => {
    const name = hex();
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([shade, 120, 255 - shade, 255], i);
    writeFileSync(join(run, "a", "img", `${name}.png`), encodePng(w, h, rgba));
    return `a/img/${name}.png`;
  };
  const p = (brief: string, screen: string, size: number, outcome: Pair["outcome"]): Pair => ({
    id: hex(), brief, screen, size, outcome,
    ...(outcome === "both" || outcome === "motif-only" ? { motif: img(40) } : {}),
    ...(outcome === "both" || outcome === "baseline-only" ? { baseline: img(200) } : {}),
    ...(outcome === "both" ? {} : { why: "The app couldn't be shot: its dev server didn't start." }),
  });
  const pairs: Pair[] = [
    p("nuzha", "/", 390, "both"),
    p("nuzha", "/sign-in", 390, "both"),
    p("nuzha", "/trails", 1440, "both"),
    p("nuzha", "/", 1440, "motif-only"),
    p("nuzha", "/sign-in", 1440, "baseline-only"),
    p("nuzha", "/trails", 390, "neither"),
    p("stride", "/", 390, "both"),
    p("stride", "/sign-in", 390, "both"),
  ];
  writeFileSync(join(run, "a", "pairs.json"), JSON.stringify(pairs, null, 2));
  const state: RunState = {
    motifEvalRun: 1, id: "20261026-120000", commit: "abc", dirty: false, started: "2026-10-26T12:00:00.000Z", claudeVersion: "2", resumes: [],
    options: { keep: false, work: "/w" },
    cases: { "d-nuzha": graded(true), "a-nuzha": graded(true), "d-stride": graded(true), "a-stride": graded(false) },
  };
  writeFileSync(join(run, "run.json"), JSON.stringify(state, null, 2));
  return { run, pairs, state, shown: pairs.slice(0, 5), hidden: pairs.slice(5) };
}

/** The pairs the page carries, in its order, as the page has them. */
function pageData(html: string): { pairs: { id: string; title: string; left: string | null; right: string | null; size: number }[] } {
  const m = html.match(/<script id="pairs" type="application\/json">([\s\S]*?)<\/script>/);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]!);
}

describe("the owner's page", () => {
  test("shows the pairs the owner decides: not those left out or decided by a build", () => {
    const f = fixture();
    expect(ownerPairs(f.state, f.run).map((p) => p.id).sort()).toEqual(f.shown.map((p) => p.id).sort());
  });

  test("names neither side, no case and no brief folder, and carries only the shown pairs' images", () => {
    const f = fixture();
    const file = writePage(f.run, "owner", ownerPairs(f.state, f.run));
    expect(existsSync(file)).toBe(true);
    const html = readFileSync(file, "utf8");
    expect(tells(html, f.run)).toEqual([]);
    // Nothing about why a side lost, or which side a file is.
    expect(html).not.toContain("dev server");
    expect(html).not.toMatch(/"order"|"outcome"|"why"/);
    const data = pageData(html);
    expect(data.pairs).toHaveLength(5);
    for (const p of f.shown) {
      for (const img of [p.motif, p.baseline]) if (img) expect(html).toContain(img.replace("a/img/", ""));
    }
    for (const p of f.hidden) {
      expect(html).not.toContain(p.id);
      for (const img of [p.motif, p.baseline]) if (img) expect(html).not.toContain(img.replace("a/img/", ""));
    }
    // The brief's own title and the screen, which both sides share.
    expect(data.pairs.map((x) => x.title)).toContain("Nuzha — Sign in");
    expect(data.pairs.map((x) => x.title)).toContain("Nuzha — Welcome");
    expect(html).toContain("About the same");
    // A one-sided pair has its one image on whichever side its order puts it, and nothing on the other.
    const lone = data.pairs.filter((x) => !x.left || !x.right);
    expect(lone).toHaveLength(2);
  });

  test("each pair's sides are shuffled on their own, from the session's seed", () => {
    const ids = Array.from({ length: 400 }, () => hex());
    const left = ids.filter((id) => sideOrder("seed-1", id) === "motif-left").length;
    expect(left).toBeGreaterThan(150);
    expect(left).toBeLessThan(250);
    // The same seed gives the same sides; another seed others.
    expect(ids.map((id) => sideOrder("seed-1", id))).toEqual(ids.map((id) => sideOrder("seed-1", id)));
    expect(ids.map((id) => sideOrder("seed-2", id))).not.toEqual(ids.map((id) => sideOrder("seed-1", id)));
  });

  test("the public page is Task 6's", () => {
    const f = fixture();
    expect(() => writePage(f.run, "public", f.shown)).toThrow();
  });
});

describe("serving the owner's page", () => {
  const get = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, init);
    const body = Buffer.from(await r.arrayBuffer());
    const headers = [...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    return { status: r.status, body, text: body.toString("latin1"), headers };
  };
  const vote = (url: string, pairId: string, pick: string) =>
    get(`${url}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairId, pick }) });

  test("serves the page, the shown pairs' images, and nothing else; no response tells the sides apart", async () => {
    const f = fixture();
    const s = await serveOwner(f.run);
    try {
      expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const page = await get(`${s.url}/`);
      expect(page.status).toBe(200);
      const data = pageData(page.body.toString("utf8"));
      const img = data.pairs.find((x) => x.left)!.left!;
      const shot = await get(`${s.url}/${img}`);
      expect(shot.status).toBe(200);
      expect(shot.body.equals(readFileSync(join(f.run, "a", img)))).toBe(true);
      const votes = await get(`${s.url}/votes`);
      expect(JSON.parse(votes.text)).toEqual({ votes: [] });
      const reveal = await get(`${s.url}/reveal`);
      expect(reveal.status).toBe(409);
      for (const r of [page, shot, votes, reveal]) expect(tells(r.text + r.headers, f.run)).toEqual([]);
      // Not a hidden pair's image, not the run's files, not a path out of the image folder.
      const hidden = f.hidden.find((p) => p.motif)!.motif!.replace("a/", "");
      for (const path of [hidden, "a/pairs.json", "pairs.json", "run.json", "a/owner-votes.json", "img/..%2Fpairs.json", "img/../pairs.json", "img/x.png"]) {
        const r = await get(`${s.url}/${path}`);
        expect(r.status).toBe(404);
        expect(tells(r.text + r.headers, f.run)).toEqual([]);
      }
    } finally {
      s.stop();
    }
  });

  test("answers only requests addressed to it", async () => {
    const f = fixture();
    const s = await serveOwner(f.run);
    try {
      const r = await fetch(`${s.url}/votes`, { headers: { host: "evil.example" } });
      expect(r.status).toBe(403);
      const v = await fetch(`${s.url}/vote`, { method: "POST", headers: { origin: "http://evil.example", "content-type": "application/json" }, body: JSON.stringify({ pairId: f.shown[0]!.id, pick: "left" }) });
      expect(v.status).toBe(403);
      expect(readVotes(f.run)).toEqual([]);
    } finally {
      s.stop();
    }
  });

  test("a vote is saved the moment it's made, with the side order it was shown in; a second replaces it", async () => {
    const f = fixture();
    const s = await serveOwner(f.run);
    try {
      const data = pageData((await get(`${s.url}/`)).body.toString("utf8"));
      const first = data.pairs[0]!;
      const pair = f.pairs.find((p) => p.id === first.id)!;
      const order = first.left ? (`a/${first.left}` === pair.motif ? "motif-left" : "motif-right") : `a/${first.right}` === pair.motif ? "motif-right" : "motif-left";
      const r = await vote(s.url, first.id, "left");
      expect(r.status).toBe(200);
      expect(tells(r.text + r.headers, f.run)).toEqual([]);
      // On disk before anything else happens.
      expect(readVotes(f.run)).toEqual([{ pairId: first.id, pick: "left", order }]);
      await vote(s.url, first.id, "same");
      expect(readVotes(f.run)).toEqual([{ pairId: first.id, pick: "same", order }]);
      // GET /votes gives the picks, never the order.
      const votes = await get(`${s.url}/votes`);
      expect(JSON.parse(votes.text)).toEqual({ votes: [{ pairId: first.id, pick: "same" }] });
      // A pair the owner isn't shown, an unknown pick, or a body that isn't a vote changes nothing.
      expect((await vote(s.url, f.hidden[1]!.id, "left")).status).toBe(400);
      expect((await vote(s.url, first.id, "motif")).status).toBe(400);
      expect((await get(`${s.url}/vote`, { method: "POST", body: "not json" })).status).toBe(400);
      expect(readVotes(f.run)).toHaveLength(1);
    } finally {
      s.stop();
    }
  });

  test("reopening keeps the order, the sides and the votes, so judging continues where it stopped", async () => {
    const f = fixture();
    const s1 = await serveOwner(f.run);
    let before: ReturnType<typeof pageData>;
    try {
      before = pageData((await get(`${s1.url}/`)).body.toString("utf8"));
      await vote(s1.url, before.pairs[0]!.id, "left");
      await vote(s1.url, before.pairs[1]!.id, "right");
    } finally {
      s1.stop();
    }
    const s2 = await serveOwner(f.run);
    try {
      const after = pageData((await get(`${s2.url}/`)).body.toString("utf8"));
      expect(after.pairs).toEqual(before.pairs);
      const votes = JSON.parse((await get(`${s2.url}/votes`)).text).votes;
      expect(votes).toEqual([{ pairId: before.pairs[0]!.id, pick: "left" }, { pairId: before.pairs[1]!.id, pick: "right" }]);
    } finally {
      s2.stop();
    }
  });

  test("the reveal comes only once every shown pair has a vote; then the votes stand", async () => {
    const f = fixture();
    const s = await serveOwner(f.run);
    try {
      const data = pageData((await get(`${s.url}/`)).body.toString("utf8"));
      const picks = ["left", "right", "same", "left", "right"];
      for (let i = 0; i < 4; i++) await vote(s.url, data.pairs[i]!.id, picks[i]!);
      const early = await get(`${s.url}/reveal`);
      expect(early.status).toBe(409);
      expect(tells(early.text, f.run)).toEqual([]);
      await vote(s.url, data.pairs[4]!.id, picks[4]!);
      const reveal = await get(`${s.url}/reveal`);
      expect(reveal.status).toBe(200);
      const body = JSON.parse(reveal.text);
      // Motif's side of each pair, as the page showed it.
      for (const x of data.pairs) {
        const pair = f.pairs.find((p) => p.id === x.id)!;
        const motifLeft = x.left ? `a/${x.left}` === pair.motif : `a/${x.right}` !== pair.motif;
        expect(body.pairs.find((y: any) => y.pairId === x.id).answer).toBe(motifLeft ? "left" : "right");
      }
      expect(body.briefs).toHaveLength(1);
      expect(body.briefs[0].title).toBe("Nuzha");
      // Once the sides are shown, a vote already made can't change.
      expect((await vote(s.url, data.pairs[0]!.id, "same")).status).toBe(409);
      expect(readVotes(f.run).find((v) => v.pairId === data.pairs[0]!.id)!.pick).toBe("left");
    } finally {
      s.stop();
    }
  });
});

describe("the owner's votes in Test A's score", () => {
  test("ownerPicks reads each pick through its order", () => {
    const run = tempDir("page-a-");
    mkdirSync(join(run, "a"), { recursive: true });
    const votes: OwnerVote[] = [
      { pairId: "p1", pick: "left", order: "motif-left" },
      { pairId: "p2", pick: "left", order: "motif-right" },
      { pairId: "p3", pick: "right", order: "motif-left" },
      { pairId: "p4", pick: "right", order: "motif-right" },
      { pairId: "p5", pick: "same", order: "motif-left" },
    ];
    writeFileSync(join(run, "a", "owner-votes.json"), JSON.stringify(votes));
    expect(ownerPicks(run)).toEqual(new Map([["p1", "motif"], ["p2", "baseline"], ["p3", "baseline"], ["p4", "motif"], ["p5", "same"]]));
    expect(ownerPicks(tempDir("page-a-"))).toEqual(new Map());
  });

  test("the run's report counts the owner's votes once they exist", async () => {
    const f = fixture();
    expect(scoreRun(f.state, f.run).find((s) => s.brief === "nuzha")!.owner).toBeUndefined();
    const s = await serveOwner(f.run);
    try {
      const data = pageData(await (await fetch(`${s.url}/`)).text());
      for (const x of data.pairs) {
        const pair = f.pairs.find((p) => p.id === x.id)!;
        // The owner picks Motif's side every time.
        const pick = x.left && `a/${x.left}` === pair.motif ? "left" : x.right && `a/${x.right}` === pair.motif ? "right" : x.left ? "right" : "left";
        await fetch(`${s.url}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairId: x.id, pick }) });
      }
    } finally {
      s.stop();
    }
    writeReport(f.state, f.run, { log: () => {} });
    const report = JSON.parse(readFileSync(join(f.run, "report.json"), "utf8"));
    const nuzha = report.scoresA.find((x: any) => x.brief === "nuzha");
    // Three open pairs voted for Motif, plus the one-sided pair Motif drew alone; the baseline's lone pair is the other's.
    expect(nuzha.owner).toEqual({ motif: 4, other: 1 });
  });
});

describe("judge-owner.ts", () => {
  test("refuses, plainly, a run with no pairs to judge", () => {
    const run = tempDir("page-a-");
    const state: RunState = { motifEvalRun: 1, id: "r", commit: "abc", dirty: false, started: "2026-10-26T12:00:00.000Z", claudeVersion: "2", resumes: [], options: { keep: false, work: "/w" }, cases: {} };
    writeFileSync(join(run, "run.json"), JSON.stringify(state));
    const r = Bun.spawnSync([process.execPath, join(REPO, "tests", "evals", "judge-owner.ts"), run], { cwd: REPO });
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString() + r.stderr.toString()).toContain("no pairs");
  });

  test("without a run, says how to use it", () => {
    const r = Bun.spawnSync([process.execPath, join(REPO, "tests", "evals", "judge-owner.ts")], { cwd: REPO });
    expect(r.exitCode).toBe(2);
    expect(r.stdout.toString() + r.stderr.toString()).toContain("Usage: bun tests/evals/judge-owner.ts <run>");
  });
});

const browser = findBrowser();

describe.skipIf(!browser)("the page in a browser (needs Chrome, Edge or Chromium)", () => {
  test("loads, takes three votes from the keyboard into owner-votes.json, and picks up where it stopped", async () => {
    const f = fixture();
    const s = await serveOwner(f.run);
    const b = await launchBrowser(browser!.path);
    try {
      const page = await b.newPage({ isolated: true });
      await page.setViewport(1280, 800);
      await page.goto(`${s.url}/`);
      const ready = () => page.evaluate<boolean>(`document.body.dataset.ready === "1"`);
      for (let i = 0; i < 100 && !(await ready()); i++) await Bun.sleep(50);
      expect(await page.evaluate<string>(`document.getElementById("count").textContent`)).toBe("1 of 5");
      for (const key of ["1", "2", "3"]) {
        const before = readVotes(f.run).length;
        await page.evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }))`);
        for (let i = 0; i < 100 && readVotes(f.run).length === before; i++) await Bun.sleep(50);
      }
      expect(readVotes(f.run).map((v) => v.pick)).toEqual(["left", "right", "same"]);
      for (let i = 0; i < 100 && (await page.evaluate<string>(`document.getElementById("count").textContent`)) !== "4 of 5"; i++) await Bun.sleep(50);
      expect(await page.evaluate<string>(`document.getElementById("count").textContent`)).toBe("4 of 5");
      // Closed part-way and opened again: it continues at the next pair without a vote.
      await page.goto(`${s.url}/`);
      for (let i = 0; i < 100 && !(await ready()); i++) await Bun.sleep(50);
      expect(await page.evaluate<string>(`document.getElementById("count").textContent`)).toBe("4 of 5");
      expect(page.takeErrors()).toEqual([]);
    } finally {
      await b.close();
      s.stop();
    }
  }, 60_000);
});
