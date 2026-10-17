import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "../cli/output";
import { findBrowser, type BrowserInfo } from "../detect/browser";
import { findConfiguredSources, SOURCE_LABELS } from "../detect/sources";
import { ADAPTERS_AVAILABLE, detectApps, NODE_STACKS, siteDir, STACK_LABELS } from "../detect/stacks";
import { VERSION } from "../version";
import { runValidate } from "./validate";

export interface DoctorItem {
  id: string;
  status: "ok" | "optional" | "needed";
  label: string;
  detail: string;
}

export interface DoctorDeps {
  platform: NodeJS.Platform;
  arch: string;
  home: string;
  findBrowser: () => BrowserInfo | null;
  which: (cmd: string) => string | null;
}

export function defaultDoctorDeps(): DoctorDeps {
  return {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    findBrowser: () => findBrowser(),
    which: (c) => Bun.which(c),
  };
}

const SYMBOL: Record<DoctorItem["status"], string> = { ok: "✓", optional: "○", needed: "✗" };

export async function runDoctor(cwd: string, deps: DoctorDeps = defaultDoctorDeps()): Promise<CommandResult> {
  const items: DoctorItem[] = [];
  const push = (id: string, status: DoctorItem["status"], label: string, detail: string) =>
    items.push({ id, status, label, detail });

  push("tool", "ok", "Motif tool", `Version ${VERSION} (${deps.platform}-${deps.arch}).`);

  const { apps, findings } = detectApps(cwd);
  for (const f of findings) push("settings", "needed", "Project settings", f.message);
  if (apps.length === 0) {
    push("app", "optional", "Your app", "No app found in this folder yet. That's fine — /design can start a new one.");
  }
  for (const app of apps) {
    const label = `App (${app.path === "." ? "this folder" : app.path})`;
    if (!app.stack) {
      push(`app:${app.path}`, "needed", label, "Motif couldn't tell which framework this app uses. Add it to design/motif.json.");
    } else if (ADAPTERS_AVAILABLE.includes(app.stack)) {
      const site = app.stack === "plain-web" ? siteDir(cwd, app) : null;
      const where = site === null ? "" : `; its pages are in ${site === "." ? "this folder" : `${site}/`}`;
      push(`app:${app.path}`, "ok", label, `Full support for ${STACK_LABELS[app.stack]}${where}.`);
    } else {
      push(`app:${app.path}`, "optional", label, `${STACK_LABELS[app.stack]} detected. Full support is coming soon; Motif will still help using general guidance.`);
    }
  }

  const browser = deps.findBrowser();
  if (browser) push("browser", "ok", "Screenshots and previews", `Using ${browser.name}.`);
  else push("browser", "needed", "Screenshots and previews", 'No Chrome or Edge found. Previews and screenshots need one: "motif browser install" downloads a private copy (about 120 MB to download, about 300 MB on disk).');

  if (apps.some((a) => a.stack && NODE_STACKS.includes(a.stack))) {
    if (deps.which("node")) push("node", "ok", "Node.js", "Found. Your app needs it to run (Motif itself doesn't).");
    else push("node", "needed", "Node.js", "Not found. Your app needs Node.js to run — install it from nodejs.org.");
  }

  const hasGuide = existsSync(join(cwd, "DESIGN.md")) && existsSync(join(cwd, "design", "tokens.json"));
  if (!hasGuide) {
    push("guide", "optional", "Design guide", "None yet — /design will create one.");
  } else {
    const v = await runValidate(cwd);
    if (v.exitCode === 0) push("guide", "ok", "Design guide", "Valid.");
    else {
      const errors = (v.data.summary as { errors: number }).errors;
      push("guide", "needed", "Design guide", `Has ${errors} ${errors === 1 ? "problem" : "problems"}. Run "motif validate" to see them.`);
    }
  }

  const sources = findConfiguredSources(cwd, deps.home);
  if (sources.length > 0) push("sources", "ok", "Design sources", `Connected: ${sources.map((s) => SOURCE_LABELS[s.id]).join(", ")}.`);
  else push("sources", "optional", "Design sources", 'None connected. Everything works without them; you can add them later with "motif connect".');

  const text = ["Motif doctor", ...items.map((i) => `  ${SYMBOL[i.status]} ${i.label} — ${i.detail}`)].join("\n");
  return { command: "doctor", exitCode: 0, text, data: { items, apps } };
}
