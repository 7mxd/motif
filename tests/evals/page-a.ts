// Test A's comparison page (Part 4 §6): one pair at a time, the sides shuffled, "Left", "Right" or "About the same".
// In owner mode the runner serves it on 127.0.0.1 from the run's folder, and each vote goes straight into
// a/owner-votes.json as it's made. Nothing the page holds or any response gives before the last vote says which side is
// which: the images go by their random names, the page knows only "left" and "right", the side order of each pair stays
// on the server, and the answers come from GET /reveal only once every pair shown has a vote.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { motifCss } from "../../cli/src/generate/motif-css";
import { presetTheme } from "../../cli/src/preview/presets";
import { readPairs, type Pair } from "./pairs";
import { builtFor, type OwnerPick } from "./score-a";
import type { RunState } from "./state";

const REPO = resolve(import.meta.dir, "..", "..");
const TEMPLATE = join(import.meta.dir, "page-a", "template.html");

export type Side = "left" | "right";
export type Order = "motif-left" | "motif-right";
export interface OwnerVote { pairId: string; pick: Side | "same"; order: Order }

/** The owner's votes, relative to the run folder; one per pair, written as each is made. */
export const votesFile = "a/owner-votes.json";
/** The owner's session: the seed the pairs' order and sides come from, and when the answers were first shown. */
const sessionFile = "a/owner-session.json";
/** The owner's page, relative to the run folder. */
const ownerPage = "a/owner.html";
const IMAGE = /^img\/([0-9a-f]{12})\.png$/;

function writeJson(file: string, data: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function readVotes(run: string): OwnerVote[] {
  const file = join(run, votesFile);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as OwnerVote[]) : [];
}

/** The owner's pick for each pair voted on, as Motif's side, the baseline's, or about the same, read through its order. */
export function ownerPicks(run: string): Map<string, OwnerPick> {
  const m = new Map<string, OwnerPick>();
  for (const v of readVotes(run)) {
    if (v.pick === "same") m.set(v.pairId, "same");
    else m.set(v.pairId, (v.pick === "left") === (v.order === "motif-left") ? "motif" : "baseline");
  }
  return m;
}

/**
 * The pairs the owner is shown: every pair with a screen from one side or both, except a brief's pairs when one of its
 * apps didn't build (those are decided by the build, as forcedPairs says). A pair with one screen is shown with "This
 * screen didn't load" on the other side; Test A's score gives it to the side that drew it whatever the vote.
 */
export function ownerPairs(state: RunState, run: string): Pair[] {
  return readPairs(run).filter((p) => {
    const built = builtFor(state, p.brief);
    return p.outcome !== "neither" && built.motif !== false && built.baseline !== false;
  });
}

const hash = (s: string) => createHash("sha256").update(s).digest();

/** Which side Motif's screen is on for a pair, from the session's seed: the same on every reload, shuffled pair by pair. */
export function sideOrder(seed: string, pairId: string): Order {
  return hash(`${seed}:side:${pairId}`)[0]! & 1 ? "motif-left" : "motif-right";
}

function session(run: string): { seed: string; revealed?: string } {
  const file = join(run, sessionFile);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const s = { seed: randomBytes(16).toString("hex") };
  writeJson(file, s);
  return s;
}

/** The brief's name as its brief.md gives it ("# Nuzha"), shared by both sides. */
function briefTitle(brief: string): string {
  const file = join(REPO, "tests", "fixtures", "briefs", `${brief}.md`);
  const heading = existsSync(file) ? readFileSync(file, "utf8").match(/^#\s+(.+)$/m)?.[1]?.trim() : undefined;
  return heading || brief.charAt(0).toUpperCase() + brief.slice(1);
}

/** A screen's name: "/" is the welcome screen, "/sign-in" "Sign in"; a SwiftUI preview keeps its title. */
function screenTitle(screen: string): string {
  if (screen === "/") return "Welcome";
  const words = screen.replace(/^\//, "").replace(/[-_/]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const sizeName = (size: number) => (size < 600 ? "Phone" : size < 1024 ? "Tablet" : "Desktop");

interface Shown { pair: Pair; order: Order; left: string | null; right: string | null }

/** The session's pairs in their order (from the seed, so a reload keeps it), each with its images on their sides. */
function arrange(seed: string, pairs: Pair[]): Shown[] {
  const img = (path?: string) => (path ? path.replace(/^a\//, "") : null);
  return [...pairs]
    .map((pair) => ({ pair, key: hash(`${seed}:place:${pair.id}`).toString("hex") }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ pair }) => {
      const order = sideOrder(seed, pair.id);
      const [left, right] = order === "motif-left" ? [img(pair.motif), img(pair.baseline)] : [img(pair.baseline), img(pair.motif)];
      return { pair, order, left, right };
    });
}

/**
 * The page's own look: Motif's preview kit (kit.css) on the Minimal style's tokens, light and dark following the system,
 * with its font (Onest) inlined. Comments go and the variables are renamed, so the source never says whose kit it is.
 */
function pageStyle(): string {
  const kit = readFileSync(join(REPO, "skill", "preview-kit", "kit.css"), "utf8");
  const theme = motifCss(presetTheme("minimal")!);
  const font = readFileSync(join(REPO, "skill", "preview-kit", "fonts", "onest.woff2")).toString("base64");
  const face = `@font-face { font-family: "Onest"; font-style: normal; font-display: swap; font-weight: 100 900; src: url(data:font/woff2;base64,${font}) format("woff2"); }`;
  return `${face}\n${theme}\n${kit}`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--motif-/g, "--k-");
}

/** JSON that can sit in a <script> element. */
const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/**
 * Writes the page for a run and returns its path. Owner mode: the pairs in the session's order with their sides, by
 * their images' random names (served from img/), and nothing else about them. Public mode is Task 6's.
 */
export function writePage(run: string, mode: "owner" | "public", pairs: Pair[]): string {
  if (mode !== "owner") throw new Error("The public page isn't written yet.");
  const shown = arrange(session(run).seed, pairs);
  const data = {
    mode,
    pairs: shown.map((s) => ({
      id: s.pair.id, title: `${briefTitle(s.pair.brief)} — ${screenTitle(s.pair.screen)}`, size: s.pair.size, device: sizeName(s.pair.size), left: s.left, right: s.right,
    })),
  };
  const html = readFileSync(TEMPLATE, "utf8")
    .replace("/*{{style}}*/", () => pageStyle())
    .replace("{{pairs}}", () => scriptJson(data));
  const file = join(run, ownerPage);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, html);
  return file;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What GET /reveal answers: which side was Motif's in each pair shown ("answer"), and how the owner's picks fell for
 * each brief ("won" is Motif's side picked).
 */
function revealData(shown: Shown[], votes: OwnerVote[]) {
  const pick = (id: string) => votes.find((v) => v.pairId === id)?.pick;
  const pairs = shown.map((s) => {
    const answer: Side = s.order === "motif-left" ? "left" : "right";
    const p = pick(s.pair.id)!;
    const verdict = p === "same" ? "you called them about the same" : p === answer ? "you picked Motif's" : "you picked the other";
    return { pairId: s.pair.id, answer, pick: p, line: `Motif's was on the ${answer}; ${verdict}.` };
  });
  const briefs = [...new Set(shown.map((s) => s.pair.brief))].map((brief) => {
    const mine = pairs.filter((_, i) => shown[i]!.pair.brief === brief);
    const n = { won: 0, other: 0, same: 0 };
    for (const p of mine) n[p.pick === "same" ? "same" : p.pick === p.answer ? "won" : "other"]++;
    return {
      title: briefTitle(brief), pairs: mine.length, ...n,
      line: `You picked Motif's side in ${n.won} of ${plural(mine.length, "pair")}, the other in ${n.other}, and called ${n.same} about the same.`,
    };
  });
  return { heading: "Which side was Motif's", name: "Motif", briefs, pairs };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/**
 * Serves the owner's page from the run folder on 127.0.0.1: GET / (the page), GET /img/<name>.png (a shown pair's
 * image), GET /votes (the picks so far, without their order), POST /vote { pairId, pick } (saved at once into
 * a/owner-votes.json with the order the pair was shown in; a second vote on a pair replaces the first, until the answers
 * have been shown) and GET /reveal (only once every pair shown has a vote). `onVote` hears of each vote saved.
 */
export async function serveOwner(
  run: string, port = 0, opts: { onVote?: (votes: number, of: number) => void } = {},
): Promise<{ url: string; stop(): void }> {
  const state = JSON.parse(readFileSync(join(run, "run.json"), "utf8")) as RunState;
  const pairs = ownerPairs(state, run);
  const html = readFileSync(writePage(run, "owner", pairs));
  const shown = arrange(session(run).seed, pairs);
  const byId = new Map(shown.map((s) => [s.pair.id, s]));
  const images = new Set(shown.flatMap((s) => [s.left, s.right]).filter((x): x is string => x !== null));
  const missing = (votes: OwnerVote[]) => shown.filter((s) => !votes.some((v) => v.pairId === s.pair.id)).length;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(req, srv) {
      // Only requests addressed to this server: a web page that points its own name at 127.0.0.1 sends that name.
      const host = req.headers.get("host");
      if (host !== `127.0.0.1:${srv.port}` && host !== `localhost:${srv.port}`) return new Response("Forbidden", { status: 403 });
      const url = new URL(req.url);
      const path = url.pathname;
      if (req.method === "GET" && (path === "/" || path === "/index.html")) {
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'self'",
          },
        });
      }
      if (req.method === "GET" && IMAGE.test(path.slice(1)) && images.has(path.slice(1))) {
        // The bytes alone: no file times or tags in the headers.
        return new Response(readFileSync(join(run, "a", path.slice(1))), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
      }
      if (req.method === "GET" && path === "/votes") {
        return json({ votes: readVotes(run).filter((v) => byId.has(v.pairId)).map((v) => ({ pairId: v.pairId, pick: v.pick })) });
      }
      if (req.method === "POST" && path === "/vote") {
        const origin = req.headers.get("origin");
        if (origin !== null && origin !== `http://${host}`) return new Response("Forbidden", { status: 403 });
        let body: any;
        try {
          const text = await req.text();
          if (text.length > 4096) throw new Error("too long");
          body = JSON.parse(text);
        } catch {
          return json({ error: "That isn't a vote." }, 400);
        }
        const s = typeof body?.pairId === "string" ? byId.get(body.pairId) : undefined;
        if (!s) return json({ error: "There's no such pair here." }, 400);
        if (body.pick !== "left" && body.pick !== "right" && body.pick !== "same") return json({ error: 'A vote is "left", "right" or "same".' }, 400);
        const votes = readVotes(run);
        const at = votes.findIndex((v) => v.pairId === s.pair.id);
        if (at >= 0 && session(run).revealed) return json({ error: "The answers have been shown, so the votes made before stand." }, 409);
        const vote: OwnerVote = { pairId: s.pair.id, pick: body.pick, order: s.order };
        if (at >= 0) votes[at] = vote;
        else votes.push(vote);
        writeJson(join(run, votesFile), votes);
        const left = missing(votes);
        opts.onVote?.(shown.length - left, shown.length);
        return json({ saved: true, votes: shown.length - left, of: shown.length });
      }
      if (req.method === "GET" && path === "/reveal") {
        const votes = readVotes(run);
        const left = missing(votes);
        if (left > 0) return json({ error: `${plural(left, "pair")} still ${left === 1 ? "needs" : "need"} a vote.` }, 409);
        const s = session(run);
        if (!s.revealed) writeJson(join(run, sessionFile), { ...s, revealed: new Date().toISOString() });
        return json(revealData(shown, votes));
      }
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
