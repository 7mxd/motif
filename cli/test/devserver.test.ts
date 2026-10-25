import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { answers, devCommand, findLocalAddress, findLocalUrl, outputSummary, startDevServer } from "../src/shot/devserver";
import { selfSignedCert } from "./tls";
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
  test("prefers the line that says Local, when several programs print addresses (backlog)", () => {
    expect(findLocalUrl("[0] JSON Server is running on http://localhost:3001\n[1]   ➜  Local:   http://localhost:5173/\n")).toBe("http://localhost:5173/");
  });
  test("reads Vite's banner, with its colours", () => {
    const banner = "\n  \x1b[32m\x1b[1mVITE\x1b[22m v6.3.5\x1b[39m  ready in \x1b[1m412\x1b[22m ms\n\n  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n  \x1b[32m➜\x1b[39m  \x1b[1mNetwork\x1b[22m\x1b[2m: use \x1b[22m\x1b[1m--host\x1b[22m\x1b[2m to expose\x1b[22m\n";
    expect(findLocalAddress(banner)).toEqual({ url: "http://localhost:5173/", onLocalLine: true });
  });
  test("reads Nuxt's banner (Nuxt 3 and 4 print it through listhen), with its colours and a Network line", () => {
    // Nuxt prints "  ➜ Local:    <url>" and "  ➜ Network:  use --host to expose", or the Network address when started with --host.
    const quiet = "Nuxt 3.17.4 with Nitro 2.11.12\n\n\x1b[32m  ➜ Local:    \x1b[39m \x1b[36mhttp://localhost:\x1b[1m3000\x1b[22m/\x1b[39m\n\x1b[90m  ➜ Network:  use \x1b[39m\x1b[37m--host\x1b[39m\x1b[90m to expose\x1b[39m\n";
    expect(findLocalAddress(quiet)).toEqual({ url: "http://localhost:3000/", onLocalLine: true });
    expect(findLocalUrl("  ➜ Network:  http://192.168.1.4:3001/\n  ➜ Local:    http://localhost:3001/\n")).toBe("http://localhost:3001/");
    expect(findLocalAddress("[nitro] Using 2 threads as worker\n  ➜ Local:    http://127.0.0.1:3000/docs/\n")).toEqual({ url: "http://127.0.0.1:3000/docs/", onLocalLine: true });
  });
  test("reads the banner a real nuxt dev printed (Nuxt 4.4.8, @nuxt/cli 3.37.0, on Windows): underlined, bold port, DevTools line", () => {
    // Copied byte for byte from `npm run dev` in cli/test/fixtures/nuxt-min (plan 2I, Task 8).
    const real =
      "\n> dev\n> nuxt dev\n\n\x1b[90m│\x1b[39m\n\x1b[34m●\x1b[39m  \x1b[32mNuxt \x1b[1m4.4.8\x1b[22m\x1b[39m\x1b[90m (with \x1b[39m\x1b[90mNitro \x1b[1m2.13.5\x1b[22m\x1b[39m\x1b[90m, Vite \x1b[1m7.3.7\x1b[22m\x1b[39m\x1b[90m and Vue \x1b[1m3.5.44\x1b[22m\x1b[39m\x1b[90m)\x1b[39m\n\n" +
      "\x1b[32m  ➜ Local:   \x1b[39m \x1b[36m\x1b[4mhttp://localhost:\x1b[1m3000\x1b[22m/\x1b[24m\x1b[39m\n\x1b[90m  ➜ Network:  use \x1b[37m--host\x1b[90m to expose\x1b[39m\n\n" +
      "\x1b[33m  ➜ DevTools: \x1b[39m\x1b[2mpress \x1b[22m\x1b[32mShift\x1b[39m\x1b[2m + \x1b[22m\x1b[32mAlt\x1b[39m\x1b[2m + \x1b[22m\x1b[32mD\x1b[39m\x1b[2m in the browser (v3.4.4)\x1b[22m\n\n\x1b[32m✔\x1b[39m Vite client built in 26ms\n";
    expect(findLocalAddress(real)).toEqual({ url: "http://localhost:3000/", onLocalLine: true });
  });
  test("reads the banner a real vite dev printed for SvelteKit (Vite 8.3.5, SvelteKit 2.70, on Windows): bold port, a re-optimization line first", () => {
    // Copied byte for byte from `npm run dev` in a temp copy of cli/test/fixtures/svelte-min (plan 2J, Task 7).
    const real =
      "\n> svelte-min@0.0.1 dev\n> vite dev\n\n\x1b[2m2:10:08 PM\x1b[22m \x1b[36m\x1b[1m[vite]\x1b[22m\x1b[39m \x1b[90m\x1b[2m(client)\x1b[22m\x1b[39m Forced re-optimization of dependencies\n\n  \x1b[32m\x1b[1mVITE\x1b[22m v8.3.5\x1b[39m  \x1b[2mready in \x1b[0m\x1b[1m1080\x1b[22m\x1b[2m\x1b[0m ms\x1b[22m\n\n  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n\x1b[2m  \x1b[32m➜\x1b[39m  \x1b[1mNetwork\x1b[22m\x1b[2m: use \x1b[22m\x1b[1m--host\x1b[22m\x1b[2m to expose\x1b[22m\n";
    expect(findLocalAddress(real)).toEqual({ url: "http://localhost:5173/", onLocalLine: true });
  });
  test("reads the banner a real ng serve printed (Angular CLI 21.2.28, @angular/build:dev-server, on Windows): the build's table first", () => {
    // Copied byte for byte from `npm run start -- --port 4377` in a temp copy of cli/test/fixtures/angular-min (plan 2K,
    // Task 7), run with the env Motif gives it (FORCE_COLOR=0, NO_COLOR=1, NG_CLI_ANALYTICS=false). It printed the
    // address 2.7-2.9 s after it was started, once the whole app was built, and answered at once.
    const real =
      "\n> angular-min@0.0.0 start\n> ng serve --port 4377\n\n❯ Building...\r\n✔ Building...\r\nInitial chunk files | Names         | Raw size\nstyles.css          | styles        |  5.73 kB | \nmain.js             | main          |  4.75 kB | \n\n                    | Initial total | 10.48 kB\n\nLazy chunk files    | Names         | Raw size\nchunk-TAITDC6P.js   | settings      |  2.59 kB | \n\nApplication bundle generation complete. [1.191 seconds] - 2026-10-25T09:42:24.247Z\n\nWatch mode enabled. Watching for file changes...\nNOTE: Raw file sizes do not reflect development server per-request transformations.\n  ➜  Local:   http://localhost:4377/\n";
    expect(findLocalAddress(real)).toEqual({ url: "http://localhost:4377/", onLocalLine: true });
  });
  test("reads the banner Angular 14-16's webpack dev server prints, which has no Local line", () => {
    const webpack = "** Angular Live Development Server is listening on localhost:4321, open your browser on http://localhost:4321/ **\n";
    expect(findLocalAddress(webpack)).toEqual({ url: "http://localhost:4321/", onLocalLine: false });
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
    expect(devCommand(app({}), { platform: "win32", which, vars: {} })).toMatchObject({ command: ["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", "npm run dev"] });
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

  test("Yarn Plug'n'Play apps have no node_modules, and count as installed (backlog)", () => {
    const pnp = makeProject({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }), "yarn.lock": "", ".pnp.cjs": "" });
    expect(devCommand(pnp, { platform: "linux", which: has(["yarn", "node"]) })).toMatchObject({ display: "yarn run dev" });
  });
});

describe("devCommand with a web stack's dev script", () => {
  const ng = (scripts: Record<string, string>, files: Record<string, string> = {}) =>
    makeProject({ "package.json": JSON.stringify({ scripts }), "node_modules/.keep": "", ...files });
  const which = has(["bun", "pnpm", "yarn", "npm", "node"]);
  const start = (_dir: string, port: number) => ({ script: "start", args: ["--port", String(port)] });

  test("without the hook, the dev script runs as before", () => {
    expect(devCommand(app({}), { platform: "linux", which, port: 4321 })).toMatchObject({ command: ["/usr/bin/npm", "run", "dev"], display: "npm run dev" });
  });

  test("runs the script the hook names with its arguments, through the package manager: after -- for npm only", () => {
    // Checked 2026-10-25 with a start script that prints its arguments: npm 11 needs "--" (without it, npm takes --port
    // as its own config); pnpm 10 and Yarn 4 hand a "--" on to the script as an argument (ng serve would then ignore
    // the port); Yarn 1 drops it with a warning; bun drops it.
    const dir = ng({ start: "ng serve" });
    expect(devCommand(dir, { platform: "linux", which, port: 4321, devScript: start })).toMatchObject({
      command: ["/usr/bin/npm", "run", "start", "--", "--port", "4321"], display: "npm run start -- --port 4321", packageManager: "npm",
    });
    const run = (lock: string) => devCommand(ng({ start: "ng serve" }, { [lock]: "" }), { platform: "linux", which, port: 4321, devScript: start });
    expect(run("pnpm-lock.yaml")).toMatchObject({ command: ["/usr/bin/pnpm", "run", "start", "--port", "4321"], display: "pnpm run start --port 4321" });
    expect(run("yarn.lock")).toMatchObject({ command: ["/usr/bin/yarn", "run", "start", "--port", "4321"], display: "yarn run start --port 4321" });
    expect(run("bun.lock")).toMatchObject({ command: ["/usr/bin/bun", "run", "start", "--port", "4321"], display: "bun run start --port 4321" });
    expect(devCommand(dir, { platform: "win32", which, vars: {}, port: 4321, devScript: start })).toMatchObject({
      command: ["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", "npm run start -- --port 4321"],
    });
    expect(devCommand(ng({ start: "ng serve" }, { "pnpm-lock.yaml": "" }), { platform: "win32", which, vars: {}, port: 4321, devScript: start })).toMatchObject({
      command: ["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", "pnpm run start --port 4321"],
    });
  });

  test("a hook's own refusal is given as it is", () => {
    const refuse = () => ({ error: "This app has no \"start\" script that runs ng serve. Add one, or start it yourself and pass its address with --url." });
    expect(devCommand(ng({ build: "ng build" }), { platform: "linux", which, devScript: refuse })).toEqual(refuse());
  });

  test("the hook is given the port Motif chose, or a free one", () => {
    const ports: number[] = [];
    const record = (_dir: string, port: number) => (ports.push(port), { script: "start", args: [] });
    expect(devCommand(ng({ start: "ng serve" }), { platform: "linux", which, port: 4321, devScript: record })).toMatchObject({ display: "npm run start" });
    devCommand(ng({ start: "ng serve" }), { platform: "linux", which, devScript: record });
    expect(ports[0]).toBe(4321);
    expect(ports[1]).toBeGreaterThan(1023);
  });

  test("a script the app doesn't have is named in the refusal; no script at all is refused too", () => {
    const error = (r: ReturnType<typeof devCommand>) => ("error" in r ? r.error : "");
    expect(error(devCommand(ng({ dev: "vite" }), { platform: "linux", which, devScript: start }))).toBe(
      'This app has no "start" script in package.json. Start it yourself and pass its address with --url.',
    );
    expect(error(devCommand(ng({ start: "node server.js" }), { platform: "linux", which, devScript: () => null }))).toBe(
      "This app has no script in package.json that starts its dev server. Start it yourself and pass its address with --url.",
    );
  });
});

describe("devCommand for an Expo app", () => {
  const expo = (files: Record<string, string>, scripts: Record<string, string> = {}) =>
    makeProject({ "package.json": JSON.stringify({ scripts, dependencies: { expo: "~52.0.0" } }), "node_modules/.keep": "", ...files });
  const all = has(["bun", "bunx", "pnpm", "yarn", "npm", "npx", "node"]);

  test("runs expo start --web on a free port through the package manager's exec, with CI=1 and no telemetry", () => {
    const run = (files: Record<string, string>, platform: NodeJS.Platform = "linux") => devCommand(expo(files), { platform, which: all, port: 8099, vars: {} });
    expect(run({})).toMatchObject({ command: ["/usr/bin/npx", "expo", "start", "--web", "--port", "8099"], display: "npx expo start --web --port 8099", env: { CI: "1", EXPO_NO_TELEMETRY: "1" } });
    expect(run({ "pnpm-lock.yaml": "" })).toMatchObject({ command: ["/usr/bin/pnpm", "exec", "expo", "start", "--web", "--port", "8099"], display: "pnpm exec expo start --web --port 8099" });
    expect(run({ "yarn.lock": "" })).toMatchObject({ command: ["/usr/bin/yarn", "expo", "start", "--web", "--port", "8099"], display: "yarn expo start --web --port 8099" });
    expect(run({ "bun.lock": "" })).toMatchObject({ display: "bunx expo start --web --port 8099" });
    expect(run({}, "win32")).toMatchObject({ command: ["C:\\Windows\\System32\\cmd.exe", "/d", "/s", "/c", "npx expo start --web --port 8099"] });
  });

  test("uses the app's web script when it has one", () => {
    expect(devCommand(expo({ "yarn.lock": "" }, { web: "expo start --web" }), { platform: "linux", which: all })).toMatchObject({
      command: ["/usr/bin/yarn", "run", "web"], display: "yarn run web", env: { CI: "1", EXPO_NO_TELEMETRY: "1" },
    });
  });

  test("picks a free port when none is given, and a web app gets no extra variables", () => {
    const r = devCommand(expo({}), { platform: "linux", which: all });
    expect("error" in r ? 0 : Number(r.command[r.command.length - 1])).toBeGreaterThan(1023);
    const web = devCommand(app({}), { platform: "linux", which: all });
    expect("env" in web ? web.env : undefined).toBeUndefined();
  });
});

describe("Expo's own address line", () => {
  test('"Web is waiting on http://localhost:8081" is found, though no line says Local', () => {
    const found = findLocalAddress("Starting project at /app\nStarting Metro Bundler\nWeb is waiting on http://localhost:8081\n");
    expect(found).toEqual({ url: "http://localhost:8081", onLocalLine: false });
  });
});

const SERVER = `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<h1>Hi</h1>", { headers: { "content-type": "text/html" } }) });
console.log("\\x1b[32m  ➜  Local:\\x1b[0m   http://localhost:" + s.port + "/");
`;
/** Nuxt's dev server: it answers at once, with its loading screen (HTTP 503) until the app is built, here for 1.5 s. */
const BUILDING = `
const started = Date.now();
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Date.now() - started < 1500
  ? new Response("building server · step 6/7", { status: 503 })
  : new Response("<h1>The app</h1>", { headers: { "content-type": "text/html" } }) });
console.log("  ➜ Local:    http://localhost:" + s.port + "/");
`;
/** A dev server that never gets past its loading screen. */
const STILL_BUILDING = `
const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("Loading...", { status: 503 }) });
console.log("  ➜ Local:    http://localhost:" + s.port + "/");
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

  test("a character split across two pieces of its output arrives whole (backlog)", async () => {
    const dir = tempDir("motif-dev-");
    const crash = "process.stderr.write(Buffer.from([0x63, 0x61, 0x66, 0xc3])); setTimeout(() => { process.stderr.write(Buffer.from([0xa9, 0x0a])); process.exit(1); }, 150);";
    writeFileSync(join(dir, "split.ts"), crash);
    const message = await startDevServer({ cwd: dir, command: viaShell(dir, "split.ts"), timeoutMs: 20_000 }).then(
      () => "started",
      (e: Error) => e.message,
    );
    expect(message).toContain("café");
  }, 30_000);

  test("a server that answers with its loading screen first is waited for when the stack names that status (Vue Task 13 hands-on)", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "building.ts"), BUILDING);
    const server = await startDevServer({ cwd: dir, command: viaShell(dir, "building.ts"), timeoutMs: 20_000, buildingStatus: 503 });
    try {
      const page = await fetch(server.url);
      expect([page.status, await page.text()]).toEqual([200, "<h1>The app</h1>"]);
    } finally {
      await server.stop();
    }
  }, 30_000);

  test("without a building status, any answer means the server is ready, as before", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "building.ts"), BUILDING);
    const server = await startDevServer({ cwd: dir, command: viaShell(dir, "building.ts"), timeoutMs: 20_000 });
    try {
      expect((await fetch(server.url)).status).toBe(503);
    } finally {
      await server.stop();
    }
  }, 30_000);

  test("a server still on its loading screen at the limit says so, and is stopped", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "building.ts"), STILL_BUILDING);
    const message = await startDevServer({ cwd: dir, command: viaShell(dir, "building.ts"), timeoutMs: 3000, buildingStatus: 503 }).then(
      async (server) => (await server.stop(), "started"),
      (e: Error) => e.message,
    );
    expect(message).toMatch(/^The dev server at http:\/\/localhost:\d+\/ was still building the app after 3 s \(it answered HTTP 503\)\. If the page really answers 503, start the app yourself and pass its address with --url\./);
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

describe("outputSummary", () => {
  test("keeps the cause when npm adds its own error lines", () => {
    const output = [
      "> web@1.0.0 dev",
      "> vite",
      "",
      "'vite' is not recognized as an internal or external command,",
      "operable program or batch file.",
      "npm error Lifecycle script `dev` failed with error:",
      "npm error code 1",
      "npm error path C:/x/apps/web",
      "npm error workspace web@1.0.0",
      "npm error location C:/x/apps/web",
      "npm error command failed",
      "npm error command C:/WINDOWS/system32/cmd.exe /d /s /c vite",
    ].join("\r\n");
    const summary = outputSummary(output);
    expect(summary).toContain("'vite' is not recognized as an internal or external command,");
    expect(summary.some((l) => l.startsWith("npm error"))).toBe(false);
  });
  test("keeps the cause when a stack trace follows it", () => {
    const output = [
      "failed to load config from C:/x/vite.config.ts",
      "error when starting dev server:",
      "Error: Cannot find module 'some-missing-plugin'",
      "Require stack:",
      "- C:/x/vite.config.ts",
      ...Array.from({ length: 12 }, (_, i) => `    at Module._load (node:internal/modules/cjs/loader:${1000 + i}:12)`),
      "  code: 'MODULE_NOT_FOUND',",
      "  requireStack: [ 'C:\\x\\vite.config.ts' ]",
      "}",
      "",
      "Node.js v22.14.0",
    ].join("\n");
    const summary = outputSummary(output);
    expect(summary).toContain("Error: Cannot find module 'some-missing-plugin'");
    expect(summary.some((l) => l.includes("    at ") || l.startsWith("Node.js v"))).toBe(false);
  });
  test("a long log still leads with its first error", () => {
    const output = ["Error: port 5173 is already in use", ...Array.from({ length: 20 }, (_, i) => `retrying ${i}`)].join("\n");
    const summary = outputSummary(output);
    expect(summary[0]).toBe("Error: port 5173 is already in use");
    expect(summary.length).toBeLessThanOrEqual(8);
  });
});

const cert = selfSignedCert();
describe.skipIf(!cert)("dev servers on https with their own certificate (backlog)", () => {
  test("count as answering, instead of being waited for until the time runs out", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, tls: cert!, fetch: () => new Response("hi") });
    try {
      expect(await answers(`https://127.0.0.1:${server.port}/`)).toBe(true);
    } finally {
      server.stop(true);
    }
  });
});

describe("the app's address, printed after another program's (review of batch B)", () => {
  test("waits a moment for a Local line before taking the first address", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "both.ts"), `
import { writeFileSync } from "node:fs";
writeFileSync("server.pid", String(process.pid));
const api = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("{}") });
console.log("JSON Server is running on http://localhost:" + api.port);
setTimeout(() => {
  const app = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<h1>App</h1>", { headers: { "content-type": "text/html" } }) });
  console.log("  ➜  Local:   http://localhost:" + app.port + "/");
}, 700);
`);
    const server = await startDevServer({ cwd: dir, command: viaShell(dir, "both.ts"), timeoutMs: 20_000 });
    try {
      expect(await (await fetch(server.url)).text()).toContain("App");
    } finally {
      await server.stop();
    }
  }, 30_000);
});

describe.skipIf(process.platform === "win32")("stopping a dev server whose first process already ended (backlog)", () => {
  test("still stops what it started", async () => {
    const dir = tempDir("motif-dev-");
    writeFileSync(join(dir, "server.ts"), SERVER);
    // The shell starts the server in the background, then ends after a moment, as "tsc -w & vite" can leave things.
    const server = await startDevServer({ cwd: dir, command: ["sh", "-c", `"${process.execPath}" server.ts & sleep 1`], timeoutMs: 20_000 });
    const pid = pidIn(dir);
    await Bun.sleep(1500);
    await server.stop();
    expect(await gone(pid)).toBe(true);
  }, 30_000);
});
