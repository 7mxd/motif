//
//  DrinkCard.swift
//  Qahwa
//

import SwiftUI

/// A drink in the menu: its name, a line about it and its price. The label of the card that opens its page.
struct DrinkCard: View {
    let drink: Drink
    @Environment(\.motifColors) private var colors

    var body: some View {
        HStack(spacing: MotifSpace.s3) {
            VStack(alignment: .leading, spacing: MotifSpace.s1) {
                Text(drink.name)
                    .motifFont(.body)
                    .foregroundStyle(colors.textPrimary)
                Text(drink.details)
                    .motifFont(.caption)
                    .foregroundStyle(colors.textSecondary)
                    .lineLimit(2)
                Text(drink.price, format: .currency(code: "SAR"))
                    .motifFont(.label)
                    .foregroundStyle(colors.actionPrimary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.forward")
                .foregroundStyle(colors.textSecondary)
                .accessibilityHidden(true)
        }
        .multilineTextAlignment(.leading)
    }
}
