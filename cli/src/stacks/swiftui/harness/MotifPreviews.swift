// The app's #Preview bodies, found at run time (decision 0010). The #Preview macro expands to a type conforming to
// DeveloperToolsSupport's PreviewRegistry, with a name no source can spell. Swift lists every conformance in the
// __swift5_proto section of the image that declares it, so the harness reads the app's images' sections and keeps the
// conformances to PreviewRegistry. A Preview keeps its body as a closure; MotifMirror finds it and calls it.
// (SwiftUI's _PreviewHost.makeHost(providerType:) answers nil for these types: it reads PreviewProvider only.)
import DeveloperToolsSupport
import MachO
import SwiftData
import SwiftUI

struct MotifPreviewInfo: Encodable {
    /// "<fileID>:<line>", where the #Preview is: SwiftUIMin/ContentView.swift:28.
    let id: String
    /// The name given to #Preview("…"), if any.
    let name: String?
}

@MainActor
struct MotifPreview {
    let info: MotifPreviewInfo
    let make: @MainActor () throws -> AnyView
}

@MainActor
enum MotifPreviews {
    /// Every #Preview of the app's own images, in file and line order: those in the app's bundle (its executable and, in
    /// a debug build, its .debug.dylib), and the test bundle's (a Swift package's code is linked into it).
    static func all() -> [MotifPreview] {
        var out: [MotifPreview] = []
        let folders = [Bundle.main.bundlePath, Bundle(for: MotifShotTests.self).bundlePath].map { $0 + "/" }
        for index in 0..<_dyld_image_count() {
            guard let cName = _dyld_get_image_name(index) else { continue }
            let name = String(cString: cName)
            guard folders.contains(where: { name.hasPrefix($0) }) else { continue }
            guard let header = _dyld_get_image_header(index) else { continue }
            for type in registryTypes(UnsafeRawPointer(header)) {
                out.append(preview(type))
            }
        }
        let key = { (p: MotifPreview) -> (String, Int) in
            let parts = p.info.id.split(separator: ":")
            return (String(parts.first ?? ""), Int(parts.last ?? "") ?? 0)
        }
        return out.sorted { key($0) < key($1) }
    }

    /// The preview a shot names: by its id ("SwiftUIMin/HomeScreen.swift:26"), or by its file and line alone
    /// ("HomeScreen.swift:26"; a module can't have two files of one name).
    static func matching(_ previews: [MotifPreview], _ screen: String) -> MotifPreview? {
        previews.first { $0.info.id == screen } ?? previews.first { $0.info.id.hasSuffix("/" + screen) }
    }

    private static func preview(_ type: any PreviewRegistry.Type) -> MotifPreview {
        let id = "\(type.fileID):\(type.line)"
        let made = try? type.makePreview()
        let name = made.flatMap { MotifMirror.child($0, "displayName") as? String }
        return MotifPreview(info: MotifPreviewInfo(id: id, name: name)) {
            // Preview keeps its body as a closure (dataSource.preview.structure.singlePreview.makeBody) whose result
            // holds the view; Mirror reaches both, and MotifMirror.call calls the closure.
            let preview = try type.makePreview()
            guard let view = MotifMirror.firstView(preview, calling: true) else {
                throw MotifShotError("Motif couldn't find the view in the preview at \(id). Tell Motif's maintainers which Xcode you use.")
            }
            return view
        }
    }

    /// The types in one image that conform to PreviewRegistry, from its __TEXT,__swift5_proto section.
    private static func registryTypes(_ header: UnsafeRawPointer) -> [any PreviewRegistry.Type] {
        var size: UInt = 0
        guard let section = getsectiondata(header.assumingMemoryBound(to: mach_header_64.self), "__TEXT", "__swift5_proto", &size) else { return [] }
        let start = UnsafeRawPointer(section)
        var out: [any PreviewRegistry.Type] = []
        for offset in stride(from: 0, to: Int(size), by: 4) {
            let entry = start + offset
            let conformance = relative(entry)
            // ProtocolConformanceDescriptor: protocol (relative, indirect when its lowest bit is set), type reference, witness table, flags.
            guard protocolName(conformance) == "PreviewRegistry" else { continue }
            let flags = (conformance + 12).load(as: UInt32.self)
            let kind = (flags >> 3) & 0x7
            let reference = conformance + 4
            let descriptor: UnsafeRawPointer
            switch kind {
            case 0: descriptor = relative(reference)
            case 1: descriptor = relative(reference).load(as: UnsafeRawPointer.self)
            default: continue
            }
            // TypeContextDescriptor: flags, parent, name, access function. A generic type's accessor needs arguments.
            let typeFlags = descriptor.load(as: UInt32.self)
            if typeFlags & 0x80 != 0 { continue }
            let accessor = relative(descriptor + 12)
            typealias Access = @convention(c) (Int) -> UnsafeRawPointer
            let metadata = unsafeBitCast(accessor, to: Access.self)(0)
            let type = unsafeBitCast(metadata, to: Any.Type.self)
            if let registry = type as? any PreviewRegistry.Type { out.append(registry) }
        }
        return out
    }

    private static func relative(_ field: UnsafeRawPointer) -> UnsafeRawPointer {
        field + Int(field.load(as: Int32.self))
    }

    private static func protocolName(_ conformance: UnsafeRawPointer) -> String? {
        let raw = Int(conformance.load(as: Int32.self))
        var target = conformance + (raw & ~1)
        if raw & 1 != 0 {
            guard let indirect = target.load(as: UnsafeRawPointer?.self) else { return nil }
            target = indirect
        }
        // ProtocolDescriptor: flags, parent, name.
        let name = relative(target + 8)
        return String(cString: name.assumingMemoryBound(to: CChar.self))
    }
}

/// Finding views inside SwiftUI's own values (a scene, a preview) with Mirror.
@MainActor
enum MotifMirror {
    /// The value of a stored property, by name, found depth first.
    static func child(_ value: Any, _ label: String, depth: Int = 0) -> Any? {
        if depth > 6 { return nil }
        for c in Mirror(reflecting: value).children {
            if c.label == label {
                let inner = Mirror(reflecting: c.value)
                return inner.displayStyle == .optional ? inner.children.first?.value : c.value
            }
            if let found = child(c.value, label, depth: depth + 1) { return found }
        }
        return nil
    }

    /// The view the first WindowGroup in a scene shows. Only its `content` is read: a titled WindowGroup also keeps its
    /// title, a Text, which must never be taken for the screen. The content is the view itself, or (as SwiftUI keeps
    /// it) a closure that makes it, perhaps inside an enum case; the closure is called.
    ///
    /// The modifiers the App puts on the scene around the WindowGroup are applied to the view too, where they can be:
    /// an environment value or object (.environment, .environmentObject, which are view modifiers as well) and a
    /// SwiftData container (.modelContainer). Others (window sizes, commands) don't apply to a view and are left out.
    static func windowContent(_ scene: Any, depth: Int = 0) -> AnyView? {
        let name = String(describing: type(of: scene))
        let children = Mirror(reflecting: scene).children
        if name.hasPrefix("WindowGroup<") {
            guard let content = children.first(where: { $0.label == "content" })?.value else { return nil }
            return contentView(content)
        }
        if depth > 8 { return nil }
        if name.hasPrefix("ModifiedContent<"),
           let content = children.first(where: { $0.label == "content" })?.value,
           let view = windowContent(content, depth: depth + 1) {
            guard let modifier = children.first(where: { $0.label == "modifier" })?.value else { return view }
            return sceneModifier(modifier, on: view)
        }
        for c in children {
            if let found = windowContent(c.value, depth: depth + 1) { return found }
        }
        return nil
    }

    /// A modifier of the App's scene, applied to its root view when it means something there.
    private static func sceneModifier(_ modifier: Any, on view: AnyView) -> AnyView {
        if let container = first(ModelContainer.self, in: modifier) { return AnyView(view.modelContainer(container)) }
        func apply<M: ViewModifier>(_ m: M) -> AnyView { AnyView(view.modifier(m)) }
        if let viewModifier = modifier as? any ViewModifier { return apply(viewModifier) }
        return view
    }

    /// The first value of a type inside a value, depth first.
    static func first<T>(_ type: T.Type, in value: Any, depth: Int = 0) -> T? {
        if let found = value as? T { return found }
        if depth > 6 { return nil }
        for c in Mirror(reflecting: value).children {
            if let found = first(type, in: c.value, depth: depth + 1) { return found }
        }
        return nil
    }

    private static func contentView(_ content: Any, depth: Int = 0) -> AnyView? {
        // An Optional is a View too (when its value is); it is looked through, never taken for the screen.
        if Mirror(reflecting: content).displayStyle != .optional, let view = content as? any View {
            return AnyView(view)
        }
        if depth >= 3 { return nil }
        if let result = call(content) { return contentView(result, depth: depth + 1) }
        for c in Mirror(reflecting: content).children {
            if let view = contentView(c.value, depth: depth + 1) { return view }
        }
        return nil
    }

    /// The type of the view inside an AnyView (ContentView, ModifiedContent<…>), for result.json.
    static func typeName(_ view: AnyView) -> String {
        String(describe(view).prefix(300))
    }

    /// A view's type, looking through AnyView (the scene's modifiers are applied to the root inside one).
    private static func describe(_ value: Any, depth: Int = 0) -> String {
        let name = String(describing: type(of: value))
        guard depth < 8 else { return name }
        if name == "AnyView", let inner = child(value, "view") { return describe(inner, depth: depth + 1) }
        if name.hasPrefix("ModifiedContent<AnyView, ") {
            let children = Mirror(reflecting: value).children
            if let content = children.first(where: { $0.label == "content" })?.value,
               let modifier = children.first(where: { $0.label == "modifier" })?.value {
                return "ModifiedContent<\(describe(content, depth: depth + 1)), \(type(of: modifier))>"
            }
        }
        return name
    }

    /// The first View inside the value, depth first; with `calling`, closures that take nothing are called and their
    /// results looked in. An Optional is looked through, not taken for a view.
    static func firstView(_ value: Any, calling: Bool, depth: Int = 0) -> AnyView? {
        let mirror = Mirror(reflecting: value)
        if depth > 0, mirror.displayStyle != .optional, let view = value as? any View {
            return AnyView(view)
        }
        if depth > 10 { return nil }
        if calling, let result = call(value) {
            return firstView(result, calling: calling, depth: depth + 1)
        }
        for c in mirror.children {
            if let view = firstView(c.value, calling: calling, depth: depth + 1) { return view }
        }
        return nil
    }

    /// Calls a closure that takes nothing, whatever it returns; nil for anything else. The result's type comes from the
    /// closure's function type metadata (kind 0x302: flags, then the result type), so the closure can be cast to it.
    static func call(_ closure: Any) -> Any? {
        let metadata = unsafeBitCast(type(of: closure) as Any.Type, to: UnsafeRawPointer.self)
        guard metadata.load(as: Int.self) == 0x302 else { return nil }
        let flags = (metadata + MemoryLayout<Int>.size).load(as: Int.self)
        guard flags & 0xFFFF == 0 else { return nil }
        let result = (metadata + 2 * MemoryLayout<Int>.size).load(as: Any.Type.self)
        func open<T>(_: T.Type) -> Any? {
            if let f = closure as? @MainActor () -> T { return f() }
            if let f = closure as? () -> T { return f() }
            return nil
        }
        return _openExistential(result, do: open)
    }
}
