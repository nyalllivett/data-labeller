import ExpoModulesCore
import Foundation

public class PrivateStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PrivateStorage")
    AsyncFunction("prepareDatabaseDirectory") { () throws -> String in
      do {
        var directory = try FileManager.default.url(
          for: .applicationSupportDirectory, in: .userDomainMask,
          appropriateFor: nil, create: true
        ).appendingPathComponent("DataLabeller", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        guard try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else {
          throw NSError(domain: "PrivateStorage", code: 1)
        }
        return directory.absoluteString
      } catch {
        // Do not expose filesystem paths or the original native error to JS.
        throw NSError(domain: "PrivateStorage", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Private storage preparation failed."])
      }
    }
  }
}
