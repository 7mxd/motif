import { statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { emit, type CommandResult, type RunContext } from "./cli/output";
import { runCheck } from "./commands/check";
import { runDoctor } from "./commands/doctor";
import { runTokens } from "./commands/tokens";
import { runValidate } from "./commands/validate";
import { VERSION } from "./version";

const HELP = `Motif ${VERSION} — design guide tools for coding agents

Usage: motif <command> [options]

Commands:
  doctor     Explain what works on this computer and what's optional
  validate   Check your design guide (DESIGN.md + design/tokens.json)
  tokens     Turn your design guide into theme code for your app
  check      Find colours, sizes and animations that bypass your design guide

Options:
  --json     Print one JSON object (for agents and CI)
  --cwd      Run in another folder (default: the current folder)
  --app      Only this app (its path in design/motif.json)
  --version  Print the version
`;

type Runner = (cwd: string, ctx: RunContext) => Promise<CommandResult>;

const COMMANDS: Record<string, Runner> = {
  doctor: (cwd) => runDoctor(cwd),
  validate: (cwd) => runValidate(cwd),
  tokens: runTokens,
  check: runCheck,
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
        app: { type: "string" },
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
  if (!Object.hasOwn(COMMANDS, command)) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  const runner = COMMANDS[command]!;
  const json = values.json ?? false;
  const cwd = resolve(values.cwd ?? process.cwd());
  if (!isFolder(cwd)) {
    emit({ command, exitCode: 2, text: `This folder doesn't exist: ${cwd}`, data: { error: "no-folder", folder: cwd } }, json);
    return 2;
  }
  let result: CommandResult;
  try {
    result = await runner(cwd, { positionals: positionals.slice(1), app: values.app });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    result = {
      command,
      exitCode: 2,
      text: `Motif hit an unexpected problem and stopped: ${message}\nPlease report this at https://github.com/7mxd/motif/issues`,
      data: { error: "unexpected", message },
    };
  }
  emit(result, json);
  return result.exitCode;
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
