package expo.modules.privatestorage

import java.io.File

internal interface PrivateStorageFileSystem {
  fun exists(directory: File): Boolean
  fun createDirectories(directory: File)
  fun isDirectory(directory: File): Boolean
}

private object LocalPrivateStorageFileSystem : PrivateStorageFileSystem {
  override fun exists(directory: File) = directory.exists()
  override fun createDirectories(directory: File) {
    // The policy verifies the resulting directory before returning its URI.
    directory.mkdirs()
  }
  override fun isDirectory(directory: File) = directory.isDirectory
}

// No Android/Expo dependencies: the local JVM unit target uses this same policy.
internal fun preparePrivateStorageDirectory(
  root: () -> File?,
  uri: (File) -> String,
  fileSystem: PrivateStorageFileSystem = LocalPrivateStorageFileSystem
): String {
  try {
    val directory = File(checkNotNull(root()), "data-labeller")
    if (!fileSystem.exists(directory)) fileSystem.createDirectories(directory)
    check(fileSystem.isDirectory(directory))
    return uri(directory)
  } catch (_: Exception) {
    // No original path, cause or error metadata crosses the JS boundary.
    throw IllegalStateException("Private storage preparation failed.")
  }
}
