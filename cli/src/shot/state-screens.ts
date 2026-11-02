import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { RouteResult, StateScript } from "./capture";

/** The comment a state script names its screens in: `// motif-screens: /#/applications/*, /#/matches/*`. */
export const SCREENS_LINE = "motif-screens:";

// The script's leading region: comments, blank lines and, in Dart, Kotlin and Swift, the lines that bring code in.
const LEADING = /^\s*(?:$|\/\/|\/\*|(?:@testable\s+)?import\b|(?:package|part|library)\b)/;

/**
 * The screens a state script's `// motif-screens:` line names, read only from the script's leading region; null when
 * there is no line there.
 */
export function readScreensLine(script: string): string[] | null | { error: string } {
  let inBlock = false;
  for (const line of script.split(/\r?\n/)) {
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    const found = /^\s*\/\/\s*motif-screens:(.*)$/.exec(line);
    if (found) {
      const screens = found[1]!.split(",").map((s) => s.trim()).filter(Boolean);
      if (screens.length === 0) {
        return { error: `the "// ${SCREENS_LINE}" line names no screen; list them after it, like // ${SCREENS_LINE} /settings, /#/applications/*.` };
      }
      return screens;
    }
    if (!LEADING.test(line)) return null;
    if (/^\s*\/\*/.test(line) && !line.includes("*/")) inBlock = true;
  }
  return null;
}

// A route as it's matched: no query string, no trailing slash (but "/" stays "/").
function bare(route: string): string {
  const path = route.split("?")[0]!;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Whether a screen in a state's line names this screen: `*` stands for exactly one path segment. */
export function screenMatches(pattern: string, screen: string): boolean {
  const p = bare(pattern).split("/");
  const s = bare(screen).split("/");
  return p.length === s.length && p.every((part, i) => part === "*" ? s[i] !== "" : part === s[i]);
}

/** Whether a state runs on this screen: everywhere when its script has no line. */
export function runsOn(state: Pick<StateScript, "screens">, screen: string): boolean {
  return !state.screens || state.screens.some((p) => screenMatches(p, screen));
}

/**
 * How many screenshots a run takes: perLook on each screen as it opens (none with --states-only), and perLook more for
 * each state on the screens its line lets it run on.
 */
export function plannedShots(routes: string[], states: StateScript[], perLook: number, statesOnly: boolean): number {
  return routes.reduce((sum, r) => sum + perLook * ((statesOnly ? 0 : 1) + states.filter((s) => runsOn(s, r)).length), 0);
}

/** Where a state was captured in a run, which shots it skipped, and whether it went missing. */
export interface StateOutcome {
  state: string;
  /** Its line's screens; absent when it has none. */
  screens?: string[];
  /** The screens it was captured on, in at least one shot. */
  capturedOn: string[];
  /** The shots its script skipped by returning false. */
  notHere: { screen: string; shot: string }[];
  /** Its line names no screen this run took. */
  notInRun: boolean;
  /** Screens it was tried on and returned false in every shot of (for a lined state, only screens its line names). */
  lost: string[];
  /** The run's screens its line kept it off. */
  excluded: string[];
}

const baseName = (file: string) => file.split(/[\\/]/).pop()!;

/** Each state's outcome from the screens this run took and what each screen's shots were. */
export function stateOutcomes(states: StateScript[], screensInRun: string[], routes: RouteResult[]): StateOutcome[] {
  return states.map((s) => {
    // A state's shot is named page@state.size…png, or page@state+variant.size…png.
    const ofState = (file: string) => new RegExp(`@${s.name}[.+]`).test(baseName(file));
    const tried = routes.filter((r) => runsOn(s, r.route));
    const capturedOn = tried.filter((r) => r.shots.some(ofState)).map((r) => r.route);
    const notHere = tried.flatMap((r) => (r.notHere ?? []).filter((n) => n.state === s.name).map((n) => ({ screen: r.route, shot: n.shot })));
    const skippedOn = [...new Set(notHere.map((n) => n.screen))];
    // With no line, it is lost only when it was nowhere: "not here" on some pages is its script doing its job.
    const lost = s.screens ? skippedOn.filter((r) => !capturedOn.includes(r)) : capturedOn.length === 0 ? skippedOn : [];
    return {
      state: s.name,
      ...(s.screens ? { screens: s.screens } : {}),
      capturedOn,
      notHere,
      notInRun: Boolean(s.screens) && !screensInRun.some((r) => runsOn(s, r)),
      lost,
      excluded: screensInRun.filter((r) => !runsOn(s, r)),
    };
  });
}

// A list of screens short enough for one line.
function screenList(screens: string[]): string {
  return screens.length > 7 ? `${screens.slice(0, 6).join(", ")} and ${screens.length - 6} more` : screens.join(", ");
}

/**
 * What a run says about its states: notes (a state whose line names no screen of this run; states with no line), and
 * a line for each lost state, which fails the run.
 */
export function stateNotes(outcomes: StateOutcome[], screensInRun: string[]): { notes: string[]; lost: string[] } {
  const notes: string[] = [];
  const lost: string[] = [];
  for (const o of outcomes) {
    if (o.notInRun) {
      notes.push(
        `State "${o.state}" didn't run: its // ${SCREENS_LINE} line names ${o.screens!.join(", ")}, and this run took ${screenList(screensInRun)}. Name its screens with --routes to capture it, or fix the line if the app's routes look different.`,
      );
    }
    if (o.lost.length > 0) {
      lost.push(
        o.screens
          ? `✗ State "${o.state}" found nothing to do on ${o.lost.join(", ")}: its script returned false in every shot there. Its // ${SCREENS_LINE} line or its script is out of date with the app; fix whichever is wrong.`
          : `✗ State "${o.state}" found nothing to do on any page (${screenList(o.lost)}): its script returned false in every shot. Its script is out of date with the app; fix it, and add a // ${SCREENS_LINE} line naming the pages it belongs on.`,
      );
    }
  }
  const unlined = outcomes.filter((o) => !o.screens).map((o) => o.state);
  if (unlined.length > 0) {
    notes.push(
      `${unlined.length === 1 ? `State "${unlined[0]}" has` : `States ${unlined.map((n) => `"${n}"`).join(", ")} have`} no // ${SCREENS_LINE} line, so ${unlined.length === 1 ? "it ran" : "they ran"} on every screen. That's right for a state that belongs everywhere, like signing in; for one that belongs on only some screens, a line at the top of its script naming them makes the run faster.`,
    );
  }
  return { notes, lost };
}

/** The state a shot's file is of (page@state.size….png, page@state+variant.size….png), or undefined for a plain shot. */
export function stateOfShot(file: string): string | undefined {
  return /@([a-z0-9][a-z0-9-]*)[.+]/.exec(baseName(file))?.[1];
}

/**
 * Removes the screenshots these states left of one screen in an earlier
 * run (`<slug>@<state>.…` and `<slug>@<state>+<look>.…`), so a state that
 * no longer runs there, or found nothing to do there, leaves nothing stale
 * behind for the next look at the folder.
 */
/** clearStateShots for each screen of a run, for the states whose line keeps them off it. */
export function clearExcludedStates(outDir: string, screens: { key: string; slug: string }[], states: Pick<StateScript, "name" | "screens">[]): void {
  for (const t of screens) clearStateShots(outDir, t.slug, states.filter((s) => !runsOn(s, t.key)).map((s) => s.name));
}

export function clearStateShots(outDir: string, slug: string, states: string[]): void {
  if (states.length === 0) return;
  let files: string[];
  try {
    files = readdirSync(outDir);
  } catch {
    return;
  }
  for (const f of files) {
    if (states.some((s) => f.startsWith(`${slug}@${s}.`) || f.startsWith(`${slug}@${s}+`))) rmSync(join(outDir, f), { force: true });
  }
}
