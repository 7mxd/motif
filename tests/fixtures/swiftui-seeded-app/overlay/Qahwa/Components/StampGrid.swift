//
//  StampGrid.swift
//  Qahwa
//

import SwiftUI

/// The card's stamps, five to a row: a filled cup for each drink, an empty one for each still to come. Read as one
/// element ("7 of 10 stamps"), not as ten pictures.
struct StampGrid: View {
    let stamps: Int
    let goal: Int
    @Environment(\.motifColors) private var colors

    var body: some View {
        Grid(horizontalSpacing: MotifSpace.s2, verticalSpacing: MotifSpace.s2) {
            ForEach(0..<rows, id: \.self) { row in
                GridRow {
                    ForEach(0..<5, id: \.self) { column in
                        stamp(filled: row * 5 + column < stamps)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("\(stamps) of \(goal) stamps"))
    }

    private var rows: Int { (goal + 4) / 5 }

    private func stamp(filled: Bool) -> some View {
        ZStack {
            Circle()
                .fill(filled ? Color(red: 0.54, green: 0.29, blue: 0.16) : colors.surface)
            Circle()
                .strokeBorder(filled ? colors.actionPrimary : colors.border)
            Image(systemName: "cup.and.saucer.fill")
                .foregroundStyle(filled ? colors.onActionPrimary : colors.border)
        }
        .frame(width: 40, height: 40)
    }
}
