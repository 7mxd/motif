import { installBrowser } from "../browser/install";
import type { CommandResult, RunContext } from "../cli/output";
import { BROWSER_OFF, browserOff, findBrowser, type BrowserInfo } from "../detect/browser";
import { motifHome } from "../home";

export interface BrowserDeps {
  find: () => BrowserInfo | null;
  install: (onProgress?: (got: number, total: number) => void) => Promise<{ version: string; path: string; bytes: number }>;
  /** True when MOTIF_BROWSER=none turns the browser off. */
  off?: () => boolean;
}

const defaultDeps: BrowserDeps = {
  find: () => findBrowser(),
  install: (onProgress) => installBrowser({ home: motifHome(), onProgress }),
  off: () => browserOff(),
};

export async function runBrowser(_cwd: string, ctx: RunContext, deps: BrowserDeps = defaultDeps): Promise<CommandResult> {
  const action = ctx.positionals[0];
  if (!action) {
    const browser = deps.find();
    if (!browser && deps.off?.()) {
      return { command: "browser", exitCode: 0, text: `${BROWSER_OFF}: previews and screenshots make no images. Unset MOTIF_BROWSER to use Chrome or Edge.`, data: { browser: null, off: true } };
    }
    return browser
      ? { command: "browser", exitCode: 0, text: `✓ Previews and screenshots use ${browser.name}: ${browser.path}`, data: { browser } }
      : {
          command: "browser",
          exitCode: 0,
          text: 'No Chrome or Edge found. "motif browser install" downloads a private headless copy (about 120 MB to download, about 300 MB on disk) that only Motif uses.',
          data: { browser: null },
        };
  }
  if (action !== "install") {
    return { command: "browser", exitCode: 2, text: `Unknown action "${action}". Use "motif browser" or "motif browser install".`, data: { error: "usage" } };
  }
  try {
    // For a person watching: every tenth of the download, once.
    let shown = -1;
    const r = await deps.install((got, total) => {
      const tenth = total > 0 ? Math.floor((got / total) * 10) : -1;
      if (tenth > shown && tenth >= 1) {
        shown = tenth;
        ctx.progress?.(`Downloading the browser… ${tenth * 10}%`);
      }
    });
    return {
      command: "browser",
      exitCode: 0,
      text: `✓ Installed a private headless browser (Chrome for Testing ${r.version}) for previews and screenshots.\n  ${r.path}`,
      data: { version: r.version, path: r.path, bytes: r.bytes },
    };
  } catch (e) {
    return { command: "browser", exitCode: 2, text: e instanceof Error ? e.message : String(e), data: { error: "install-failed" } };
  }
}
