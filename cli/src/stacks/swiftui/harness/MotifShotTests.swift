// Motif's screenshot harness for a SwiftUI app (decision 0010). Motif adds it to a copy of the app's project as a
// unit-test target hosted by the app (MotifShots), runs it in an iOS simulator Motif creates (or, for a macOS app, in
// the app on the Mac itself), and deletes both afterwards. It draws each shot the options list, writes the PNGs, and
// writes result.json next to the options.
import CoreText
import SwiftUI
import XCTest
#if os(macOS)
import AppKit
#else
import UIKit
#endif

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
        /// The audit's checks on the drawn screen (contrast, names, targets, motion), with --audit.
        let checks: [String]?
        /// Drawn with reduce motion on (SwiftUI's accessibilityReduceMotion), for the reduced-motion check.
        let reduceMotion: Bool?
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
    /// macOS: draw with AppKit alone, never the window server (to test that way).
    let appKitOnly: Bool?
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
    /// What the audit found on the drawn screen, the texts whose contrast it couldn't judge, and why it couldn't finish.
    var issues: [MotifIssue]?
    var unjudged: [String]?
    var auditError: String?
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
        // States find things, and the audit reads the screen, through the accessibility elements SwiftUI makes only
        // while accessibility is on.
        if options.shots.contains(where: { $0.state != nil || !($0.checks ?? []).isEmpty }) {
            MotifAccessibility.enable()
            if MotifAccessibility.enabled != true { result.notes.append(MotifAccessibility.problem) }
        }
        if let note = MotifShotDrawing.prepare(appKitOnly: options.appKitOnly ?? false) { result.notes.append(note) }
        // Reduce motion off to start with: a launch after one that stopped mid-shot finds the simulator as that left it.
        if options.shots.contains(where: { $0.reduceMotion == true }) { MotifReduceMotion.set(false) }
        let previews = MotifPreviews.all()
        result.previews = previews.map(\.info)
        try write(result, to: resultURL)

        for shot in options.shots {
            result.current = Current(screen: shot.screen, file: shot.file)
            try write(result, to: resultURL)
            let started = Date()
            var entry = ShotResult(file: shot.file, error: nil, ms: 0)
            // Reduce motion on as the app reads it, before the screen is made (SwiftUI's environment value is set too, when
            // it is hosted), and off again after it.
            let reduced = shot.reduceMotion == true
            let systemReduced = reduced ? MotifReduceMotion.set(true) : true
            defer { if reduced { MotifReduceMotion.set(false) } }
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
                    if let note = MotifShotApp.unkeptNote, !result.notes.contains(note) { result.notes.append(note) }
                    for name in MotifMirror.unapplied {
                        let note = "The App's scene modifier \(name) couldn't be given to the root view: what it gives (an environment value, a container) is missing there, and a screen that needs it may fail or draw differently. Give it inside the WindowGroup instead."
                        if !result.notes.contains(note) { result.notes.append(note) }
                    }
                } else if let preview = MotifPreviews.matching(previews, shot.screen) {
                    view = try preview.make()
                } else {
                    throw MotifShotError("The app has no #Preview at \(shot.screen).")
                }
                entry.view = MotifMirror.typeName(view)
                let checks = Set(shot.checks ?? [])
                var audit: MotifAuditOutcome?
                let drawn = try MotifShotDrawing.draw(MotifShotApp.themed(view), shot: shot, settle: settle, after: { window, png in
                    // The audit reads the window the screen was drawn in, and the picture just taken: after a state,
                    // once its editing has ended.
                    guard !checks.isEmpty else { return }
                    audit = MotifAudit.run(checks, window: window, png: png, scale: shot.scale, systemReduceMotion: systemReduced)
                }) { window in
                    // The state runs on the settled screen, with its own time limit; the screen is drawn as it leaves it.
                    guard let state = shot.state else { return nil }
                    let app = MotifHarness(window: window, variant: shot.variantId ?? "", locale: locale, dark: shot.dark, settle: settle)
                    switch MotifAsync.run(seconds: limit, { try await MotifHooks.state(state, app) }) {
                    case nil:
                        // Cancelled, and kept from acting on the screens after this one.
                        app.abandoned = true
                        return "State \"\(state)\": it was still running after \(Int(limit)) seconds."
                    case .failure(let error)?: return "State \"\(state)\": \(error)"
                    case .success?: return nil
                    }
                }
                entry.stateError = drawn.stateError
                if let audit {
                    entry.issues = audit.issues
                    if !audit.unjudged.isEmpty { entry.unjudged = audit.unjudged }
                    entry.auditError = audit.error
                    if let note = audit.note, !result.notes.contains(note) { result.notes.append(note) }
                }
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

extension View {
    /// Reduce motion on for this screen alone when `on`, as SwiftUI's previews set it (accessibilityReduceMotion reads
    /// it): nothing on the simulator or the Mac changes.
    @ViewBuilder
    func motifReduceMotion(_ on: Bool) -> some View {
        if on {
            environment(\._accessibilityReduceMotion, true)
        } else {
            self
        }
    }
}

struct MotifShotError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

#if !os(macOS)
@MainActor
enum MotifShotDrawing {
    /// Nothing to do before the first shot in the simulator: the app's own window stays behind the harness's.
    static func prepare(appKitOnly: Bool) -> String? { nil }

    /// Hosts the view in a window of its own at the shot's size and traits, waits for it to settle, and draws the window.
    static func draw(
        _ view: AnyView, shot: MotifShotOptions.Shot, settle: Double, after: (UIWindow, Data) -> Void = { _, _ in },
        state: (UIWindow) -> String? = { _ in nil }
    ) throws -> (png: Data, note: String?, stateError: String?) {
        let insets = shot.insets ?? [0, 0]
        // The window's own safe area comes from the simulator's screen; the shot's is given to SwiftUI instead.
        let root = view
            .safeAreaPadding(EdgeInsets(top: insets.first ?? 0, leading: 0, bottom: insets.last ?? 0, trailing: 0))
            .environment(\.locale, Locale(identifier: shot.locale))
            .environment(\.layoutDirection, shot.rtl ? .rightToLeft : .leftToRight)
            .motifReduceMotion(shot.reduceMotion == true)
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
        // The keyboard isn't drawn, and while it is up the screen is laid out above it: a field being edited (typed into
        // by a state, or focused by the screen itself) is left before the screen is drawn.
        if editing(window) {
            window.endEditing(true)
            // The keyboard goes away with an animation, after which the screen gets its height back.
            RunLoop.main.run(until: Date().addingTimeInterval(0.6))
            settleWindow(window, seconds: settle)
        }
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
            if drawn, let png = image.pngData() {
                after(window, png)
                return (png, nil, stateError)
            }
        }
        let image = UIGraphicsImageRenderer(bounds: bounds, format: format).image { context in
            window.layer.render(in: context.cgContext)
        }
        guard let png = image.pngData() else { throw MotifShotError("The picture couldn't be made into a PNG.") }
        after(window, png)
        return (png, "Screens were drawn from their layers, without the render server: blurs and materials may be missing.", stateError)
    }

    /// Lets the main run loop turn until the window's layers stop changing (two quiet turns in a row), or the time is up.
    /// A layer is changing while it is laid out anew, shown or hidden, faded or given its contents (an image loaded).
    /// Running animations aren't waited for: a text field's blinking caret, or a spinner, never stops.
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

    private static func editing(_ view: UIView) -> Bool {
        if view.isFirstResponder, view is UITextField || view is UITextView { return true }
        return view.subviews.contains { editing($0) }
    }

    static func describe(_ layer: CALayer) -> String {
        var out = "\(layer.frame)\(layer.sublayers?.count ?? 0)\(layer.isHidden)\(layer.opacity)\(layer.contents != nil)"
        for sub in layer.sublayers ?? [] { out += describe(sub) }
        return out
    }
}
#else
/// The harness's window on the Mac: it stays where it is put, off every screen (AppKit moves a titled window back onto
/// a screen otherwise), and can take the keyboard for a state's typing.
final class MotifShotWindow: NSWindow {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
    override var canBecomeKey: Bool { true }

    /// The scale its views are laid out and drawn at, whatever the screen's (decision 0010, §17).
    var drawingScale: CGFloat = 0
    override var backingScaleFactor: CGFloat { drawingScale > 0 ? drawingScale : super.backingScaleFactor }

    /// Drawn as the window in front is, though its app stays in the background: its controls in the accent colour
    /// (a prominent button, a switch that's on), its title bar's buttons in colour, its sidebar's selection emphasised.
    /// AppKit asks a window these (the last five are its own, not API); a later macOS that asks otherwise draws the
    /// window as one behind the others, greyed, and nothing else changes.
    override var isKeyWindow: Bool { true }
    override var isMainWindow: Bool { true }
    @objc func _hasActiveAppearance() -> Bool { true }
    @objc func _hasActiveAppearanceIgnoringKeyFocus() -> Bool { true }
    @objc func _hasKeyAppearance() -> Bool { true }
    @objc func hasKeyAppearance() -> Bool { true }
    @objc func _hasMainAppearance() -> Bool { true }

    /// AppKit's own methods the active look rests on, for the note when one is missing.
    static let activeLook = ["_hasActiveAppearance", "_hasActiveAppearanceIgnoringKeyFocus", "_hasKeyAppearance", "hasKeyAppearance", "_hasMainAppearance"]
}

@MainActor
enum MotifShotDrawing {
    /// Before the first shot: the app's own windows (its WindowGroup's, opened at launch) are taken off the screen, and
    /// the app leaves the Dock and gives the focus back if it had it, so a run stays out of the way of the Mac's screen.
    /// Accessibility is turned on for every run, not only those with a state: on CI's macOS 15 runner, only runs with
    /// it on got 2× pictures from the window server (decision 0010, §17).
    /// When AppKit lacks one of the methods MotifShotWindow answers for the active look, the note says so: the shots'
    /// controls may then be drawn as in a window behind the others.
    static func prepare(appKitOnly: Bool) -> String? {
        self.appKitOnly = appKitOnly
        for window in NSApp.windows where window.isVisible { window.orderOut(nil) }
        NSApp.setActivationPolicy(.accessory)
        if NSApp.isActive { NSApp.deactivate() }
        MotifAccessibility.enable()
        let missing = MotifShotWindow.activeLook.filter { class_getInstanceMethod(NSWindow.self, NSSelectorFromString($0)) == nil }
        guard !missing.isEmpty else { return nil }
        return "This macOS's AppKit has no \(missing.joined(separator: ", ")), which Motif answers to draw its windows as the window in front: buttons, switches and the title bar's buttons may be drawn grey, as in a window behind the others. Tell Motif's maintainers which macOS you use."
    }

    /// Draw with AppKit alone, never the window server (MOTIF_SWIFTUI_APPKIT=1, to test that way).
    static var appKitOnly = false

    /// Said once when a shot couldn't be taken from the window server, with what it gave instead.
    static func withoutWindowServer(_ why: String) -> String {
        "Some screens were drawn by AppKit alone, without the window server (\(why)): sidebars, toolbars and other glass or translucent materials may be missing from them."
    }

    /// Hosts the view in a window of its own, off the screen, at the shot's size (the window's whole frame: its title bar
    /// and toolbar over the content, as a window with a full-size content view has them), in light or dark, left to
    /// right or right to left; waits for it to settle; and takes the window's picture at the shot's scale.
    static func draw(
        _ view: AnyView, shot: MotifShotOptions.Shot, settle: Double, after: (NSWindow, Data) -> Void = { _, _ in },
        state: (NSWindow) -> String? = { _ in nil }
    ) throws -> (png: Data, note: String?, stateError: String?) {
        let size = NSSize(width: shot.width, height: shot.height)
        let root = view
            .environment(\.locale, Locale(identifier: shot.locale))
            .environment(\.layoutDirection, shot.rtl ? .rightToLeft : .leftToRight)
            .motifReduceMotion(shot.reduceMotion == true)
        let host = NSHostingView(rootView: AnyView(root))
        host.sizingOptions = []
        let window = MotifShotWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: shot.dark ? .darkAqua : .aqua)
        window.contentView = host
        host.userInterfaceLayoutDirection = shot.rtl ? .rightToLeft : .leftToRight
        // Off every screen: nothing shows on the Mac, and the app isn't brought forward.
        window.setFrame(NSRect(origin: NSPoint(x: -20000 - size.width, y: -20000 - size.height), size: size), display: false)
        // After the window is placed: placing it sets its resolution from the screen again.
        let scaled = setScale(window, shot.scale)
        window.orderFrontRegardless()
        defer {
            window.makeFirstResponder(nil)
            window.orderOut(nil)
            window.contentView = nil
            window.close()
        }
        settleWindow(window, seconds: settle)
        let stateError = state(window)
        if stateError != nil || shot.state != nil { settleWindow(window, seconds: settle) }
        // A field being edited is left, so the picture has no caret or focus ring the screen wouldn't show on its own.
        if window.firstResponder is NSText {
            window.makeFirstResponder(nil)
            settleWindow(window, seconds: settle)
        }
        window.displayIfNeeded()
        CATransaction.flush()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        // The window server takes the new scale, and the window's latest frame, a moment after AppKit: on a busy Mac
        // (CI's runner) its first picture can still be the 1× one, so it is asked again, for up to 2 s.
        var why = appKitOnly ? "Motif was told to draw with AppKit alone, MOTIF_SWIFTUI_APPKIT=1" : "AppKit can't set the window's scale"
        if scaled && !appKitOnly {
            let deadline = Date().addingTimeInterval(2)
            while true {
                switch windowServerPicture(window, size: size, scale: shot.scale, dark: shot.dark) {
                case .success(let png):
                    after(window, png)
                    return (png, nil, stateError)
                case .failure(let reason): why = reason.description
                }
                if Date() >= deadline { break }
                // Asked again: the window server may have kept the window's first scale.
                _ = setScale(window, shot.scale)
                window.display()
                CATransaction.flush()
                RunLoop.main.run(until: Date().addingTimeInterval(0.1))
            }
        }
        let png = try viewsPicture(window, scale: shot.scale, dark: shot.dark)
        after(window, png)
        return (png, withoutWindowServer(why), stateError)
    }

    /// Makes the window's surface the shot's scale (2× on a Mac whose screen is 1×), through AppKit's
    /// _setWindowResolution:, so the window server draws it at that scale; AppKit lays out and draws the views for that
    /// scale too (MotifShotWindow.drawingScale). False when AppKit has no such method: then only the views are drawn at
    /// the scale, by AppKit alone. Whether the window server took it shows in its picture's size.
    private static func setScale(_ window: MotifShotWindow, _ scale: Double) -> Bool {
        window.drawingScale = CGFloat(scale)
        let selector = NSSelectorFromString("_setWindowResolution:")
        guard let method = class_getInstanceMethod(NSWindow.self, selector) else { return false }
        typealias Set = @convention(c) (NSWindow, Selector, CGFloat) -> Void
        unsafeBitCast(method_getImplementation(method), to: Set.self)(window, selector, CGFloat(scale))
        return true
    }

    /// The window as the window server composites it (glass, materials and the title bar included), at the shot's size
    /// and scale, its frame's edge trimmed and its rounded corners filled with the window's background. A process may
    /// take its own windows' pictures without the Screen Recording permission. CGWindowListCreateImage is asked for by
    /// name: the macOS 15 SDK no longer declares it. Fails, saying what it got, when it isn't there, gives nothing, or
    /// gives another size or an empty picture.
    private static func windowServerPicture(_ window: NSWindow, size: NSSize, scale: Double, dark: Bool) -> Result<Data, MotifShotError> {
        guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else {
            return .failure(MotifShotError("this macOS has no CGWindowListCreateImage"))
        }
        typealias Create = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
        // kCGWindowListOptionIncludingWindow; kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution.
        guard let image = unsafeBitCast(symbol, to: Create.self)(.null, 8, UInt32(window.windowNumber), 1 | 8)?.takeRetainedValue() else {
            return .failure(MotifShotError("it gave no picture of the window"))
        }
        let width = Int((size.width * scale).rounded())
        let height = Int((size.height * scale).rounded())
        let dx = (image.width - width) / 2
        let dy = (image.height - height) / 2
        guard dx >= 0, dy >= 0, dx <= Int(scale) * 2, dy <= Int(scale) * 2 else {
            return .failure(MotifShotError("it gave a \(image.width)×\(image.height) picture of a \(Int(size.width))×\(Int(size.height)) window at \(Int(scale))×"))
        }
        // A surface not drawn yet is see-through in the middle.
        if let data = image.dataProvider?.data, let bytes = CFDataGetBytePtr(data), image.bitsPerPixel == 32, image.alphaInfo != .none,
           image.alphaInfo != .noneSkipFirst, image.alphaInfo != .noneSkipLast {
            let at = (image.height / 2) * image.bytesPerRow + (image.width / 2) * 4
            let alphaFirst = image.alphaInfo == .premultipliedFirst || image.alphaInfo == .first
            if bytes[at + (alphaFirst ? 0 : 3)] == 0 { return .failure(MotifShotError("it gave an empty picture of the window")) }
        }
        guard let cropped = image.cropping(to: CGRect(x: dx, y: dy, width: width, height: height)) else {
            return .failure(MotifShotError("its picture couldn't be cropped"))
        }
        guard let png = opaquePNG(cropped, dark: dark) else { return .failure(MotifShotError("its picture couldn't be made into a PNG")) }
        return .success(png)
    }

    /// The picture as an opaque sRGB PNG: drawn over the window's background colour, so the window's rounded corners,
    /// and anything see-through, read as the window, as the other stacks' shots do.
    private static func opaquePNG(_ image: CGImage, dark: Bool) -> Data? {
        let width = image.width
        let height = image.height
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
        else { return nil }
        var background = CGColor(gray: dark ? 0 : 1, alpha: 1)
        NSAppearance(named: dark ? .darkAqua : .aqua)?.performAsCurrentDrawingAppearance {
            background = NSColor.windowBackgroundColor.usingColorSpace(.sRGB)?.cgColor ?? background
        }
        context.setFillColor(background)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        guard let flat = context.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: flat).representation(using: .png, properties: [:])
    }

    /// The window's frame view (the content, with the title bar and toolbar over it) drawn by AppKit at the shot's
    /// scale, opaque. Glass and translucent materials are drawn by the window server, so they are missing here.
    private static func viewsPicture(_ window: NSWindow, scale: Double, dark: Bool) throws -> Data {
        guard let frameView = window.contentView?.superview else { throw MotifShotError("The window has no frame view to draw.") }
        let bounds = frameView.bounds
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: Int((bounds.width * scale).rounded()), pixelsHigh: Int((bounds.height * scale).rounded()),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
        else { throw MotifShotError("Motif couldn't make a picture of \(Int(bounds.width))×\(Int(bounds.height)) at \(scale)×.") }
        rep.size = bounds.size
        frameView.cacheDisplay(in: bounds, to: rep)
        guard let image = rep.cgImage, let png = opaquePNG(image, dark: dark) else { throw MotifShotError("The picture couldn't be made into a PNG.") }
        return png
    }

    /// Lets the main run loop turn until the window's views and layers stop changing (two quiet turns in a row), or the
    /// time is up, as in the simulator: a view laid out anew, shown or hidden, faded, or given its contents.
    private static func settleWindow(_ window: NSWindow, seconds: Double) {
        let deadline = Date().addingTimeInterval(seconds)
        var last = ""
        var quiet = 0
        while Date() < deadline {
            window.contentView?.layoutSubtreeIfNeeded()
            window.displayIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            let now = describe(window.contentView)
            quiet = now == last ? quiet + 1 : 0
            if quiet >= 2 { return }
            last = now
        }
    }

    /// A view's frames and layers, and its subviews', as a string that changes when any of them does.
    static func describe(_ view: NSView?) -> String {
        guard let view else { return "" }
        var out = "\(view.frame)\(view.isHidden)\(view.alphaValue)"
        if let layer = view.layer { out += describe(layer) }
        for sub in view.subviews { out += describe(sub) }
        return out
    }

    static func describe(_ layer: CALayer) -> String {
        var out = "\(layer.frame)\(layer.sublayers?.count ?? 0)\(layer.isHidden)\(layer.opacity)\(layer.contents != nil)"
        for sub in layer.sublayers ?? [] { out += describe(sub) }
        return out
    }
}
#endif
