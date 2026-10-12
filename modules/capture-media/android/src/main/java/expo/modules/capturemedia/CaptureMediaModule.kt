package expo.modules.capturemedia

import android.media.MediaMetadataRetriever
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class CaptureMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CaptureMedia")
    AsyncFunction("inspectVideo") { uri: String ->
      inspectCaptureMedia(uri) {
        object : CaptureVideoReader {
          private val retriever = MediaMetadataRetriever()
          override fun read(file: File): CaptureMediaFacts {
            retriever.setDataSource(file.path)
            return CaptureMediaFacts(
              hasVideo = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes",
              durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: Double.NaN
            )
          }
          override fun close() { retriever.release() }
        }
      }
    }
  }
}
