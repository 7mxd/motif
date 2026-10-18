import type { AppInfo } from "../detect/stacks";

/** The apps --app selects: all when it's absent, null when it names an app that isn't there. */
export function selectApps(apps: AppInfo[], app?: string): AppInfo[] | null {
  if (!app) return apps;
  const want = app.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
  const found = apps.filter((a) => a.path === want);
  return found.length > 0 ? found : null;
}

export function appLabel(app: AppInfo): string {
  return app.path === "." ? "Your app" : app.path;
}

/** A path inside an app, relative to the project root, with forward slashes. */
export function prefixPath(appPath: string, rel: string): string {
  return appPath === "." ? rel : `${appPath}/${rel}`;
}

/** What a command says when --app names a folder with no app. */
export function noSuchApp(app: string | undefined, detected: { path: string }[]): string {
  return `There's no app at "${app}". Apps here: ${detected.map((a) => a.path).join(", ") || "none"}.`;
}
