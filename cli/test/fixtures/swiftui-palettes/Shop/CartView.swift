import SwiftUI

struct CartView: View {
    @State private var open = false

    var body: some View {
        VStack {
            Text("Cart")
                .font(.custom("Inter", size: 22))
                .foregroundStyle(Color.brand)
            Button("Pay") { open.toggle() }
                .padding(13)
                .background(Color.brand, in: RoundedRectangle(cornerRadius: 12))
                .animation(.easeOut(duration: 0.25), value: open)
        }
    }
}

