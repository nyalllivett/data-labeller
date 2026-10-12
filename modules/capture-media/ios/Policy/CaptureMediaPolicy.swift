import Foundation

private func mediaFailure() -> NSError {
  NSError(domain: "CaptureMedia", code: 1,
    userInfo: [NSLocalizedDescriptionKey: "capture-media-unavailable"])
}

// A Stop can arrive before the native start callback, independently of media
// duration. The camera uses this only on its existing session queue.
public final class RecordingStopRequest {
  private var currentId: String?
  private var requestedId: String?
  private var started = false
  public init() {}
  public func begin(_ id: String?) {
    currentId = id
    started = false
    if requestedId != id { requestedId = nil }
  }
  public func request(_ id: String) -> Bool {
    requestedId = id
    return currentId == id && started
  }
  public func didStart() -> Bool {
    started = true
    return currentId != nil && currentId == requestedId
  }
  public func finish() {
    currentId = nil
    requestedId = nil
    started = false
  }
}

public func reportedRecordingPosition(
  requestedId: String, currentId: String?, seconds: Double, isRecording: Bool
) throws -> Double {
  guard requestedId == currentId, isRecording, seconds.isFinite, seconds > 0 else {
    throw mediaFailure()
  }
  return seconds * 1000
}

public func captureOutputURL(_ requested: String?, fallback: () -> URL) throws -> URL {
  guard let requested = requested else { return fallback() }
  guard let url = URL(string: requested), url.isFileURL else { throw mediaFailure() }
  return url
}

public struct CaptureMediaFacts {
  public let hasVideo: Bool
  public let durationSeconds: Double
  public init(hasVideo: Bool, durationSeconds: Double) {
    self.hasVideo = hasVideo
    self.durationSeconds = durationSeconds
  }
}

public func inspectCaptureMedia(
  _ uri: String, read: (URL) async throws -> CaptureMediaFacts
) async throws -> Double {
  do {
    let url = try captureOutputURL(uri, fallback: { URL(fileURLWithPath: "/") })
    let facts = try await read(url)
    guard facts.hasVideo, facts.durationSeconds.isFinite, facts.durationSeconds > 0 else {
      throw mediaFailure()
    }
    return facts.durationSeconds * 1000
  } catch {
    throw mediaFailure()
  }
}
