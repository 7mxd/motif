//
//  ContentView.swift
//  Qahwa
//

import SwiftUI

/// The places the menu's NavigationStack opens.
enum Route: Hashable {
    case drink(Drink.ID)
    case loyalty
}

/// The app's root: the menu for a member who has signed in, Sign in for anyone else.
struct ContentView: View {
    @AppStorage(Session.signedInKey) private var signedIn = false

    var body: some View {
        if signedIn {
            NavigationStack {
                MenuScreen()
                    .routeDestinations()
            }
        } else {
            SignInScreen()
        }
    }
}

extension View {
    /// The screens a Route opens, for the menu's NavigationStack and its preview.
    func routeDestinations() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case .drink(let id):
                if let drink = MenuData.drink(id) {
                    DrinkScreen(drink: drink)
                }
            case .loyalty:
                LoyaltyScreen()
            }
        }
    }
}
