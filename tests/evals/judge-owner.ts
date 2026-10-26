// The owner's judging of Test A (Part 4 §6): serves a run's pairs on this computer (127.0.0.1 only), blind and one at a
// time, and saves each vote into the run's a/owner-votes.json as it's made. Stop it with Ctrl+C at any point; running it
// again continues at the next pair without a vote. The run's report counts the votes from then on.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { openUrl } from "../../cli/src/preview/open";
import { ownerPairs, readVotes, serveOwner } from "./page-a";
import { readPairs } from "./pairs";
import { writeReport } from "./run";
import { loadRun, runDir, type RunState } from "./state";

export const USAGE = `Usage: bun tests/evals/judge-owner.ts <run> [--port <n>] [--no-open]

Serves Test A's pairs from a run (its id in tests/evals/results, or its folder) for you to judge, blind, in your
browser. Each vote is saved as you make it; Ctrl+C stops, and running this again continues where you left off.`;

/** The run's folder and record, from its id or its folder. */
function findRun(arg: string, results: string): { dir: string; state: RunState } | { error: string } {
  if (existsSync(join(arg, "run.json"))) {
    const dir = resolve(arg);
    const state = loadRun(join(dir, ".."), dir.split(/[\\/]/).pop()!);
    return "error" in state ? state : { dir, state };
  }
  const state = loadRun(results, arg);
  return "error" in state ? state : { dir: runDir(results, arg), state };
}

/**
 * What happens after each vote: once every pair has one, each vote (a changed one included) rewrites the run's report,
 * so it never lags the votes; the first time, it says so.
 */
export function reportOnVote(state: RunState, dir: string, log: (line: string) => void): (votes: number, of: number) => void {
  let told = false;
  return (votes, of) => {
    if (votes < of) return;
    writeReport(state, dir, { log: () => {} });
    if (!told) log("Every pair has your vote. Show the answers on the page; the report now counts your votes.");
    told = true;
  };
}

export async function main(argv: string[], log: (line: string) => void = console.log): Promise<number> {
  let o: { values: { port?: string; "no-open"?: boolean; help?: boolean }; positionals: string[] };
  try {
    o = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: "string" }, "no-open": { type: "boolean" }, help: { type: "boolean" } } });
  } catch (e) {
    log(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const run = o.positionals[0];
  const port = o.values.port === undefined ? 0 : Number(o.values.port);
  if (!run || o.positionals.length > 1 || o.values.help || !Number.isInteger(port) || port < 0 || port > 65535) {
    log(USAGE);
    return 2;
  }
  const found = findRun(run, join(import.meta.dir, "results"));
  if ("error" in found) {
    log(found.error);
    return 2;
  }
  const { dir, state } = found;
  if (readPairs(dir).length === 0) {
    log(`Run ${state.id} has no pairs for Test A yet: they're taken once a brief's apps with and without Motif are both graded.`);
    return 2;
  }
  const shown = ownerPairs(state, dir);
  if (shown.length === 0) {
    log(`Run ${state.id} has no pairs for you to judge: each has a screen from one side only, is in a brief where one app didn't build, or has neither side's screen; the score has already decided them.`);
    return 2;
  }
  const done = () => readVotes(dir).filter((v) => shown.some((p) => p.id === v.pairId)).length;
  let server: Awaited<ReturnType<typeof serveOwner>>;
  try {
    server = await serveOwner(dir, port, { onVote: reportOnVote(state, dir, log) });
  } catch (e) {
    log((e as Error).message);
    return 2;
  }
  log(`Judge Test A's pairs at ${server.url}  (${done()} of ${shown.length} judged so far)`);
  log("Each vote is saved as you make it. Ctrl+C stops; run this again to continue.");
  if (!o.values["no-open"] && !(await openUrl(server.url))) log("Open that address in your browser.");
  await new Promise<void>((stop) => {
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  server.stop();
  const n = done();
  if (n > 0) writeReport(state, dir, { log: () => {} });
  log(`\nStopped with ${n} of ${shown.length} pairs judged.${n > 0 ? ` The report in ${dir} counts them.` : ""}`);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
