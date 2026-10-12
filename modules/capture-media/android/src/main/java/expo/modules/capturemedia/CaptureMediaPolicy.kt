package expo.modules.capturemedia

import java.io.File
import java.net.URI

private fun mediaFailure() = IllegalStateException("capture-media-unavailable")

class RecordingStopRequest {
  private var currentId: String? = null
  private var requestedId: String? = null
  private var started = false
  fun begin(id: String?) {
    currentId = id
    started = false
    if (requestedId != id) requestedId = null
  }
  fun request(id: String): Boolean {
    requestedId = id
    return currentId == id && started
  }
  fun didStart(): Boolean {
    started = true
    return currentId != null && currentId == requestedId
  }
  fun finish() {
    currentId = null
    requestedId = null
    started = false
  }
}

class RecordingPosition {
  private var recordingId: String? = null
  private var mediaMs: Double? = null

  fun begin(id: String?) {
    recordingId = id
    mediaMs = null
  }

  fun observe(id: String?, durationNanos: Long, recording: Boolean) {
    if (id != recordingId) return
    mediaMs = if (recording && durationNanos > 0) durationNanos / 1_000_000.0 else null
  }

  fun sample(id: String): Double {
    if (id != recordingId) throw mediaFailure()
    return mediaMs ?: throw mediaFailure()
  }
}

fun captureOutputFile(requested: String?, fallback: () -> File): File {
  try {
    return if (requested == null) fallback() else File(URI(requested))
  } catch (_: Exception) {
    throw mediaFailure()
  }
}

data class CaptureMediaFacts(val hasVideo: Boolean, val durationMs: Double)

interface CaptureVideoReader : AutoCloseable {
  fun read(file: File): CaptureMediaFacts
}

fun inspectCaptureMedia(uri: String, createReader: () -> CaptureVideoReader): Double {
  try {
    val file = captureOutputFile(uri) { throw mediaFailure() }
    return createReader().use { reader ->
      val facts = reader.read(file)
      if (!facts.hasVideo || !facts.durationMs.isFinite() || facts.durationMs <= 0) throw mediaFailure()
      facts.durationMs
    }
  } catch (_: Exception) {
    throw mediaFailure()
  }
}
