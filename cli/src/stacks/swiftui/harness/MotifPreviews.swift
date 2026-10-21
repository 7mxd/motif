// The app's #Preview bodies, found at run time (decision 0010). The #Preview macro expands to a type conforming to
// DeveloperToolsSupport's PreviewRegistry, with a name no source can spell. Swift lists every conformance in the
// __swift5_proto section of the image that declares it, so the harness reads the app's images' sections, keeps the
// conformances to PreviewRegistry, and asks SwiftUI's preview host for each one's view.
import DeveloperToolsSupport
import MachO
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
    /// Every #Preview of the app's own images (its executable and, in a debug build, its .debug.dylib), in file and line order.
    static func all() -> [MotifPreview] {
        var out: [MotifPreview] = []
        let appFolder = Bundle.main.bundlePath + "/"
        for index in 0..<_dyld_image_count() {
            guard let cName = _dyld_get_image_name(index), String(cString: cName).hasPrefix(appFolder) else { continue }
            guard let header = _dyld_get_image_header(index) else { continue }
            for type in registryTypes(UnsafeRawPointer(header)) {
                out.append(preview(type))
            }
        }
        return out.sorted { ($0.info.id.split(separator: ":").first ?? "", line($0)) < ($1.info.id.split(separator: ":").first ?? "", line($1)) }
    }

    private static func line(_ p: MotifPreview) -> Int {
        Int(p.info.id.split(separator: ":").last ?? "") ?? 0
    }

    private static func preview(_ type: any PreviewRegistry.Type) -> MotifPreview {
        let id = "\(type.fileID):\(type.line)"
        let host = _PreviewHost.makeHost(providerType: type)
        let first = host?.previews.first
        return MotifPreview(info: MotifPreviewInfo(id: id, name: first?.displayName)) {
            guard let content = _PreviewHost.makeHost(providerType: type)?.previews.first?.content else {
                throw MotifShotError("SwiftUI couldn't make the preview at \(id).")
            }
            return content
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
