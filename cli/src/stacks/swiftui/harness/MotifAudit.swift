// Motif's audit of a SwiftUI screen as it was drawn (motif shot --audit, plan 2H Task 10; decision 0010, §18): the
// contrast of its text and of its icon buttons, from the screenshot's own pixels; its tap targets and their names, from
// the accessibility tree VoiceOver reads; and motion that goes on when reduce motion is on. It runs in the hosted test,
// on the window the screen was drawn in, right after the picture is taken.
//
// Each problem is like audit.json's RawIssue: { rule, selector, label, kind, icon?, ratio?, expected?, fg?, bg?, width?,
// height? }, and which of the screen's elements with the same selector it is (nth, of). The selector names the element
// as its view is written: its kind, its .accessibilityIdentifier and what it says, like Button("Sign out"),
// Text("Prices include tax"), TextField("Name"), or an SF Symbol for a control that shows only one: Button(gearshape).
import CoreGraphics
import ImageIO
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// One problem, as audit.json's RawIssue has it; Motif adds where it was seen.
struct MotifIssue: Encodable {
    var rule: String
    var selector: String
    var label: String
    var kind: String
    var icon: String?
    var ratio: Double?
    var expected: Double?
    var fg: String?
    var bg: String?
    var width: Int?
    var height: Int?
    /// Which of the screen's elements with this selector it is (1-based), and how many there are, when more than one.
    var nth: Int?
    var of: Int?
}

/// What the audit found on one screenshot: its problems, the texts whose contrast it couldn't judge (no one colour
/// behind them), and why it couldn't finish, if it couldn't.
struct MotifAuditOutcome {
    var issues: [MotifIssue] = []
    var unjudged: [String] = []
    var error: String?
}

/// An element of the screen, as VoiceOver reads it, with what the audit needs to know.
struct MotifElement {
    enum Kind { case text, button, link, toggle, image, field, adjustable, other }
    let kind: Kind
    /// What VoiceOver says it is called (a field's prompt when it has no label); nil when nothing.
    var name: String?
    /// Where it is in the window, in points, from the top left: as in the screenshot.
    let rect: CGRect
    /// The SF Symbol it shows (its name), when it shows one.
    let symbol: String?
    /// Its name is only the symbol's own (Gear Shape for gearshape), or it has none.
    let symbolOnly: Bool
    /// The developer's own .accessibilityIdentifier.
    let identifier: String?
    let enabled: Bool
    /// Its text's size in points and whether it is bold, when the element says (SwiftUI's Text does).
    let font: (size: Double, bold: Bool)?
    /// Its text's own colour (sRGB, with its alpha), when the element says.
    let color: [Double]?
    /// A field's text, typed in it (not its prompt).
    let typed: String?
}

@MainActor
enum MotifAudit {
    /// The smallest tap target on a phone or a tablet, in points (Apple's 44 × 44, as on the other stacks).
    static let minTarget = 44.0

    /// The checks asked for, on the window just drawn and its picture (`png`, at `scale`).
    static func run(_ checks: Set<String>, window: MotifWindow, png: Data, scale: Double) -> MotifAuditOutcome {
        var out = MotifAuditOutcome()
        var elements: [MotifElement] = []
        let tree = checks.contains("contrast") || checks.contains("names") || checks.contains("targets")
        if tree {
            if MotifAccessibility.enabled != true {
                out.error = MotifAccessibility.auditProblem
            } else {
                elements = MotifAuditTree.elements(in: window)
                let selectors = elements.map(baseSelector)
                func described(_ i: Int) -> MotifIssue {
                    let e = elements[i]
                    let same = selectors.indices.filter { selectors[$0] == selectors[i] }
                    var issue = MotifIssue(rule: "", selector: selectors[i], label: shownName(e), kind: issueKind(e))
                    if same.count > 1 {
                        issue.nth = (same.firstIndex(of: i) ?? 0) + 1
                        issue.of = same.count
                    }
                    return issue
                }
                if checks.contains("contrast") {
                    if let pixels = MotifPixels(png: png, scale: scale) {
                        for i in elements.indices {
                            guard let judged = contrast(elements[i], pixels) else { continue }
                            switch judged {
                            case .unjudged(let what): out.unjudged.append(what)
                            case .failed(let ratio, let expected, let fg, let bg, let icon):
                                var issue = described(i)
                                issue.rule = "color-contrast"
                                issue.ratio = ratio
                                issue.expected = expected
                                issue.fg = fg
                                issue.bg = bg
                                if icon {
                                    issue.kind = "icon"
                                    issue.icon = elements[i].symbol
                                    if elements[i].symbolOnly { issue.label = "" }
                                }
                                out.issues.append(issue)
                            }
                        }
                    } else {
                        out.error = "the contrast check: Motif couldn't read the screenshot's pixels."
                    }
                }
                for i in elements.indices {
                    let e = elements[i]
                    guard e.enabled, onScreen(e.rect, window) else { continue }
                    let control = [.button, .link, .toggle, .field, .adjustable].contains(e.kind)
                    if checks.contains("names"), control || e.kind == .image, e.symbolOnly || (e.name ?? "").isEmpty {
                        var issue = described(i)
                        issue.rule = "name"
                        issue.label = ""
                        out.issues.append(issue)
                    }
                    if checks.contains("targets"), control, e.kind != .link,
                       e.rect.width < minTarget - 0.01 || e.rect.height < minTarget - 0.01 {
                        var issue = described(i)
                        issue.rule = "target-mobile"
                        issue.width = Int(e.rect.width.rounded())
                        issue.height = Int(e.rect.height.rounded())
                        out.issues.append(issue)
                    }
                }
            }
        }
        // Last, as it lets the screen run on for two seconds.
        if checks.contains("motion"), let moving = MotifMotionCheck.moving(window, elements: elements) {
            out.issues.append(moving)
        }
        return out
    }

    private static func onScreen(_ rect: CGRect, _ window: MotifWindow) -> Bool {
        let shown = rect.intersection(CGRect(origin: .zero, size: MotifAuditTree.size(of: window)))
        return !shown.isNull && shown.width > 0 && shown.height > 0
    }

    // ---- Describing an element ----

    /// The element's kind as audit.json names it.
    static func issueKind(_ e: MotifElement) -> String {
        switch e.kind {
        case .button: return "button"
        case .link: return "link"
        case .toggle: return "switch"
        case .field: return "field"
        case .image: return "image"
        default: return "element"
        }
    }

    /// Its kind as its view is written, its identifier, and what it says (or the symbol it shows, when that's all).
    static func baseSelector(_ e: MotifElement) -> String {
        let type: String
        switch e.kind {
        case .text: type = "Text"
        case .button: type = "Button"
        case .link: type = "Link"
        case .toggle: type = "Toggle"
        case .image: type = "Image"
        case .field: type = "TextField"
        case .adjustable: type = "Slider"
        case .other: type = "Element"
        }
        let id = e.identifier.map { "#\($0)" } ?? ""
        if let symbol = e.symbol, e.symbolOnly { return "\(type)\(id)(\(symbol))" }
        let name = short(e.name ?? "")
        return name.isEmpty ? "\(type)\(id)" : "\(type)\(id)(\"\(name.replacingOccurrences(of: "\"", with: "\\\""))\")"
    }

    /// What a finding calls an element: its name, or the symbol it shows when that's all its name says (whatever the
    /// language, so a screen right to left is the same place).
    static func shownName(_ e: MotifElement) -> String {
        short(e.symbolOnly ? (e.symbol ?? "") : (e.name ?? ""))
    }

    static func plain(_ text: String) -> String {
        text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    static func short(_ text: String) -> String {
        String(plain(text).prefix(40))
    }

    /// True when a name says no more than an SF Symbol's own: its raw name (gearshape), or the description the system
    /// gives it (Gear Shape), whatever the case.
    static func sameName(_ a: String, _ b: String) -> Bool {
        let fold = { (s: String) in plain(s.replacingOccurrences(of: ".", with: " ")).lowercased() }
        return fold(a) == fold(b)
    }

    /// True when an element that shows an SF Symbol has no name of its own: none, or only the symbol's.
    /// SwiftUI says the symbol's name in the screen's language ("צורת גלגל שיניים" in Hebrew), so what made the label is
    /// read first: SwiftUI's element keeps the texts its label was made from, and a symbol's is a text of its own kind.
    /// Without that (another SwiftUI), the name is compared with the symbol's raw name and its description.
    static func symbolOnly(_ object: NSObject, _ name: String?, symbol: String, description: String?) -> Bool {
        guard let name else { return true }
        if let made = labelIsSymbol(object) { return made }
        return sameName(name, symbol) || description.map { sameName(name, $0) } == true
    }

    /// A control's or an image's name that is itself an SF Symbol's raw name (gearshape, bell.badge): what an older
    /// SwiftUI may say for an unlabelled symbol, without naming the symbol in the element's identifier.
    static func rawSymbol(_ name: String?, kind: MotifElement.Kind, exists: (String) -> Bool) -> String? {
        guard [.button, .link, .toggle, .image].contains(kind), let name,
              name.range(of: #"^[a-z0-9]+(\.[a-z0-9]+)*$"#, options: .regularExpression) != nil, exists(name) else { return nil }
        return name
    }

    /// True when SwiftUI made an element's label from an SF Symbol alone (an Image(systemName:) the app gave no label):
    /// every text its label storage holds is a symbol's. Nil when SwiftUI's element doesn't show that.
    static func labelIsSymbol(_ object: NSObject) -> Bool? {
        for child in Mirror(reflecting: object).children where child.label == "cachedCombinedAttachment" {
            let text = String(describing: child.value)
            guard let start = text.range(of: "LabelKey, value: ") else { return nil }
            let rest = text[start.upperBound...]
            let label = rest[..<(rest.range(of: "placement:")?.lowerBound ?? rest.endIndex)]
            let texts = label.components(separatedBy: "Text.Storage.").dropFirst()
            guard !texts.isEmpty else { return nil }
            return texts.allSatisfy { $0.hasPrefix("anyTextStorage(<SystemSymbolTextStorage") }
        }
        return nil
    }

    // ---- Contrast ----

    enum Judged {
        case failed(ratio: Double, expected: Double, fg: String, bg: String, icon: Bool)
        case unjudged(String)
    }

    /// A text's contrast (a Text, a control's label, a field's typed text), or an icon button's: its colour against the
    /// colour most common under it in the screenshot. Nil when it passes, isn't judged at all (a disabled control, a
    /// decoration, text with no letter or digit, a field showing only its prompt), or is off the screen.
    static func contrast(_ e: MotifElement, _ pixels: MotifPixels) -> Judged? {
        guard e.enabled else { return nil }
        // An icon is a mark, not text: WCAG 1.4.11 asks 3:1 of a control's icon.
        let icon = e.symbol != nil && [.button, .link, .toggle].contains(e.kind)
        let text: String
        switch e.kind {
        case .text, .button, .link: text = e.name ?? ""
        case .toggle: text = e.name ?? ""
        case .field: text = e.typed ?? ""
        default: return nil
        }
        if !icon && text.range(of: "[\\p{L}\\p{N}]", options: .regularExpression) == nil { return nil }
        // A switch's row holds the switch too: only its label's own colour, when the element says it, is looked for.
        if e.kind == .toggle && !icon && e.color == nil { return nil }
        guard let drawn = pixels.drawn(in: e.rect, hint: icon ? nil : e.color, strict: e.kind == .toggle && !icon) else {
            return pixels.covers(e.rect) ? .unjudged(short(icon ? (e.symbol ?? "") : text)) : nil
        }
        let ratio = MotifColor.ratio(drawn.fg, drawn.bg)
        let expected = icon || large(e, pixels: pixels, drawn: drawn) ? 3.0 : 4.5
        if ratio >= expected { return nil }
        return .failed(ratio: ratio, expected: expected, fg: MotifColor.hex(drawn.fg), bg: MotifColor.hex(drawn.bg), icon: icon)
    }

    /// WCAG's large text: 18 pt (24 px), or 14 pt (about 18.66 px) in bold, as axe-core judges it on the web. From the
    /// element's font when it says; else from the height of its lines in the picture (a line is about 1.2 times its size).
    static func large(_ e: MotifElement, pixels: MotifPixels, drawn: MotifPixels.Drawn) -> Bool {
        if let font = e.font { return font.size >= 24 || (font.size >= 18.66 && font.bold) }
        let lines = max(1, pixels.lines(in: e.rect, drawn: drawn))
        return e.rect.height / Double(lines) / 1.2 >= 24
    }
}

/// The screenshot's pixels, 8-bit sRGB, top row first, at the shot's scale.
struct MotifPixels {
    let width: Int
    let height: Int
    let scale: Double
    private let data: [UInt8]

    init?(png: Data, scale: Double) {
        guard let source = CGImageSourceCreateWithData(png as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let width = image.width
        let height = image.height
        var data = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = data.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                          space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { return nil }
        self.width = width
        self.height = height
        self.scale = scale
        self.data = data
    }

    /// The picture's pixels under a rectangle in points.
    private func box(_ rect: CGRect) -> (x0: Int, y0: Int, x1: Int, y1: Int)? {
        let x0 = max(0, Int((rect.minX * scale).rounded(.down)))
        let y0 = max(0, Int((rect.minY * scale).rounded(.down)))
        let x1 = min(width, Int((rect.maxX * scale).rounded(.up)))
        let y1 = min(height, Int((rect.maxY * scale).rounded(.up)))
        return x1 > x0 && y1 > y0 ? (x0, y0, x1, y1) : nil
    }

    func covers(_ rect: CGRect) -> Bool { box(rect) != nil }

    private func rgb(_ x: Int, _ y: Int) -> UInt32 {
        let at = (y * width + x) * 4
        return UInt32(data[at]) << 16 | UInt32(data[at + 1]) << 8 | UInt32(data[at + 2])
    }

    /// A text's (or an icon's) background and its colour as drawn on it.
    struct Drawn {
        let bg: [Double]
        let fg: [Double]
    }

    /// How far apart two colours may be (0–255 RGB, straight-line distance) and still count as one: rounding, and a
    /// glyph's anti-aliased edge, which lies on the line between the background and the text's colour.
    static let tolerance = 6.0
    /// The share of the pixels under a text (its glyphs and their edges left out) that one colour must cover to be its
    /// background. Under a photo or a gradient no colour does, and a ratio would be a guess: such text isn't judged.
    static let backgroundShare = 0.5

    /// The background under the rectangle (its most common colour) and the colour drawn on it: the element's own colour
    /// when it says one and that colour is in the picture; else, of the colours drawn there often enough to be a glyph's
    /// core rather than its edge, the one that stands out most. With `strict`, only the element's own colour counts.
    /// Nil when nothing is drawn on the background, or no one colour is clearly the background.
    func drawn(in rect: CGRect, hint: [Double]?, strict: Bool = false) -> Drawn? {
        guard let b = box(rect) else { return nil }
        var counts: [UInt32: Int] = [:]
        for y in b.y0..<b.y1 {
            for x in b.x0..<b.x1 { counts[rgb(x, y), default: 0] += 1 }
        }
        let common = counts.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }
        guard let top = common.first else { return nil }
        let bg = MotifColor.components(top.key)
        let others = common.filter { MotifColor.distance(MotifColor.components($0.key), bg) > Self.tolerance }
        guard let most = others.first else { return nil }
        var fg: [Double]?
        if let hint {
            // Its own colour, blended on the background when it is see-through.
            let alpha = hint.count > 3 ? hint[3] : 1
            let own = (0..<3).map { bg[$0] * (1 - alpha) + hint[$0] * 255 * alpha }
            let near = others.filter { MotifColor.distance(MotifColor.components($0.key), own) <= 2 * Self.tolerance }
            if near.reduce(0, { $0 + $1.value }) >= 3 { fg = MotifColor.components(near[0].key) }
        }
        if fg == nil && !strict {
            let floor = max(2, most.value / 10)
            fg = others.filter { $0.value >= floor }
                .map { MotifColor.components($0.key) }
                .max { MotifColor.ratio($0, bg) < MotifColor.ratio($1, bg) }
        }
        guard let fg else { return nil }
        var background = 0
        var glyphs = 0
        var total = 0
        for (key, count) in common {
            let c = MotifColor.components(key)
            total += count
            if MotifColor.distance(c, bg) <= Self.tolerance { background += count }
            else if MotifColor.toSegment(c, bg, fg) <= Self.tolerance { glyphs += count }
        }
        let rest = total - glyphs
        guard rest > 0, Double(background) / Double(rest) >= Self.backgroundShare else { return nil }
        return Drawn(bg: bg, fg: fg)
    }

    /// How many lines of text the rectangle holds: runs of rows with the text's colour in them, apart.
    func lines(in rect: CGRect, drawn: Drawn) -> Int {
        guard let b = box(rect) else { return 0 }
        var lines = 0
        var inLine = false
        for y in b.y0..<b.y1 {
            var ink = false
            for x in b.x0..<b.x1 where MotifColor.distance(MotifColor.components(rgb(x, y)), drawn.bg) > Self.tolerance
                && MotifColor.toSegment(MotifColor.components(rgb(x, y)), drawn.bg, drawn.fg) <= Self.tolerance {
                ink = true
                break
            }
            if ink && !inLine { lines += 1 }
            inLine = ink
        }
        return lines
    }
}

enum MotifColor {
    static func components(_ rgb: UInt32) -> [Double] {
        [Double((rgb >> 16) & 0xFF), Double((rgb >> 8) & 0xFF), Double(rgb & 0xFF)]
    }

    static func distance(_ a: [Double], _ b: [Double]) -> Double {
        (0..<3).reduce(0) { $0 + (a[$1] - b[$1]) * (a[$1] - b[$1]) }.squareRoot()
    }

    /// How far a colour is from the line between two others (a blend of them).
    static func toSegment(_ c: [Double], _ from: [Double], _ to: [Double]) -> Double {
        let v = (0..<3).map { to[$0] - from[$0] }
        let length = v.reduce(0) { $0 + $1 * $1 }
        if length == 0 { return distance(c, from) }
        let t = min(1, max(0, (0..<3).reduce(0) { $0 + (c[$1] - from[$1]) * v[$1] } / length))
        return distance(c, (0..<3).map { from[$0] + t * v[$0] })
    }

    static func luminance(_ c: [Double]) -> Double {
        let l = c.prefix(3).map { v -> Double in
            let s = v / 255
            return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
    }

    /// WCAG's contrast ratio, cut to two decimals as axe-core does.
    static func ratio(_ a: [Double], _ b: [Double]) -> Double {
        let la = luminance(a)
        let lb = luminance(b)
        return ((max(la, lb) + 0.05) / (min(la, lb) + 0.05) * 100).rounded(.down) / 100
    }

    static func hex(_ c: [Double]) -> String {
        "#" + c.prefix(3).map { String(format: "%02x", Int(max(0, min(255, $0.rounded())))) }.joined()
    }

    /// A colour an element names (a CGColor, a UIColor or an NSColor) as sRGB components in 0–1, with its alpha.
    static func srgb(_ value: Any?) -> [Double]? {
        guard let value else { return nil }
        let cg: CGColor
        if CFGetTypeID(value as CFTypeRef) == CGColor.typeID {
            cg = value as! CGColor
        } else {
            #if os(macOS)
            guard let color = value as? NSColor else { return nil }
            cg = color.cgColor
            #else
            guard let color = value as? UIColor else { return nil }
            cg = color.cgColor
            #endif
        }
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let converted = cg.converted(to: space, intent: .defaultIntent, options: nil),
              let parts = converted.components, parts.count >= 3 else { return nil }
        return [parts[0], parts[1], parts[2], parts.count > 3 ? parts[3] : 1].map { Double(min(1, max(0, $0))) }
    }

    /// WCAG's bold (700 and over): a font named bold, heavy or black, not semibold.
    static func bold(_ fontName: String) -> Bool {
        let name = fontName.lowercased()
        return (name.contains("bold") || name.contains("heavy") || name.contains("black")) && !name.contains("semibold") && !name.contains("demibold")
    }
}

/// What keeps moving on a screen that has settled, with reduce motion on: after two more seconds, the layers whose place,
/// size or turn still change over the next half second (only movement counts, as on the web: a
/// fade or a colour change is fine). The platform's own spinner (an activity indicator,
/// which the system keeps turning) and a text field's own drawing (its caret) aren't the app's motion and are left out.
@MainActor
enum MotifMotionCheck {
    struct Layer {
        let key: String
        let state: String
        let rect: CGRect
        let size: CGSize
    }

    static func moving(_ window: MotifWindow, elements: [MotifElement]) -> MotifIssue? {
        RunLoop.main.run(until: Date().addingTimeInterval(2))
        let first = MotifAuditTree.layers(of: window)
        var changed: [Layer] = []
        for _ in 0..<5 {
            RunLoop.main.run(until: Date().addingTimeInterval(0.1))
            let now = Dictionary(MotifAuditTree.layers(of: window).map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
            changed = first.filter { layer in now[layer.key].map { $0.state != layer.state } ?? false }
            if !changed.isEmpty { break }
        }
        // The largest thing that moves stands for them all.
        guard let lead = changed.max(by: { $0.size.width * $0.size.height < $1.size.width * $1.size.height }) else { return nil }
        // The element it is part of, when it is one: the smallest whose frame takes in the middle of what moves (not a
        // group that holds the whole screen).
        let middle = CGPoint(x: lead.rect.midX, y: lead.rect.midY)
        if let subject = elements.filter({ $0.kind != .other && $0.rect.contains(middle) }).min(by: { $0.rect.width * $0.rect.height < $1.rect.width * $1.rect.height }) {
            return MotifIssue(rule: "motion", selector: MotifAudit.baseSelector(subject), label: MotifAudit.shownName(subject), kind: "element")
        }
        return MotifIssue(rule: "motion", selector: "View(\(Int(lead.size.width.rounded()))×\(Int(lead.size.height.rounded())))", label: "", kind: "element")
    }

    /// A layer as the screen shows it now: its presentation's place, size and turn.
    static func state(_ layer: CALayer) -> String {
        let p = layer.presentation() ?? layer
        let t = p.transform
        return "\(p.position)\(p.bounds)\(t.m11),\(t.m12),\(t.m21),\(t.m22),\(t.m41),\(t.m42)"
    }
}

#if os(macOS)
typealias MotifWindow = NSWindow

@MainActor
enum MotifAuditTree {
    static func size(of window: NSWindow) -> CGSize { window.frame.size }

    /// Every accessibility element in the window, as VoiceOver reads them: SwiftUI's elements and AppKit's controls.
    /// A Form row's label names the control after it (a switch, a field), as VoiceOver reads them together.
    static func elements(in window: NSWindow) -> [MotifElement] {
        var objects: [NSObject] = []
        var seen = Set<ObjectIdentifier>()
        func visit(_ object: NSObject, depth: Int) {
            guard depth < 64, seen.insert(ObjectIdentifier(object)).inserted else { return }
            if let view = object as? NSView, view.isHidden || view.alphaValue < 0.01 { return }
            if MotifAX.bool(object, "isAccessibilityElement") == true { objects.append(object) }
            for case let child as NSObject in MotifAX.object(object, "accessibilityChildren") as? [Any] ?? [] {
                visit(child, depth: depth + 1)
            }
        }
        if let content = window.contentView { visit(content, depth: 0) }
        var out = objects.compactMap { element($0, window) }
        for i in out.indices where out[i].kind == .text {
            let next = out[(i + 1)...].prefix(2).firstIndex { $0.kind != .text && ($0.name ?? "").isEmpty && !$0.symbolOnly }
            if let at = next, [.toggle, .field, .adjustable, .button].contains(out[at].kind) { out[at].name = out[i].name }
        }
        return out
    }

    private static func string(_ value: Any?) -> String? {
        let s = (value as? String) ?? (value as? NSAttributedString)?.string
        let t = s?.trimmingCharacters(in: .whitespacesAndNewlines)
        return t?.isEmpty == false ? t : nil
    }

    private static func element(_ object: NSObject, _ window: NSWindow) -> MotifElement? {
        let role = MotifAX.object(object, "accessibilityRole") as? String ?? ""
        let screen = MotifAX.rect(object, "accessibilityFrame")
        guard screen.width > 0, screen.height > 0 else { return nil }
        let local = window.convertFromScreen(screen)
        let rect = CGRect(x: local.minX, y: window.frame.height - local.maxY, width: local.width, height: local.height)
        let kind: MotifElement.Kind
        switch role {
        case "AXStaticText": kind = .text
        case "AXButton", "AXPopUpButton", "AXMenuButton", "AXRadioButton", "AXDisclosureTriangle": kind = .button
        case "AXLink": kind = .link
        case "AXCheckBox", "AXSwitch", "AXToggle": kind = .toggle
        case "AXImage": kind = .image
        case "AXTextField", "AXTextArea", "AXComboBox", "AXSearchField": kind = .field
        case "AXSlider", "AXIncrementor", "AXStepper": kind = .adjustable
        default: kind = .other
        }
        let value = string(MotifAX.object(object, "accessibilityValue"))
        let placeholder = string(MotifAX.object(object, "accessibilityPlaceholderValue"))
        var name = string(MotifAX.object(object, "accessibilityLabel")) ?? string(MotifAX.object(object, "accessibilityTitle"))
        if name == nil && kind == .text { name = value }
        if name == nil && kind == .field { name = placeholder }
        // SwiftUI gives an element that shows an SF Symbol the symbol's name as its identifier.
        let id = string(MotifAX.object(object, "accessibilityIdentifier"))
        let image = id.flatMap { NSImage(systemSymbolName: $0, accessibilityDescription: nil) }
        var symbol = image != nil ? id : nil
        var symbolOnly = symbol.map { MotifAudit.symbolOnly(object, name, symbol: $0, description: image?.accessibilityDescription) } ?? false
        if symbol == nil, let raw = MotifAudit.rawSymbol(name, kind: kind, exists: { NSImage(systemSymbolName: $0, accessibilityDescription: nil) != nil }) {
            symbol = raw
            symbolOnly = true
        }
        // A static text's own font and colour, as its attributed value says them.
        var font: (Double, Bool)?
        var color: [Double]?
        if kind == .text || kind == .button || kind == .link || kind == .toggle, let attributed = attributes(object, value ?? name) {
            if let f = attributed["AXFont"] as? [String: Any], let size = (f["AXFontSize"] as? NSNumber)?.doubleValue {
                font = (size, MotifColor.bold(f["AXFontName"] as? String ?? ""))
            }
            color = MotifColor.srgb(attributed["AXForegroundColor"])
        }
        return MotifElement(
            kind: kind, name: name, rect: rect, symbol: symbol, symbolOnly: symbolOnly, identifier: symbol == nil ? id : nil,
            enabled: MotifAX.bool(object, "isAccessibilityEnabled") ?? true, font: font, color: color,
            typed: kind == .field ? value : nil)
    }

    /// The attributes of an element's text at its first character (accessibilityAttributedStringForRange:).
    private static func attributes(_ object: NSObject, _ text: String?) -> [String: Any]? {
        let selector = NSSelectorFromString("accessibilityAttributedStringForRange:")
        guard let text, !text.isEmpty, object.responds(to: selector), let imp = object.method(for: selector) else { return nil }
        typealias Get = @convention(c) (NSObject, Selector, NSRange) -> NSAttributedString?
        let attributed = unsafeBitCast(imp, to: Get.self)(object, selector, NSRange(location: 0, length: (text as NSString).length))
        guard let attributed, attributed.length > 0 else { return nil }
        return Dictionary(uniqueKeysWithValues: attributed.attributes(at: 0, effectiveRange: nil).map { ($0.key.rawValue, $0.value) })
    }

    /// Every layer in the window's content, with its state now and where it is (window points, from the top left); the
    /// layers of a progress indicator are left out.
    static func layers(of window: NSWindow) -> [MotifMotionCheck.Layer] {
        guard let content = window.contentView, let root = content.layer else { return [] }
        var out: [MotifMotionCheck.Layer] = []
        func visit(_ layer: CALayer, _ key: String) {
            // The system's spinner, and a field's caret, aren't the app's motion.
            if layer.delegate is NSProgressIndicator || layer.delegate is NSText || layer.delegate is NSTextField { return }
            let r = layer.convert(layer.bounds, to: root)
            let rect = content.isFlipped ? r : CGRect(x: r.minX, y: root.bounds.height - r.maxY, width: r.width, height: r.height)
            out.append(MotifMotionCheck.Layer(key: key, state: MotifMotionCheck.state(layer), rect: rect, size: layer.bounds.size))
            for (i, sub) in (layer.sublayers ?? []).enumerated() { visit(sub, "\(key)/\(i)") }
        }
        visit(root, "")
        return out
    }
}
#else
typealias MotifWindow = UIWindow

@MainActor
enum MotifAuditTree {
    static func size(of window: UIWindow) -> CGSize { window.bounds.size }

    /// Every accessibility element in the window, as VoiceOver reads them: an element's own children, else its views'.
    static func elements(in window: UIWindow) -> [MotifElement] {
        var out: [MotifElement] = []
        var seen = Set<ObjectIdentifier>()
        func visit(_ object: NSObject, depth: Int) {
            guard depth < 64, seen.insert(ObjectIdentifier(object)).inserted else { return }
            if let view = object as? UIView, view.isHidden || view.alpha < 0.01 { return }
            if object.accessibilityElementsHidden { return }
            if object.isAccessibilityElement {
                if let e = element(object, window) { out.append(e) }
                return
            }
            if let children = object.accessibilityElements, !children.isEmpty {
                for case let child as NSObject in children { visit(child, depth: depth + 1) }
                return
            }
            let count = object.accessibilityElementCount()
            if count != NSNotFound && count > 0 {
                for i in 0..<count {
                    if let child = object.accessibilityElement(at: i) as? NSObject { visit(child, depth: depth + 1) }
                }
                return
            }
            if let view = object as? UIView {
                for sub in view.subviews { visit(sub, depth: depth + 1) }
            }
        }
        visit(window, depth: 0)
        return out
    }

    private static func string(_ value: String?) -> String? {
        let t = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return t?.isEmpty == false ? t : nil
    }

    private static func element(_ object: NSObject, _ window: UIWindow) -> MotifElement? {
        let frame = object.accessibilityFrame
        guard frame.width > 0, frame.height > 0 else { return nil }
        let rect = window.convert(frame, from: window.screen.coordinateSpace)
        let traits = object.accessibilityTraits
        let field = object as? UITextField
        let kind: MotifElement.Kind
        if field != nil || object is UITextView || traits.rawValue & 0x40000 != 0 { kind = .field }
        else if traits.contains(.toggleButton) { kind = .toggle }
        else if traits.contains(.link) { kind = .link }
        else if traits.contains(.button) { kind = .button }
        else if traits.contains(.adjustable) { kind = .adjustable }
        else if traits.contains(.image) { kind = .image }
        else if traits.contains(.staticText) { kind = .text }
        else { kind = .other }
        var name = string(object.accessibilityLabel)
        if name == nil && kind == .field { name = string(field?.placeholder) }
        // SwiftUI gives an element that shows an SF Symbol the symbol's name as its identifier.
        let getter = NSSelectorFromString("accessibilityIdentifier")
        let id = object.responds(to: getter) ? string(object.perform(getter)?.takeUnretainedValue() as? String) : nil
        let image = id.flatMap { UIImage(systemName: $0) }
        var symbol = image != nil ? id : nil
        var symbolOnly = symbol.map { MotifAudit.symbolOnly(object, name, symbol: $0, description: image?.accessibilityLabel) } ?? false
        if symbol == nil, let raw = MotifAudit.rawSymbol(name, kind: kind, exists: { UIImage(systemName: $0) != nil }) {
            symbol = raw
            symbolOnly = true
        }
        // SwiftUI's elements carry their text's font and colour in their attributed label.
        var font: (Double, Bool)?
        var color: [Double]?
        if let label = object.accessibilityAttributedLabel, label.length > 0 {
            let attributes = label.attributes(at: 0, effectiveRange: nil)
            let value = { (key: String) in attributes[NSAttributedString.Key(key)] }
            if let size = (value("UIAccessibilityTokenFontSize") as? NSNumber)?.doubleValue {
                font = (size, MotifColor.bold(value("UIAccessibilityTokenFontName") as? String ?? ""))
            }
            color = MotifColor.srgb(value("UIAccessibilityTokenForegroundColor"))
        }
        let typed = kind == .field ? string(field?.text ?? (object as? UITextView)?.text) : nil
        return MotifElement(
            kind: kind, name: name, rect: rect, symbol: symbol, symbolOnly: symbolOnly, identifier: symbol == nil ? id : nil,
            enabled: !traits.contains(.notEnabled), font: font, color: color, typed: typed)
    }

    /// Every layer in the window, with its state now and where it is; the layers of an activity indicator (the system's
    /// spinner) are left out.
    static func layers(of window: UIWindow) -> [MotifMotionCheck.Layer] {
        var out: [MotifMotionCheck.Layer] = []
        func visit(_ layer: CALayer, _ key: String) {
            // The system's spinner, and a field's caret, aren't the app's motion.
            if layer.delegate is UIActivityIndicatorView || layer.delegate is UITextField || layer.delegate is UITextView { return }
            out.append(MotifMotionCheck.Layer(key: key, state: MotifMotionCheck.state(layer), rect: layer.convert(layer.bounds, to: window.layer), size: layer.bounds.size))
            for (i, sub) in (layer.sublayers ?? []).enumerated() { visit(sub, "\(key)/\(i)") }
        }
        visit(window.layer, "")
        return out
    }
}
#endif
