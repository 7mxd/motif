// Written by Motif for one screenshot run: what the harness needs to know about this app (decision 0010).
@testable import __MODULE__
import SwiftUI

@MainActor
enum MotifShotApp {
    /// The app's root view: what the first WindowGroup in its App's body shows.
    static func root() throws -> AnyView {
        guard let view = MotifMirror.windowContent(__APP__().body) else {
            throw MotifShotError("Motif couldn't find the view in __APP__'s WindowGroup. Draw its screens from previews (--screen).")
        }
        return view
    }

    /// Sets the generated theme's variant for the views hosted from now on: the guide's id (partner).
    static func setVariant(_ id: String?) {
        // __VARIANT__
    }

    /// The view inside the generated theme's modifier, for its tint and variant, when the app has the theme.
    static func themed(_ view: AnyView) -> AnyView {
        // __THEMED__
        view
    }
}
