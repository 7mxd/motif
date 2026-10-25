import type { DoctorDeps, DoctorItem } from "../commands/doctor";
import type { SourceFile } from "../check/files";
import type { Hit, Scale } from "../check/types";
import type { AppInfo, StackId } from "../detect/stacks";
import type { Occurrences } from "../extract/draft";
import type { GeneratedFile } from "../generate/header";
import type { ThemeSet } from "../generate/theme";
import type { IssueRule } from "../shot/audit";
import type { TailwindVersion } from "./react-web/generate";
import type { RouteDiscovery } from "./react-web/routes";
import { ANGULAR } from "./angular";
import { SVELTE } from "./svelte";
import { VUE } from "./vue";

/** What a stack's fix may need to know about the app: where it is, and the motion.ts Motif wrote for it (an app path, without ".ts"), if any. */
export interface WebFixContext {
  appDir: string;
  appPath: string;
  motionImport?: string;
}

/**
 * What a web framework with its own file format (Vue's .vue, Svelte's .svelte, Angular's templates) adds to Motif. React
 * web and plain web keep their own code paths and aren't registered here. Each stack fills in the parts it supports.
 */
export interface WebStack {
  id: StackId;
  /** The framework's own file extensions (".vue"), which motif check reads beside the web's. */
  extensions?: string[];
  /** The files motif check and extract read: the framework's own files beside scripts, styles and HTML. */
  sourceFiles(root: string, app: AppInfo, opts: { ignore?: string[]; paths?: string[] }): SourceFile[];
  /**
   * The parts of one source file (a .vue file's template, script and style blocks) as files for the web scanners.
   * `files`, the app's files it is among, says what one file can't (the .ts whose templateUrl names an Angular template).
   */
  views?(file: SourceFile, files?: SourceFile[]): SourceFile[];
  /** Where the app's source lives, relative to the app folder. */
  srcDir(appDir: string): string;
  /** Theme code (root-relative files) and notes for the developer. */
  generate?(set: ThemeSet, ctx: { root: string; app: AppInfo; srcDir: string; tailwind: TailwindVersion }): { files: GeneratedFile[]; notes: string[] };
  /** The one step that puts the theme files to use, or null when the app already uses them. */
  wiring?(root: string, app: AppInfo, files: GeneratedFile[], set: ThemeSet): string | null;
  /** The hits in one file. */
  scan?(file: SourceFile, scale: Scale): Hit[];
  appWide?(files: SourceFile[], generated: SourceFile[]): Hit[];
  /** What to use instead of a hit, in the framework's own syntax. */
  fix?(hit: Hit, ctx?: WebFixContext): string;
  /** Files besides sourceFiles that motif extract reads (Vuetify's config, which the usual ignores leave out); check never scans them. */
  extractFiles?(root: string, app: AppInfo, opts: { ignore?: string[] }): SourceFile[];
  /** What the app's own files say about its design, for motif extract. */
  collect?(files: SourceFile[]): Occurrences;
  /** The pages of the app, for motif shot without --routes. */
  routes?(appDir: string): RouteDiscovery;
  /** How long this app's dev server may take to answer its first page, in ms, when the web's usual limit is too short (undefined: the usual). */
  startTimeoutMs?(appDir: string): number | undefined;
  /**
   * The HTTP status this app's dev server answers with while it is still building the app (Nuxt's loading screen, 503),
   * or undefined when any answer means it's ready: Motif waits for another answer before drawing.
   */
  buildingStatus?(appDir: string): number | undefined;
  /**
   * The package.json script that starts this app's dev server and the arguments it takes (a port: Motif picks a
   * free one), or null when the app has none (or the refusal in the framework's own words); without this hook, the app's
   * "dev" script runs.
   */
  devScript?(appDir: string, port: number): { script: string; args: string[] } | { error: string } | null;
  /** Variables this app's dev server needs besides the usual, or undefined for none. */
  devEnv?(appDir: string): Record<string, string> | undefined;
  /** How the framework sets a design variant, for the note when a variant looks the same as the default. */
  variantHow?: string;
  /** What motif shot --audit says to do, in the framework's own terms, where the web's words don't fit. */
  auditFixes?: Partial<Record<IssueRule, string>>;
  /** The items for this stack, given the project root and this stack's apps in it. */
  doctor?(deps: DoctorDeps, ctx: { root: string; apps: AppInfo[] }): DoctorItem[];
  /** What doctor says for an app on a version Motif doesn't support (and what still works), or null when the version is fine. */
  unsupported?(appDir: string): string | null;
}

const STACKS = new Map<StackId, WebStack>([[VUE.id, VUE], [SVELTE.id, SVELTE], [ANGULAR.id, ANGULAR]]);

/** Every web stack of this kind Motif has, registered. */
export function webStacks(): WebStack[] {
  return [...STACKS.values()];
}

export function webStack(id: StackId | null): WebStack | null {
  return (id && STACKS.get(id)) || null;
}
