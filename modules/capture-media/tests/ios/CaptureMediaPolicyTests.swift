import Foundation
import XCTest
@testable import CaptureMediaPolicy

final class CaptureMediaPolicyTests: XCTestCase {
  func testStopBeforeAndAfterNativeStartDoesNotWaitForMediaDuration() {
    let stop = RecordingStopRequest()
    XCTAssertFalse(stop.request("A"))
    stop.begin("A")
    XCTAssertTrue(stop.didStart())
    XCTAssertTrue(stop.request("A"))
    stop.finish()
    stop.begin("B")
    XCTAssertFalse(stop.didStart())
    XCTAssertFalse(stop.request("A"))
    XCTAssertTrue(stop.request("B"))
    stop.finish()
    stop.begin(nil)
    XCTAssertFalse(stop.didStart())
  }

  func testDifferentPendingStopIsClearedWhenAnotherRecordingStarts() {
    let stop = RecordingStopRequest()
    XCTAssertFalse(stop.request("A"))
    stop.begin("B")
    XCTAssertFalse(stop.didStart())
  }
  private func assertFixed(_ error: Error, file: StaticString = #filePath, line: UInt = #line) {
    let error = error as NSError
    XCTAssertEqual(error.domain, "CaptureMedia", file: file, line: line)
    XCTAssertEqual(error.code, 1, file: file, line: line)
    XCTAssertEqual(error.localizedDescription, "capture-media-unavailable", file: file, line: line)
    XCTAssertEqual(Set(error.userInfo.keys), Set([NSLocalizedDescriptionKey]), file: file, line: line)
  }

  func testReportedPositionUsesCurrentRecordingMediaSecondsWithoutStartOffset() throws {
    XCTAssertEqual(try reportedRecordingPosition(requestedId: "A", currentId: "A", seconds: 1.25, isRecording: true), 1250)
    XCTAssertEqual(try reportedRecordingPosition(requestedId: "A", currentId: "A", seconds: 1.25, isRecording: true), 1250)
  }

  func testUnavailableWrongRecordingAndInvalidPositionsAreNotManufactured() {
    for seconds in [0, -1, Double.nan, Double.infinity] {
      XCTAssertThrowsError(try reportedRecordingPosition(requestedId: "A", currentId: "A", seconds: seconds, isRecording: true)) { self.assertFixed($0) }
    }
    for id: String? in [nil, "B"] {
      XCTAssertThrowsError(try reportedRecordingPosition(requestedId: "A", currentId: id, seconds: 1, isRecording: true)) { self.assertFixed($0) }
    }
    XCTAssertThrowsError(try reportedRecordingPosition(requestedId: "A", currentId: "A", seconds: 1, isRecording: false)) { self.assertFixed($0) }
  }

  func testExplicitStagingDestinationAndUnmodifiedSDKFallback() throws {
    let expected = URL(fileURLWithPath: "/private/A.partial.mov")
    var fallbackCalls = 0
    let fallback = { fallbackCalls += 1; return URL(fileURLWithPath: "/cache/default.mov") }
    XCTAssertEqual(try captureOutputURL(expected.absoluteString, fallback: fallback), expected)
    XCTAssertEqual(fallbackCalls, 0)
    XCTAssertEqual(try captureOutputURL(nil, fallback: fallback).path, "/cache/default.mov")
    XCTAssertEqual(fallbackCalls, 1)
  }

  func testNonFileDestinationFailsWithFixedError() {
    XCTAssertThrowsError(try captureOutputURL("https://private.example/video", fallback: { URL(fileURLWithPath: "/") })) { self.assertFixed($0) }
  }

  func testInspectionReadsLocalVideoAndConvertsActualAssetDuration() async throws {
    var inputs: [URL] = []
    let duration = try await inspectCaptureMedia("file:///private/A.mov") { url in
      inputs.append(url)
      return CaptureMediaFacts(hasVideo: true, durationSeconds: 2.5)
    }
    XCTAssertEqual(duration, 2500)
    XCTAssertEqual(inputs.map { $0.path }, ["/private/A.mov"])
  }

  func testMissingVideoAndInvalidAssetDurationCannotBeSaved() async {
    for facts in [
      CaptureMediaFacts(hasVideo: false, durationSeconds: 1),
      CaptureMediaFacts(hasVideo: true, durationSeconds: 0),
      CaptureMediaFacts(hasVideo: true, durationSeconds: -1),
      CaptureMediaFacts(hasVideo: true, durationSeconds: .nan),
      CaptureMediaFacts(hasVideo: true, durationSeconds: .infinity)
    ] {
      do {
        _ = try await inspectCaptureMedia("file:///private/A.mov") { _ in facts }
        XCTFail("Invalid media must fail")
      } catch { assertFixed(error) }
    }
  }

  func testAssetReadFailureDropsPathsAndUnderlyingErrors() async {
    do {
      _ = try await inspectCaptureMedia("file:///private/A.mov") { _ in
        throw NSError(domain: "secret path", code: 99,
          userInfo: [NSLocalizedDescriptionKey: "/private/secret", NSUnderlyingErrorKey: NSError(domain: "secret cause", code: 2)])
      }
      XCTFail("Read failure must fail")
    } catch { assertFixed(error) }
  }

  func testInvalidURIStopsBeforeAssetRead() async {
    var read = false
    do {
      _ = try await inspectCaptureMedia("https://private.example/video") { _ in
        read = true
        return CaptureMediaFacts(hasVideo: true, durationSeconds: 1)
      }
      XCTFail("Invalid URI must fail")
    } catch { assertFixed(error) }
    XCTAssertFalse(read)
  }
}
