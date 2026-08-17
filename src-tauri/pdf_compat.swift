import AppKit
import Foundation
import PDFKit

func renderedInk(_ path: String) throws -> [Double] {
    guard let document = PDFDocument(url: URL(fileURLWithPath: path)), let page = document.page(at: 0) else { throw NSError(domain: "Modafile", code: 1) }
    let box = page.bounds(for: .mediaBox)
    let width = 180
    let height = max(120, min(1200, Int(CGFloat(width) * box.height / box.width)))
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw NSError(domain: "Modafile", code: 2) }
    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: CGFloat(width) / box.width, y: CGFloat(height) / box.height)
    page.draw(with: .mediaBox, to: context)
    let bytes = context.data!.assumingMemoryBound(to: UInt8.self)
    var zones = [0, 0, 0]
    var totals = [0, 0, 0]
    for y in 0..<height {
        let zone = min(2, y * 3 / height)
        for x in 0..<width {
            totals[zone] += 1
            let index = (y * width + x) * 4
            if bytes[index] < 242 || bytes[index + 1] < 242 || bytes[index + 2] < 242 { zones[zone] += 1 }
        }
    }
    return zip(zones, totals).map { Double($0) / Double($1) }
}

if CommandLine.arguments.count == 4, CommandLine.arguments[1] == "check" {
    do {
        let source = try renderedInk(CommandLine.arguments[2])
        let output = try renderedInk(CommandLine.arguments[3])
        let compatible = zip(source, output).allSatisfy { original, candidate in original < 0.004 || candidate >= original * 0.32 }
        exit(compatible ? 0 : 1)
    } catch { exit(2) }
}

exit(2)
