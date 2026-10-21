// Measures what a finished case left behind: the motif tool's checks, the build and the type check (on a plain site, the page in a browser; on Flutter,
// flutter analyze and the page as Flutter draws it; on React Native, tsc and the page as Expo's web target draws it), what the session changed,
// and for test C the review report, graded against the seeded list (match.ts) and by the model grader (judge.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, posix } from "node:path";
import { REQUIRED_SECTIONS } from "../../cli/src/contract/design-md";
import { discoverRoutes } from "../../cli/src/stacks/react-web/routes";
import { detectApps, siteDir } from "../../cli/src/detect/stacks";
import { discoverPlainRoutes } from "../../cli/src/stacks/plain-web/routes";
import { maskComments, maskStrings } from "../../cli/src/check/mask";
import { discoverFlutterRoutes } from "../../cli/src/stacks/flutter/routes";
import { defaultDoctorDeps } from "../../cli/src/commands/doctor";
import { findAndroidSdk, gradleJava } from "../../cli/src/stacks/compose/doctor";
import { gradleProjectPath, gradleTaskCommand } from "../../cli/src/stacks/compose/harness";
import { discoverComposeScreens, previewSlug, type Preview } from "../../cli/src/stacks/compose/screens";
import { discoverExpoRoutes } from "../../cli/src/stacks/react-native/routes";
import { isCompose, isFlutter, isPlain, isReactNative, type EvalCase } from "./cases";
import { gradeB, gradeC, gradeD, type BFacts, type CFacts, type CheckFacts, type CmdFacts, type DFacts, type Grade, type ScreenFacts, type ValidateFacts } from "./grade";
import { Paused, type JudgeFn, type JudgeInput, type JudgeVerdict } from "./judge";
import { gradeExact, parseReport, type SeededIssue } from "./match";
import { packageManager, withoutProviderKeys, type Motif, type MotifResult, type Run } from "./tools";
import { changes, findApp, patch, type Workspace } from "./workspace";

/** The JDK and Android SDK a Gradle run uses, or why there is none. */
export type AndroidTools = { java: string; javaHome: string; sdk?: string } | { problem: string };

export interface Collectors {
  run: Run; motif: Motif; judge: JudgeFn;
  /** Compose: the JDK and SDK for Gradle; found as motif doctor finds them when not given (tests give a fake). */
  android?: () => AndroidTools;
}

const FIXTURES = join(import.meta.dir, "..", "fixtures");

const save = (out: string, name: string, data: unknown) => writeFileSync(join(out, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));

const checkFacts = (r: MotifResult): CheckFacts =>
  r.json?.summary ? { violations: r.json.summary.violations, exceptions: r.json.summary.exceptions, warnings: r.json.summary.warnings } : { error: String(r.json?.error ?? r.output) };

const validateFacts = (r: MotifResult): ValidateFacts =>
  r.json?.summary
    ? { errors: r.json.summary.errors, warnings: r.json.summary.warnings, missingSections: (r.json.findings ?? []).filter((x: any) => x.code === "missing-section").map((x: any) => String(x.message)) }
    : { error: String(r.json?.error ?? r.output) };

async function motifJson(k: Collectors, args: string[], cwd: string, out: string, name: string, timeoutMs?: number): Promise<MotifResult> {
  const r = await k.motif(args, cwd, timeoutMs);
  save(out, name, r.json ?? { output: r.output });
  return r;
}

async function buildAndTypecheck(dir: string, k: Collectors, out: string): Promise<{ build: CmdFacts; typecheck: CmdFacts }> {
  const build = await k.run([packageManager(dir), "run", "build"], dir, 900_000);
  save(out, "build.log", `${build.stdout}\n${build.stderr}`);
  const typecheck = await k.run(["npx", "--no", "tsc", "--noEmit"], dir, 600_000);
  save(out, "typecheck.log", `${typecheck.stdout}\n${typecheck.stderr}`);
  return { build: { code: build.code, timedOut: build.timedOut }, typecheck: { code: typecheck.code, timedOut: typecheck.timedOut } };
}

/**
 * A Flutter app's type check: its packages got again (the session may have added some, and flutter pub get also writes
 * the translations), then flutter analyze, where infos don't fail it but warnings and errors do. When the packages
 * can't be got, the type check fails and says so: analyzing without them proves nothing.
 */
async function flutterAnalyze(dir: string, k: Collectors, out: string): Promise<CmdFacts> {
  const pub = await k.run(["flutter", "pub", "get"], dir, 900_000);
  save(out, "pub-get.log", `${pub.stdout}\n${pub.stderr}`);
  const analyze = await k.run(["flutter", "analyze", "--no-fatal-infos"], dir, 900_000);
  save(out, "analyze.log", `${analyze.stdout}\n${analyze.stderr}`);
  if (pub.code !== 0 || pub.timedOut) {
    return { code: pub.code || 1, timedOut: pub.timedOut, command: "flutter analyze", detail: "flutter pub get failed (see pub-get.log), so the type check couldn't run properly." };
  }
  return { code: analyze.code, timedOut: analyze.timedOut, command: "flutter analyze" };
}

/** What a Compose app's type check is called in the details and the grade. */
const COMPOSE_TYPECHECK = "./gradlew :app:compileDebugKotlin";

/** The module a Compose project's app is in: its detected one, else app/. */
const composeModule = (dir: string): string => detectApps(dir).apps.find((a) => a.stack === "compose")?.path ?? "app";

/** The JDK and SDK as motif doctor finds them on this computer. */
function androidTools(dir: string): AndroidTools {
  const deps = defaultDoctorDeps();
  const java = gradleJava(deps);
  if ("problem" in java) return java;
  const sdk = findAndroidSdk(dir, { path: ".", stack: "compose", source: "detected" }, deps);
  return { ...java, ...(sdk ? { sdk } : {}) };
}

/**
 * A Compose app's type check: its Kotlin compiled with Gradle (the wrapper's jar started with the JDK doctor chooses,
 * as motif shot does, since gradlew.bat breaks on some paths). When there's no JDK, SDK or wrapper, it fails and says so.
 */
async function composeCompile(dir: string, k: Collectors, out: string): Promise<CmdFacts> {
  const failed = (detail: string): CmdFacts => ({ code: 1, command: COMPOSE_TYPECHECK, detail });
  const tools: AndroidTools = k.android ? k.android() : androidTools(dir);
  if ("problem" in tools) return failed(tools.problem);
  if (!existsSync(join(dir, "gradle", "wrapper", "gradle-wrapper.jar"))) {
    return failed("There's no Gradle wrapper (gradle/wrapper/gradle-wrapper.jar), so the app couldn't be compiled.");
  }
  const env: Record<string, string | undefined> = { ...withoutProviderKeys(process.env), JAVA_HOME: tools.javaHome };
  // The SDK doctor chose already prefers ANDROID_HOME, so it is passed as is: one answer to which SDK builds the app.
  if (tools.sdk) env.ANDROID_HOME = tools.sdk;
  const task = `${gradleProjectPath(dir, join(dir, composeModule(dir)))}:compileDebugKotlin`;
  const r = await k.run(gradleTaskCommand(tools.java, [task, "--console=plain"], env), dir, 1_800_000, env);
  save(out, "compile.log", `${r.stdout}\n${r.stderr}`);
  return { code: r.code, timedOut: r.timedOut, command: COMPOSE_TYPECHECK };
}

/**
 * An Expo app's type check: tsc over the app as it is (the session may have added packages, which it installed itself).
 * It has no build: Expo's web target is drawn by motif shot.
 */
async function rnTypecheck(dir: string, k: Collectors, out: string): Promise<CmdFacts> {
  const tsc = await k.run(["npx", "tsc", "--noEmit"], dir, 600_000);
  save(out, "typecheck.log", `${tsc.stdout}\n${tsc.stderr}`);
  return { code: tsc.code, timedOut: tsc.timedOut, command: "tsc" };
}

/** motif shot's sizes for a Flutter, Compose or Expo app: one phone, so each screen is drawn once per scheme rather than at every native size. */
const PHONE_SIZES = ["--sizes", "390"];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Next's route files, tests and stories aren't components; any other .tsx or .jsx file under src/ may be, wherever it sits. */
const ROUTE_FILES = new Set(["page", "layout", "loading", "error", "global-error", "not-found", "template", "default", "route", "opengraph-image", "twitter-image", "icon", "apple-icon"]);
const isComponentFile = (path: string) =>
  /^src\/.+\.(tsx|jsx)$/.test(path) && !/\.(test|spec|stories|d)\.(tsx|jsx)$/.test(path) && !ROUTE_FILES.has(basename(path, extname(path)));

/** A file in a diff; `after` is its hunks as they read after the change (context and added lines). */
interface DiffFile { path: string; isNew: boolean; deleted: boolean; added: string[]; removed: string[]; after: string[]; text: string }

/** A diff's files: whether each is new, and the lines it adds and removes, line endings dropped. */
function diffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let inHunk = false;
  for (const raw of diff.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const head = /^diff --git a\/.+? b\/(.+)$/.exec(line);
    if (head) {
      file = { path: head[1]!, isNew: false, deleted: false, added: [], removed: [], after: [], text: line };
      files.push(file);
      inHunk = false;
      continue;
    }
    if (!file) continue;
    file.text += `\n${line}`;
    if (!inHunk) {
      if (line.startsWith("new file mode")) file.isNew = true;
      if (line.startsWith("deleted file mode")) file.deleted = true;
      if (line.startsWith("@@")) inHunk = true;
    } else if (line.startsWith("+")) {
      file.added.push(line.slice(1));
      file.after.push(line.slice(1));
    } else if (line.startsWith("-")) file.removed.push(line.slice(1));
    else if (line.startsWith(" ")) file.after.push(line.slice(1));
    else if (line.startsWith("@@")) file.after.push("");
  }
  return files;
}

/** The lines a diff really adds to a file: one it also removes (the same text, saved with other line endings) isn't added. */
function reallyAdded(f: DiffFile): string[] {
  const gone = new Set(f.removed);
  return f.added.filter((l) => !gone.has(l));
}

/**
 * Which of these names the lines a session added to DESIGN.md mention, written as they are (a recorded design guide
 * change). "the checkout's delivery slots" doesn't record Checkout.
 */
export function recordedIn(diff: string, names: string[]): string[] {
  const guide = diffFiles(diff).filter((f) => f.path === "DESIGN.md").flatMap(reallyAdded).join("\n");
  return names.filter((n) => new RegExp(`(?<![\\w-])${escapeRegExp(n)}(?![\\w-])`).test(guide));
}

/** The tags a file renders: not a context it creates (<Ctx value>, <Ctx.Provider>), and not a type argument (useState<T>). */
function renderedTags(text: string): string[] {
  const contexts = new Set([...text.matchAll(/(\w+)\s*=\s*createContext\b/g)].map((m) => m[1]!));
  return [...text.matchAll(/(?<![\w)\].])<([A-Za-z][\w.]*)/g)].map((m) => m[1]!).filter((t) => !contexts.has(t.split(".")[0]!));
}

/** The app's own components a file imports: from a components folder, not its icons, and not one this change adds. */
function sharedImports(path: string, text: string, added: Set<string>): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/^\s*import\s+(?!type\s)[^;]*?\sfrom\s+["']([^"']+)["']/gm)) {
    const spec = m[1]!;
    const target = /^[@~]\//.test(spec) ? `src/${spec.slice(2)}` : spec.startsWith(".") ? posix.join(posix.dirname(path), spec) : null;
    const name = target ? /(?:^|\/)components\/([^/]+)$/.exec(target)?.[1] : undefined;
    if (!target || !name || /^icons?$/i.test(name)) continue;
    if (added.has(target) || [".tsx", ".jsx", ".ts", ".js"].some((x) => added.has(`${target}${x}`))) continue;
    names.push(name);
  }
  return names;
}

export interface ReactComponents {
  /** New components: they count against the limit unless the design guide records them. */
  newComponents: string[];
  /** Files in a route folder built from the app's own components: part of that screen. */
  screenParts: string[];
  /** Files that draw nothing, such as state shared through a context. */
  notUi: string[];
}

/** React web's new components, from the session's diff: new .tsx and .jsx files under src/, minus a screen's own parts and files that draw no UI. */
export function reactComponents(diff: string): ReactComponents {
  const files = diffFiles(diff).filter((f) => f.isNew);
  const added = new Set(files.map((f) => f.path));
  const found: ReactComponents = { newComponents: [], screenParts: [], notUi: [] };
  for (const f of files) {
    if (!isComponentFile(f.path)) continue;
    const name = basename(f.path, extname(f.path));
    const text = f.added.join("\n");
    if (renderedTags(text).length === 0) found.notUi.push(name);
    else if (f.path.startsWith("src/app/") && sharedImports(f.path, text, added).length > 0) found.screenParts.push(name);
    else found.newComponents.push(name);
  }
  return found;
}

/** The widget classes Flutter's components extend: plain Flutter, Riverpod and flutter_hooks. */
const WIDGET_BASES = ["StatelessWidget", "StatefulWidget", "ConsumerWidget", "ConsumerStatefulWidget", "HookWidget", "StatefulHookWidget", "HookConsumerWidget", "StatefulHookConsumerWidget"];
const WIDGET_CLASS = new RegExp(`\\bclass\\s+(\\w+)(?:\\s*<[^{]*?>)?\\s+extends\\s+(?:${WIDGET_BASES.join("|")})\\b`, "g");
const widgetClasses = (text: string) => [...text.matchAll(WIDGET_CLASS)].map((m) => m[1]!);

const OPENS = "([{";
const CLOSES = ")]}";

/** Where the bracket at `open` closes in masked code (its end when it never does). */
function closeOf(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (OPENS.includes(s[j]!)) depth++;
    else if (CLOSES.includes(s[j]!) && --depth === 0) return j;
  }
  return s.length;
}

/** Where a named argument's value ends: the next comma at its own depth, or the end of the argument list. */
function valueEnd(s: string, from: number, end: number): number {
  let depth = 0;
  for (let j = from; j < end; j++) {
    if (OPENS.includes(s[j]!)) depth++;
    else if (CLOSES.includes(s[j]!)) depth--;
    else if (s[j] === "," && depth === 0) return j;
  }
  return end;
}

/**
 * The widget a route's builder returns: what follows its => or each return in its block; for a pageBuilder, the
 * child of the page it makes.
 */
function shownBy(value: string, page: boolean): string[] {
  const head = /^\s*\([^)]*\)\s*(=>|\{)/.exec(value);
  if (!head) return [];
  const body = value.slice(head[0].length);
  const results = head[1] === "=>" ? [body] : [...body.matchAll(/\breturn\b/g)].map((m) => body.slice(m.index! + m[0].length));
  return results.flatMap((r) => {
    const m = page ? /^[^;]*?\bchild\s*:\s*(?:const\s+)?([A-Z]\w*)\s*\(/.exec(r) : /^\s*(?:const\s+)?([A-Z]\w*)\s*\(/.exec(r);
    return m ? [m[1]!] : [];
  });
}

/**
 * The widgets a go_router route shows: what a GoRoute's builder or pageBuilder returns, or a ShellRoute's pageBuilder
 * (its builder, like Maktaba's AppShell, makes the app's navigation, a component). Builders of other widgets
 * (LayoutBuilder, FutureBuilder, AnimatedBuilder, an item builder) show no page. Read from the session's view of the
 * changed code (its added lines and their context), with comments and strings masked.
 */
function routedWidgets(text: string): Set<string> {
  const s = maskStrings(maskComments(text, "dart"), "dart");
  const names = new Set<string>();
  for (const call of s.matchAll(/\b(GoRoute|ShellRoute)\s*\(/g)) {
    const open = call.index! + call[0].length - 1;
    const close = closeOf(s, open);
    let depth = 0;
    for (let j = open; j < close; j++) {
      const c = s[j]!;
      if (OPENS.includes(c)) depth++;
      else if (CLOSES.includes(c)) depth--;
      else if (depth === 1 && /[a-z]/.test(c) && !/[\w$]/.test(s[j - 1] ?? "")) {
        // One of the route's own named arguments.
        const key = /^(builder|pageBuilder)\s*:/.exec(s.slice(j, j + 20));
        if (!key || (call[1] === "ShellRoute" && key[1] !== "pageBuilder")) continue;
        const from = j + key[0].length;
        const to = valueEnd(s, from, close);
        for (const name of shownBy(s.slice(from, to), key[1] === "pageBuilder")) names.add(name);
        j = to - 1;
      }
    }
  }
  return names;
}

export interface FlutterComponents {
  /** New public widget classes under lib/: they count against the limit unless the design guide records them. */
  newComponents: string[];
  /** Widgets a route shows: the page itself, as a React route file is. */
  screens: string[];
  /** Private widget classes (_Name): a screen's or a component's own parts. */
  screenParts: string[];
}

/**
 * Flutter's new components, from the session's diff: public classes it adds under lib/ that extend a widget class,
 * minus the pages routes show. lib/design/ (Motif's theme code) and generated files never count, and a class the
 * diff also removes (moved or renamed in place) isn't new.
 */
export function flutterComponents(diff: string): FlutterComponents {
  const all = diffFiles(diff);
  const removed = new Set(all.flatMap((f) => widgetClasses(f.removed.join("\n"))));
  const kept = all.filter((f) => !f.deleted);
  // A changed route comes with its context lines, so its GoRoute( is there even when the session changed only its builder.
  const routed = new Set(kept.flatMap((f) => [...routedWidgets(f.after.join("\n"))]));
  const found: FlutterComponents = { newComponents: [], screens: [], screenParts: [] };
  const seen = new Set<string>();
  for (const f of kept) {
    if (!/^lib\/.+\.dart$/.test(f.path) || f.path.startsWith("lib/design/") || /\.(g|freezed)\.dart$/.test(f.path)) continue;
    for (const name of widgetClasses(reallyAdded(f).join("\n"))) {
      if (removed.has(name) || seen.has(name)) continue;
      seen.add(name);
      if (name.startsWith("_")) found.screenParts.push(name);
      else if (routed.has(name)) found.screens.push(name);
      else found.newComponents.push(name);
    }
  }
  return found;
}

export interface ComposeComponents {
  /** New public @Composable functions under ui/: they count against the limit unless the design guide records them. */
  newComponents: string[];
  /** A screen's entry point (*Screen) and the stateless *Content beside it. */
  screens: string[];
  /** Private @Composable functions: a screen's or a component's own parts. */
  screenParts: string[];
}

const KOTLIN_FUN =
  /^((?:@[\w.]+(?:\([^)]*\))?\s*)*)((?:(?:public|private|internal|protected|inline|actual|expect|override)\s+)*)fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?, ]+?\.)?([A-Za-z_]\w*)\s*\(/;
const KOTLIN_FUN_NAME = /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.<>?, ]+?\.)?([A-Za-z_]\w*)\s*\(/;

interface ComposableFun { name: string; isPrivate: boolean; isPreview: boolean }

/** The @Composable functions declared in some Kotlin lines, with comments and strings masked. */
function composableFuns(lines: string[]): ComposableFun[] {
  const found: ComposableFun[] = [];
  let pending = "";
  for (const raw of maskStrings(maskComments(lines.join("\n"), "kotlin"), "kotlin").split("\n")) {
    const t = raw.trim();
    // An annotation's arguments may run over several lines.
    if (pending && (pending.match(/\(/g) ?? []).length > (pending.match(/\)/g) ?? []).length) {
      pending += ` ${t}`;
      continue;
    }
    const m = KOTLIN_FUN.exec(t);
    if (m) {
      const annotations = `${pending} ${m[1]}`;
      if (/@Composable\b/.test(annotations)) {
        found.push({ name: m[3]!, isPrivate: /\bprivate\b/.test(m[2]!), isPreview: /@Preview\b/.test(annotations) || /Preview$/.test(m[3]!) });
      }
      pending = "";
    } else pending = t.startsWith("@") ? `${pending} ${t}` : "";
  }
  return found;
}

/**
 * Compose's new components, from the session's diff: public @Composable functions it adds under ui/, minus previews and
 * a screen's entry point (*Screen, and the *Content beside it in the same file). Private ones are a screen's parts. The
 * generated theme (ui/motif/, or a file that starts with Motif's header) never counts, and a function the diff also
 * removes (moved or renamed in place) isn't new.
 */
export function composeComponents(diff: string): ComposeComponents {
  const all = diffFiles(diff);
  const removed = new Set(all.flatMap((f) => f.removed.flatMap((l) => KOTLIN_FUN_NAME.exec(l)?.[1] ?? [])));
  const found: ComposeComponents = { newComponents: [], screens: [], screenParts: [] };
  const seen = new Set<string>();
  for (const f of all) {
    if (f.deleted || !/(^|\/)ui\/.+\.kt$/.test(f.path) || /(^|\/)src\/(test|androidTest)\//.test(f.path) || /(^|\/)ui\/motif\//.test(f.path)) continue;
    if (reallyAdded(f)[0]?.startsWith("// Generated by Motif")) continue;
    const funs = composableFuns(reallyAdded(f));
    const entries = new Set(funs.filter((x) => !x.isPrivate && !x.isPreview && x.name.endsWith("Screen")).map((x) => x.name));
    for (const fun of funs) {
      if (fun.isPreview || removed.has(fun.name) || seen.has(fun.name)) continue;
      seen.add(fun.name);
      if (fun.isPrivate) found.screenParts.push(fun.name);
      else if (entries.has(fun.name) || (fun.name.endsWith("Content") && entries.has(`${fun.name.slice(0, -"Content".length)}Screen`))) found.screens.push(fun.name);
      else found.newComponents.push(fun.name);
    }
  }
  return found;
}

export interface RnComponents {
  /** New exported function components under components/: they count against the limit unless the design guide records them. */
  newComponents: string[];
  /** The default export of a new route file under app/: the page itself, as a React route file is (an anonymous one is named by its file). */
  screens: string[];
  /** Private components (and extra exports) in a route file, and private ones in a components file: a screen's or a component's own parts. */
  screenParts: string[];
  /** Capitalised functions that draw nothing, and a new route layout (navigation). */
  notUi: string[];
}

interface Decl { name: string; exported: boolean; isDefault: boolean; draws: boolean }

/** The top-level functions with a component's name (capitalised) in code, and whether each is exported and draws any JSX. */
function declarations(code: string): Decl[] {
  const text = maskComments(code, "script");
  const found: { name: string; exported: boolean; isDefault: boolean; at: number }[] = [];
  const decl = /^(export\s+(default\s+)?)?(?:async\s+)?(?:function\s*\*?\s*([A-Z]\w*)\s*[(<]|(?:const|let|var)\s+([A-Z]\w*)\s*(?::[^=\n]+)?=(?=\s*(?:async\s+)?(?:\(|[A-Za-z_$][\w$]*\s*=>|function\b|(?:React\.)?(?:memo|forwardRef)\s*[(<])))/gm;
  for (const m of text.matchAll(decl)) found.push({ name: (m[3] ?? m[4])!, exported: Boolean(m[1]), isDefault: Boolean(m[2]), at: m.index! });
  const defaulted = new Set([...text.matchAll(/^export\s+default\s+([A-Z]\w*)\s*;?\s*$/gm)].map((m) => m[1]!));
  return found.map((d, i) => ({
    name: d.name, exported: d.exported || defaulted.has(d.name), isDefault: d.isDefault || defaulted.has(d.name),
    draws: renderedTags(text.slice(d.at, found[i + 1]?.at ?? text.length)).length > 0,
  }));
}

const isTestFile = (path: string) => /\.(test|spec|stories|d)\.(tsx|jsx)$/.test(path);

/**
 * An Expo app's new components, from the session's diff: exported function components the session adds under
 * components/ (the app's shared ones), minus those it moved. A route file under app/ is a screen: its default export is
 * the page itself, and its other components are parts of it. The generated theme (design/), state files and tests
 * never count, and a capitalised function that draws no JSX is not UI.
 */
export function rnComponents(diff: string): RnComponents {
  const files = diffFiles(diff).filter((f) => !f.deleted && /\.(tsx|jsx)$/.test(f.path) && !isTestFile(f.path));
  const removed = new Set(diffFiles(diff).filter((f) => /\.(tsx|jsx)$/.test(f.path)).flatMap((f) => declarations(f.removed.join("\n")).map((d) => d.name)));
  const found: RnComponents = { newComponents: [], screens: [], screenParts: [], notUi: [] };
  const seen = new Set<string>();
  const add = (list: string[], name: string) => {
    if (!seen.has(name)) {
      seen.add(name);
      list.push(name);
    }
  };
  for (const f of files) {
    const inComponents = /^(?:src\/)?components\/.+\.(tsx|jsx)$/.test(f.path);
    const inApp = /^(?:src\/)?app\/.+\.(tsx|jsx)$/.test(f.path);
    if (!inComponents && !inApp) continue;
    const added = reallyAdded(f).join("\n");
    const file = basename(f.path, extname(f.path));
    if (inApp && file === "_layout") {
      if (f.isNew) add(found.notUi, file);
      continue;
    }
    for (const d of declarations(added)) {
      if (removed.has(d.name)) continue;
      if (!d.draws) add(found.notUi, d.name);
      else if (inComponents) add(d.exported ? found.newComponents : found.screenParts, d.name);
      else if (d.isDefault && f.isNew) add(found.screens, d.name);
      else if (!d.isDefault) add(found.screenParts, d.name);
    }
    // A new route file whose default export has no name of its own.
    if (inApp && f.isNew && !declarations(added).some((d) => d.isDefault) && /^export\s+default\b/m.test(maskComments(added, "script"))) add(found.screens, file);
  }
  return found;
}

/** A plain site's new components, from the session's diff of its pages and stylesheets. */
const plainComponents = (diff: string, existing: Set<string>) =>
  addedComponents(diffFiles(diff).filter((f) => !f.deleted && /\.(css|html?)$/i.test(f.path)).map((f) => f.text).join("\n"), existing);

/** The components a plain fixture already has: the names on its own "Component:" lines. */
export function fixtureComponents(fixture: string, root = join(import.meta.dir, "..", "fixtures")): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(path);
      } else if (/\.(css|html?)$/i.test(entry.name)) {
        for (const m of readFileSync(path, "utf8").matchAll(/Component:\s*([A-Za-z][\w-]*)/g)) names.add(m[1]!);
      }
    }
  };
  if (existsSync(join(root, fixture))) walk(join(root, fixture));
  return names;
}

/** A B case's new components, and which the design guide records, from the session's diff (also used by --regrade). */
export function componentFacts(c: EvalCase, diff: string): Pick<BFacts, "newComponents" | "recorded" | "screenParts" | "notUi" | "screens"> {
  const found = isCompose(c) ? composeComponents(diff) : isFlutter(c) ? flutterComponents(diff) : isReactNative(c) ? rnComponents(diff) : isPlain(c) ? { newComponents: plainComponents(diff, fixtureComponents(c.fixture!)) } : reactComponents(diff);
  return { ...found, recorded: recordedIn(diff, found.newComponents) };
}

/**
 * A plain site's new components: names on "Component:" lines the diff adds, minus those it only rewrote (a new variant)
 * and those the site already had.
 */
export function addedComponents(diff: string, existing: Set<string> = new Set()): string[] {
  const named = (sign: "+" | "-") =>
    new Set(diff.split("\n").filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3))).flatMap((l) => [...l.matchAll(/Component:\s*([A-Za-z][\w-]*)/g)].map((m) => m[1]!)));
  const before = named("-");
  return [...named("+")].filter((n) => !before.has(n) && !existing.has(n));
}

/** A plain site's folder of pages, as Motif finds it. */
function plainSite(app: string): string {
  const site = detectApps(app).apps.find((a) => a.stack === "plain-web");
  return site ? join(app, siteDir(app, site)) : app;
}

/** The feature's page as motif shot draws it (in a browser, or by Flutter): its status and how many errors it threw. */
async function renderFacts(k: Collectors, app: string, route: string, out: string, extra: string[] = [], screen?: string, timeoutMs = 900_000): Promise<ScreenFacts | { error: string }> {
  const key = screen ?? route;
  const shot = await motifJson(k, ["shot", ...(screen ? ["--screen", screen] : ["--routes", route]), ...extra], app, out, "shot.json", timeoutMs);
  const r = Array.isArray(shot.json?.routes) ? shot.json.routes.find((x: any) => x.route === key) : undefined;
  if (!r) return { error: String(shot.json?.error ?? `${key} wasn't captured`) };
  return { route: key, status: Number(r.status ?? 0), pageErrors: Array.isArray(r.pageErrors) ? r.pageErrors.length : 0 };
}

/** The @Preview that stands for a route: /reminders is RemindersPreview or RemindersScreenPreview. */
function previewFor(previews: Preview[], route: string): Preview | undefined {
  const slug = route.replace(/^\/+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return slug ? previews.find((p) => [slug, `${slug}-screen`].includes(previewSlug(p.name))) : undefined;
}

/** A Compose screen exists when its route, or a preview named for it, is among the app's screens; it is drawn by whichever it has. */
function composeScreen(app: string, route: string): { exists: boolean; preview?: string } {
  const found = discoverComposeScreens(join(app, composeModule(app)));
  if (found.routes.includes(route)) return { exists: true };
  const preview = previewFor(found.previews, route);
  return preview ? { exists: true, preview: preview.name } : { exists: false };
}

export async function collectB(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<BFacts> {
  mkdirSync(out, { recursive: true });
  const route = c.routes[0]!;
  // What changed is read before the build, which may touch files of its own.
  const diff = await patch(ws, k.run);
  save(out, "diff.patch", diff);
  const plain = isPlain(c);
  const components = componentFacts(c, diff);
  const check = await motifJson(k, ["check"], ws.app, out, "check.json");
  const validate = await motifJson(k, ["validate"], ws.app, out, "validate.json");
  if (plain) {
    return {
      route, pageExists: discoverPlainRoutes(plainSite(ws.app)).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
      render: await renderFacts(k, ws.app, route, out), ...components,
    };
  }
  if (isCompose(c)) {
    const screen = composeScreen(ws.app, route);
    const typecheck = await composeCompile(ws.app, k, out);
    return {
      route, pageExists: screen.exists, check: checkFacts(check), validate: validateFacts(validate),
      typecheck, render: await renderFacts(k, ws.app, route, out, PHONE_SIZES, screen.preview, 1_800_000), ...components,
    };
  }
  if (isFlutter(c)) {
    const typecheck = await flutterAnalyze(ws.app, k, out);
    return {
      route, pageExists: discoverFlutterRoutes(ws.app).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
      typecheck, render: await renderFacts(k, ws.app, route, out, PHONE_SIZES), ...components,
    };
  }
  if (isReactNative(c)) {
    return {
      route, pageExists: discoverExpoRoutes(ws.app).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
      typecheck: await rnTypecheck(ws.app, k, out), render: await renderFacts(k, ws.app, route, out, PHONE_SIZES), ...components,
    };
  }
  const { build, typecheck } = await buildAndTypecheck(ws.app, k, out);
  return {
    route, pageExists: discoverRoutes(ws.app).routes.includes(route), check: checkFacts(check), validate: validateFacts(validate),
    build, typecheck, ...components,
  };
}

function newestReport(app: string): string | null {
  const dir = join(app, "design", "reviews");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** What a report-only review may change: its report, screenshots and notes in design/, and files agents keep for themselves. */
const reviewMayChange = (path: string) => path.startsWith("design/") || path.startsWith(".claude/") || path === "AGENTS.md" || path === "CLAUDE.md";

export async function collectC(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<CFacts> {
  mkdirSync(out, { recursive: true });
  const issues: SeededIssue[] = JSON.parse(readFileSync(join(FIXTURES, c.fixture!, "seeded-issues.json"), "utf8")).issues;
  const exactIds = issues.filter((i) => i.kind === "exact").map((i) => i.id);
  const judgementIds = issues.filter((i) => i.kind === "judgement").map((i) => i.id);
  const changed = await changes(ws, k.run);
  save(out, "diff.patch", await patch(ws, k.run));
  const changedCode = changed.map((x) => x.path).filter((p) => !reviewMayChange(p));

  const file = newestReport(ws.app);
  if (!file) {
    return {
      report: { error: "No review report was written (design/reviews/*.json)." },
      exact: { found: [], missed: exactIds }, judgement: { found: [], missed: judgementIds }, serious: 0, falseFindings: [], changedCode,
    };
  }
  for (const ext of [".json", ".md"]) {
    const f = file.replace(/\.json$/, ext);
    if (existsSync(f)) copyFileSync(f, join(out, `review${ext}`));
  }
  const audit = join(ws.app, "design", "shots", "audit.json");
  if (existsSync(audit)) copyFileSync(audit, join(out, "audit.json"));

  const { findings, problems } = parseReport(readFileSync(file, "utf8"));
  const lineText = (path: string, line: number) => {
    try {
      return readFileSync(join(ws.app, path), "utf8").split(/\r?\n/)[line - 1];
    } catch {
      return undefined;
    }
  };
  const g = gradeExact(findings, issues, lineText, ws.app);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const input: JudgeInput = {
    issues: g.candidates.filter((x) => x.findings.length > 0).map((x) => ({ issue: issues.find((i) => i.id === x.id)!, candidates: x.findings.map((id) => byId.get(id)!) })),
    unmatched: g.unmatchedSerious.map((id) => byId.get(id)!),
  };
  let verdict: JudgeVerdict = { issues: {}, unmatched: {}, notes: [] };
  if (input.issues.length + input.unmatched.length > 0) {
    const r = await k.judge(input, ws.app);
    if ("paused" in r) throw new Paused(r.paused.resetsAt);
    if ("error" in r) throw new Error(`The grader couldn't finish: ${r.error}`);
    verdict = r.verdict;
  }
  const confirmed = new Set(Object.values(verdict.issues).flatMap((v) => v.findings));
  const confirmedFor = (id: string) => (verdict.issues[id]?.findings.length ?? 0) > 0;
  const judgementFound = judgementIds.filter(confirmedFor);
  // An exact problem counts when found at its place, or when the grader confirms a finding that named only its screen.
  const exactFound = exactIds.filter((id) => g.exact.find((e) => e.id === id)!.findings.length > 0 || confirmedFor(id));
  const falseFindings = g.unmatchedSerious.filter((id) => !confirmed.has(id) && verdict.unmatched[id]?.verdict !== "real");
  save(out, "grading.json", { ...g, judge: verdict });
  return {
    report: { findings: findings.length, problems },
    exact: { found: exactFound, missed: exactIds.filter((id) => !exactFound.includes(id)) },
    judgement: { found: judgementFound, missed: judgementIds.filter((id) => !judgementFound.includes(id)) },
    serious: findings.filter((f) => f.severity === "critical" || f.severity === "major").length,
    falseFindings,
    changedCode,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();

/** Which of DESIGN.md's sections are missing, and which hold nothing but comments or sub-headings. */
export function designSections(md: string): { missing: string[]; empty: string[] } {
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n").split("\n");
  const heads = lines.flatMap((l, i) => {
    const m = l.match(/^##\s+(?:\d+\.\s*)?(.+?)\s*#*\s*$/);
    return m ? [{ i, name: norm(m[1]!) }] : [];
  });
  const missing: string[] = [];
  const empty: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const at = heads.findIndex((h) => h.name === norm(section));
    if (at === -1) {
      missing.push(section);
      continue;
    }
    const body = lines.slice(heads[at]!.i + 1, heads[at + 1]?.i ?? lines.length).filter((l) => l.trim() !== "" && !/^#{1,6}\s/.test(l));
    if (body.length === 0) empty.push(section);
  }
  return { missing, empty };
}

function copyShots(app: string, json: any, dest: string): void {
  const shots: unknown[] = Array.isArray(json?.shots) ? json.shots : [];
  for (const s of shots) {
    if (typeof s !== "string" || !existsSync(join(app, s))) continue;
    mkdirSync(dest, { recursive: true });
    copyFileSync(join(app, s), join(dest, basename(s)));
  }
}

export async function collectD(c: EvalCase, ws: Workspace, k: Collectors, out: string): Promise<DFacts> {
  mkdirSync(out, { recursive: true });
  const app = findApp(ws.app);
  if (!app) {
    const none = { error: "no app" };
    return { app: null, validate: none, check: none, sections: { missing: [...REQUIRED_SECTIONS], empty: [] }, build: { code: 1 }, typecheck: { code: 1 }, screens: none, routes: c.routes };
  }
  for (const f of ["DESIGN.md", "design/tokens.json"]) if (existsSync(join(app, f))) copyFileSync(join(app, f), join(out, basename(f)));
  const compose = isCompose(c);
  const flutter = isFlutter(c);
  if (!flutter && !compose && !existsSync(join(app, "node_modules"))) {
    const r = await k.run([packageManager(app), "install"], app, 900_000);
    save(out, "install.log", `${r.stdout}\n${r.stderr}`);
  }
  const validate = await motifJson(k, ["validate"], app, out, "validate.json");
  const check = await motifJson(k, ["check"], app, out, "check.json");
  const sections = designSections(existsSync(join(app, "DESIGN.md")) ? readFileSync(join(app, "DESIGN.md"), "utf8") : "");
  const { build, typecheck } = compose
    ? { build: undefined, typecheck: await composeCompile(app, k, out) }
    : flutter
      ? { build: undefined, typecheck: await flutterAnalyze(app, k, out) }
      : isReactNative(c) ? { build: undefined, typecheck: await rnTypecheck(app, k, out) } : await buildAndTypecheck(app, k, out);
  const shot = await motifJson(k, ["shot", "--audit", "--routes", c.routes.join(","), ...(flutter || compose || isReactNative(c) ? PHONE_SIZES : [])], app, out, "shot.json", compose ? 1_800_000 : 900_000);
  copyShots(app, shot.json, join(out, "shots"));
  const screens = Array.isArray(shot.json?.routes)
    ? shot.json.routes.map((r: any) => ({ route: String(r.route), status: Number(r.status ?? 0), pageErrors: Array.isArray(r.pageErrors) ? r.pageErrors.length : 0 }))
    : { error: String(shot.json?.error ?? shot.output) };
  return {
    app, validate: validateFacts(validate), check: checkFacts(check), sections, ...(build ? { build } : {}), typecheck, screens, routes: c.routes,
    ...(Array.isArray(shot.json?.findings) ? { auditFindings: shot.json.findings.length } : {}),
  };
}

export async function collectAndGrade(c: EvalCase, ws: Workspace, out: string, k: Collectors): Promise<Grade> {
  if (c.test === "B") return gradeB(await collectB(c, ws, k, out));
  if (c.test === "C") return gradeC(await collectC(c, ws, k, out));
  return gradeD(await collectD(c, ws, k, out));
}
