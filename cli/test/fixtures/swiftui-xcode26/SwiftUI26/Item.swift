//
//  Item.swift
//  SwiftUI26
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date

    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}

/// The app's state, held by the App and handed down with .environment.
@Observable
final class AppModel {
    var greeting = "Hello from the model"
}
