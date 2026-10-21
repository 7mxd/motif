//
//  MenuScreen.swift
//  Qahwa
//

import SwiftUI

/// The start: the loyalty card's stamps, then the hot and cold drinks, each opening its page.
struct MenuScreen: View {
    var card = LoyaltyCard.current
    var drinks = MenuData.drinks
    @Environment(\.motifColors) private var colors

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MotifSpace.s6) {
                Text("Menu")
                    .motifFont(.title)
                    .foregroundStyle(colors.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                NavigationLink(value: Route.loyalty) {
                    LoyaltySummary(stamps: card.stamps, goal: card.goal)
                }
                .buttonStyle(CardButtonStyle())
                section("Hot drinks", kind: .hot)
                section("Cold drinks", kind: .cold)
            }
            .padding(MotifSpace.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(colors.background)
        .navigationTitle("Menu")
        .toolbar(.hidden, for: .navigationBar)
    }

    private func section(_ title: LocalizedStringKey, kind: Drink.Kind) -> some View {
        VStack(alignment: .leading, spacing: MotifSpace.s4) {
            Text(title)
                .motifFont(.heading)
                .foregroundStyle(colors.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(drinks.filter { $0.kind == kind }) { drink in
                NavigationLink(value: Route.drink(drink.id)) {
                    DrinkCard(drink: drink)
                }
                .buttonStyle(CardButtonStyle())
            }
        }
    }
}

#Preview("Menu") {
    NavigationStack {
        MenuScreen()
            .routeDestinations()
    }
    .motifTheme()
}
