//
//  LoyaltyScreen.swift
//  Qahwa
//

import SwiftUI

/// The loyalty card: its stamps, the member number, the Evening colours switch, and signing out.
struct LoyaltyScreen: View {
    var card = LoyaltyCard.current
    @AppStorage(Session.variantKey) private var variant = MotifVariant.defaultVariant.rawValue
    @AppStorage(Session.signedInKey) private var signedIn = false
    @State private var steaming = false
    @Environment(\.motifColors) private var colors

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MotifSpace.s6) {
                HStack(spacing: MotifSpace.s2) {
                    Text("Your card")
                        .motifFont(.title)
                        .foregroundStyle(colors.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Image(systemName: "cup.and.saucer.fill")
                        .motifFont(.title)
                        .foregroundStyle(colors.actionPrimary)
                        .scaleEffect(steaming ? 1.15 : 1)
                        .accessibilityHidden(true)
                        .onAppear {
                            withAnimation(MotifCurves.standard(over: MotifDurations.slow).repeatForever(autoreverses: true)) {
                                steaming = true
                            }
                        }
                }
                VStack(alignment: .leading, spacing: MotifSpace.s4) {
                    StampGrid(stamps: card.stamps, goal: card.goal)
                    Text("\(card.goal - card.stamps) more drinks until a free one")
                        .motifFont(.body)
                        .foregroundStyle(colors.textPrimary)
                    HStack(spacing: MotifSpace.s2) {
                        Text("Member \(card.member)")
                            .font(.system(size: 15))
                            .foregroundStyle(colors.textSecondary)
                        Spacer()
                        Button {
                            UIPasteboard.general.string = card.member
                        } label: {
                            Text("Copy")
                                .motifFont(.label)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(colors.actionPrimary)
                        .accessibilityLabel("Copy member number")
                    }
                }
                .card()
                Toggle("Evening colours", isOn: evening)
                    .motifFont(.body)
                    .foregroundStyle(colors.textPrimary)
                    .card()
                AppButton(title: "Sign out") {
                    signedIn = false
                }
            }
            .padding(MotifSpace.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(colors.background)
        .navigationBarTitleDisplayMode(.inline)
    }

    /// The switch reads and writes the variant the App passes to .motifTheme.
    private var evening: Binding<Bool> {
        Binding(
            get: { variant == MotifVariant.evening.rawValue },
            set: { variant = ($0 ? MotifVariant.evening : .defaultVariant).rawValue }
        )
    }
}

#Preview("Loyalty card") {
    NavigationStack {
        LoyaltyScreen()
    }
    .motifTheme()
}
