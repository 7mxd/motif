import type { DoctorDeps, DoctorItem } from "../../commands/doctor";

/** The oldest Flutter whose theme API Motif's generated code uses. */
const MIN: [number, number, number] = [3, 27, 0];
const LABEL = "Flutter SDK";

function parts(v: string): [number, number, number] {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : [0, 0, 0];
}

function olderThanMin(v: string): boolean {
  const p = parts(v);
  for (let i = 0; i < 3; i++) if (p[i] !== MIN[i]) return p[i]! < MIN[i]!;
  return false;
}

/** One doctor item for the Flutter SDK: found or not, and recent enough or not. */
export function flutterDoctor(deps: DoctorDeps): DoctorItem[] {
  const missing: DoctorItem = {
    id: "flutter",
    status: "needed",
    label: LABEL,
    detail: "Flutter isn't installed. Theme code, checks and drafts work without it; screenshots need it: install it from https://docs.flutter.dev/get-started/install.",
  };
  const path = deps.which("flutter");
  if (!path || !deps.run) return [missing];
  const r = deps.run([path, "--version", "--machine"]);
  if (r.code !== 0) return [missing];

  // Flutter may print an "upgrade available" banner before the JSON.
  const start = r.stdout.indexOf("{");
  let info: { frameworkVersion?: unknown; dartSdkVersion?: unknown } = {};
  try {
    info = start >= 0 ? JSON.parse(r.stdout.slice(start)) : {};
  } catch {
    info = {};
  }
  const version = typeof info.frameworkVersion === "string" ? info.frameworkVersion : "";
  if (!version) {
    return [{ id: "flutter", status: "optional", label: LABEL, detail: "Found Flutter, but couldn't read its version. Run flutter --version to check it works." }];
  }
  if (olderThanMin(version)) {
    return [{ id: "flutter", status: "needed", label: LABEL, detail: `Flutter ${version} is older than 3.27, which Motif's theme code needs. Run flutter upgrade.` }];
  }
  const dart = typeof info.dartSdkVersion === "string" ? info.dartSdkVersion.trim().split(/\s+/)[0] : "";
  return [{ id: "flutter", status: "ok", label: LABEL, detail: dart ? `Flutter ${version} (Dart ${dart}).` : `Flutter ${version}.` }];
}
