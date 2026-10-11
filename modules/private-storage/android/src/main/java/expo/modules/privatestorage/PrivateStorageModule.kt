package expo.modules.privatestorage

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PrivateStorageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PrivateStorage")
    AsyncFunction("prepareDatabaseDirectory") {
      preparePrivateStorageDirectory(
        root = { appContext.reactContext?.noBackupFilesDir },
        uri = { Uri.fromFile(it).toString() }
      )
    }
  }
}
