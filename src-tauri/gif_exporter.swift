import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else {
  fputs("Usage: gif-exporter input-video output-gif\n", stderr)
  exit(64)
}

let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let asset = AVURLAsset(url: sourceURL)
guard let track = asset.tracks(withMediaType: .video).first else {
  fputs("This file does not contain a video track.\n", stderr)
  exit(65)
}

let reader: AVAssetReader
do { reader = try AVAssetReader(asset: asset) }
catch { fputs("Could not read video: \(error.localizedDescription)\n", stderr); exit(66) }

let settings: [String: Any] = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
reader.add(output)
guard reader.startReading() else { fputs("Could not start reading this video.\n", stderr); exit(67) }

let frameRate = max(track.nominalFrameRate, 1)
let frameStride = max(1, Int(frameRate / 10.0))
let delay = Double(frameStride) / Double(frameRate)
let gifProperties: CFDictionary = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary
guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, UTType.gif.identifier as CFString, 0, nil) else {
  fputs("Could not create GIF output.\n", stderr); exit(68)
}

let context = CIContext(options: nil)
var index = 0
var written = 0
while let sample = output.copyNextSampleBuffer(), let pixelBuffer = CMSampleBufferGetImageBuffer(sample) {
  defer { index += 1 }
  guard index % frameStride == 0 else { continue }
  let image = CIImage(cvPixelBuffer: pixelBuffer)
  guard let cgImage = context.createCGImage(image, from: image.extent) else { continue }
  let frameProperties: CFDictionary = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: delay, kCGImagePropertyGIFUnclampedDelayTime: delay]] as CFDictionary
  CGImageDestinationAddImage(destination, cgImage, frameProperties)
  written += 1
}

guard written > 0 else { fputs("No frames could be read from this video.\n", stderr); exit(69) }
guard CGImageDestinationFinalize(destination) else { fputs("Could not finish GIF output.\n", stderr); exit(70) }
