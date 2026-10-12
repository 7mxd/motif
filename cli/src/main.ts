import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { emit, type CommandResult } from "./cli/output";
import { runDoctor } from "./commands/doctor";
import { runValidate } from "./commands/validate";
import { VERSION } from "./version";

const HELP = `Motif ${VERSION} — design guide tools for coding agents

Usage: motif <command> [--json] [--cwd <folder>]

Commands:
  doctor     Explain what works on this computer and what's optional
  validate   Check your design guide (DESIGN.md + design/tokens.json)

Options:
  --json     Print one JSON object (for agents and CI)
  --cwd      Run in another folder (default: the current folder)
  --version  Print the version
`;

type Runner = (cwd: string) => Promise<CommandResult>;

const COMMANDS: Record<string, Runner> = {
  doctor: (cwd) => runDoctor(cwd),
  validate: runValidate,
};

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: "boolean", default: false },
        cwd: { type: "string" },
        version: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const command = positionals[0];
  if (values.help || command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (!command) {
    process.stdout.write(HELP);
    return 2;
  }
  const runner = COMMANDS[command];
  if (!runner) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  const result = await runner(resolve(values.cwd ?? process.cwd()));
  emit(result, values.json ?? false);
  return result.exitCode;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
