import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentChecks } from "../scripts/agent-checks";
import { ADAPTERS_AVAILABLE } from "../src/detect/stacks";
import { PARITY_ROWS, parityGaps } from "./parity-gate";

const REPO = join(import.meta.dir, "../..");
const VERSION = readFileSync(join(REPO, "skill/VERSION"), "utf8").trim();
const NOTES = join(REPO, "docs/releases", `v${VERSION}.md`);

describe("the release notes", () => {
  test("exist for this version, so tagging it can publish", () => {
    expect(existsSync(NOTES)).toBe(true);
  });

  test("say how to install, what's needed, what's in it and what isn't", () => {
    const notes = readFileSync(NOTES, "utf8");
    for (const s of [
      "/plugin marketplace add 7mxd/motif", "/plugin install motif@motif", "Claude Code 2.1.224", "git", "SHA256SUMS",
      "preview", "React web", "plain web", "## Known limits", "aren't code-signed", "motif-claude-code.zip", "THIRD-PARTY-NOTICES.txt",
    ]) expect(notes).toContain(s);
  });

  test("say how to install Motif in every agent, and name the skill archives (Part 3)", () => {
    const notes = readFileSync(NOTES, "utf8");
    for (const s of [
      "codex plugin marketplace add 7mxd/motif", "codex plugin add motif@motif", "copilot plugin marketplace add 7mxd/motif", "copilot plugin install motif@motif",
      "gemini extensions install https://github.com/7mxd/motif --ref plugins --auto-update", "cursor-agent plugin marketplace add https://github.com/7mxd/motif",
      "install.sh", "install.ps1", "motif-skill.zip", "motif-skill.tar.gz", "motif connect",
    ]) expect(notes).toContain(s);
  });
});

describe("the READMEs", () => {
  test("tell people how to install Motif from its marketplace, now that a release exists", () => {
    for (const file of ["README.md", "plugin/claude-code/README.md"]) {
      const text = readFileSync(join(REPO, file), "utf8");
      for (const s of ["/plugin marketplace add 7mxd/motif", "/plugin install motif@motif", "Claude Code 2.1.224"]) {
        expect(text.includes(s) ? file : `${file} lacks ${s}`).toBe(file);
      }
    }
    expect(readFileSync(join(REPO, "README.md"), "utf8")).toContain(`**Preview (v${VERSION}).**`);
    expect(readFileSync(join(REPO, "plugin/claude-code/README.md"), "utf8")).not.toContain("Until Motif's first release is published");
  });

  test("the README's install commands are the ones the release checks run (Part 3)", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf8");
    const ciOnly = new Set(["--consent", "--skip-settings"]);
    for (const c of agentChecks({ kind: "github", repo: "7mxd/motif", branch: "plugins" }, { platform: "linux", repo: REPO })) {
      if (c.id === "opencode") continue;
      for (const step of c.steps) expect([c.id, readme.includes(step.filter((a) => !ciOnly.has(a)).join(" "))]).toEqual([c.id, true]);
    }
    for (const s of ["raw.githubusercontent.com/7mxd/motif/main/install.sh | sh", "raw.githubusercontent.com/7mxd/motif/main/install.ps1 | iex", "/motif", "$motif"]) {
      expect(readme).toContain(s);
    }
  });

  test("the README's preview note lists the stacks v0.6.0 has, Vue, Svelte and Angular with them, and links the parity checklist (Ruling W)", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf8");
    const note = readme.slice(readme.indexOf("**Preview"), readme.indexOf("\n", readme.indexOf("**Preview")));
    expect(note).toContain("for React web apps, plain web sites, Vue (and Nuxt), Svelte (and SvelteKit) and Angular apps, and Flutter, Jetpack Compose, React Native (Expo) and SwiftUI apps ([what each stack gets](docs/parity.md)). The first full release comes next.");
    expect(note).not.toContain("Vue, Svelte, Angular and");
    expect(readme).toContain("Full support in v0.6.0: React web apps and plain web sites");
    expect(readme).not.toContain("arrive in v0.");
    // The web stacks' floors and needs, as doctor and their guides say them (plans 2I to 2K).
    for (const s of [
      "Vue 3 apps with Vite, and Nuxt 3 or 4 apps; Vue 2 and Nuxt 2 aren't supported",
      "Svelte 5 apps, with SvelteKit 2 or 3 or with Vite; SvelteKit 3 needs Node.js 22.17 or later",
      "Angular 15 or later, with standalone components or NgModules", "(Angular 22: 22.22.3 or later, or 24.15 or later)",
      "Angular 14 and older aren't supported", "the `start` script that runs `ng serve`",
    ]) expect(readme).toContain(s);
    expect(readme).not.toMatch(/Full support today[^\n]*(Flutter|Compose|React Native|SwiftUI)/);
    expect(readme).not.toContain("SwiftUI comes after");
    // SwiftUI's needs, as doctor and the SwiftUI guide say them (2H Task 15).
    expect(readme).toContain("SwiftUI apps for iPhone, iPad and the Mac, in an Xcode project or a Swift package: theme code, checks and drafts work on any computer, and screenshots need a Mac with Xcode.");
    for (const s of ["a Mac with Xcode 16 or later", "iOS 17 or macOS 14", "`--state design/states/<name>.swift`", "`design/states/Setup.swift`", "Kotlin and Swift"]) expect(readme).toContain(s);
    expect(readme).toContain("Jetpack Compose apps (Android); in a Gradle project with several modules, Motif finds each app module and reads its own code, and names the Compose library modules it depends on, which it doesn't read yet.");
    expect(readme).not.toContain("also in a Gradle project with several modules");
    expect(readme).toContain("React Native apps made with Expo (SDK 52 or later), also inside a monorepo; React Native without Expo");
  });

  test("the README's motif connect row says it sets sources up in the agents you choose (Part 3)", () => {
    expect(readFileSync(join(REPO, "README.md"), "utf8")).toContain("to the coding agents you choose");
  });
});

describe("the release workflow", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  /** One job's text: from its "  name:" line to the next job's. */
  const section = (name: string) => {
    const start = wf.indexOf(`\n  ${name}:\n`);
    expect(start).toBeGreaterThan(-1);
    const next = wf.slice(start + 1).search(/\n  [a-z][\w-]*:\n/);
    return next === -1 ? wf.slice(start) : wf.slice(start, start + 1 + next);
  };

  test("builds and zips the plugin, with the tag and the plugin's version checked", () => {
    const plugin = section("plugin");
    for (const s of ["bun run plugin", "bun run plugin:zip", "dist/motif-claude-code.zip", 'test "v$(tr -d \' \\r\\n\' < skill/VERSION)" = "$GITHUB_REF_NAME"']) {
      expect(plugin).toContain(s);
    }
  });

  test("publishes with written notes and the notices, only after checking the notes exist", () => {
    const publish = section("publish");
    expect(publish).toContain("needs: [build, plugin, test, flutter, compose, react-native, vue, svelte, angular, swiftui, swiftui-fixtures]");
    expect(publish).toContain('--notes-file "docs/releases/$GITHUB_REF_NAME.md" $pre');
    expect(publish).not.toContain("--generate-notes");
    expect(publish).toContain("cp THIRD-PARTY-NOTICES.txt dist/");
    expect(publish.indexOf('test -f "docs/releases/$GITHUB_REF_NAME.md"')).toBeGreaterThan(-1);
    expect(publish.indexOf('test -f "docs/releases/$GITHUB_REF_NAME.md"')).toBeLessThan(publish.indexOf("gh release create"));
  });

  const sh = Bun.which("sh");
  test.skipIf(!sh)("marks every tag below 1.0, and any tag with a suffix such as -rc.1, as a pre-release (final review)", () => {
    const line = section("publish").split("\n").find((l) => l.trim().startsWith('case "$GITHUB_REF_NAME"'));
    expect(line).toBeDefined();
    const pre = (tag: string) =>
      Bun.spawnSync([sh!, "-c", `pre=""\n${line!.trim()}\nprintf %s "$pre"`], { env: { ...process.env, GITHUB_REF_NAME: tag } }).stdout.toString();
    for (const tag of ["v0.1.0", "v0.2.0-rc.1", "v1.0.0-rc.1", "v1.2.3-beta.2"]) expect(`${tag}: ${pre(tag)}`).toBe(`${tag}: --prerelease`);
    for (const tag of ["v1.0.0", "v10.2.0"]) expect(`${tag}: ${pre(tag)}`).toBe(`${tag}: `);
  });

  test("gives each job only the access it needs: write only to publish and the plugins branch, the token only to the download step (final review)", () => {
    expect(wf.slice(0, wf.indexOf("\njobs:"))).toContain("permissions:\n  contents: read");
    expect(section("publish")).toContain("permissions:\n      contents: write");
    expect(section("plugins-branch")).toContain("permissions:\n      contents: write");
    expect(wf.split("contents: write").length - 1).toBe(2);
    const check = section("check");
    const download = check.slice(check.indexOf("- name: Download the plugin"), check.indexOf("- name: The zip matches"));
    expect(download).toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
    expect(check.split("GH_TOKEN").length - 1).toBe(1);
    expect(section("plugin")).toContain("persist-credentials: false");
  });

  test("checks the published release on Windows, macOS and Linux through the plugin's own bootstrap", () => {
    const check = section("check");
    expect(check).toContain("needs: publish");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(check).toContain(os);
    for (const s of [
      "gh release download", "--pattern motif-claude-code.zip", "--pattern SHA256SUMS", "sha256sum -c", "shasum -a 256 -c",
      "chmod a-x plugin/skills/motif/bin/motif", "sh plugin/skills/motif/bin/motif --version", "sh plugin/skills/motif/bin/motif doctor --json",
      "motif.cmd --version", "motif.cmd doctor --json", "MOTIF_HOME", "unset MOTIF_BIN",
    ]) expect(check).toContain(s);
  });

  test("builds the package for other agents and the skill archives, checks their versions, and keeps the branch's files for publishing", () => {
    const plugin = section("plugin");
    for (const s of [
      "bun run packages", "bun run skill:archives", "dist/agents/plugin.json", "dist/agents/gemini-extension.json",
      "tar -czf dist/plugins-tree.tar.gz -C dist/agents .", "dist/motif-skill.zip", "dist/motif-skill.tar.gz", "name: plugins-tree",
    ]) expect(plugin).toContain(s);
  });

  test("publishes the skill archives with the release, and the plugins branch only from its own artifact", () => {
    const publish = section("publish");
    expect(publish).toContain("pattern: motif-*");
    expect(publish).not.toContain("plugins-tree");
    const branch = section("plugins-branch");
    for (const s of [
      "needs: publish", "name: plugins-tree", 'tar -xzf plugins-tree/plugins-tree.tar.gz -C "$dir"',
      'commit -q -m "Motif $GITHUB_REF_NAME"', 'git -C "$dir" push origin "HEAD:refs/heads/plugins"', '"refs/tags/plugins-$GITHUB_REF_NAME"',
    ]) expect(branch).toContain(s);
  });

  test.skipIf(!sh)("moves the plugins branch only for a release without a suffix (review focus)", () => {
    const line = section("plugins-branch").split("\n").find((l) => l.trim().startsWith('case "$GITHUB_REF_NAME" in *-*)'));
    expect(line).toBeDefined();
    const moves = (tag: string) =>
      Bun.spawnSync([sh!, "-c", `${line!.trim()}\necho moved`], { env: { ...process.env, GITHUB_REF_NAME: tag } }).stdout.toString().includes("moved");
    expect([moves("v1.0.0-rc.1"), moves("v0.3.0-beta.2"), moves("v0.2.0"), moves("v1.0.0")]).toEqual([false, false, true, true]);
  });

  test("checks every agent's install from GitHub on Windows, macOS and Linux after publishing, without the token", () => {
    const agents = section("agents");
    expect(agents).toContain("needs: plugins-branch");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(agents).toContain(os);
    for (const s of [
      "@openai/codex@$CODEX", "@github/copilot@$COPILOT", "@google/gemini-cli@$GEMINI", "opencode-ai@$OPENCODE", "https://cursor.com/install",
      "bun scripts/agent-checks.ts --source github --doctor", "persist-credentials: false",
    ]) expect(agents).toContain(s);
    expect(agents).not.toContain("GH_TOKEN");
    expect(agents.match(/secrets\.\w+/g)).toEqual(["secrets.CURSOR_API_KEY"]);
    expect(agents.slice(agents.indexOf("- name: Each agent installs Motif from GitHub"))).toContain("MOTIF_CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}");
  });

  test("on Windows, passes the folders Cursor's installer adds to the user PATH on to the later steps (final review)", () => {
    const agents = section("agents");
    const step = agents.slice(agents.indexOf("- name: Install the Cursor CLI (Windows)"), agents.indexOf("- name: Each agent installs Motif from GitHub"));
    expect(step).toContain("[Environment]::GetEnvironmentVariable('Path', 'User')");
    expect(step).toContain("$env:GITHUB_PATH");
  });

  test("a failed plugins-branch push doesn't skip the Claude Code check, and the agents check waits for the branch (3A review)", () => {
    expect(section("check")).toContain("needs: publish");
    expect(section("agents")).toContain("needs: plugins-branch");
  });

  test("on CI's macOS machine, the release check leaves Cursor out: its CLI can't save its login there (v0.2.0 release)", () => {
    const agents = section("agents");
    expect(agents).toContain("runner.os == 'macOS' && '--skip cursor' || ''");
    expect(agents).toContain("- name: Install the Cursor CLI (Linux)");
    expect(agents).not.toContain("Install the Cursor CLI (macOS");
  });

  test("the agents checks can't hold a runner for hours (3A review)", () => {
    expect(section("agents")).toContain("timeout-minutes: 30");
    expect(readFileSync(join(REPO, ".github/workflows/agents.yml"), "utf8")).toContain("timeout-minutes: 30");
  });
});

describe("the agents workflow", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/agents.yml"), "utf8").replace(/\r\n/g, "\n");

  test("installs every agent's CLI without signing in and checks Motif installs in each, from the build", () => {
    for (const s of [
      "@openai/codex@$CODEX", "@github/copilot@$COPILOT", "@google/gemini-cli@$GEMINI", "opencode-ai@$OPENCODE",
      "bun run packages", "bun run skill:archives", "bun scripts/agent-checks.ts --source local",
    ]) expect(wf).toContain(s);
    // Cursor's CLI adds marketplaces only from a git URL, so it's checked after a release, from GitHub (second agents run).
    expect(wf).not.toContain("cursor.com/install");
    expect(wf).not.toContain("secrets.");
    expect(wf).toContain("permissions:\n  contents: read");
  });

  test("pins the agents' versions, and tries their latest versions every week", () => {
    expect(wf).toContain("cron:");
    expect(wf).toContain("github.event_name == 'schedule' && 'latest' || '0.163.0'");
  });
});

describe("each stack job and its heavy tests agree on its name", () => {
  // Each job that runs heavy tests: the stack its MOTIF_STACK_JOB names (what heavyStackTests reads), and its files. The
  // SwiftUI fixtures have a job of their own beside the swiftui job, with the same stack, to keep both within their time
  // (plan 2H, Task 12 follow-up).
  const HEAVY: Record<string, { stack: string; files: string[] }> = {
    compose: { stack: "compose", files: ["compose-compile", "compose-render", "compose-shot-e2e", "fixtures-compose", "compose-agp9", "compose-flavors", "compose-junit-platform"] },
    "react-native": { stack: "react-native", files: ["rn-compile", "rn-shot-e2e", "fixtures-rn"] },
    vue: { stack: "vue", files: ["vue-compile", "vue-shot-e2e", "fixtures-vue"] },
    svelte: { stack: "svelte", files: ["svelte-compile", "svelte-shot-e2e", "fixtures-svelte"] },
    angular: { stack: "angular", files: ["angular-compile", "angular-shot-e2e", "fixtures-angular"] },
    swiftui: { stack: "swiftui", files: ["swiftui-compile", "swiftui-guide-compile", "swiftui-render", "swiftui-shot-e2e", "swiftui-mac-shot-e2e"] },
    "swiftui-fixtures": { stack: "swiftui", files: ["fixtures-swiftui"] },
  };
  /** How long each of these jobs may run, in minutes. */
  const TIMEOUT: Record<string, number> = { swiftui: 75, "swiftui-fixtures": 45 };

  const workflow = (name: string) => readFileSync(join(REPO, ".github/workflows", name), "utf8").replace(/\r\n/g, "\n");
  /** Every job of a workflow by its id, with its body. */
  const jobsOf = (wf: string) => {
    const body = wf.slice(wf.indexOf("\njobs:\n"));
    const ids = [...body.matchAll(/\n {2}(\w[\w-]*):\n/g)];
    return ids.map((m, i) => ({ id: m[1]!, body: body.slice(m.index!, ids[i + 1]?.index ?? body.length) }));
  };
  /** The test files a job's bun test names (none for a job that runs every test). */
  const globsOf = (job: string) => {
    const run = job.split("\n").find((l) => l.includes("bun test")) ?? "";
    return run.split(/\s+/).filter((w) => w.startsWith("test/")).map((g) => new RegExp(`^${g.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`));
  };

  test("every heavy test is one of these: no other test file calls heavyStackTests", () => {
    const source = (f: string) => readFileSync(join(REPO, "cli/test", f), "utf8");
    const callers = readdirSync(join(REPO, "cli/test")).filter((f) => f.endsWith(".test.ts") && f !== "release.test.ts" && source(f).includes("heavyStackTests("));
    expect(callers.map((f) => f.replace(/\.test\.ts$/, "")).sort()).toEqual(Object.values(HEAVY).flatMap((j) => j.files).sort());
  });

  for (const [id, { stack, files }] of Object.entries(HEAVY)) {
    test(`MOTIF_STACK_JOB in both workflows' ${id} job is the stack name its heavy tests pass to heavyStackTests, and the job runs them`, () => {
      for (const f of files) expect([f, readFileSync(join(REPO, "cli/test", `${f}.test.ts`), "utf8").includes(`heavyStackTests("${stack}", `)]).toEqual([f, true]);
      for (const name of ["ci.yml", "release.yml"]) {
        const job = jobsOf(workflow(name)).find((j) => j.id === id)?.body ?? "";
        expect([name, id, job !== ""]).toEqual([name, id, true]);
        expect(job).toContain(`MOTIF_STACK_JOB: ${stack}\n`);
        // The SwiftUI jobs draw iOS and macOS apps, with several first builds (plan 2H, Tasks 9 and 12).
        if (TIMEOUT[id]) expect([name, id, job.includes(`timeout-minutes: ${TIMEOUT[id]}\n`)]).toEqual([name, id, true]);
        const globs = globsOf(job);
        for (const f of files) expect([name, f, globs.some((g) => g.test(`test/${f}.test.ts`))]).toEqual([name, f, true]);
      }
    });
  }

  test("in both workflows, every heavy test is run by exactly one job that names test files, the one above", () => {
    for (const name of ["ci.yml", "release.yml"]) {
      const jobs = jobsOf(workflow(name));
      for (const [id, { files }] of Object.entries(HEAVY)) {
        for (const f of files) {
          const runners = jobs.filter((j) => globsOf(j.body).some((g) => g.test(`test/${f}.test.ts`))).map((j) => j.id);
          expect([name, f, runners]).toEqual([name, f, [id]]);
        }
      }
    }
  });

  test("the svelte job fails on a Node older than 22.17 before its tests, so kit3-min can't skip there", () => {
    for (const name of ["ci.yml", "release.yml"]) {
      const job = jobsOf(workflow(name)).find((j) => j.id === "svelte")!.body;
      const gate = job.indexOf("SvelteKit 3 needs Node 22.17");
      expect([name, gate > 0, job.includes("process.versions.node"), job.includes("process.exit(1)")]).toEqual([name, true, true, true]);
      expect([name, gate < job.indexOf("- name: Svelte tests")]).toEqual([name, true]);
    }
  });

  test("the angular job fails on a Node outside Angular 22's range before its tests, so ng22-min can't skip there", () => {
    for (const name of ["ci.yml", "release.yml"]) {
      const job = jobsOf(workflow(name)).find((j) => j.id === "angular")!.body;
      const gate = job.indexOf("Angular 22 needs Node");
      expect([name, gate > 0, job.includes("process.versions.node"), job.includes("process.exit(1)"), job.includes("node-version: 24\n")]).toEqual([name, true, true, true, true]);
      expect([name, gate < job.indexOf("- name: Angular tests")]).toEqual([name, true]);
    }
  });

  test("the SwiftUI fixtures' job runs on the swiftui job's image with the same Xcode, and the release waits for it", () => {
    for (const name of ["ci.yml", "release.yml"]) {
      const jobs = jobsOf(workflow(name));
      const main = jobs.find((j) => j.id === "swiftui")!.body;
      const fixtures = jobs.find((j) => j.id === "swiftui-fixtures")!.body;
      for (const s of ["runs-on: macos-15\n", 'XCODE: "16.4"\n', "sudo xcode-select -s"]) {
        expect([name, s, main.includes(s), fixtures.includes(s)]).toEqual([name, s, true, true]);
      }
      expect(globsOf(fixtures).length).toBe(1);
    }
    expect(workflow("release.yml")).toMatch(/\n {2}publish:\n {4}needs: \[[^\]]*\bswiftui-fixtures\b/);
  });
});

describe("the release workflows are hardened (backlog)", () => {
  test("a tag publishes only after the tests pass", () => {
    const wf = readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
    expect(wf).toContain("\n  test:\n");
    expect(wf).toMatch(/\n  publish:\n    needs: \[build, plugin, test, flutter, compose, react-native, vue, svelte, angular, swiftui, swiftui-fixtures]/);
  });

  test("every action is pinned to a commit, with its version beside it", () => {
    for (const f of ["release.yml", "ci.yml", "agents.yml"]) {
      const wf = readFileSync(join(REPO, ".github/workflows", f), "utf8");
      for (const m of wf.matchAll(/uses: (\S+)(.*)/g)) expect(`${f}: ${m[1]}${m[2]}`).toMatch(/@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });
});

describe("vendored files are kept byte for byte (backlog)", () => {
  // With text=auto, a Windows checkout (core.autocrlf) turns axe.min.js's line ends into CRLF, so the tool built there
  // would embed different bytes from the one built on macOS or Linux.
  test("git never changes the line ends of anything in cli/vendor", () => {
    for (const f of ["cli/vendor/axe-core/axe.min.js", "cli/vendor/axe-core/LICENSE"]) {
      const out = Bun.spawnSync(["git", "check-attr", "text", "--", f], { cwd: REPO }).stdout.toString().trim();
      expect(out).toBe(`${f}: text: unset`);
    }
  });
});

describe("the README names what Motif's tool includes (backlog)", () => {
  test("axe-core at the version vendored, its licence and where its source is", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf8");
    // The version the vendored file says it is, so upgrading axe-core without the README fails here.
    const version = readFileSync(join(REPO, "cli/vendor/axe-core/axe.min.js"), "utf8").match(/^\/\*! axe v(\d+\.\d+\.\d+)/)![1];
    for (const s of [`axe-core ${version} (MPL-2.0)`, "THIRD-PARTY-NOTICES.txt", `github.com/dequelabs/axe-core/tree/v${version}`]) expect(readme).toContain(s);
  });
});

describe("the release's tests (review of batch G)", () => {
  test("run on every system the tool is built for, like CI", () => {
    const wf = readFileSync(join(REPO, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
    const test = wf.slice(wf.indexOf("\n  test:\n"), wf.indexOf("\n  build:\n"));
    expect(test).toContain("runs-on: ${{ matrix.os }}");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) expect(test).toContain(os);
  });
});

describe("keeping the pinned actions current", () => {
  test("Dependabot checks the workflows' actions every week", () => {
    const path = join(REPO, ".github/dependabot.yml");
    expect(existsSync(path)).toBe(true);
    const config = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    expect(config).toContain('package-ecosystem: "github-actions"');
    expect(config).toContain('interval: "weekly"');
  });
});

describe("the release gate on docs/parity.md (plan 2H's final review)", () => {
  const workflow = (name: string) => readFileSync(join(REPO, ".github/workflows", name), "utf8").replace(/\r\n/g, "\n");
  const TABLE = (swiftui: string) =>
    [
      "| Stack | Detect and set up | Theme code | Evals | Agents |",
      "|---|---|---|---|---|",
      "| React web | done | done | done | done |",
      `| SwiftUI | done | done | ${swiftui} | done |`,
    ].join("\n");

  test("the release's test step sets MOTIF_RELEASE=1, which runs the gate; ordinary CI doesn't", () => {
    const release = workflow("release.yml");
    const test = release.slice(release.indexOf("\n  test:"), release.indexOf("\n  flutter:"));
    expect(test).toMatch(/- name: Tests\n {8}working-directory: cli\n(?: {8}#[^\n]*\n)* {8}env:\n {10}MOTIF_RELEASE: "1"\n {8}run: bun test --timeout 300000\n/);
    expect(workflow("ci.yml")).not.toContain("MOTIF_RELEASE");
    expect(readFileSync(join(import.meta.dir, "release-gate.test.ts"), "utf8")).toContain('process.env.MOTIF_RELEASE === "1"');
  });

  test("a row with an area not done, or no row, keeps its stack from a release; a done row passes", () => {
    expect(parityGaps(TABLE("done"), ["react-web", "swiftui"])).toEqual([]);
    expect(parityGaps(TABLE("pending"), ["react-web", "swiftui"])).toEqual(["SwiftUI: Evals is pending."]);
    expect(parityGaps(TABLE("done"), ["flutter"])).toEqual(["Flutter has no row in docs/parity.md."]);
  });

  test("every supported stack has its row's name", () => {
    for (const id of ADAPTERS_AVAILABLE) expect([id, typeof PARITY_ROWS[id]]).toEqual([id, "string"]);
  });
});
