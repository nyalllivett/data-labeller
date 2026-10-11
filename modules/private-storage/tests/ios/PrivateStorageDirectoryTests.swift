import Foundation
import XCTest
@testable import PrivateStoragePolicy

final class PrivateStorageDirectoryTests: XCTestCase {
  private final class FileSystemDouble {
    let root = URL(fileURLWithPath: "/private/application-support", isDirectory: true)
    var directoryExists = false
    var directoryIsFile = false
    var excluded: Bool? = nil
    var failedStep: String? = nil
    var ignoresExclusion = false
    var events: [String] = []
    var paths: [URL] = []
    var creations = 0

    private func visit(_ step: String, _ directory: URL? = nil) throws {
      events.append(step)
      if let directory = directory { paths.append(directory) }
      if failedStep == step {
        throw NSError(domain: "secret /private/path", code: 99,
          userInfo: [
            NSLocalizedDescriptionKey: "secret content", "path": "/private/path",
            NSUnderlyingErrorKey: NSError(domain: "secret underlying cause", code: 97)
          ])
      }
    }

    var operations: PrivateStorageFileSystem {
      PrivateStorageFileSystem(
        applicationSupportDirectory: {
          try self.visit("root")
          return self.root
        },
        createDirectory: { directory in
          try self.visit("create", directory)
          // FileManager's createDirectory throws when a file occupies the path.
          if self.directoryIsFile {
            throw NSError(domain: "secret /private/file", code: 17)
          }
          if !self.directoryExists {
            self.directoryExists = true
            self.creations += 1
          }
        },
        excludeFromBackup: { directory in
          try self.visit("exclude", directory)
          if !self.ignoresExclusion { self.excluded = true }
        },
        isExcludedFromBackup: { directory in
          try self.visit("verify-exclusion", directory)
          return self.excluded
        }
      )
    }
  }

  private let order = ["root", "create", "exclude", "verify-exclusion"]

  private func assertSanitizedFailure(
    _ fileSystem: FileSystemDouble, file: StaticString = #filePath, line: UInt = #line
  ) {
    XCTAssertThrowsError(try preparePrivateStorageDirectory(using: fileSystem.operations), file: file, line: line) { error in
      let error = error as NSError
      XCTAssertEqual(error.domain, "PrivateStorage", file: file, line: line)
      XCTAssertEqual(error.code, 1, file: file, line: line)
      XCTAssertEqual(error.localizedDescription, "Private storage preparation failed.", file: file, line: line)
      XCTAssertEqual(Set(error.userInfo.keys), Set([NSLocalizedDescriptionKey]), file: file, line: line)
      XCTAssertNil(error.userInfo[NSUnderlyingErrorKey], file: file, line: line)
    }
  }

  func testNewDirectoryIsCreatedVerifiedAndExcludedBeforeReturningURI() throws {
    let fileSystem = FileSystemDouble()
    let directory = fileSystem.root.appendingPathComponent("DataLabeller", isDirectory: true)
    XCTAssertEqual(try preparePrivateStorageDirectory(using: fileSystem.operations), directory.absoluteString)
    XCTAssertEqual(fileSystem.events, order)
    XCTAssertEqual(fileSystem.paths, Array(repeating: directory, count: 3))
    XCTAssertEqual(fileSystem.creations, 1)
    XCTAssertEqual(fileSystem.excluded, true)
  }

  func testExistingDirectoryRechecksAndRepairsMissingExclusion() throws {
    let fileSystem = FileSystemDouble()
    fileSystem.directoryExists = true
    fileSystem.excluded = false
    _ = try preparePrivateStorageDirectory(using: fileSystem.operations)
    XCTAssertEqual(fileSystem.events, order)
    XCTAssertEqual(fileSystem.creations, 0)
    XCTAssertEqual(fileSystem.excluded, true)
  }

  func testRepeatedPreparationRechecksPolicyWithoutDuplicatingDirectory() throws {
    let fileSystem = FileSystemDouble()
    let first = try preparePrivateStorageDirectory(using: fileSystem.operations)
    XCTAssertEqual(try preparePrivateStorageDirectory(using: fileSystem.operations), first)
    XCTAssertEqual(fileSystem.events, order + order)
    XCTAssertEqual(fileSystem.creations, 1)
  }

  func testEveryThrownFilesystemFailureIsSanitizedAndStopsLaterSteps() {
    for (index, step) in order.enumerated() {
      let fileSystem = FileSystemDouble()
      fileSystem.failedStep = step
      assertSanitizedFailure(fileSystem)
      XCTAssertEqual(fileSystem.events, Array(order.prefix(index + 1)))
    }
  }

  func testFileAtDestinationFailsBeforeBackupOperations() {
    let fileSystem = FileSystemDouble()
    fileSystem.directoryExists = true
    fileSystem.directoryIsFile = true
    assertSanitizedFailure(fileSystem)
    XCTAssertEqual(fileSystem.events, Array(order.prefix(2)))
  }

  func testMissingBackupExclusionNeverReturnsURI() {
    let fileSystem = FileSystemDouble()
    fileSystem.ignoresExclusion = true
    assertSanitizedFailure(fileSystem)
    XCTAssertEqual(fileSystem.events, order)
  }

  func testFalseBackupExclusionOnExistingDirectoryNeverReturnsURI() {
    let fileSystem = FileSystemDouble()
    fileSystem.directoryExists = true
    fileSystem.excluded = false
    fileSystem.ignoresExclusion = true
    assertSanitizedFailure(fileSystem)
    XCTAssertEqual(fileSystem.events, order)
  }
}
