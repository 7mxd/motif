// Motif's screenshot harness for a SwiftUI app (decision 0010). Motif adds it to a copy of the app's project as a
// unit-test target hosted by the app (MotifShots), runs it in an iOS simulator Motif creates, and deletes both
// afterwards. It draws each shot the options list, writes the PNGs, and writes result.json next to the options.
import CoreText
import SwiftUI
import UIKit
import XCTest

struct MotifShotOptions: Decodable {
    struct Shot: Decodable {
        /// "/" for the app's root view (its WindowGroup's), or a preview's id: "<fileID>:<line>" (SwiftUIMin/HomeScreen.swift:26).
        let screen: String
        /// The PNG's file name in outDir.
        let file: String
        /// The size in points, and the scale it is drawn at (3 for a phone, 2 for the tablet).
        let width: Double
        let height: Double
        let scale: Double
        let dark: Bool
        /// en, ar, en_US: the locale SwiftUI looks strings up in, and formats with.
        let locale: String
        let rtl: Bool
        /// The variant as the guide names it (partner), when the app's theme has variants.
        let variant: String?
        /// The variant as design/states/Setup.swift is told it: the guide's id, also when the theme has none ("" without variants).
        let variantId: String?
        /// The --state to run on the settled screen before it is drawn.
        let state: String?
        /// A UIContentSizeCategory raw value (UICTContentSizeCategoryAccessibilityL), when not the default.
        let contentSize: String?
        /// The safe area's top and bottom in points (a phone's status bar and home indicator); none when not given.
        let insets: [Double]?
    }

    let outDir: String
    /// Font files registered for the run's process before the first shot (Google families from Motif's cache).
    let fonts: [String]?
    /// How long a screen may take to settle, in seconds.
    let settle: Double?
    /// How long design/states/Setup.swift's motifSetup and a state may run, in seconds (15).
    let stateLimit: Double?
    /// The setup file as Motif names it (design/states/Setup.swift, or an app's own), for messages.
    let setupFile: String?
    let shots: [Shot]
}

private struct ShotResult: Encodable {
    let file: String
    var error: String?
    var ms: Int
    /// The type of the view drawn (ContentView, ModifiedContent<…>).
    var view: String?
    /// What went wrong in the shot's state: the screen is drawn as the state left it.
    var stateError: String?
}

private struct Current: Encodable {
    let screen: String
    let file: String
}

/// What the harness has done so far. It is written before the first shot, before each shot is drawn (with that shot as
/// `current`) and after it, so a screen that stops the app leaves the shots before it, and its own name, behind.
private struct RunResult: Encodable {
    var shots: [ShotResult] = []
    var previews: [MotifPreviewInfo] = []
    var notes: [String] = []
    var current: Current?
    var done = false
}

@MainActor
final class MotifShotTests: XCTestCase {
    func testShots() throws {
        guard let path = ProcessInfo.processInfo.environment["MOTIF_SHOT_OPTIONS"] else {
            throw XCTSkip("MOTIF_SHOT_OPTIONS isn't set: Motif runs this test itself.")
        }
        let optionsURL = URL(fileURLWithPath: path)
        let options = try JSONDecoder().decode(MotifShotOptions.self, from: Data(contentsOf: optionsURL))
        let outDir = URL(fileURLWithPath: options.outDir, isDirectory: true)
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        let resultURL = optionsURL.deletingLastPathComponent().appendingPathComponent("result.json")

        var result = RunResult()
        for font in options.fonts ?? [] {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: font) as CFURL, .process, &error) {
                let reason = error.map { CFErrorCopyDescription($0.takeRetainedValue()) as String } ?? "unknown"
                result.notes.append("The font \(font) couldn't be registered: \(reason)")
            }
        }
        let settle = options.settle ?? 5
        let limit = options.stateLimit ?? 15
        let setupFile = options.setupFile ?? "design/states/Setup.swift"
        let previews = MotifPreviews.all()
        result.previews = previews.map(\.info)
        try write(result, to: resultURL)

        for shot in options.shots {
            result.current = Current(screen: shot.screen, file: shot.file)
            try write(result, to: resultURL)
            let started = Date()
            var entry = ShotResult(file: shot.file, error: nil, ms: 0)
            do {
                // Before the view is made and hosted: the generated theme reads it when its modifier first runs, and
                // a view already drawn doesn't see it change.
                try MotifShotApp.setVariant(shot.variant)
                let locale = Locale(identifier: shot.locale)
                if MotifHooks.hasSetup {
                    let variant = shot.variantId ?? ""
                    switch MotifAsync.run(seconds: limit, { try await MotifHooks.setup(variant: variant, locale: locale, dark: shot.dark) }) {
                    case nil: throw MotifShotError("\(setupFile) didn't finish within \(Int(limit)) s.")
                    case .failure(let error)?: throw MotifShotError("\(setupFile) failed: \(error)")
                    case .success?: break
                    }
                }
                let view: AnyView
                if shot.screen == "/" {
                    view = try MotifShotApp.root()
                } else if let preview = MotifPreviews.matching(previews, shot.screen) {
                    view = try preview.make()
                } else {
                    throw MotifShotError("The app has no #Preview at \(shot.screen).")
                }
                entry.view = MotifMirror.typeName(view)
                let drawn = try MotifShotDrawing.draw(MotifShotApp.themed(view), shot: shot, settle: settle) { window in
                    // The state runs on the settled screen, with its own time limit; the screen is drawn as it leaves it.
                    guard let state = shot.state else { return nil }
                    let app = MotifHarness(window: window, variant: shot.variantId ?? "", locale: locale, dark: shot.dark, settle: settle)
                    switch MotifAsync.run(seconds: limit, { try await MotifHooks.state(state, app) }) {
                    case nil: return "State \"\(state)\": it was still running after \(Int(limit)) seconds."
                    case .failure(let error)?: return "State \"\(state)\": \(error)"
                    case .success?: return nil
                    }
                }
                entry.stateError = drawn.stateError
                try drawn.png.write(to: outDir.appendingPathComponent(shot.file))
                if let note = drawn.note, !result.notes.contains(note) { result.notes.append(note) }
            } catch {
                entry.error = "\(error)"
            }
            entry.ms = Int(Date().timeIntervalSince(started) * 1000)
            result.shots.append(entry)
            try write(result, to: resultURL)
        }
        result.current = nil
        result.done = true
        try write(result, to: resultURL)
    }

    /// Writes the result whole: to result.json.part, then moved over result.json.
    private func write(_ result: RunResult, to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let part = url.appendingPathExtension("part")
        try encoder.encode(result).write(to: part)
        _ = try? FileManager.default.removeItem(at: url)
        try FileManager.default.moveItem(at: part, to: url)
    }
}

struct MotifShotError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

@MainActor
enum MotifShotDrawing {
    /// Hosts the view in a window of its own at the shot's size and traits, waits for it to settle, and draws the window.
    static func draw(
        _ view: AnyView, shot: MotifShotOptions.Shot, settle: Double, state: (UIWindow) -> String? = { _ in nil }
    ) throws -> (png: Data, note: String?, stateError: String?) {
        let insets = shot.insets ?? [0, 0]
        // The window's own safe area comes from the simulator's screen; the shot's is given to SwiftUI instead.
        let root = view
            .safeAreaPadding(EdgeInsets(top: insets.first ?? 0, leading: 0, bottom: insets.last ?? 0, trailing: 0))
            .environment(\.locale, Locale(identifier: shot.locale))
            .environment(\.layoutDirection, shot.rtl ? .rightToLeft : .leftToRight)
        let host = UIHostingController(rootView: AnyView(root))
        host.safeAreaRegions = []
        let bounds = CGRect(x: 0, y: 0, width: shot.width, height: shot.height)
        // A hosted test runs in the app, which has a window scene. A Swift package's tests run without one: their
        // window is never on screen, and is drawn from its layers.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
        window.frame = bounds
        window.traitOverrides.userInterfaceStyle = shot.dark ? .dark : .light
        window.traitOverrides.layoutDirection = shot.rtl ? .rightToLeft : .leftToRight
        window.traitOverrides.horizontalSizeClass = shot.width >= 600 ? .regular : .compact
        window.traitOverrides.verticalSizeClass = .regular
        window.traitOverrides.displayScale = shot.scale
        if let size = shot.contentSize {
            window.traitOverrides.preferredContentSizeCategory = UIContentSizeCategory(rawValue: size)
        }
        window.rootViewController = host
        window.isHidden = false
        defer {
            window.endEditing(true)
            window.isHidden = true
            window.rootViewController = nil
        }
        settleWindow(window, seconds: settle)
        let stateError = state(window)
        if stateError != nil || shot.state != nil { settleWindow(window, seconds: settle) }
        let format = UIGraphicsImageRendererFormat()
        format.scale = shot.scale
        format.opaque = true
        // 8 bits a channel in sRGB, whatever the simulated screen's colour range.
        format.preferredRange = .standard
        var drawn = false
        if scene != nil {
            let image = UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
                drawn = window.drawHierarchy(in: bounds, afterScreenUpdates: true)
            }
            if drawn, let png = image.pngData() { return (png, nil, stateError) }
        }
        let image = UIGraphicsImageRenderer(bounds: bounds, format: format).image { context in
            window.layer.render(in: context.cgContext)
        }
        guard let png = image.pngData() else { throw MotifShotError("The picture couldn't be made into a PNG.") }
        return (png, "Screens were drawn from their layers, without the render server: blurs and materials may be missing.", stateError)
    }

    /// Lets the main run loop turn until the window's layers stop changing (two quiet turns in a row), or the time is up.
    /// A layer is changing while it is laid out anew, shown or hidden, faded, given its contents (an image loaded) or
    /// animated: a screen that animates for ever (a spinner) is drawn when the time is up.
    private static func settleWindow(_ window: UIWindow, seconds: Double) {
        let deadline = Date().addingTimeInterval(seconds)
        var last = ""
        var quiet = 0
        while Date() < deadline {
            window.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            let now = describe(window.layer)
            quiet = now == last ? quiet + 1 : 0
            if quiet >= 2 { return }
            last = now
        }
    }

    static func describe(_ layer: CALayer) -> String {
        let animating = layer.animationKeys()?.isEmpty == false
        var out = "\(layer.frame)\(layer.sublayers?.count ?? 0)\(layer.isHidden)\(layer.opacity)\(layer.contents != nil)\(animating ? "~\(Date().timeIntervalSince1970)" : "")"
        for sub in layer.sublayers ?? [] { out += describe(sub) }
        return out
    }
}
