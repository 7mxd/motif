// Motif's screenshots run this before each one: a member who has signed in, and the variant's own switch.
import Foundation

/// Signed in, as a regular with seven stamps (the card's mock data); the variant is drawn by MotifTheme.
func motifSetup(variant: String, locale: Locale, dark: Bool) {
    UserDefaults.standard.set(true, forKey: Session.signedInKey)
    UserDefaults.standard.set("layla@example.com", forKey: Session.emailKey)
    // The loyalty card's Evening colours switch shows the variant being drawn.
    UserDefaults.standard.set(variant, forKey: Session.variantKey)
}
