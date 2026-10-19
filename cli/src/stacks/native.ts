import type { DoctorDeps, DoctorItem } from "../commands/doctor";
import type { SourceFile } from "../check/files";
import type { Hit, Scale, ValueKind } from "../check/types";
import type { StackId, AppInfo } from "../detect/stacks";
import type { Occurrences } from "../extract/draft";
import type { GeneratedFile } from "../generate/header";
import type { ThemeSet } from "../generate/theme";
import type { AuditIssue } from "../shot/audit";
import type { RouteResult, StateScript, Viewport } from "../shot/capture";
import { FLUTTER } from "./flutter";

export interface NativeShotOptions {
  root: string;
  app: AppInfo;
  routes: string[];
  screens: string[];
  outDir: string;
  viewports: Viewport[];
  variants: string[];
  rtl?: string;
  states: StateScript[];
  audit: boolean;
  timeoutMs: number;
}

/** What a native stack (Flutter, and later SwiftUI and Compose) adds to Motif. Each stack fills in the parts it supports. */
export interface NativeStack {
  id: StackId;
  /** Where theme code goes for an app, relative to the project root (themeDir from motif.json wins). */
  themeDir(root: string, app: AppInfo): string;
  /** Theme code (root-relative files), files to copy into the app (root-relative), and notes for the developer. */
  generate?(set: ThemeSet, ctx: { root: string; app: AppInfo; themeDir: string }): { files: GeneratedFile[]; copies: { from: string; to: string }[]; notes: string[] };
  /** The one step that puts the theme file (root-relative) to use, or null when the app already uses it. */
  wiring?(root: string, app: AppInfo, file: string): string | null;
  sourceFiles?(root: string, app: AppInfo, opts: { ignore?: string[] }): SourceFile[];
  scan?(file: SourceFile, scale: Scale): Hit[];
  appWide?(files: SourceFile[], generated: SourceFile[]): Hit[];
  /** What to use instead of a hit, in the stack's own language. */
  fix?(hit: Hit): string;
  /** A theme role as the stack's code names it, for "Closest:" suggestions (text-secondary → MotifColors.of(context).textSecondary). */
  role?(kind: ValueKind, name: string): string;
  /**
   * Files of the packages an app takes from a folder in the project (a Flutter path: dependency), whose theme code the
   * app uses; and notes on what was read or skipped.
   */
  sharedFiles?(root: string, app: AppInfo, opts: { ignore?: string[] }): { files: SourceFile[]; notes: string[] };
  /** What the app's own files (and its shared packages' theme code) say about its design, for motif extract. */
  collect?(files: SourceFile[], shared?: SourceFile[]): Occurrences;
  shoot?(opts: NativeShotOptions): Promise<{ routes: RouteResult[]; issues: AuditIssue[]; notes: string[] }>;
  doctor?(deps: DoctorDeps): DoctorItem[];
}

const STACKS = new Map<StackId, NativeStack>([[FLUTTER.id, FLUTTER]]);

/** The native stacks motif check reads. */
export function checkableNativeStacks(): NativeStack[] {
  return [...STACKS.values()].filter((s) => s.scan);
}

export function nativeStack(id: StackId | null): NativeStack | null {
  return (id && STACKS.get(id)) || null;
}
