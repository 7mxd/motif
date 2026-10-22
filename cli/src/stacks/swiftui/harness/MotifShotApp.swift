// Written by Motif for one screenshot run: what the harness needs to know about this app (decision 0010).
@testable import __MODULE__
import SwiftUI

/// The App's own @State (`@State private var model = AppModel()`) is installed by SwiftUI only inside a view. Read outside
/// one, as Motif reads the App's WindowGroup, it makes a new model on every read, so what the root's modifiers write
/// (Landmarks's window size) would be lost. As a property of a view, the App's @State is installed like the view's own.
extension __APP__: DynamicProperty {}

/// Holds the App for the root view being drawn: a new App for each (its init runs again, as at a launch), its @State
/// installed in a view that lives until the next one (decision 0010, §4). So each screenshot of the root starts from the
/// App as it starts, on every SDK: with Xcode 16's SDK an App's @State value is made once with the App, so one App kept for
/// the launch would carry what one screenshot did to its model (a sign-in, a counter) into the next.
@MainActor
enum MotifAppState {
    /// The App as the keeper's view has it, for the root view being drawn: its @State reads that view's one value.
    static var installed: __APP__?
    /// The renderer whose view holds the App's state; kept until the next root view, so the state lives as long as it.
    static var keeper: ImageRenderer<MotifAppKeeper>?
    /// The names of the App's @State properties that couldn't be kept, for the run's note; empty when all were.
    static var unkept: [String] = []

    /// A new App for a root view, its @State installed when SwiftUI can.
    static func app() -> __APP__ {
        installed = nil
        let made = __APP__()
        let renderer = ImageRenderer(content: MotifAppKeeper(app: made))
        keeper = renderer
        _ = renderer.cgImage
        let app = installed ?? made
        unkept = stateNames(app).filter { !$0.kept }.map(\.name)
        return app
    }

    /// The App's @State properties (State or, in newer SDKs, LazyState), and whether each was installed.
    static func stateNames(_ app: __APP__) -> [(name: String, kept: Bool)] {
        Mirror(reflecting: app).children.compactMap { child in
            let type = String(describing: Swift.type(of: child.value))
            guard type.hasPrefix("State<") || type.hasPrefix("LazyState<"), let label = child.label else { return nil }
            let location = Mirror(reflecting: child.value).children.first { $0.label == "_location" }?.value
            let kept = location.map { Mirror(reflecting: $0).displayStyle != .optional || Mirror(reflecting: $0).children.first != nil } ?? false
            return (String(label.drop { $0 == "_" }), kept)
        }
    }
}

/// A view whose one property is the App: SwiftUI installs the App's @State when it makes the view.
struct MotifAppKeeper: View {
    var app: __APP__

    var body: some View {
        MotifAppState.installed = app
        return Color.clear.frame(width: 1, height: 1)
    }
}

@MainActor
enum MotifShotApp {
    /// The app's root view: what the first WindowGroup in its App's body shows, from the launch's one App.
    static func root() throws -> AnyView {
        MotifMirror.unapplied = []
        guard let view = MotifMirror.windowContent(MotifAppState.app().body) else {
            throw MotifShotError("Motif couldn't find the view inside __APP__'s WindowGroup. Draw its screens from previews (--screen) instead.")
        }
        return view
    }

    /// Said when the App's @State couldn't be kept for the root: the root may then draw as if what it wrote were lost.
    static var unkeptNote: String? {
        let names = MotifAppState.unkept
        guard !names.isEmpty else { return nil }
        let list = names.map { "`\($0)`" }.joined(separator: ", ")
        return "__APP__ keeps \(list) in @State, which Motif couldn't keep for the root view: SwiftUI makes it again each time it is read there, so / may be drawn without what the App's root writes into it. Draw that screen from a #Preview that holds the model with @Previewable @State."
    }

    /// Sets the generated theme's variant for the views hosted from now on: the guide's id (partner). A variant the
    /// app's MotifTheme.swift doesn't have fails the shot, rather than drawing the app's own.
    static func setVariant(_ id: String?) throws {
        // __VARIANT__
    }

    /// The view inside the generated theme's modifier, for its tint and variant, when the app has the theme.
    static func themed(_ view: AnyView) -> AnyView {
        // __THEMED__
        view
    }
}
