import ExpoModulesCore

public class PrivateStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PrivateStorage")
    AsyncFunction("prepareDatabaseDirectory") { () throws -> String in
      try preparePrivateStorageDirectory()
    }
  }
}
