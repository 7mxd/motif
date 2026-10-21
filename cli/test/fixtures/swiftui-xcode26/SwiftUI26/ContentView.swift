//
//  ContentView.swift
//  SwiftUI26
//

import SwiftData
import SwiftUI

struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Query private var items: [Item]

    var body: some View {
        NavigationStack {
            List {
                Text(model.greeting)
                ForEach(items) { item in
                    Text(item.timestamp, format: Date.FormatStyle(date: .numeric, time: .standard))
                }
            }
            .navigationTitle("Items")
        }
    }
}

#Preview("Previewable") {
    @Previewable @State var on = true
    VStack {
        Toggle("Notifications", isOn: $on)
        ContentView()
            .environment(AppModel())
            .modelContainer(for: Item.self, inMemory: true)
    }
}
