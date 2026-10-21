//
//  BrokenPreview.swift
//  SwiftUI26
//

import SwiftUI

/// A preview that stops the app: its view needs an environment object nobody gives it. Motif's harness must fail this
/// screen with SwiftUI's reason, and still draw the others.
final class Session: ObservableObject {
    @Published var name = "Signed in"
}

struct SessionBadge: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        Text(session.name)
    }
}

#Preview("Broken") {
    SessionBadge()
}
