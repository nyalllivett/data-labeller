package expo.modules.privatestorage

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class PrivateStorageDirectoryTest {
  private class FileSystemDouble : PrivateStorageFileSystem {
    val base = File("/private/no-backup")
    var contextAvailable = true
    var directoryExists = false
    var directoryIsFile = false
    var creationSucceeds = true
    var failedStep: String? = null
    var creations = 0
    val events = mutableListOf<String>()
    val paths = mutableListOf<File>()

    private fun visit(step: String, directory: File? = null) {
      events.add(step)
      if (directory != null) paths.add(directory)
      if (step == failedStep) {
        val error = IllegalArgumentException("secret /private/path", Exception("secret cause"))
        error.addSuppressed(Exception("secret suppressed error"))
        throw error
      }
    }

    fun root(): File? {
      visit("root")
      return if (contextAvailable) base else null
    }

    fun uri(directory: File): String {
      visit("uri", directory)
      return "file:///private/no-backup/data-labeller"
    }

    override fun exists(directory: File): Boolean {
      visit("exists", directory)
      return directoryExists
    }

    override fun createDirectories(directory: File) {
      visit("create", directory)
      if (creationSucceeds) creations += 1
      directoryExists = creationSucceeds
    }

    override fun isDirectory(directory: File): Boolean {
      visit("verify-directory", directory)
      return directoryExists && !directoryIsFile
    }

    fun prepare() = preparePrivateStorageDirectory(::root, ::uri, this)
  }

  private val newDirectoryOrder = listOf("root", "exists", "create", "verify-directory", "uri")
  private val existingDirectoryOrder = listOf("root", "exists", "verify-directory", "uri")

  private fun assertSanitizedFailure(fileSystem: FileSystemDouble) {
    val error = assertThrows(IllegalStateException::class.java) { fileSystem.prepare() }
    assertEquals("Private storage preparation failed.", error.message)
    assertNull(error.cause)
    assertEquals(0, error.suppressed.size)
  }

  @Test fun newDirectoryIsCreatedAndVerifiedBeforeReturningURI() {
    val fileSystem = FileSystemDouble()
    assertEquals("file:///private/no-backup/data-labeller", fileSystem.prepare())
    assertEquals(newDirectoryOrder, fileSystem.events)
    assertEquals(List(4) { File(fileSystem.base, "data-labeller") }, fileSystem.paths)
    assertEquals(1, fileSystem.creations)
  }

  @Test fun existingDirectoryIsVerifiedWithoutCreation() {
    val fileSystem = FileSystemDouble()
    fileSystem.directoryExists = true
    assertEquals("file:///private/no-backup/data-labeller", fileSystem.prepare())
    assertEquals(existingDirectoryOrder, fileSystem.events)
    assertEquals(0, fileSystem.creations)
  }

  @Test fun repeatedPreparationRechecksWithoutDuplicatingDirectory() {
    val fileSystem = FileSystemDouble()
    val first = fileSystem.prepare()
    assertEquals(first, fileSystem.prepare())
    assertEquals(newDirectoryOrder + existingDirectoryOrder, fileSystem.events)
    assertEquals(1, fileSystem.creations)
  }

  @Test fun missingContextFailsBeforeAnyFilesystemOrURIOperation() {
    val fileSystem = FileSystemDouble()
    fileSystem.contextAvailable = false
    assertSanitizedFailure(fileSystem)
    assertEquals(listOf("root"), fileSystem.events)
  }

  @Test fun everyThrownProviderFilesystemAndURIFailureIsSanitizedAndStopsLaterSteps() {
    for ((index, step) in newDirectoryOrder.withIndex()) {
      val fileSystem = FileSystemDouble()
      fileSystem.failedStep = step
      assertSanitizedFailure(fileSystem)
      assertEquals(newDirectoryOrder.take(index + 1), fileSystem.events)
    }
  }

  @Test fun failedCreationNeverReturnsURI() {
    val fileSystem = FileSystemDouble()
    fileSystem.creationSucceeds = false
    assertSanitizedFailure(fileSystem)
    assertEquals(newDirectoryOrder.take(4), fileSystem.events)
    assertEquals(0, fileSystem.creations)
  }

  @Test fun fileAtDestinationFailsWithoutAttemptingCreationOrURIConversion() {
    val fileSystem = FileSystemDouble()
    fileSystem.directoryExists = true
    fileSystem.directoryIsFile = true
    assertSanitizedFailure(fileSystem)
    assertEquals(existingDirectoryOrder.take(3), fileSystem.events)
  }
}
