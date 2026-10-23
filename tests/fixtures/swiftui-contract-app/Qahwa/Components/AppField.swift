//
//  AppField.swift
//  Qahwa
//

import SwiftUI

/// One line of text, or a password, with its label above it and its error below.
struct AppField: View {
    let label: LocalizedStringKey
    @Binding var text: String
    var prompt: LocalizedStringKey? = nil
    var secure = false
    var error: LocalizedStringKey? = nil
    @FocusState private var focused: Bool
    @Environment(\.motifColors) private var colors

    var body: some View {
        VStack(alignment: .leading, spacing: MotifSpace.s1) {
            // The field says its own name, so VoiceOver doesn't read the label twice. With a prompt, iOS would name the
            // field by its prompt ("name@example.com"), so its name is set to the label.
            Text(label)
                .motifFont(.label)
                .foregroundStyle(colors.textSecondary)
                .accessibilityHidden(true)
            field
                .accessibilityLabel(label)
                .motifFont(.body)
                .foregroundStyle(colors.textPrimary)
                .focused($focused)
                .padding(MotifSpace.s3)
                .background(colors.surface, in: RoundedRectangle(cornerRadius: MotifRadius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: MotifRadius.md)
                        .strokeBorder(error != nil ? colors.danger : focused ? colors.focus : colors.border, lineWidth: focused ? 2 : 1)
                )
            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .motifFont(.caption)
                    .foregroundStyle(colors.danger)
            }
        }
    }

    @ViewBuilder private var field: some View {
        if secure {
            SecureField(label, text: $text, prompt: prompt.map { Text($0) })
        } else {
            TextField(label, text: $text, prompt: prompt.map { Text($0) })
        }
    }
}
