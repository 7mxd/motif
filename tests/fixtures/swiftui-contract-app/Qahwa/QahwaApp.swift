//
//  QahwaApp.swift
//  Qahwa
//

import SwiftUI

@main
struct QahwaApp: App {
    /// The design variant the member chose on the loyalty card (Evening colours).
    @AppStorage(Session.variantKey) private var variant = MotifVariant.defaultVariant.rawValue

    var body: some Scene {
        WindowGroup {
            ContentView()
                .motifTheme(variant: MotifVariant(rawValue: variant) ?? .defaultVariant)
        }
    }
}
