import type { PackageVersion } from "../project/package";

/** A version as doctor's lines print it after a name: " 5.57", " 3", or nothing when it can't be read. */
export const shown = (v: PackageVersion | null) => (v === null ? "" : v.minor === null ? ` ${v.major}` : ` ${v.major}.${v.minor}`);

/** What doctor's lines say in place of a version package.json doesn't give ("workspace:*", "latest"). */
export const NO_VERSION = " (version not found in package.json)";
