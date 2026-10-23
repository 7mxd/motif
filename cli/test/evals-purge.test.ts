import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectFolderName, removeProjectData, supportsPurge } from "../../tests/evals/purge";
import { cleanupTempDirs, tempDir } from "./tmp";

afterAll(cleanupTempDirs);

function home(...folders: string[]) {
  const h = tempDir("motif-purge-");
  for (const f of folders) {
    mkdirSync(join(h, ".claude", "projects", f), { recursive: true });
    writeFileSync(join(h, ".claude", "projects", f, "a.jsonl"), "{}");
  }
  return h;
}

describe("purge support", () => {
  test("read from claude purge --help; older versions print the main usage instead", () => {
    expect(supportsPurge("Usage: claude purge [options] [path]\n\nDelete all Claude Code state for a project\n  -y, --yes")).toBe(true);
    expect(supportsPurge("Usage: claude [options] [command] [prompt]\n\nClaude Code - starts an interactive session")).toBe(false);
  });
});

describe("the project's folder name", () => {
  test("every separator, colon and dot becomes a dash, as Claude Code names it", () => {
    expect(projectFolderName("/Users/ahmed/.motif-evals/run-1/b-search/app")).toBe("-Users-ahmed--motif-evals-run-1-b-search-app");
    expect(projectFolderName(String.raw`c:\Users\PC\GitHub\motif`)).toBe("c--Users-PC-GitHub-motif");
  });
});

describe("removing a case's transcripts without purge", () => {
  test("removes that one folder and nothing else", () => {
    const cwd = "/Users/ahmed/.motif-evals/run-1/b-search/app";
    const name = projectFolderName(cwd);
    const h = home(name, `${name}-2`, "other");
    expect(removeProjectData(h, cwd)).toBeUndefined();
    expect(existsSync(join(h, ".claude", "projects", name))).toBe(false);
    expect(existsSync(join(h, ".claude", "projects", `${name}-2`))).toBe(true);
    expect(existsSync(join(h, ".claude", "projects", "other", "a.jsonl"))).toBe(true);
  });

  test("a project with no saved data is fine", () => {
    const h = home("other");
    expect(removeProjectData(h, "/x/y")).toBeUndefined();
    expect(existsSync(join(h, ".claude", "projects", "other"))).toBe(true);
  });

  test("never the projects folder itself, or a folder above or beside it", () => {
    const h = home("other");
    // A path that names nothing (the root) would give an empty or dash-only name.
    for (const cwd of ["", "/"]) {
      removeProjectData(h, cwd);
      expect(existsSync(join(h, ".claude", "projects", "other", "a.jsonl"))).toBe(true);
    }
    expect(existsSync(join(h, ".claude", "projects"))).toBe(true);
  });

  test("a link in its place is left alone", () => {
    const h = home("other");
    const name = projectFolderName("/x/app");
    try {
      symlinkSync(join(h, ".claude", "projects", "other"), join(h, ".claude", "projects", name), "junction");
    } catch {
      return; // can't make links here
    }
    expect(removeProjectData(h, "/x/app")).toContain("left alone");
    expect(existsSync(join(h, ".claude", "projects", "other", "a.jsonl"))).toBe(true);
  });
});

describe("the folder under the path as given and under its real path (macOS: /tmp is /private/tmp)", () => {
  const cwd = "/tmp/motif-evals/run-1/app";
  const real = () => "/private/tmp/motif-evals/run-1/app";

  test("Claude Code saved it under the real path: that one is removed", () => {
    const h = home(projectFolderName("/private/tmp/motif-evals/run-1/app"), "other");
    expect(removeProjectData(h, cwd, real)).toBeUndefined();
    expect(existsSync(join(h, ".claude", "projects", projectFolderName("/private/tmp/motif-evals/run-1/app")))).toBe(false);
    expect(existsSync(join(h, ".claude", "projects", "other", "a.jsonl"))).toBe(true);
  });

  test("under both, both go; a real path that names nothing is ignored, and the guards hold", () => {
    const h = home(projectFolderName(cwd), projectFolderName(real()), "other");
    expect(removeProjectData(h, cwd, real)).toBeUndefined();
    expect(existsSync(join(h, ".claude", "projects", projectFolderName(cwd)))).toBe(false);
    expect(existsSync(join(h, ".claude", "projects", projectFolderName(real())))).toBe(false);
    const h2 = home(projectFolderName(cwd), "other");
    expect(removeProjectData(h2, cwd, () => "/")).toBeUndefined();
    expect(existsSync(join(h2, ".claude", "projects", projectFolderName(cwd)))).toBe(false);
    expect(existsSync(join(h2, ".claude", "projects", "other", "a.jsonl"))).toBe(true);
    const h3 = home("other");
    expect(removeProjectData(h3, cwd, () => { throw new Error("no such path"); })).toBeUndefined();
  });
});
