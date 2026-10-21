// The states' side of Motif's screenshot harness (decision 0010): what a --state script's motifState(_:) is given to act
// on the screen, and how the harness runs it, and design/states/Setup.swift's motifSetup, with a time limit.
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

#if os(macOS)
/// What a state script acts on: the screen Motif drew, in a window of its own. It finds things the way VoiceOver does:
/// by their accessibility label (a Button's or a TextField's title, a Text's words, an .accessibilityLabel) or their
/// .accessibilityIdentifier. A field typed into is drawn once editing ends, without its caret.
@MainActor
final class MotifHarness {
    /// The window the screen is drawn in.
    let window: NSWindow
    /// The screenshot's design variant as the guide names it ("" when it has none), locale and scheme.
    let variant: String
    let locale: Locale
    let dark: Bool
    private let settleSeconds: Double
    /// Set when the state ran out of time: it was cancelled, and nothing it still asks for touches a later screen.
    var abandoned = false

    private func live() throws {
        if abandoned { throw MotifShotError("The state ran out of time and was stopped.") }
    }

    init(window: NSWindow, variant: String, locale: Locale, dark: Bool, settle: Double) {
        self.window = window
        self.variant = variant
        self.locale = locale
        self.dark = dark
        settleSeconds = settle
    }

    /// Clicks what is called `label` once it's on the screen (waiting at most `timeout` seconds), then lets the screen settle.
    func tap(_ label: String, timeout: Double = 5) async throws {
        let element = try await find(label, timeout: timeout)
        try live()
        // A Form row's label names the control after it (a switch, a picker): that is what is clicked.
        var pressed = await press(element)
        if !pressed, let control = labelled(element) { pressed = await press(control) }
        guard pressed else {
            throw MotifShotError("\"\(label)\" is on the screen, but clicking it did nothing: it isn't a button or a control.")
        }
        await settle()
    }

    /// Presses an element as VoiceOver does; true when that did something. AppKit's switch toggles a moment later yet
    /// answers no, so a press that answers no counts when the element's value changed once the screen settled. An
    /// AppKit control that neither answers nor changes is clicked as a person would.
    private func press(_ element: NSObject) async -> Bool {
        let value = { String(describing: MotifAX.object(element, "accessibilityValue") ?? "") }
        let before = value()
        if MotifAX.bool(element, "accessibilityPerformPress") == true { return true }
        await settle()
        if value() != before { return true }
        guard let control = element as? NSControl, control.isEnabled else { return false }
        control.performClick(nil)
        return true
    }

    /// Types the text into the text field called `label` (its title or prompt); without one, into the field being edited,
    /// else the screen's first. Then lets the screen settle.
    func type(_ text: String, into label: String? = nil, timeout: Double = 5) async throws {
        let field = try await textField(label, timeout: timeout)
        try live()
        guard window.makeFirstResponder(field), let editor = field.currentEditor() as? NSTextView else {
            throw MotifShotError("The text field can't be typed into.")
        }
        editor.insertText(text, replacementRange: NSRange(location: NSNotFound, length: 0))
        await settle()
    }

    /// Lets the screen run for `seconds`.
    func wait(_ seconds: Double) async {
        if abandoned { return }
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

    /// Lets the main run loop turn until the window's views and layers stop changing, at most the run's settle time.
    func settle() async {
        let deadline = Date().addingTimeInterval(settleSeconds)
        var last = ""
        var quiet = 0
        while Date() < deadline {
            window.contentView?.layoutSubtreeIfNeeded()
            try? await Task.sleep(nanoseconds: 50_000_000)
            let now = MotifShotDrawing.describe(window.contentView)
            quiet = now == last ? quiet + 1 : 0
            if quiet >= 2 { return }
            last = now
        }
    }

    // ---- Finding things ----

    private func text(_ value: Any?) -> String? {
        let s = (value as? String) ?? (value as? NSAttributedString)?.string
        let t = s?.trimmingCharacters(in: .whitespacesAndNewlines)
        return t?.isEmpty == false ? t : nil
    }

    /// What VoiceOver says an element is called: its label, else its title, else a text's words, else a field's prompt.
    private func name(_ element: NSObject) -> String? {
        if let label = text(MotifAX.object(element, "accessibilityLabel")) { return label }
        if let title = text(MotifAX.object(element, "accessibilityTitle")) { return title }
        if MotifAX.object(element, "accessibilityRole") as? String == NSAccessibility.Role.staticText.rawValue,
           let value = text(MotifAX.object(element, "accessibilityValue")) { return value }
        return text(MotifAX.object(element, "accessibilityPlaceholderValue"))
    }

    private func role(_ element: NSObject) -> String? {
        MotifAX.object(element, "accessibilityRole") as? String
    }

    /// The control a Form row's label stands for: in a grouped Form, a TextField's or a Toggle's title is a text of its
    /// own, read just before the control, which has no name. Nil for anything but such a text.
    private func labelled(_ element: NSObject) -> NSObject? {
        guard role(element) == NSAccessibility.Role.staticText.rawValue else { return nil }
        let all = elements(named: false)
        guard let at = all.firstIndex(where: { $0 === element }) else { return nil }
        return all[(at + 1)...].prefix(2).first { role($0) != NSAccessibility.Role.staticText.rawValue && name($0) == nil }
    }

    /// Every accessibility element in the window, depth first: AppKit's views and SwiftUI's elements inside them; with
    /// `named`, only those that have a name.
    private func elements(named: Bool = true) -> [NSObject] {
        var out: [NSObject] = []
        var seen = Set<ObjectIdentifier>()
        func visit(_ object: NSObject, depth: Int) {
            guard depth < 64, seen.insert(ObjectIdentifier(object)).inserted else { return }
            if let view = object as? NSView, view.isHidden || view.alphaValue == 0 { return }
            if MotifAX.bool(object, "isAccessibilityElement") == true, !named || name(object) != nil { out.append(object) }
            for case let child as NSObject in MotifAX.object(object, "accessibilityChildren") as? [Any] ?? [] {
                visit(child, depth: depth + 1)
            }
        }
        if let content = window.contentView { visit(content, depth: 0) }
        return out
    }

    /// The element called `label`: by its label, then its identifier, then its label in any case.
    private func element(_ label: String) -> NSObject? {
        let all = elements()
        return all.first { name($0) == label }
            ?? all.first { text(MotifAX.object($0, "accessibilityIdentifier")) == label }
            ?? all.first { name($0)?.caseInsensitiveCompare(label) == .orderedSame }
    }

    private func find(_ label: String, timeout: Double) async throws -> NSObject {
        let deadline = Date().addingTimeInterval(timeout)
        while true {
            try live()
            if let found = element(label) { return found }
            if Date() >= deadline { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        // Accessibility never turned on: the state can't see the screen, whatever it asks for.
        if MotifAccessibility.enabled != true { throw MotifShotError(MotifAccessibility.problem) }
        if elements().isEmpty {
            throw MotifShotError("There's nothing called \"\(label)\" on the screen: it has nothing VoiceOver can read yet, so it may be blank or still loading. Wait for something on it first (app.waitFor(\"…\")), or check the screen.")
        }
        let shown = labels.prefix(12).map { "\"\($0)\"" }.joined(separator: ", ")
        throw MotifShotError("There's nothing called \"\(label)\" on the screen\(shown.isEmpty ? "" : " (it shows \(shown))").")
    }

    private func textFields() -> [NSTextField] {
        var out: [NSTextField] = []
        func visit(_ view: NSView) {
            if view.isHidden { return }
            if let field = view as? NSTextField, field.isEditable { out.append(field) }
            for sub in view.subviews { visit(sub) }
        }
        if let content = window.contentView { visit(content) }
        return out
    }

    private func textField(_ label: String?, timeout: Double) async throws -> NSTextField {
        guard let label else {
            let fields = textFields()
            if let field = fields.first(where: { $0.currentEditor() != nil }) ?? fields.first { return field }
            throw MotifShotError("There's no text field on the screen to type into.")
        }
        // A text field called `label` first: in a Form, a TextField's title is also its row's label.
        let found = try await find(label, timeout: timeout)
        let isField = { (o: NSObject) in self.role(o) == NSAccessibility.Role.textField.rawValue }
        let all = elements()
        let element = all.first { isField($0) && name($0) == label }
            ?? all.first { isField($0) && name($0)?.caseInsensitiveCompare(label) == .orderedSame }
            ?? labelled(found).flatMap { isField($0) ? $0 : nil }
            ?? found
        if let field = element as? NSTextField, field.isEditable { return field }
        // SwiftUI's TextField is AppKit's field, whose cell is the element.
        if let field = (element as? NSCell)?.controlView as? NSTextField, field.isEditable { return field }
        // An element standing in front of AppKit's field: the field under its middle.
        let frame = MotifAX.rect(element, "accessibilityFrame")
        let middle = NSPoint(x: frame.midX, y: frame.midY)
        if let field = textFields().first(where: { field in
            guard let window = field.window else { return false }
            return window.convertToScreen(field.convert(field.bounds, to: nil)).contains(middle)
        }) { return field }
        throw MotifShotError("\"\(label)\" is on the screen, but it isn't a text field.")
    }
}

/// NSAccessibility's getters, asked for by name: SwiftUI's elements answer them without declaring the protocol.
enum MotifAX {
    /// An attribute that is an object (a label, a role, the children); nil when the element doesn't answer it.
    static func object(_ element: NSObject, _ getter: String) -> Any? {
        let selector = NSSelectorFromString(getter)
        guard element.responds(to: selector) else { return nil }
        return element.perform(selector)?.takeUnretainedValue()
    }

    /// A yes-or-no attribute, or an action's answer (accessibilityPerformPress); nil when the element doesn't answer it.
    static func bool(_ element: NSObject, _ getter: String) -> Bool? {
        let selector = NSSelectorFromString(getter)
        guard element.responds(to: selector), let imp = element.method(for: selector) else { return nil }
        typealias Get = @convention(c) (NSObject, Selector) -> Bool
        return unsafeBitCast(imp, to: Get.self)(element, selector)
    }

    /// A rectangle attribute (accessibilityFrame, in screen coordinates); zero when the element doesn't answer it.
    static func rect(_ element: NSObject, _ getter: String) -> NSRect {
        let selector = NSSelectorFromString(getter)
        guard element.responds(to: selector), let imp = element.method(for: selector) else { return .zero }
        typealias Get = @convention(c) (NSObject, Selector) -> NSRect
        return unsafeBitCast(imp, to: Get.self)(element, selector)
    }
}

/// SwiftUI makes its views' accessibility elements only while an assistive technology is on. On the Mac, the harness
/// tells its own app what VoiceOver tells an app it reads (AXEnhancedUserInterface, through NSAccessibility's
/// accessibilitySetValue:forAttribute:), before the first screen that needs them. Nothing outside the app changes.
@MainActor
enum MotifAccessibility {
    /// Whether the app took it: nil until tried.
    private(set) static var enabled: Bool?

    static func enable() {
        if enabled != nil { return }
        let attribute = "AXEnhancedUserInterface"
        let set = NSSelectorFromString("accessibilitySetValue:forAttribute:")
        guard NSApp.responds(to: set) else {
            enabled = false
            return
        }
        _ = NSApp.perform(set, with: NSNumber(value: true), with: attribute)
        let get = NSSelectorFromString("accessibilityAttributeValue:")
        let value = NSApp.responds(to: get) ? NSApp.perform(get, with: attribute)?.takeUnretainedValue() as? NSNumber : nil
        // Read back when AppKit says; taken at its word otherwise.
        enabled = value?.boolValue ?? true
    }

    /// Why a state finds nothing at all, when accessibility isn't on: the macOS version named.
    static var problem: String {
        "Motif couldn't turn on accessibility in the app on this Mac (macOS \(ProcessInfo.processInfo.operatingSystemVersionString)), so a state can't find anything on the screen. Tell Motif's maintainers which Xcode and macOS you use."
    }
}
#else
/// What a state script acts on: the screen Motif drew, in a window of its own. It finds things the way VoiceOver does:
/// by their accessibility label (a Button's or a TextField's title, an .accessibilityLabel) or their
/// .accessibilityIdentifier. The keyboard isn't drawn: a field typed into is drawn as it is once editing ends.
@MainActor
final class MotifHarness {
    /// The window the screen is drawn in.
    let window: UIWindow
    /// The screenshot's design variant as the guide names it ("" when it has none), locale and scheme.
    let variant: String
    let locale: Locale
    let dark: Bool
    private let settleSeconds: Double
    /// Set when the state ran out of time: it was cancelled, and nothing it still asks for touches a later screen.
    var abandoned = false

    private func live() throws {
        if abandoned { throw MotifShotError("The state ran out of time and was stopped.") }
    }

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
        try live()
        guard activate(element) else {
            throw MotifShotError("\"\(label)\" is on the screen, but tapping it did nothing: it isn't a button or a control.")
        }
        await settle()
    }

    /// Types the text into the text field called `label` (its title or prompt); without one, into the field being edited,
    /// else the screen's first. Then lets the screen settle.
    func type(_ text: String, into label: String? = nil, timeout: Double = 5) async throws {
        let input = try await textInput(label, timeout: timeout)
        try live()
        window.makeKey()
        _ = input.becomeFirstResponder()
        guard let keys = input as? UIKeyInput else { throw MotifShotError("The text field can't be typed into.") }
        keys.insertText(text)
        await settle()
    }

    /// Lets the screen run for `seconds`.
    func wait(_ seconds: Double) async {
        if abandoned { return }
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
            try live()
            if let found = element(label) { return found }
            if Date() >= deadline { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        // Accessibility never turned on: the state can't see the screen, whatever it asks for.
        if MotifAccessibility.enabled != true { throw MotifShotError(MotifAccessibility.problem) }
        // On, but the screen has nothing to read yet: blank, or still loading.
        if elements().isEmpty {
            throw MotifShotError("There's nothing called \"\(label)\" on the screen: it has nothing VoiceOver can read yet, so it may be blank or still loading. Wait for something on it first (app.waitFor(\"…\")), or check the screen.")
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

/// SwiftUI makes its views' accessibility elements only while an assistive technology (or UI automation) is on. The
/// harness turns automation on for the simulator, as UI test tools do (KIF), before the first screen that needs them.
@MainActor
enum MotifAccessibility {
    /// Whether automation is on: nil until tried.
    private(set) static var enabled: Bool?

    static func enable() {
        if enabled != nil { return }
        enabled = false
        guard let library = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW),
              let set = dlsym(library, "_AXSSetAutomationEnabled") else { return }
        typealias SetEnabled = @convention(c) (Int32) -> Void
        unsafeBitCast(set, to: SetEnabled.self)(1)
        // Read back when the runtime says; a runtime without the getter is taken at its word.
        typealias IsEnabled = @convention(c) () -> Int32
        enabled = dlsym(library, "_AXSAutomationEnabled").map { unsafeBitCast($0, to: IsEnabled.self)() != 0 } ?? true
    }

    /// Why a state finds nothing at all, when accessibility isn't on: the runtime named.
    static var problem: String {
        "Motif couldn't turn on accessibility automation in this simulator runtime (iOS \(UIDevice.current.systemVersion)), so a state can't find anything on the screen. Tell Motif's maintainers which Xcode and runtime you use."
    }
}

#endif

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
