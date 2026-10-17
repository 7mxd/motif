// Packs the skill for the install scripts: motif-skill.tar.gz (install.sh) and motif-skill.zip (install.ps1), each with
// the skill as motif/ and OpenCode's /motif command. Fixed order, dates and modes, so the same files give the same bytes.
// Run: bun run skill:archives
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync, zipSync, type Zippable } from "fflate";
import { listFiles, refuseWindowsLineEndings } from "./zip-plugin";

const REPO = resolve(import.meta.dir, "../..");
export const SKILL_ZIP = "motif-skill.zip";
export const SKILL_TGZ = "motif-skill.tar.gz";
const BOOTSTRAP = "motif/bin/motif";
const TAR_MTIME = 946684800; // 2000-01-01 00:00 UTC

export type ArchiveEntry = [path: string, data: Uint8Array, mode: number];

/** Every file the archives hold, sorted: the skill as motif/, and OpenCode's command. */
export function skillArchiveEntries(repo: string = REPO): ArchiveEntry[] {
  const skill = join(repo, "skill");
  const entries: ArchiveEntry[] = listFiles(skill).map((f) => [`motif/${f}`, new Uint8Array(readFileSync(join(skill, f))), 0o644]);
  const command = join(repo, "plugin", "agents", "opencode", "commands", "motif.md");
  entries.push(["opencode/commands/motif.md", new Uint8Array(readFileSync(command)), 0o644]);
  for (const e of entries) if (e[0] === BOOTSTRAP) e[2] = 0o755;
  return entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function checked(entries: ArchiveEntry[]): ArchiveEntry[] {
  for (const [path, data] of entries) if (path === BOOTSTRAP) refuseWindowsLineEndings(path, data);
  return entries;
}

export function skillZip(entries: ArchiveEntry[]): Uint8Array {
  const date = new Date(2000, 0, 1); // zips store local time: built from local parts, the same in every time zone
  const files: Zippable = {};
  for (const [path, data, mode] of checked(entries)) files[path] = [data, { os: 3, attrs: ((0o100000 | mode) << 16) >>> 0, mtime: date }];
  return zipSync(files, { level: 9 });
}

function tarHeader(name: string, size: number, mode: number): Uint8Array {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(name);
  if (nameBytes.length > 100) throw new Error(`${name} is longer than a tar name can be (100 bytes): shorten it.`);
  const h = new Uint8Array(512);
  const put = (text: string, at: number) => h.set(enc.encode(text), at);
  const octal = (n: number, width: number) => `${n.toString(8).padStart(width - 1, "0")}\0`;
  h.set(nameBytes, 0);
  put(octal(mode, 8), 100);
  put(octal(0, 8), 108);
  put(octal(0, 8), 116);
  put(octal(size, 12), 124);
  put(octal(TAR_MTIME, 12), 136);
  put("        ", 148);
  put("0", 156);
  put("ustar\0", 257);
  put("00", 263);
  const sum = h.reduce((total, b) => total + b, 0);
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return h;
}

export function skillTarGz(entries: ArchiveEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [path, data, mode] of checked(entries)) {
    parts.push(tarHeader(path, data.length, mode), data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const tar = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    tar.set(p, at);
    at += p.length;
  }
  return gzipSync(tar, { level: 9, mtime: 0 });
}

if (import.meta.main) {
  const entries = skillArchiveEntries();
  mkdirSync(join(REPO, "dist"), { recursive: true });
  writeFileSync(join(REPO, "dist", SKILL_ZIP), skillZip(entries));
  writeFileSync(join(REPO, "dist", SKILL_TGZ), skillTarGz(entries));
  console.log(`Wrote dist/${SKILL_ZIP} and dist/${SKILL_TGZ} (${entries.length} files)`);
}
