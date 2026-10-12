import AVFoundation
import ExpoModulesCore

public class CaptureMediaModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CaptureMedia")
    AsyncFunction("inspectVideo") { (uri: String) async throws -> Double in
      try await inspectCaptureMedia(uri) { url in
        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        let duration = try await asset.load(.duration)
        return CaptureMediaFacts(hasVideo: !tracks.isEmpty, durationSeconds: CMTimeGetSeconds(duration))
      }
    }
  }
}
