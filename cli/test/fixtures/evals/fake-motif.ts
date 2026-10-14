// A stand-in for the motif tool: prints FAKE_MOTIF_RAW as it is, or the JSON that FAKE_MOTIF_OUTPUT gives for the command.
if (process.env.FAKE_MOTIF_RAW) {
  console.log(process.env.FAKE_MOTIF_RAW);
  process.exit(1);
}
const outputs = JSON.parse(process.env.FAKE_MOTIF_OUTPUT ?? "{}");
const command = process.argv[2] ?? "";
const out = outputs[command] ?? { command, ok: false, exitCode: 2, error: "unknown-command" };
console.log(JSON.stringify(out));
process.exit(out.exitCode ?? 0);
