package expo.modules.privatestorage

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class PrivateStorageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PrivateStorage")
    AsyncFunction("prepareDatabaseDirectory") {
      try {
        val context = appContext.reactContext ?: throw IllegalStateException()
        val directory = File(context.noBackupFilesDir, "data-labeller")
        if (!directory.exists() && !directory.mkdirs()) throw IllegalStateException()
        if (!directory.isDirectory) throw IllegalStateException()
        Uri.fromFile(directory).toString()
      } catch (_: Exception) {
        throw IllegalStateException("Private storage preparation failed.")
      }
    }
  }
}
