//
//  DrinkScreen.swift
//  Qahwa
//

import SwiftUI

/// A drink's page: what it is, its price, oat milk or not, and adding it to the order.
struct DrinkScreen: View {
    let drink: Drink
    @State private var oatMilk = false
    @State private var favourite = false
    @State private var added = false
    @Environment(\.motifColors) private var colors
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MotifSpace.s6) {
                Image(systemName: drink.symbol)
                    .motifFont(.display)
                    .foregroundStyle(colors.actionPrimary)
                    .frame(width: 96, height: 96)
                    .background(colors.actionSecondary, in: Circle())
                    .accessibilityHidden(true)
                HStack(alignment: .top, spacing: MotifSpace.s2) {
                    VStack(alignment: .leading, spacing: MotifSpace.s2) {
                        Text(drink.name)
                            .motifFont(.title)
                            .foregroundStyle(colors.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                        Text(drink.price, format: .currency(code: "SAR"))
                            .motifFont(.label)
                            .foregroundStyle(colors.actionPrimary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        favourite.toggle()
                    } label: {
                        Image(systemName: favourite ? "heart.fill" : "heart")
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(colors.actionPrimary)
                }
                Text(drink.details)
                    .motifFont(.body)
                    .foregroundStyle(colors.textSecondary)
                Toggle("Oat milk", isOn: $oatMilk)
                    .motifFont(.body)
                    .foregroundStyle(colors.textPrimary)
                    .card()
                VStack(alignment: .leading, spacing: MotifSpace.s3) {
                    Button("Add to order") {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            added = true
                        }
                    }
                    .buttonStyle(.bordered)
                    if added {
                        HStack(spacing: MotifSpace.s2) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(colors.success)
                                .accessibilityHidden(true)
                            Text("Added to your order")
                                .motifFont(.label)
                                .foregroundStyle(colors.textPrimary)
                        }
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(colors.background)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Drink") {
    NavigationStack {
        DrinkScreen(drink: MenuData.drinks[1])
    }
    .motifTheme()
}
