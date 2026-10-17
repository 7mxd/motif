import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    expect(publish).toContain("needs: [build, plugin]");
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

  test("gives each job only the access it needs: write only to publish, the token only to the download step (final review)", () => {
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

  test("the agents checks can't hold a runner for hours (3A review)", () => {
    expect(section("agents")).toContain("timeout-minutes: 30");
    expect(readFileSync(join(REPO, ".github/workflows/agents.yml"), "utf8")).toContain("timeout-minutes: 30");
  });
});

describe("the agents workflow", () => {
  const wf = readFileSync(join(REPO, ".github/workflows/agents.yml"), "utf8").replace(/\r\n/g, "\n");

  test("installs every agent's CLI without signing in and checks Motif installs in each, from the build", () => {
    for (const s of [
      "@openai/codex@$CODEX", "@github/copilot@$COPILOT", "@google/gemini-cli@$GEMINI", "opencode-ai@$OPENCODE", "https://cursor.com/install",
      "bun run packages", "bun run skill:archives", "bun scripts/agent-checks.ts --source local",
    ]) expect(wf).toContain(s);
    // Its one secret is a Cursor key, given only to the check step, which hands it to Cursor's CLI alone.
    expect(wf.match(/secrets\.\w+/g)).toEqual(["secrets.CURSOR_API_KEY"]);
    expect(wf.slice(wf.indexOf("- name: Each agent installs Motif from the build"))).toContain("MOTIF_CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}");
    expect(wf).toContain("permissions:\n  contents: read");
  });

  test("pins the agents' versions, and tries their latest versions every week", () => {
    expect(wf).toContain("cron:");
    expect(wf).toContain("github.event_name == 'schedule' && 'latest' || '0.163.0'");
  });
});
