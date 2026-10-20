import { join } from "node:path";
import { listKotlinFiles } from "../../check/files";
import { prefixPath } from "../../project/apps";
import type { NativeStack } from "../native";
import { composeDoctor } from "./doctor";
import { composeModule, packageFolder } from "./project";

export const COMPOSE: NativeStack = {
  id: "compose",
  extensions: [".kt"],

  // <module>/<sourceRoot>/<namespace path>/ui/motif, so the theme sits in the app's own package.
  themeDir(root, app) {
    if (app.themeDir) return app.themeDir;
    const mod = composeModule(join(root, app.path));
    const sourceRoot = mod?.sourceRoot ?? "src/main/java";
    const pkg = mod?.namespace ? `${packageFolder(mod.namespace)}/` : "";
    return prefixPath(app.path, `${sourceRoot}/${pkg}ui/motif`);
  },

  sourceFiles: (root, app, { ignore }) => listKotlinFiles(root, app.path, { ignore }),
  doctor: composeDoctor,
};
