import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runValidate } from "../src/commands/validate";
import { checkProjectFontFiles, readProjectFonts, type ProjectFontFile } from "../src/contract/fonts";
import { copyFixture, docFrom, validTokens } from "./helpers";
import { cleanupTempDirs } from "./tmp";

afterAll(cleanupTempDirs);

const FILE: ProjectFontFile = { path: "assets/fonts/Thmanyah-Regular.woff2", weight: 400, style: "normal" };
const entry = (over: Record<string, unknown> = {}) => ({ family: "Thmanyah Sans", files: [FILE], ...over });

function withFonts(fonts: unknown) {
  const t = validTokens();
  t.$extensions = { ...(t.$extensions ?? {}), "dev.motif": { ...(t.$extensions?.["dev.motif"] ?? {}), fonts } };
  return t;
}
const read = (fonts: unknown) => readProjectFonts(docFrom(withFonts(fonts)));
const codes = (fonts: unknown) => read(fonts).findings.map((f) => f.code);

describe("readProjectFonts", () => {
  test("a guide with no fonts block has none", () => {
    expect(readProjectFonts(docFrom(validTokens()))).toEqual({ fonts: [], findings: [] });
  });
  test("reads a valid entry", () => {
    const r = read([entry()]);
    expect(r.findings).toEqual([]);
    expect(r.fonts).toEqual([{ family: "Thmanyah Sans", files: [FILE] }]);
  });
  test("bad-project-font: no family", () => expect(codes([entry({ family: "" })])).toContain("bad-project-font"));
  test("bad-project-font: no files", () => expect(codes([entry({ files: [] })])).toContain("bad-project-font"));
  test("bad-project-font: weight outside 100-900", () => {
    expect(codes([entry({ files: [{ ...FILE, weight: 950 }] })])).toContain("bad-project-font");
    expect(codes([entry({ files: [{ ...FILE, weight: 50 }] })])).toContain("bad-project-font");
  });
  test("bad-project-font: style", () => expect(codes([entry({ files: [{ ...FILE, style: "oblique" }] })])).toContain("bad-project-font"));
  test("bad-project-font: absolute path", () => {
    expect(codes([entry({ files: [{ ...FILE, path: "/etc/font.woff2" }] })])).toContain("bad-project-font");
    expect(codes([entry({ files: [{ ...FILE, path: "C:\fonts\a.woff2" }] })])).toContain("bad-project-font");
  });
});

function projectWithFont(file = FILE.path) {
  const dir = copyFixture();
  mkdirSync(join(dir, "assets/fonts"), { recursive: true });
  writeFileSync(join(dir, file), "x");
  return dir;
}
const usedDoc = () => {
  const t = withFonts([entry()]);
  t.primitive.font.sans.$value = ["Thmanyah Sans", "Inter", "sans-serif"];
  return docFrom(t);
};

describe("checkProjectFontFiles", () => {
  test("an existing file inside the project, family in use: no findings", () => {
    const doc = usedDoc();
    expect(checkProjectFontFiles(projectWithFont(), readProjectFonts(doc).fonts, doc)).toEqual([]);
  });
  test("missing-font-file names the path", () => {
    const f = checkProjectFontFiles(copyFixture(), [{ family: "A", files: [FILE] }]);
    expect(f.map((x) => x.code)).toEqual(["missing-font-file"]);
    expect(f[0]!.message).toContain(FILE.path);
  });
  test("font-outside-project", () => {
    const f = checkProjectFontFiles(copyFixture(), [{ family: "A", files: [{ ...FILE, path: "../secret.woff2" }] }]);
    expect(f.map((x) => x.code)).toEqual(["font-outside-project"]);
  });
  test("font-not-used is a warning", () => {
    const doc = docFrom(withFonts([entry()]));
    const f = checkProjectFontFiles(projectWithFont(), readProjectFonts(doc).fonts, doc);
    expect(f.map((x) => [x.code, x.severity])).toEqual([["font-not-used", "warning"]]);
  });
});

describe("motif validate", () => {
  test("reports a missing font file with its path", async () => {
    const dir = copyFixture();
    const p = join(dir, "design", "tokens.json");
    writeFileSync(p, JSON.stringify(withFonts([entry()]), null, 2));
    const r = await runValidate(dir);
    const f = (r.data.findings as any[]).find((x) => x.code === "missing-font-file");
    expect(f.message).toContain(FILE.path);
    expect(r.exitCode).toBe(1);
  });
});
