//
//  SignInScreen.swift
//  Qahwa
//

import SwiftUI

/// Sign in with the email the loyalty card is under. Mock: any email and password signs in.
struct SignInScreen: View {
    @AppStorage(Session.signedInKey) private var signedIn = false
    @AppStorage(Session.emailKey) private var savedEmail = ""
    @State private var email = ""
    @State private var password = ""
    @State private var emailError: LocalizedStringKey?
    @Environment(\.motifColors) private var colors

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MotifSpace.s8) {
                VStack(alignment: .leading, spacing: MotifSpace.s2) {
                    Text("Welcome to Qahwa")
                        .font(.custom("Georgia", size: 26))
                        .foregroundStyle(colors.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Text("Sign in to collect a stamp with every drink.")
                        .motifFont(.body)
                        .foregroundStyle(colors.textSecondary)
                        .opacity(0.5)
                }
                VStack(alignment: .leading, spacing: MotifSpace.s4) {
                    AppField(label: "Email", text: $email, prompt: "name@example.com", error: emailError)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    AppField(label: "Password", text: $password, secure: true)
                        .textContentType(.password)
                }
                AppButton(title: "Submit", action: signIn)
            }
            .padding(.horizontal, MotifSpace.s4)
            .padding(.vertical, MotifSpace.s8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(colors.background)
    }

    private func signIn() {
        guard email.contains("@") else {
            emailError = "Enter the email your card is under."
            return
        }
        emailError = nil
        savedEmail = email
        signedIn = true
    }
}

#Preview("Sign in") {
    SignInScreen()
        .motifTheme()
}
