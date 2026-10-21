//
//  MenuData.swift
//  Qahwa
//

import SwiftUI

/// A drink on the menu. Its name and description are keys in Localizable.xcstrings, so they follow the screen's language.
struct Drink: Identifiable {
    enum Kind {
        case hot
        case cold
    }

    let id: String
    let name: LocalizedStringKey
    let details: LocalizedStringKey
    /// In Saudi riyals.
    let price: Decimal
    let kind: Kind
    /// The SF Symbol on its page.
    let symbol: String
}

/// A member's loyalty card: a stamp for each drink, and the drink after the last stamp is free.
struct LoyaltyCard {
    let stamps: Int
    let goal: Int
    let member: String

    static let current = LoyaltyCard(stamps: 7, goal: 10, member: "QH-2048-117")
}

/// The shop's menu: mock data, kept on the phone.
enum MenuData {
    static let drinks: [Drink] = [
        Drink(id: "flat-white", name: "Flat white", details: "Espresso with a thin layer of steamed milk.", price: 16, kind: .hot, symbol: "cup.and.saucer.fill"),
        Drink(id: "cardamom-latte", name: "Cardamom latte", details: "Our latte with green cardamom, ground each morning.", price: 19, kind: .hot, symbol: "cup.and.saucer.fill"),
        Drink(id: "saudi-coffee", name: "Saudi coffee", details: "Light-roast coffee with saffron and cardamom, served with dates.", price: 12, kind: .hot, symbol: "cup.and.saucer.fill"),
        Drink(id: "cold-brew", name: "Cold brew", details: "Steeped for eighteen hours and poured over ice.", price: 18, kind: .cold, symbol: "takeoutbag.and.cup.and.straw.fill"),
        Drink(id: "iced-spanish-latte", name: "Iced Spanish latte", details: "Espresso and sweetened condensed milk over ice.", price: 21, kind: .cold, symbol: "takeoutbag.and.cup.and.straw.fill"),
    ]

    static func drink(_ id: Drink.ID) -> Drink? {
        drinks.first { $0.id == id }
    }
}
