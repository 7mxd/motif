import { win32 } from "node:path";

/**
 * A Windows system program by its full path (cmd.exe from %ComSpec%, the others from %SystemRoot%\System32), so a
 * file of the same name earlier on PATH, or in the project folder, can't stand in for it.
 */
export function windowsExe(name: "cmd.exe" | "taskkill.exe" | "rundll32.exe", env: Record<string, string | undefined> = process.env): string {
  if (name === "cmd.exe" && env.ComSpec) return env.ComSpec;
  return win32.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", name);
}
