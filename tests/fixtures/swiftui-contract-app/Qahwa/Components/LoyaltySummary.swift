//
//  LoyaltySummary.swift
//  Qahwa
//

import SwiftUI

/// The loyalty card on the menu: its stamps, and how many drinks are left until a free one. The label of the card that
/// opens the loyalty card.
struct LoyaltySummary: View {
    let stamps: Int
    let goal: Int
    @Environment(\.motifColors) private var colors

    var body: some View {
        VStack(alignment: .leading, spacing: MotifSpace.s3) {
            Text("Your card")
                .motifFont(.heading)
                .foregroundStyle(colors.textPrimary)
            StampGrid(stamps: stamps, goal: goal)
            Text("\(goal - stamps) more drinks until a free one")
                .motifFont(.body)
                .foregroundStyle(colors.textSecondary)
        }
        .multilineTextAlignment(.leading)
    }
}
