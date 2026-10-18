import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { motifHome } from "../src/home";

describe("motifHome", () => {
  test("defaults to ~/.motif", () => {
    expect(motifHome({})).toBe(join(homedir(), ".motif"));
  });
  test("an empty MOTIF_HOME counts as not set (backlog)", () => {
    expect(motifHome({ MOTIF_HOME: "" })).toBe(join(homedir(), ".motif"));
  });
  test("MOTIF_HOME wins", () => {
    expect(motifHome({ MOTIF_HOME: "/tmp/m" })).toBe("/tmp/m");
  });
});
