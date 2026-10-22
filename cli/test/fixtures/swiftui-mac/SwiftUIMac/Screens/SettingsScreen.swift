//
//  SettingsScreen.swift
//  SwiftUIMac
//

import SwiftUI

struct SettingsScreen: View {
    @State private var notifications = true
    @State private var name = ""

    var body: some View {
        Form {
            Toggle("Notifications", isOn: $notifications)
            TextField("Name", text: $name)
            Button("Sign out") {}
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
    }
}

#Preview("Settings") {
    SettingsScreen()
}
