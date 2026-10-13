/** Work to undo when Motif exits: child processes (a browser, a dev server) must not outlive it. */
const hooks = new Set<() => void>();
let installed = false;

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
 * Runs fn synchronously when the process exits, including after Ctrl+C or a termination signal.
 * Returns a function that cancels it; call that once the work has been cleaned up normally.
 */
export function onExit(fn: () => void): () => void {
  if (!installed) {
    installed = true;
    process.on("exit", runHooks);
    // A signal ends the process without "exit" handlers unless something turns it into process.exit.
    process.on("SIGINT", () => process.exit(130));
    process.on("SIGTERM", () => process.exit(143));
    if (process.platform !== "win32") process.on("SIGHUP", () => process.exit(129));
  }
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}
