import { statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { emit, type CommandResult, type RunContext } from "./cli/output";
import { runBrowser } from "./commands/browser";
import { runCheck } from "./commands/check";
import { runDoctor } from "./commands/doctor";
import { runExtract } from "./commands/extract";
import { runPreview } from "./commands/preview";
import { runShot } from "./commands/shot";
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
  extract    Draft a design guide from an existing app's code
  browser    Show the browser used for previews ("browser install" downloads one)
  preview    Show mockups in your browser and save them as PNGs
  shot       Screenshot your app's pages (--audit checks what people actually see)

Options:
  --json     Print one JSON object (for agents and CI)
  --cwd      Run in another folder (default: the current folder)
  --app      Only this app (its path in design/motif.json)
  --version  Print the version

Preview options:
  --preset <name>   Use a starting style instead of design/tokens.json
  --compare         Show several mockups side by side
  --gallery         Show the 8 starting styles
  --png-only        Save PNGs and stop, without opening a browser
  --no-open         Serve without opening a browser
  --out <folder>    Where PNGs go (preview: design/previews, shot: design/shots)

Shot options:
  --url <address>   Use an app that's already running instead of starting it
  --routes <list>   Pages to capture, e.g. /,/settings (default: found from your app)
  --audit           Also check contrast, tap-target sizes and reduced motion as rendered

Tokens options:
  --stack preview   Write only the CSS mockups use (design/previews/motif.css)
`;

type Runner = (cwd: string, ctx: RunContext) => Promise<CommandResult>;

const COMMANDS: Record<string, Runner> = {
  doctor: (cwd) => runDoctor(cwd),
  validate: (cwd) => runValidate(cwd),
  tokens: runTokens,
  check: runCheck,
  extract: runExtract,
  browser: runBrowser,
  preview: runPreview,
  shot: runShot,
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
        compare: { type: "boolean", default: false },
        gallery: { type: "boolean", default: false },
        "png-only": { type: "boolean", default: false },
        "no-open": { type: "boolean", default: false },
        preset: { type: "string" },
        out: { type: "string" },
        stack: { type: "string" },
        url: { type: "string" },
        routes: { type: "string" },
        audit: { type: "boolean", default: false },
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
    result = await runner(cwd, {
      positionals: positionals.slice(1),
      app: values.app,
      flags: {
        compare: values.compare,
        gallery: values.gallery,
        "png-only": values["png-only"],
        "no-open": values["no-open"],
        preset: values.preset,
        out: values.out,
        stack: values.stack,
        url: values.url,
        routes: values.routes,
        audit: values.audit,
      },
    });
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
  if (result.hold) await result.hold;
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
