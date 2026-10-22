//
//  ContentView.swift
//  SwiftUIMin
//

import SwiftUI

/// The places the app's NavigationStack can open.
enum Route: Hashable {
    case settings
}

struct ContentView: View {
    var body: some View {
        NavigationStack {
            HomeScreen()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .settings:
                        SettingsScreen()
                    }
                }
        }
    }
}

#Preview {
    ContentView()
}
