// The states' side of Motif's screenshot harness (decision 0010): what a --state script's motifState(_:) is given to act
// on the screen, and how the harness runs it, and design/states/Setup.swift's motifSetup, with a time limit.
import SwiftUI
import UIKit

/// What a state script acts on: the screen Motif drew, in a window of its own. It finds things the way VoiceOver does:
/// by their accessibility label (a Button's or a TextField's title, an .accessibilityLabel) or their
/// .accessibilityIdentifier. The keyboard isn't drawn: a field being typed into is shown without it.
@MainActor
final class MotifHarness {
    /// The window the screen is drawn in.
    let window: UIWindow
    /// The screenshot's design variant as the guide names it ("" when it has none), locale and scheme.
    let variant: String
    let locale: Locale
    let dark: Bool
    private let settleSeconds: Double

    init(window: UIWindow, variant: String, locale: Locale, dark: Bool, settle: Double) {
        self.window = window
        self.variant = variant
        self.locale = locale
        self.dark = dark
        settleSeconds = settle
    }

    /// Taps what is called `label` once it's on the screen (waiting at most `timeout` seconds), then lets the screen settle.
    func tap(_ label: String, timeout: Double = 5) async throws {
        let element = try await find(label, timeout: timeout)
        guard activate(element) else {
            throw MotifShotError("\"\(label)\" is on the screen, but tapping it did nothing: it isn't a button or a control.")
        }
        await settle()
    }

    /// Types the text into the text field called `label` (its title or prompt); without one, into the field being edited,
    /// else the screen's first. Then lets the screen settle.
    func type(_ text: String, into label: String? = nil, timeout: Double = 5) async throws {
        let input = try await textInput(label, timeout: timeout)
        window.makeKey()
        _ = input.becomeFirstResponder()
        guard let keys = input as? UIKeyInput else { throw MotifShotError("The text field can't be typed into.") }
        keys.insertText(text)
        await settle()
    }

    /// Lets the screen run for `seconds`.
    func wait(_ seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
    }

    /// Waits until something called `label` is on the screen, at most `timeout` seconds.
    func waitFor(_ label: String, timeout: Double = 5) async throws {
        _ = try await find(label, timeout: timeout)
    }

    /// True when something called `label` is on the screen now.
    func exists(_ label: String) -> Bool {
        element(label) != nil
    }

    /// What the screen's elements are called, in the order VoiceOver would read them.
    var labels: [String] {
        elements().compactMap(name)
    }

    /// Lets the main run loop turn until the window's layers stop changing, at most the run's settle time.
    func settle() async {
        let deadline = Date().addingTimeInterval(settleSeconds)
        var last = ""
        var quiet = 0
        while Date() < deadline {
            window.layoutIfNeeded()
            try? await Task.sleep(nanoseconds: 50_000_000)
            let now = MotifShotDrawing.describe(window.layer)
            quiet = now == last ? quiet + 1 : 0
            if quiet >= 2 { return }
            last = now
        }
    }

    // ---- Finding things ----

    private func name(_ object: NSObject) -> String? {
        let label = object.accessibilityLabel?.trimmingCharacters(in: .whitespacesAndNewlines)
        return label?.isEmpty == false ? label : nil
    }

    /// Every accessibility element in the window, depth first: UIKit's views and SwiftUI's elements inside them.
    private func elements() -> [NSObject] {
        var out: [NSObject] = []
        var seen = Set<ObjectIdentifier>()
        func visit(_ object: NSObject, depth: Int) {
            guard depth < 64, seen.insert(ObjectIdentifier(object)).inserted else { return }
            if let view = object as? UIView, view.isHidden || view.alpha == 0 { return }
            if object.isAccessibilityElement { out.append(object) }
            if let children = object.accessibilityElements {
                for case let child as NSObject in children { visit(child, depth: depth + 1) }
            } else {
                let count = object.accessibilityElementCount()
                if count != NSNotFound && count > 0 {
                    for i in 0..<count {
                        if let child = object.accessibilityElement(at: i) as? NSObject { visit(child, depth: depth + 1) }
                    }
                }
            }
            if let view = object as? UIView {
                for sub in view.subviews { visit(sub, depth: depth + 1) }
            }
        }
        visit(window, depth: 0)
        return out
    }

    /// The element called `label`: by its label, then its identifier, then its label in any case.
    private func element(_ label: String) -> NSObject? {
        let all = elements()
        let identifier = { (o: NSObject) in (o as? UIAccessibilityIdentification)?.accessibilityIdentifier }
        return all.first { name($0) == label }
            ?? all.first { identifier($0) == label }
            ?? all.first { name($0)?.caseInsensitiveCompare(label) == .orderedSame }
    }

    private func find(_ label: String, timeout: Double) async throws -> NSObject {
        let deadline = Date().addingTimeInterval(timeout)
        while true {
            if let found = element(label) { return found }
            if Date() >= deadline { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        let shown = labels.prefix(12).map { "\"\($0)\"" }.joined(separator: ", ")
        throw MotifShotError("There's nothing called \"\(label)\" on the screen\(shown.isEmpty ? "" : " (it shows \(shown))").")
    }

    private func activate(_ element: NSObject) -> Bool {
        if element.accessibilityActivate() { return true }
        if let control = element as? UIControl {
            control.sendActions(for: .touchUpInside)
            return true
        }
        return false
    }

    private func textInputs() -> [UIView] {
        var out: [UIView] = []
        func visit(_ view: UIView) {
            if view.isHidden { return }
            if view is UITextField || view is UITextView { out.append(view) }
            for sub in view.subviews { visit(sub) }
        }
        visit(window)
        return out
    }

    private func textInput(_ label: String?, timeout: Double) async throws -> UIView {
        guard let label else {
            let inputs = textInputs()
            if let input = inputs.first(where: { $0.isFirstResponder }) ?? inputs.first { return input }
            throw MotifShotError("There's no text field on the screen to type into.")
        }
        let element = try await find(label, timeout: timeout)
        if let view = element as? UIView, view is UITextField || view is UITextView { return view }
        // SwiftUI's element for a TextField is in front of UIKit's field: the field under its middle.
        let frame = element.accessibilityFrame
        let middle = CGPoint(x: frame.midX, y: frame.midY)
        if let input = textInputs().first(where: { $0.convert($0.bounds, to: nil).contains(middle) }) { return input }
        throw MotifShotError("\"\(label)\" is on the screen, but it isn't a text field.")
    }
}

@MainActor
enum MotifAsync {
    private final class Outcome {
        var value: Result<Void, Error>?
    }

    /// Runs the work on the main actor while the main run loop turns, for at most `seconds`: how it ended, or nil when it
    /// was still running then (it is cancelled).
    static func run(seconds: Double, _ work: @escaping @MainActor () async throws -> Void) -> Result<Void, Error>? {
        let outcome = Outcome()
        let task = Task { @MainActor in
            do {
                try await work()
                outcome.value = .success(())
            } catch {
                outcome.value = .failure(error)
            }
        }
        let deadline = Date().addingTimeInterval(seconds)
        while outcome.value == nil && Date() < deadline {
            _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
        }
        if outcome.value == nil { task.cancel() }
        return outcome.value
    }
}
