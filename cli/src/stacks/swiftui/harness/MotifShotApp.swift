// Written by Motif for one screenshot run: what the harness needs to know about this app (decision 0010).
@testable import __MODULE__
import SwiftUI

@MainActor
enum MotifShotApp {
    /// The app's root view: the content of the first WindowGroup in its App's body, found with Mirror.
    static func root() throws -> AnyView {
        let app = __APP__()
        guard let view = MotifMirror.firstView(in: app.body) else {
            throw MotifShotError("Motif couldn't find the view in __APP__'s WindowGroup. Draw its screens from previews (--screen).")
        }
        return view
    }

    /// Sets the generated theme's variant for the next view hosted: the guide's id (partner), or nil without variants.
    static func setVariant(_ id: String?) {
        // __VARIANT__
    }

    /// The view inside the generated theme's modifier, for its tint and variant, when the app has the theme.
    static func themed(_ view: AnyView) -> AnyView {
        // __THEMED__
        view
    }
}

enum MotifMirror {
    /// The first value inside the scene (or the value) that is a View, depth first.
    static func firstView(in value: Any, depth: Int = 0) -> AnyView? {
        if depth > 0, let view = value as? any View {
            return AnyView(view)
        }
        if depth > 8 { return nil }
        for child in Mirror(reflecting: value).children {
            if let view = firstView(in: child.value, depth: depth + 1) { return view }
        }
        return nil
    }
}
