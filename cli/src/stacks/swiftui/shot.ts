import { resolve } from "node:path";
import type { DoctorDeps } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { swiftUIDoctor } from "./doctor";
import { swiftUIScreenProblem } from "./screens";

/** Said before the first run on a computer starts, and in its notes. */
export const SWIFTUI_FIRST_RUN = "The first SwiftUI screenshots build the app for a simulator, which takes a few minutes; later runs reuse the build.";

/** Why motif shot can't draw this SwiftUI app on this computer: not a Mac, or Xcode (or its simulator) missing, in doctor's words. */
export function swiftUIShotRefusal(root: string, app: AppInfo, doctor: DoctorDeps): { error: string; text: string } | null {
  const [item] = swiftUIDoctor(doctor, { root, apps: [app] });
  if (!item) return null;
  if (doctor.platform !== "darwin") return { error: "needs-mac", text: `${item.detail} Run motif shot on a Mac that has Xcode.` };
  if (item.status !== "needed") return null;
  return { error: "needs-xcode", text: `${item.detail} Then run motif shot again.` };
}

/** What's wrong with the --screen values, before anything is written. */
export function swiftUIInputsProblem(root: string, app: AppInfo, given: { screens: string[] }): string | null {
  return swiftUIScreenProblem(resolve(root, app.path), given.screens);
}
