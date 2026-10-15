export interface CommandResult {
  command: string;
  exitCode: 0 | 1 | 2;
  /** Plain-language output for people. */
  text: string;
  /** Structured output merged into the --json object. */
  data: Record<string, unknown>;
  /** For commands that keep running (a preview server): main waits for this after printing. */
  hold?: Promise<void>;
}

/** What a command receives besides the folder: extra words after the command name, --app, and its own options. */
export interface RunContext {
  positionals: string[];
  app?: string;
  flags?: Record<string, string | string[] | boolean | undefined>;
}

export function emit(
  result: CommandResult,
  json: boolean,
  out: (s: string) => void = (s) => void process.stdout.write(s),
): void {
  if (json) {
    out(JSON.stringify({ command: result.command, ok: result.exitCode === 0, exitCode: result.exitCode, ...result.data }) + "\n");
  } else {
    out(result.text.endsWith("\n") ? result.text : result.text + "\n");
  }
}
