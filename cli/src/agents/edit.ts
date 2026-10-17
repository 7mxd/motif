// Adds an MCP server to an agent's settings file, for the agents whose own command can't (Part 3 spec §7.2): every
// other entry, comment and the formatting stay as they were, and a file Motif can't read is left alone.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyEdits, findNodeAtLocation, modify, parse, parseTree, type ParseError } from "jsonc-parser";

export type Edited = { ok: true } | { ok: false; reason: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The file a settings path names: where a link points (dotfiles kept elsewhere), so the link itself stays. */
function realTarget(path: string): string {
  try {
    return realpathSync(path);
  } catch {}
  try {
    if (lstatSync(path).isSymbolicLink()) return resolve(dirname(path), readlinkSync(path));
  } catch {}
  return path;
}

/** Where a settings path that is a link points, so a warning can name the file that really holds a key; null when it isn't a link. */
export function linkTarget(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? realTarget(path) : null;
  } catch {
    return null;
  }
}

/** Writes beside the file, then moves it into place, so a failed write never leaves half a settings file. */
function writeSafely(path: string, text: string, holdsKey: boolean): Edited {
  const target = realTarget(path);
  const tmp = `${target}.motif-${process.pid}.tmp`;
  try {
    mkdirSync(dirname(target), { recursive: true });
    const mode = existsSync(target) ? statSync(target).mode & 0o777 : holdsKey ? 0o600 : undefined;
    rmSync(tmp, { force: true });
    // Created with its mode, so a new file holding a key is never readable by others, even briefly.
    writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
    if (mode !== undefined && process.platform !== "win32") chmodSync(tmp, mode);
    renameSync(tmp, target);
    return { ok: true };
  } catch (e) {
    rmSync(tmp, { force: true });
    return { ok: false, reason: `couldn't write ${path}: ${message(e)}` };
  }
}

function readIfThere(path: string): { text: string } | Edited {
  if (!existsSync(path)) return { text: "" };
  try {
    return { text: readFileSync(path, "utf8") };
  } catch (e) {
    return { ok: false, reason: `couldn't read ${path}: ${message(e)}` };
  }
}

const notServers = (path: string, key: string): Edited => ({ ok: false, reason: `${path}'s "${key}" isn't a list of servers, so it wasn't changed` });
const isTable = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);

/** The file's indent: a tab, or its smallest run of leading spaces (2 when nothing is indented). */
function indentUnit(text: string): string {
  const leads = text.split(/\r?\n/).map((l) => /^[ \t]*/.exec(l)![0]).filter((l) => l !== "");
  if (leads.some((l) => l.startsWith("\t"))) return "\t";
  return " ".repeat(leads.length > 0 ? Math.min(...leads.map((l) => l.length)) : 2);
}

/** What may follow a property on its line: a comma, then a comment. */
const LINE_REST = /^[ \t]*(,?)[ \t]*(?:\/\/.*|\/\*.*?\*\/[ \t]*)?$/;

/**
 * The text with name added after the last property of the object at key, indented like it, when that property starts
 * its own line (as agents write these files): no existing line is reformatted, and a comment after that property stays
 * on its line. Null when that isn't the case.
 */
function insertAfterLast(text: string, key: string, name: string, value: unknown, eol: string, unit: string): string | null {
  const root = parseTree(text, [], { allowTrailingComma: true });
  const container = root ? findNodeAtLocation(root, [key]) : undefined;
  const last = container?.type === "object" ? container.children?.at(-1) : undefined;
  if (!container || !last) return null;
  const lineStart = text.lastIndexOf("\n", last.offset) + 1;
  if (lineStart === 0 || text.slice(lineStart, last.offset).trim() !== "") return null;
  const indent = text.slice(lineStart, last.offset);
  const lastEnd = last.offset + last.length;
  const close = container.offset + container.length - 1;
  const entry = `${JSON.stringify(name)}: ${JSON.stringify(value, null, unit).split("\n").join(`${eol}${indent}`)}`;
  let next: string;
  const newline = text.indexOf("\n", lastEnd);
  const lineEnd = newline !== -1 && newline < close ? (text[newline - 1] === "\r" ? newline - 1 : newline) : -1;
  const rest = lineEnd === -1 ? null : LINE_REST.exec(text.slice(lastEnd, lineEnd));
  if (rest) {
    // The new entry goes on the next line, after anything on this one; the comma (if the file had none) goes before it.
    const head = rest[1] ? text.slice(0, lineEnd) : `${text.slice(0, lastEnd)},${text.slice(lastEnd, lineEnd)}`;
    next = `${head}${eol}${indent}${entry}${rest[1] ? "," : ""}${text.slice(lineEnd)}`;
  } else {
    const between = text.slice(lastEnd, close);
    if (/^\s*,/.test(between)) {
      const afterComma = lastEnd + between.indexOf(",") + 1;
      next = `${text.slice(0, afterComma)}${eol}${indent}${entry},${text.slice(afterComma)}`;
    } else next = `${text.slice(0, lastEnd)},${eol}${indent}${entry}${text.slice(lastEnd)}`;
  }
  const errors: ParseError[] = [];
  const doc = parse(next, errors, { allowTrailingComma: true });
  return errors.length === 0 && JSON.stringify(doc?.[key]?.[name]) === JSON.stringify(value) ? next : null;
}

/** Adds name under key (mcpServers for Cursor, servers for VS Code) in a JSON or JSONC file. */
export function addJsonServer(path: string, key: string, name: string, server: Record<string, unknown>, holdsKey = false): Edited {
  const read = readIfThere(path);
  if (!("text" in read)) return read;
  const bom = read.text.startsWith("﻿") ? "﻿" : "";
  const body = bom ? read.text.slice(1) : read.text;
  if (body.trim() !== "") {
    const errors: ParseError[] = [];
    const doc = parse(body, errors, { allowTrailingComma: true });
    if (errors.length > 0 || !isTable(doc)) {
      return { ok: false, reason: `${path} isn't valid JSON, so it wasn't changed` };
    }
    const servers = (doc as Record<string, unknown>)[key];
    if (servers !== undefined && !isTable(servers)) return notServers(path, key);
    if (servers && name in (servers as object)) {
      return { ok: false, reason: `${path} already has a server named "${name}", so it wasn't changed` };
    }
  }
  const base = body.trim() === "" ? "{}" : body;
  const eol = base.includes("\r\n") ? "\r\n" : "\n";
  const unit = indentUnit(base);
  const formattingOptions = { insertSpaces: unit !== "\t", tabSize: unit === "\t" ? 1 : unit.length, eol };
  let next: string;
  try {
    next = insertAfterLast(base, key, name, server, eol, unit) ?? applyEdits(base, modify(base, [key, name], server, { formattingOptions }));
  } catch (e) {
    return { ok: false, reason: `couldn't add "${name}" to ${path} (${message(e)}), so it wasn't changed` };
  }
  return writeSafely(path, `${bom}${next.endsWith(eol) ? next : next + eol}`, holdsKey);
}

/** Appends [mcp_servers.<name>] to Codex's config.toml. */
export function addTomlServer(path: string, name: string, server: { url: string; headers?: Record<string, string> }, holdsKey = false): Edited {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { ok: false, reason: `"${name}" can't be a server name in ${path}` };
  const read = readIfThere(path);
  if (!("text" in read)) return read;
  const text = read.text;
  if (text.trim() !== "") {
    let doc: any;
    try {
      doc = Bun.TOML.parse(text.replace(/^﻿/, ""));
    } catch {
      return { ok: false, reason: `${path} isn't valid TOML, so it wasn't changed` };
    }
    if (doc?.mcp_servers !== undefined && !isTable(doc.mcp_servers)) return notServers(path, "mcp_servers");
    if (doc?.mcp_servers?.[name] !== undefined) return { ok: false, reason: `${path} already has a server named "${name}", so it wasn't changed` };
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const table = [`[mcp_servers.${name}]`, `url = ${JSON.stringify(server.url)}`];
  if (server.headers) {
    table.push(`http_headers = { ${Object.entries(server.headers).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`).join(", ")} }`);
  }
  const gap = text === "" ? "" : text.endsWith("\n") ? eol : eol + eol;
  const next = `${text}${gap}${table.join(eol)}${eol}`;
  try {
    if ((Bun.TOML.parse(next.replace(/^﻿/, "")) as any)?.mcp_servers?.[name]?.url !== server.url) throw new Error("not added");
  } catch {
    return { ok: false, reason: `couldn't add "${name}" to ${path} cleanly, so it wasn't changed` };
  }
  return writeSafely(path, next, holdsKey);
}
