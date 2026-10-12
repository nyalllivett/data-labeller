package expo.modules.capturemedia

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class CaptureMediaPolicyTest {
  @Test fun stopBeforeAndAfterNativeStartDoesNotWaitForMediaDuration() {
    val stop = RecordingStopRequest()
    assertFalse(stop.request("A"))
    stop.begin("A")
    assertEquals(true, stop.didStart())
    assertEquals(true, stop.request("A"))
    stop.finish()
    stop.begin("B")
    assertFalse(stop.didStart())
    assertFalse(stop.request("A"))
    assertEquals(true, stop.request("B"))
    stop.finish()
    stop.begin(null)
    assertFalse(stop.didStart())
  }

  @Test fun differentPendingStopIsClearedWhenAnotherRecordingStarts() {
    val stop = RecordingStopRequest()
    assertFalse(stop.request("A"))
    stop.begin("B")
    assertFalse(stop.didStart())
  }
  private fun assertFixed(action: () -> Unit) {
    val error = assertThrows(IllegalStateException::class.java) { action() }
    assertEquals("capture-media-unavailable", error.message)
    assertNull(error.cause)
    assertEquals(0, error.suppressed.size)
  }

  @Test fun noPositionExistsBeforeFirstPositiveMediaSample() {
    val clock = RecordingPosition()
    assertFixed { clock.sample("A") }
    clock.begin("A")
    for (nanos in listOf(0L, -1L)) {
      clock.observe("A", nanos, true)
      assertFixed { clock.sample("A") }
    }
  }

  @Test fun positionUsesReportedNanosAndEqualSamplesWithoutElapsedExtrapolation() {
    val clock = RecordingPosition()
    clock.begin("A")
    clock.observe("A", 1_250_000_000, true)
    assertEquals(1250.0, clock.sample("A"), 0.0)
    clock.observe("A", 1_250_000_000, true)
    assertEquals(1250.0, clock.sample("A"), 0.0)
  }

  @Test fun recordingIdentityResetAndLatePreviousEventsCannotAttachToNewRecording() {
    val clock = RecordingPosition()
    clock.begin("A")
    clock.observe("A", 1_000_000_000, true)
    assertFixed { clock.sample("B") }
    clock.begin("B")
    clock.observe("A", 2_000_000_000, true)
    assertFixed { clock.sample("B") }
    clock.observe("B", 500_000_000, true)
    assertEquals(500.0, clock.sample("B"), 0.0)
  }

  @Test fun pauseFinalizationAndUnsupportedNonAppRecordingHaveNoUsablePosition() {
    val clock = RecordingPosition()
    clock.begin("A")
    clock.observe("A", 1_000_000_000, true)
    clock.observe("A", 1_000_000_000, false)
    assertFixed { clock.sample("A") }
    clock.begin(null)
    clock.observe(null, 1_000_000_000, true)
    assertFixed { clock.sample("A") }
  }

  @Test fun knownStagingFileAndOriginalSDKFallbackAreSelectedExplicitly() {
    var calls = 0
    val fallback = { calls += 1; File("/cache/default.mp4") }
    assertEquals(File("/private/A.partial.mp4"), captureOutputFile("file:///private/A.partial.mp4", fallback))
    assertEquals(0, calls)
    assertEquals(File("/cache/default.mp4"), captureOutputFile(null, fallback))
    assertEquals(1, calls)
    assertFixed { captureOutputFile("https://private.example/video", fallback) }
    assertFixed { captureOutputFile(null) { throw IllegalArgumentException("secret /private/path") } }
  }

  private class Reader : CaptureVideoReader {
    var facts = CaptureMediaFacts(true, 2500.0)
    var failure: String? = null
    val events = mutableListOf<String>()
    override fun read(file: File): CaptureMediaFacts {
      events.add("read:" + file.name)
      if (failure == "read") throw IllegalArgumentException("secret /private/path", Exception("secret cause"))
      return facts
    }
    override fun close() {
      events.add("close")
      if (failure == "close") throw IllegalArgumentException("secret close failure")
    }
  }

  @Test fun inspectionValidatesActualMetadataAndClosesReaderOnSuccess() {
    val reader = Reader()
    assertEquals(2500.0, inspectCaptureMedia("file:///private/A.mp4") { reader }, 0.0)
    assertEquals(listOf("read:A.mp4", "close"), reader.events)
  }

  @Test fun invalidMetadataAndReadOrCloseFailureAreSanitizedAndReleaseReader() {
    for (facts in listOf(CaptureMediaFacts(false, 1.0), CaptureMediaFacts(true, 0.0), CaptureMediaFacts(true, -1.0), CaptureMediaFacts(true, Double.NaN), CaptureMediaFacts(true, Double.POSITIVE_INFINITY))) {
      val reader = Reader()
      reader.facts = facts
      assertFixed { inspectCaptureMedia("file:///private/A.mp4") { reader } }
      assertEquals(listOf("read:A.mp4", "close"), reader.events)
    }
    for (failure in listOf("read", "close")) {
      val reader = Reader()
      reader.failure = failure
      assertFixed { inspectCaptureMedia("file:///private/A.mp4") { reader } }
      assertEquals(listOf("read:A.mp4", "close"), reader.events)
    }
  }

  @Test fun invalidURIStopsBeforeReaderCreationAndFactoryFailureIsSanitized() {
    var created = false
    assertFixed { inspectCaptureMedia("https://private.example/video") { created = true; Reader() } }
    assertFalse(created)
    assertFixed { inspectCaptureMedia("file:///private/A.mp4") { throw IllegalArgumentException("secret reader failure") } }
  }
}
