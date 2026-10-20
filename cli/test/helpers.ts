import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp";
import { loadTokenDocument } from "../src/contract/load";
import type { TokenDocument } from "../src/contract/types";
import { defaultDoctorDeps } from "../src/commands/doctor";
import { findAndroidSdk, findJava } from "../src/stacks/compose/doctor";

export const FIXTURES = join(import.meta.dir, "fixtures");

/** A fresh, mutable copy of the valid fixture tokens.json. */
export function validTokens(): any {
  return JSON.parse(readFileSync(join(FIXTURES, "contract/design/tokens.json"), "utf8"));
}

export function validDesignMd(): string {
  return readFileSync(join(FIXTURES, "contract/DESIGN.md"), "utf8");
}

/** Load a tokens object through the real loader; throws if the loader reports findings. */
export function docFrom(obj: unknown): TokenDocument {
  const { doc, findings } = loadTokenDocument("design/tokens.json", JSON.stringify(obj, null, 2));
  if (!doc || findings.length > 0) throw new Error(`fixture failed to load: ${JSON.stringify(findings)}`);
  return doc;
}

/** Copy the valid fixture project into a fresh temp folder. The name has a space on purpose. */
export function copyFixture(): string {
  const dir = tempDir("motif test ");
  cpSync(join(FIXTURES, "contract"), dir, { recursive: true });
  return dir;
}

/**
 * The fixture tokens with two variants (women default, men). In men: surface changes light and dark, border changes
 * light only (its dark value stays the base dark), and radius.md changes.
 */
export function twoVariantTokens(): any {
  const t = validTokens();
  t.$extensions = { ...(t.$extensions ?? {}), "dev.motif": { ...(t.$extensions?.["dev.motif"] ?? {}), variants: [{ id: "women", label: "Women", default: true }, { id: "men", label: "Men" }] } };
  const add = (role: any, variants: unknown) => {
    role.$extensions = { "dev.motif": { ...(role.$extensions?.["dev.motif"] ?? {}), variants } };
  };
  add(t.color.surface, { men: { value: hexColor("#123456"), dark: hexColor("#654321") } });
  add(t.color.border, { men: { value: hexColor("#ABCDEF"), dark: "{primitive.color.gray.700}" } });
  add(t.radius.md, { men: { value: { value: 12, unit: "px" } } });
  return t;
}

/** A DTCG colour value from a #RRGGBB string. */
export function hexColor(hex: string) {
  const n = (i: number) => Number((parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  return { colorSpace: "srgb", components: [n(1), n(3), n(5)], hex };
}

/**
 * The fixture tokens with two variants, default (the default) and partner, whose surface differs light and dark.
 * The id "default" is a Dart keyword, so it becomes defaultVariant in Dart.
 */
export function partnerTokens(): any {
  const t = validTokens();
  t.$extensions = { ...(t.$extensions ?? {}), "dev.motif": { ...(t.$extensions?.["dev.motif"] ?? {}), variants: [{ id: "default", label: "Default", default: true }, { id: "partner", label: "Partner" }] } };
  t.color.surface.$extensions = { "dev.motif": { ...t.color.surface.$extensions["dev.motif"], variants: { partner: { value: hexColor("#FFF7ED"), dark: hexColor("#1C1917") } } } };
  return t;
}

/** Tokens whose body font is Onest with Readex Pro as its Arabic companion. */
export function withCompanion(t: any): any {
  t.font.body.$value.fontFamily = ["Onest", "Readex Pro", "sans-serif"];
  return t;
}

let flutterFound: boolean | undefined;

/** True when the flutter command runs here. It runs flutter --version once and remembers the answer. */
export function hasFlutter(): boolean {
  if (flutterFound === undefined) {
    const path = Bun.which("flutter");
    try {
      flutterFound = path !== null && Bun.spawnSync([path, "--version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
    } catch {
      flutterFound = false;
    }
  }
  return flutterFound;
}

let android: { java: string; sdk: string } | null | undefined;

/**
 * The JDK and the Android SDK Motif would use here (found as motif doctor finds them), or null when either is missing.
 * It looks once and remembers the answer.
 */
export function androidToolchain(): { java: string; sdk: string } | null {
  if (android === undefined) {
    const deps = defaultDoctorDeps();
    const java = findJava(deps);
    const sdk = findAndroidSdk(join(FIXTURES, "compose-min"), { path: "app", stack: "compose", source: "detected" }, deps);
    android = java && sdk && existsSync(join(sdk, "platforms")) ? { java, sdk } : null;
  }
  return android;
}

/** True when a JDK and an Android SDK with platforms/ are here, so Gradle can build a Compose app. */
export function hasAndroid(): boolean {
  return androidToolchain() !== null;
}

/**
 * Whether a stack's heavy tests (npm ci on a fixture, starting a dev server) run here. They need the stack's toolchain,
 * and in CI they run only in that stack's own job, which sets MOTIF_STACK_JOB to the stack's name; the plain test job
 * runs on three operating systems that already have Node and Chrome, and would repeat them. Outside CI they run
 * whenever the toolchain is there. `reason` is the sentence for a skip message.
 */
export function heavyStackTests(stack: string, toolchainPresent: boolean): { run: boolean; reason: string } {
  const inCi = Boolean(process.env.CI) && process.env.CI !== "0" && process.env.CI !== "false";
  if (!toolchainPresent) return { run: false, reason: "the toolchain isn't installed" };
  if (inCi && process.env.MOTIF_STACK_JOB !== stack) return { run: false, reason: `runs in CI's ${stack} job` };
  return { run: true, reason: "" };
}
