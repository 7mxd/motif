//
//  HomeScreen.swift
//  SwiftUIMin
//

import SwiftUI

struct HomeScreen: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Welcome")
                .font(.largeTitle.bold())
            Text("Your next appointment is on Thursday at 10:30.")
            Text("مرحبا بالعالم")
                .font(.custom("Noto Naskh Arabic", size: 22))
            NavigationLink("Open settings", value: Route.settings)
                .buttonStyle(.borderedProminent)
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .navigationTitle("Home")
    }
}

#Preview {
    NavigationStack {
        HomeScreen()
    }
}
