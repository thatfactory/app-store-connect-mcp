import Foundation
import ImageIO
import CoreGraphics

func fail() -> Never {
    FileHandle.standardOutput.write(Data("{\"valid\":false}\n".utf8))
    exit(1)
}
let bytes = FileHandle.standardInput.readDataToEndOfFile()
guard !bytes.isEmpty, bytes.count <= 32 * 1024 * 1024,
      let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
      CGImageSourceGetCount(source) == 1,
      CGImageSourceGetStatus(source) == .statusComplete,
      CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete,
      let type = CGImageSourceGetType(source) as String?,
      ["public.png", "public.jpeg"].contains(type),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      [[1280, 800], [1440, 900], [2560, 1600], [2880, 1800]].contains([width, height]),
      properties[kCGImagePropertyColorModel] as? String == "RGB",
      properties[kCGImagePropertyHasAlpha] as? Bool != true,
      (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
      let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
      image.width == width, image.height == height,
      [.none, .noneSkipFirst, .noneSkipLast].contains(image.alphaInfo),
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                              space: colorSpace, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { fail() }
context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
guard CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete, context.makeImage() != nil else { fail() }
let result: [String: Any] = ["valid": true, "width": width, "height": height, "format": type == "public.png" ? "png" : "jpeg", "colorModel": "RGB", "alpha": false]
guard let encoded = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]) else { fail() }
FileHandle.standardOutput.write(encoded + Data("\n".utf8))
