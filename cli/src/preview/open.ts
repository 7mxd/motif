import { spawn } from "node:child_process";

/** The program that opens a web address in the default browser. The address is one argument, never parsed by a shell. */
export function openCommand(url: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}

/** Opens url in the default browser. Resolves false if that couldn't be started. */
export function openUrl(url: string): Promise<boolean> {
  const [cmd, args] = openCommand(url);
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: "ignore", detached: true });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
