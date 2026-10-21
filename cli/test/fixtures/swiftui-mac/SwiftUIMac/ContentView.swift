//
//  ContentView.swift
//  SwiftUIMac
//

import SwiftUI

/// The places the sidebar can open.
enum Section: String, CaseIterable, Identifiable {
    case home = "Home"
    case settings = "Settings"

    var id: String { rawValue }
}

struct ContentView: View {
    @State private var section: Section? = .home

    var body: some View {
        NavigationSplitView {
            List(Section.allCases, selection: $section) { item in
                Text(LocalizedStringKey(item.rawValue))
                    .tag(item)
            }
            .navigationSplitViewColumnWidth(min: 160, ideal: 200)
        } detail: {
            switch section ?? .home {
            case .home:
                HomeScreen()
            case .settings:
                SettingsScreen()
            }
        }
    }
}

#Preview {
    ContentView()
}
