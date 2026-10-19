import type { DoctorDeps, DoctorItem } from "../commands/doctor";
import type { SourceFile } from "../check/files";
import type { Hit, Scale } from "../check/types";
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
  fix?(hit: Hit): string;
  collect?(files: SourceFile[]): Occurrences;
  shoot?(opts: NativeShotOptions): Promise<{ routes: RouteResult[]; issues: AuditIssue[]; notes: string[] }>;
  doctor?(deps: DoctorDeps): DoctorItem[];
}

const STACKS = new Map<StackId, NativeStack>([[FLUTTER.id, FLUTTER]]);

export function nativeStack(id: StackId | null): NativeStack | null {
  return (id && STACKS.get(id)) || null;
}
