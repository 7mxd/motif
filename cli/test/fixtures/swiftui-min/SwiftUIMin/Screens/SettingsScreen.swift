//
//  SettingsScreen.swift
//  SwiftUIMin
//

import SwiftUI

struct SettingsScreen: View {
    @State private var notifications = true

    var body: some View {
        Form {
            Toggle("Notifications", isOn: $notifications)
            Button("Sign out") {}
        }
        .navigationTitle("Settings")
    }
}

#Preview("Settings") {
    NavigationStack {
        SettingsScreen()
    }
}
