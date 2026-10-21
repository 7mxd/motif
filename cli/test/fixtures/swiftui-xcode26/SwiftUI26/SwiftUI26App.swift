//
//  SwiftUI26App.swift
//  SwiftUI26
//

import SwiftData
import SwiftUI

@main
struct SwiftUI26App: App {
    @State private var model = AppModel()

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Item.self,
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup("SwiftUI 26") {
            ContentView()
                .environment(model)
        }
        .modelContainer(sharedModelContainer)
    }
}
