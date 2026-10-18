// A stand-in for Claude Code in the eval runner's tests: reads the prompt, prints a scripted event stream, and can write files or hang.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface Scenario {
  /** Fields to change in the first event. */
  init?: Record<string, unknown>;
  /** Printed after the first event, in order. */
  events?: unknown[];
  /** Written relative to the working folder before the last event. */
  files?: Record<string, string>;
  /** Waits this long before the last event. */
  hangMs?: number;
  /** Fields to change in the last event; null prints none. */
  result?: Record<string, unknown> | null;
  stderr?: string;
  exitCode?: number;
  /** Starts a long-running child and writes its process id here (what a session leaves running). */
  child?: string;
  /** Writes this file when asked to stop (SIGTERM), then stops. */
  onTerm?: string;
  /** Prints an event holding this text with its bytes split across two writes. */
  split?: string;
}

const file = process.env.FAKE_CLAUDE_SCENARIO;
const scenario: Scenario = file ? JSON.parse(await Bun.file(file).text()) : {};
const prompt = await new Response(Bun.stdin.stream()).text();
const args = process.argv.slice(2);
if (process.env.FAKE_CLAUDE_RECORD) {
  writeFileSync(process.env.FAKE_CLAUDE_RECORD, JSON.stringify({ args, prompt, cwd: process.cwd(), motifBin: process.env.MOTIF_BIN ?? null, apiKey: process.env.ANTHROPIC_API_KEY ?? null }));
}
const out = (e: unknown) => process.stdout.write(JSON.stringify(e) + "\n");
const pluginDir = args.includes("--plugin-dir") ? args[args.indexOf("--plugin-dir") + 1] : undefined;

out({
  type: "system", subtype: "init", cwd: process.cwd(), session_id: "fake", model: "fake-model",
  permissionMode: args.includes("--permission-mode") ? args[args.indexOf("--permission-mode") + 1] : "default", apiKeySource: "none", mcp_servers: [],
  plugins: [...(pluginDir ? [{ name: "motif", path: pluginDir, source: "motif@inline" }] : []), { name: "cc-plugin-telemetry", path: "builtin", source: "cc-plugin-telemetry@builtin" }],
  tools: args.includes("--tools") ? args[args.indexOf("--tools") + 1]!.split(",").filter((t) => t !== "PowerShell") : ["Bash", "Read"],
  claude_code_version: "0.0.0-fake",
  ...scenario.init,
});
for (const e of scenario.events ?? []) out(e);
if (scenario.onTerm) {
  const file = scenario.onTerm;
  process.on("SIGTERM", () => {
    writeFileSync(file, "term");
    process.exit(0);
  });
}
if (scenario.child) {
  const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", "ignore", "ignore"] });
  writeFileSync(scenario.child, String(child.pid));
}
if (scenario.split) {
  const bytes = Buffer.from(JSON.stringify({ type: "assistant", text: scenario.split }) + "\n");
  const cut = bytes.findIndex((b) => b >= 0x80) + 1 || bytes.length;
  process.stdout.write(bytes.subarray(0, cut));
  await Bun.sleep(150);
  process.stdout.write(bytes.subarray(cut));
}
for (const [path, content] of Object.entries(scenario.files ?? {})) {
  mkdirSync(dirname(join(process.cwd(), path)), { recursive: true });
  writeFileSync(join(process.cwd(), path), content);
}
if (scenario.hangMs) await Bun.sleep(scenario.hangMs);
if (scenario.result !== null) {
  out({ type: "result", subtype: "success", is_error: false, num_turns: 3, total_cost_usd: 0.5, duration_ms: 1000, permission_denials: [], result: "Done.", api_error_status: null, ...scenario.result });
}
if (scenario.stderr) process.stderr.write(scenario.stderr);
process.exit(scenario.exitCode ?? 0);
