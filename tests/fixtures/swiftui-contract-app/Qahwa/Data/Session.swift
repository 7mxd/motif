//
//  Session.swift
//  Qahwa
//

import Foundation

/// What the app keeps on the phone, in UserDefaults (through @AppStorage).
enum Session {
    /// True once someone has signed in on this phone.
    static let signedInKey = "signedIn"
    /// The email the member's card is under.
    static let emailKey = "email"
    /// The design variant the member chose: a MotifVariant's raw value.
    static let variantKey = "variant"
}
