//
//  Card.swift
//  Qahwa
//

import SwiftUI

/// The guide's card: surface-raised, with a border and no shadow, and radius lg.
struct CardBackground: ViewModifier {
    var pressed = false
    @Environment(\.motifColors) private var colors

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 10)
        content
            .padding(MotifSpace.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(colors.surfaceRaised, in: shape)
            .overlay(shape.strokeBorder(pressed ? colors.textSecondary : colors.border))
    }
}

extension View {
    /// Draws the view as one of the guide's cards.
    func card() -> some View {
        modifier(CardBackground())
    }
}

/// A card that opens something: a NavigationLink's or a Button's style, so it keeps the button's name, focus and press.
struct CardButtonStyle: ButtonStyle {
    @Environment(\.motifColors) private var colors

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(colors.textPrimary)
            .modifier(CardBackground(pressed: configuration.isPressed))
            .contentShape(Rectangle())
    }
}
