import { join } from "node:path";
import { listSwiftFiles } from "../../check/files";
import { prefixPath } from "../../project/apps";
import type { NativeStack } from "../native";
import { swiftUIApp } from "./project";

/** SwiftUI: apps in Xcode projects and Swift packages. Each area is added as it is built; so far, finding the app and its Swift. */
export const SWIFTUI: NativeStack = {
  id: "swiftui",
  extensions: [".swift"],

  // The theme sits in the app target's own folder, which an Xcode 16 synchronized group or a package target compiles as it is.
  themeDir(root, app) {
    if (app.themeDir) return app.themeDir;
    const sourceRoot = swiftUIApp(join(root, app.path))?.sourceRoot;
    return prefixPath(app.path, `${sourceRoot && sourceRoot !== "." ? `${sourceRoot}/` : ""}Design`);
  },

  sourceFiles: (root, app, { ignore }) => listSwiftFiles(root, app.path, { ignore }),
};
