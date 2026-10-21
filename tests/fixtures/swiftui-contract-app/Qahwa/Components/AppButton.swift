//
//  AppButton.swift
//  Qahwa
//

import SwiftUI

/// The app's button: primary for the one main action on a screen, secondary for supporting ones.
struct AppButton: View {
    enum Kind {
        case primary
        case secondary
    }

    let title: LocalizedStringKey
    var kind: Kind = .primary
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(AppButtonStyle(kind: kind))
    }
}

/// Draws the pressed and disabled looks, full width and at least 48 points high.
struct AppButtonStyle: ButtonStyle {
    var kind: AppButton.Kind = .primary
    @Environment(\.motifColors) private var colors
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        // A disabled primary button takes the secondary look, a pair the guide checks, so it stays readable.
        let primary = kind == .primary && isEnabled
        configuration.label
            .motifFont(.label)
            .foregroundStyle(primary ? colors.onActionPrimary : colors.onActionSecondary)
            .padding(.horizontal, MotifSpace.s6)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(primary ? colors.actionPrimary : colors.actionSecondary, in: RoundedRectangle(cornerRadius: MotifRadius.md))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .contentShape(Rectangle())
    }
}
