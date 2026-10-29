// What the SwiftUI e2e tests plant for motif shot --audit (plan 2H, Task 10), on iOS and on the Mac alike, and what they
// expect it to find.
import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the planted screen goes in the app (swiftui-min's or swiftui-mac's Screens folder). */
export const auditFile = (app: string) => `${app}/Screens/AuditScreen.swift`;

/**
 * A screen with problems planted for the audit: a caption in a pale grey (#bfbfbf on white, 1.83:1), a 30 pt icon button
 * with no name of its own (its SF Symbol's, "Gear Shape", only), a field whose typed text is grey (#999999, 2.84:1), and
 * a 40 pt pulse that keeps going with reduce motion on. What should pass: the title; a bordered button and (built with
 * Xcode 26 or later) a glass one, both under 44 pt but sized by the system; a short orange bordered "Add" on a dark
 * band, whose band shows past its rounded ends and isn't taken for its label's colour; a decorative symbol beside its text
 * and a row's chevron (images, not controls: no name finding); a segmented picker, whose selected segment's frame holds
 * more of the grey track than of its black label's cores, so the track isn't taken for the label's colour (seen on
 * Apple's Landmarks, hands-on of plan 2H Task 15); a 60 pt pulse that stops when the system's setting is on
 * (UIAccessibility's, NSWorkspace's) and an 80 pt one that stops when SwiftUI's environment says so. Either would lead
 * the motion finding if it moved, being larger.
 */
export const AUDIT_SCREEN = `import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct AuditScreen: View {
    @Environment(\\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false
    @State private var system = false
    @State private var calm = false
    @State private var code = ""
    @State private var tab = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your order")
                .font(.largeTitle.bold())
            Picker("Show", selection: $tab) {
                Text("Map").tag(0)
                Text("Activities").tag(1)
            }
            .pickerStyle(.segmented)
            Text("Prices include tax")
                .font(.caption)
                .foregroundStyle(Color(white: 0.75))
            Button {} label: {
                Image(systemName: "gearshape")
                    .frame(width: 30, height: 30)
            }
            TextField("Code", text: $code)
                .foregroundStyle(Color(white: 0.6))
            HStack {
                Button("Edit") {}
                    .buttonStyle(.bordered)
                    .tint(.primary)
                glass
            }
            // A bordered button with no tint (the theme's taken off) on a flat mid grey: its neutral fill is nearly the
            // background's, so the picture can't see its shape, and only its height (36 pt for 17 pt text) tells it is
            // styled. A tinted one is seen by the picture. Light whatever the scheme.
            HStack {
                Button("Save") {}
                    .buttonStyle(.bordered)
                    .tint(nil as Color?)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(white: 0.5))
            .environment(\\.colorScheme, .light)
            // A short, small label on a large bordered capsule on a dark band, the band showing past the capsule's ends:
            // more of the band than of any one shade of the label, so the label is read from the button's middle
            // (Qahwa's "أضف إلى الطلب", taken for 1.64:1). Dark whatever the scheme.
            HStack {
                Button("Add") {}
                    .font(.footnote)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    #if os(iOS)
                    .buttonBorderShape(.capsule)
                    #endif
                    .tint(.orange)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(white: 0.08))
            .environment(\\.colorScheme, .dark)
            HStack {
                Image(systemName: "leaf")
                Text("Fresh today")
            }
            HStack {
                Text("Delivery")
                Spacer()
                Image(systemName: "chevron.right")
            }
            HStack(spacing: 32) {
                Circle()
                    .fill(Color.indigo)
                    .frame(width: 40, height: 40)
                    .scaleEffect(pulse ? 1.3 : 0.7)
                    .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
                    .onAppear { pulse = true }
                Circle()
                    .fill(Color.orange)
                    .frame(width: 60, height: 60)
                    .scaleEffect(system ? 1.3 : 0.7)
                    .animation(systemReducesMotion ? nil : .easeInOut(duration: 0.8).repeatForever(), value: system)
                    .onAppear { system = !systemReducesMotion }
                Circle()
                    .fill(Color.teal)
                    .frame(width: 80, height: 80)
                    .scaleEffect(calm ? 1.3 : 0.7)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.8).repeatForever(), value: calm)
                    .onAppear { calm = !reduceMotion }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }

    /// A glass button, which Xcode 26's SDK (Swift 6.2) has and CI's Xcode 16.4 doesn't.
    @ViewBuilder private var glass: some View {
        #if compiler(>=6.2)
        if #available(iOS 26, macOS 26, *) {
            Button("Share") {}
                .buttonStyle(.glass)
                .tint(.primary)
        }
        #endif
    }

    /// The system's setting, as an app that doesn't read SwiftUI's environment reads it.
    private var systemReducesMotion: Bool {
        #if os(macOS)
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        #else
        UIAccessibility.isReduceMotionEnabled
        #endif
    }
}

#Preview("Audit") {
    AuditScreen()
}
`;

/**
 * True when the selected Swift compiler is 6.2 or later (Xcode 26 and later), whose SDKs have the glass button style:
 * the planted screen draws its glass button only then, as swiftui-compile gates -default-isolation.
 */
export function hasGlass(): boolean {
  const out = Bun.spawnSync(["xcrun", "swiftc", "--version"], { stdout: "pipe", stderr: "pipe" }).stdout.toString();
  const m = /Swift version (\d+)\.(\d+)/.exec(out);
  return Boolean(m && (Number(m[1]) > 6 || (Number(m[1]) === 6 && Number(m[2]) >= 2)));
}

/** A state that types into the planted field: the audit judges the typed text once editing has ended. */
export const TYPED_STATE = `@MainActor func motifState(_ app: MotifHarness) async throws {
    guard app.exists("Code") else { return }
    try await app.type("1234", into: "Code")
}
`;

/** A state that throws: its screen's error says so, and the screen is still drawn and audited as it was left. */
export const THROWS_STATE = `@MainActor func motifState(_ app: MotifHarness) async throws {
    try await app.tap("Nothing here", timeout: 1)
}
`;

/** A finding of audit.json, as the e2e tests read them. */
export type Finding = {
  severity: string;
  category: string;
  summary: string;
  fix: string;
  shot: string;
  location: { screen: string; selector: string; scheme?: string; state?: string; rtl?: true };
  locations?: { screen: string; selector: string; scheme?: string; state?: string; rtl?: true }[];
};

/**
 * What --audit says of the planted screen, the same in the simulator and on the Mac but for tap targets, which only a
 * phone or a tablet gets. With the states: the throwing state is its screen's error and its shots are audited as drawn;
 * the typed text is judged once editing has ended. The pulse that keeps going is found, the ones that stop for reduce
 * motion (the system's setting, or SwiftUI's environment) aren't.
 */
export function expectAudit(root: string, r: { text: string; data: Record<string, unknown> }, viewport: "mobile" | "desktop", states: boolean): void {
  const routes = r.data.routes as { route: string; status: number; pageErrors?: string[]; auditError?: string }[];
  expect(routes.map((x) => [x.route, x.status, x.auditError ?? null])).toEqual([["/", 200, null], ["Audit", 200, null]]);
  for (const x of routes) {
    if (states) expect(x.pageErrors?.[0]).toMatch(/^State "throws": There's nothing called "Nothing here" on the screen/);
    else expect(x.pageErrors).toBeUndefined();
  }
  // The throwing state lists what the planted screen shows: its bordered button, and its glass one where the SDK has it.
  if (states) {
    const shown = routes.find((x) => x.route === "Audit")!.pageErrors![0]!;
    expect(shown).toContain('"Edit"');
    expect(shown).toContain('"Save"');
    expect(shown).toContain('"Add"');
    if (hasGlass()) expect(shown).toContain('"Share"');
    else console.log("[audit] Swift is older than 6.2: the planted screen has no glass button.");
  }
  expect(r.text).not.toContain("couldn't turn on accessibility");
  const review = JSON.parse(readFileSync(join(root, "design", "shots", "audit.json"), "utf8")) as { scope: string; findings: Finding[] };
  expect(review.scope).toBe("screens: /, Audit");
  for (const f of review.findings) console.log(`[audit] ${f.severity} ${f.location.screen} ${f.location.selector}${f.location.state ? ` @${f.location.state}` : ""}: ${f.summary}`);
  const mine = review.findings.filter((f) => f.location.screen === "Audit");
  // Right to left in Hebrew, SwiftUI says the symbol's name in Hebrew: still the symbol's own name, the same place.
  expect(JSON.stringify(mine)).not.toMatch(/\p{Script=Hebrew}/u);
  // The bordered "Save" on mid grey is there for the tap-target check; its blue on grey is a contrast finding of its own,
  // whose ratio is the system's fill's, so contrast leaves it out.
  const of = (category: string) =>
    mine.filter((f) => f.category === category && !(category === "contrast" && f.location.selector === 'Button("Save")')).map((f) => [f.location.selector, f.location.state ?? null, f.summary]);
  // The caption, light only (#bfbfbf on the dark background is fine), wherever it was drawn; the typed text only once typed.
  // The ratios are the pixels': 1.83:1 and 2.84:1 in the simulator and on macOS 27, and the caption 1.7:1 on macOS 15,
  // whose window server gives the grey a little lighter.
  expect(of("contrast")).toEqual([
    ['Text("Prices include tax")', null, expect.stringMatching(/^Text "Prices include tax" is hard to read in light mode \(1\.\d+:1, needs 4\.5:1\)\.$/)],
    ...(states ? [['TextField("Code")', "typed", expect.stringMatching(/^The "Code" field is hard to read in light mode \(2\.\d+:1, needs 4\.5:1\)\.$/)]] : []),
  ]);
  const caption = mine.find((f) => f.location.selector === 'Text("Prices include tax")')!;
  expect(caption.severity).toBe("critical");
  expect([caption.location, ...(caption.locations ?? [])].map((l) => [l.state ?? null, l.scheme, l.rtl ?? false]).sort()).toEqual(
    (states ? [[null, "light", false], ["throws", "light", false], ["typed", "light", false]] : [[null, "light", false]]).sort(),
  );
  // Names are for what can be tapped: the leaf beside its text and the row's chevron are images, read by the name
  // SwiftUI gives them, and aren't findings.
  expect(of("accessibility")).toEqual([["Button(gearshape)", null, "The button has no name a screen reader can say."]]);
  expect(mine.find((f) => f.category === "accessibility")!.fix).toContain('.accessibilityLabel("…")');
  // Only the 40 pt pulse: the 60 pt one that reads the system's setting and the 80 pt one that reads SwiftUI's
  // environment stopped (either would lead the finding, being larger). The system's setting was on, so the fix doesn't
  // say only SwiftUI's could be turned on.
  expect(of("reduced-motion")).toEqual([["View(40×40)", null, "An element keeps moving when the viewer asks for reduced motion."]]);
  const motion = mine.find((f) => f.category === "reduced-motion")!;
  expect(motion.fix).toContain("@Environment(\\.accessibilityReduceMotion)");
  expect(motion.fix).not.toContain("could turn on only");
  if (viewport === "mobile") {
    // The plain 30 pt icon button, in SwiftUI's terms. The text field isn't one: its size is the system's; nor the
    // bordered "Edit" (36 pt high) or, with Xcode 26 and later, the glass "Share": a system style sizes them. Nor the
    // bordered "Save" on mid grey, which only its height tells (it was flagged before tallerThanItsText).
    expect(of("target-size")).toEqual([["Button(gearshape)", null, 'The "gearshape" button is 30×30 px on a phone; 44×44 px is easier to tap.']]);
    expect(mine.find((f) => f.category === "target-size")!.fix).toContain(".frame(minWidth: 44, minHeight: 44)");
    // swiftui-min's stock home: the plain Greet button is too small; its field and its bordered prominent button aren't.
    const home = review.findings.filter((f) => f.location.screen === "/" && f.category === "target-size").map((f) => f.location.selector);
    expect(home).toEqual(['Button("Greet")']);
  } else {
    expect(review.findings.filter((f) => f.category === "target-size")).toEqual([]);
  }
}
