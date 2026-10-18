/** Work to undo when Motif exits: child processes (a browser, a dev server) must not outlive it. */
const hooks = new Set<() => void>();
let installed = false;
/** Commands that run until stopped (a live preview), waiting for Ctrl+C. */
let stopWaiters: (() => void)[] = [];

function runHooks(): void {
  for (const fn of [...hooks]) {
    try {
      fn();
    } catch {
      // Best effort: keep running the other hooks.
    }
  }
  hooks.clear();
}

/**
 * A signal ends whatever runs until stopped, which then finishes normally; otherwise (or on a second Ctrl+C while it
 * stops) it ends the process with the signal's exit code. Either way the exit hooks run.
 */
const onSignal = (code: number) => () => {
  if (stopWaiters.length > 0) {
    const waiters = stopWaiters;
    stopWaiters = [];
    for (const resolve of waiters) resolve();
    return;
  }
  process.exit(code);
};

function install(): void {
  if (installed) return;
  installed = true;
  process.on("exit", runHooks);
  // A signal ends the process without "exit" handlers unless something turns it into process.exit.
  process.on("SIGINT", onSignal(130));
  process.on("SIGTERM", onSignal(143));
  // On Windows, closing the console window arrives as SIGHUP too (and the process is ended a few seconds later).
  try {
    process.on("SIGHUP", onSignal(129));
  } catch {
    // A runtime without SIGHUP here: the other signals still clean up.
  }
}

/**
 * Runs fn synchronously when the process exits, including after Ctrl+C or a termination signal.
 * Returns a function that cancels it; call that once the work has been cleaned up normally.
 */
export function onExit(fn: () => void): () => void {
  install();
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}

/** Resolves on Ctrl+C (or a termination signal), so a command that runs until stopped can finish normally, with exit 0. */
export function waitForStop(): Promise<void> {
  install();
  return new Promise((resolve) => stopWaiters.push(resolve));
}
