// Writes .claude-plugin/marketplace.json for a published release: Motif's plugin as that release's zip, pinned by the
// checksum in its SHA256SUMS. Run it only after the release exists: bun scripts/marketplace.ts v0.1.0
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pluginManifest } from "./build-plugin";
import { ZIP_NAME } from "./zip-plugin";

const REPO = resolve(import.meta.dir, "../..");
export const RELEASES = "https://github.com/7mxd/motif/releases/download";
const TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NAME = (pluginManifest("0") as { name: string }).name;

export interface Marketplace {
  name: string;
  description: string;
  owner: { name: string; url: string };
  plugins: { name: string; description: string; source: { source: "archive"; url: string; sha256: string } }[];
}

/** The marketplace file for a release, from its tag and the text of its SHA256SUMS. */
export function marketplaceFile(tag: string, sums: string): Marketplace {
  if (!TAG.test(tag)) throw new Error(`"${tag}" isn't a release tag such as v0.1.0.`);
  const line = sums
    .split(/\r?\n/)
    .map((l) => l.trim().match(/^([0-9a-fA-F]{64}) [ *]?(\S+)$/))
    .find((m) => m?.[2] === ZIP_NAME);
  if (!line) throw new Error(`${tag}'s SHA256SUMS has no ${ZIP_NAME}: is it a release that carries the plugin?`);
  const manifest = pluginManifest(tag.slice(1)) as { name: string; description: string };
  return {
    name: "motif",
    description: "Motif: design guide tools for AI coding agents.",
    owner: { name: "7mxd", url: "https://github.com/7mxd" },
    plugins: [{
      name: manifest.name,
      description: manifest.description,
      source: { source: "archive", url: `${RELEASES}/${tag}/${ZIP_NAME}`, sha256: line[1]!.toLowerCase() },
    }],
  };
}

/** What's wrong with a marketplace file, in plain words; empty when it's well formed. */
export function marketplaceProblems(file: unknown): string[] {
  const m = (file ?? {}) as Record<string, any>;
  const problems: string[] = [];
  if (m.name !== "motif") problems.push('The marketplace must be named "motif".');
  if (!m.owner?.name) problems.push("The marketplace must name its owner.");
  const plugins: any[] = Array.isArray(m.plugins) ? m.plugins : [];
  if (plugins.length !== 1) problems.push("The marketplace must list one plugin, Motif.");
  for (const p of plugins) {
    if (p?.name !== NAME) problems.push(`The plugin entry must be named "${NAME}", as the plugin itself is.`);
    if (p && "version" in p) problems.push("The plugin entry must not set a version: the zip's own plugin.json gives it.");
    const s = p?.source ?? {};
    if (s.source !== "archive") {
      problems.push("The plugin must come from an archive source: the release's zip.");
      continue;
    }
    const url = String(s.url ?? "");
    const tag = url.match(/^https:\/\/github\.com\/7mxd\/motif\/releases\/download\/([^/]+)\/motif-claude-code\.zip$/)?.[1];
    if (!tag || !TAG.test(tag)) problems.push(`The plugin's URL must be a release's ${ZIP_NAME}, not ${url || "nothing"}.`);
    if (!/^[0-9a-f]{64}$/.test(String(s.sha256 ?? ""))) problems.push("The plugin's sha256 must be 64 lowercase hex characters.");
  }
  return problems;
}

if (import.meta.main) {
  const tag = process.argv[2] ?? "";
  if (!TAG.test(tag)) {
    console.error(`Usage: bun scripts/marketplace.ts <tag>, such as v0.1.0 (got "${tag}").`);
    process.exit(2);
  }
  const res = await fetch(`${RELEASES}/${tag}/SHA256SUMS`);
  if (!res.ok) {
    console.error(`Couldn't read ${tag}'s SHA256SUMS (HTTP ${res.status}). Is the release published?`);
    process.exit(1);
  }
  const file = marketplaceFile(tag, await res.text());
  const out = join(REPO, ".claude-plugin", "marketplace.json");
  mkdirSync(join(REPO, ".claude-plugin"), { recursive: true });
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Wrote ${out}: Motif ${tag}, sha256 ${file.plugins[0]!.source.sha256}`);
}
