import Foundation

// The policy is shared by the Expo module and the Foundation-only unit target.
// Filesystem primitives are the only substituted boundary in those tests.
struct PrivateStorageFileSystem {
  var applicationSupportDirectory: () throws -> URL
  var createDirectory: (URL) throws -> Void
  var excludeFromBackup: (URL) throws -> Void
  var isExcludedFromBackup: (URL) throws -> Bool?

  static let live = PrivateStorageFileSystem(
    applicationSupportDirectory: {
      try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask,
        appropriateFor: nil, create: true
      )
    },
    createDirectory: { directory in
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    },
    excludeFromBackup: { directory in
      var directory = directory
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
    },
    isExcludedFromBackup: { directory in
      try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
    }
  )
}

func preparePrivateStorageDirectory(using fileSystem: PrivateStorageFileSystem = .live) throws -> String {
  do {
    let directory = try fileSystem.applicationSupportDirectory()
      .appendingPathComponent("DataLabeller", isDirectory: true)
    // createDirectory is idempotent for an existing directory, but not a file.
    try fileSystem.createDirectory(directory)
    try fileSystem.excludeFromBackup(directory)
    guard try fileSystem.isExcludedFromBackup(directory) == true else {
      throw NSError(domain: "PrivateStorage", code: 1)
    }
    return directory.absoluteString
  } catch {
    // No original path, cause or error metadata crosses the JS boundary.
    throw NSError(domain: "PrivateStorage", code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Private storage preparation failed."])
  }
}
