import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devCommand, findLocalUrl, startDevServer } from "../src/shot/devserver";
import { makeProject } from "./project";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5000;
  while (alive(pid) && Date.now() < deadline) await Bun.sleep(100);
  return !alive(pid);
}

describe("findLocalUrl", () => {
  test("reads the address Vite and Next.js print, colours and all", () => {
    expect(findLocalUrl("\x1b[32m  ➜  \x1b[39m\x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n  ➜  Network: use --host to expose")).toBe("http://localhost:5173/");
    expect(findLocalUrl("   ▲ Next.js 15.5.0\n   - Local:        http://localhost:3000\n   - Network:      http://192.168.1.4:3000\n")).toBe("http://localhost:3000");
  });
  test("only local addresses count, and 0.0.0.0 becomes reachable", () => {
    expect(findLocalUrl("Network: http://192.168.1.4:8080/\nListening on http://0.0.0.0:8080")).toBe("http://127.0.0.1:8080");
    expect(findLocalUrl("ready - started server on [::]:3000, url: http://[::1]:3000.")).toBe("http://[::1]:3000");
    expect(findLocalUrl("compiling...")).toBeNull();
  });
});

const has = (cmds: string[]) => (cmd: string) => (cmds.includes(cmd) ? `/usr/bin/${cmd}` : null);
const app = (files: Record<string, string>) =>
  makeProject({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }), "node_modules/.keep": "", ...files });

describe("devCommand", () => {
  test("uses the package manager the lockfile names", () => {
    const pm = (files: Record<string, string>) => {
      const r = devCommand(app(files), { platform: "linux", which: has(["bun", "pnpm", "yarn", "npm", "node"]) });
      return "error" in r ? r.error : r.display;
    };
    expect(pm({ "bun.lock": "" })).toBe("bun run dev");
    expect(pm({ "pnpm-lock.yaml": "" })).toBe("pnpm run dev");
    expect(pm({ "yarn.lock": "" })).toBe("yarn run dev");
    expect(pm({ "package-lock.json": "{}" })).toBe("npm run dev");
    expect(pm({})).toBe("npm run dev");
  });

  test("runs the package manager directly, or through cmd.exe for Windows .cmd shims", () => {
    const which = has(["bun", "npm", "node"]);
    expect(devCommand(app({ "bun.lock": "" }), { platform: "linux", which })).toMatchObject({ command: ["/usr/bin/bun", "run", "dev"] });
    expect(devCommand(app({}), { platform: "linux", which })).toMatchObject({ command: ["/usr/bin/npm", "run", "dev"] });
    expect(devCommand(app({}), { platform: "win32", which })).toMatchObject({ command: ["cmd.exe", "/d", "/s", "/c", "npm run dev"] });
    expect(devCommand(app({ "bun.lock": "" }), { platform: "win32", which })).toMatchObject({ command: ["/usr/bin/bun", "run", "dev"] });
  });

  test("in a monorepo, the lockfile and dependencies can live in the workspace root", () => {
    const root = makeProject({
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "",
      "node_modules/.keep": "",
      "apps/web/package.json": JSON.stringify({ scripts: { dev: "next dev" } }),
    });
    expect(devCommand(join(root, "apps/web"), { platform: "linux", which: has(["pnpm", "node"]) })).toMatchObject({ display: "pnpm run dev" });
  });

  test("explains what's missing", () => {
    const error = (dir: string, cmds = ["npm", "node", "pnpm"]) => {
      const r = devCommand(dir, { platform: "linux", which: has(cmds) });
      return "error" in r ? r.error : "";
    };
    expect(error(makeProject({ "package.json": JSON.stringify({ scripts: { build: "vite build" } }) }))).toContain('no "dev" script');
    expect(error(makeProject({}))).toContain("package.json");
    expect(error(makeProject({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }), "pnpm-lock.yaml": "" }))).toContain('Run "pnpm install"');
    expect(error(app({ "yarn.lock": "" }))).toContain("uses yarn, which isn't installed");
    expect(error(app({}), ["npm"])).toContain("Node.js isn't installed");
  });
});

const SERVER = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<h1>Hi</h1>", { headers: { "content-type": "text/html" } }) });
console.log("\\x1b[32m  ➜  Local:\\x1b[0m   http://localhost:" + s.port + "/");
`;
const CRASH = `console.error("Error: Cannot find module 'vite'"); process.exit(1);`;
const SILENT = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
console.log("starting...");
setInterval(() => {}, 1000);
`;

/** Runs a script through a shell, as package managers do, so the server is a grandchild of the process Motif starts. */
function viaShell(dir: string, script: string): string[] {
  if (process.platform === "win32") {
    writeFileSync(join(dir, "dev.cmd"), `@"${process.execPath}" ${script}\r\n`);
    // An explicit .\ path: Windows may be set (NoDefaultCurrentDirectoryInExePath) not to run scripts from the current folder by name.
    return ["cmd.exe", "/d", "/s", "/c", ".\\dev.cmd"];
  }
  return ["sh", "-c", `"${process.execPath}" ${script} & wait`];
}
const pidIn = (dir: string) => Number(readFileSync(join(dir, "server.pid"), "utf8"));

describe("startDevServer", () => {
  test("waits for the address, then stops the whole process tree", async () => {
    const dir = tempDir("motif dev "); // a space in the path, on purpose
    writeFileSync(join(dir, "server.ts"), SERVER);
    const server = await startDevServer({ cwd: dir, command: viaShell(dir, "server.ts"), timeoutMs: 20_000 });
    expect(server.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(await (await fetch(server.url)).text()).toContain("Hi");
    const pid = pidIn(dir);
    await server.stop();
    expect(await gone(pid)).toBe(true);
    await expect(fetch(server.url)).rejects.toThrow();
  }, 30_000);

  test("a server that stops early is a plain error with its last output", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "crash.ts"), CRASH);
    const message = await startDevServer({ cwd: dir, command: viaShell(dir, "crash.ts"), timeoutMs: 20_000 }).then(
      () => "started",
      (e: Error) => e.message,
    );
    expect(message).toContain("stopped");
    expect(message).toContain("Cannot find module 'vite'");
  }, 30_000);

  test("a server that never says where it's running times out and is stopped", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "silent.ts"), SILENT);
    await expect(startDevServer({ cwd: dir, command: viaShell(dir, "silent.ts"), timeoutMs: 2000 })).rejects.toThrow("didn't say where it's running within 2 s");
    expect(await gone(pidIn(dir))).toBe(true);
  }, 30_000);

  test("a server left running is stopped when Motif exits", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "server.ts"), SERVER);
    const SRC = join(import.meta.dir, "../src").replace(/\\/g, "/");
    writeFileSync(join(dir, "run.ts"), `
import { startDevServer } from "${SRC}/shot/devserver";
await startDevServer({ cwd: ${JSON.stringify(dir)}, command: ${JSON.stringify(viaShell(dir, "server.ts"))} });
process.exit(0);
`);
    expect(Bun.spawnSync([process.execPath, join(dir, "run.ts")]).exitCode).toBe(0);
    expect(await gone(pidIn(dir))).toBe(true);
  }, 30_000);
});
