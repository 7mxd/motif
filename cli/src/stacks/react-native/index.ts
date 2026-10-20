import { listRnFiles } from "../../check/files";
import { prefixPath } from "../../project/apps";
import type { NativeStack } from "../native";
import { rnDoctor } from "./doctor";
import { srcRoot } from "./project";
import { resolve } from "node:path";

/** React Native with Expo. Its screenshots reuse the browser pipeline (Expo's web target); the parts later tasks add are not here yet. */
export const REACT_NATIVE: NativeStack = {
  id: "react-native",
  extensions: [".ts", ".tsx", ".js", ".jsx"],

  themeDir: (root, app) => app.themeDir ?? prefixPath(app.path, prefixPath(srcRoot(resolve(root, app.path)), "design")),

  sourceFiles: (root, app, { ignore }) => listRnFiles(root, app.path, { ignore }),

  doctor: rnDoctor,
};
