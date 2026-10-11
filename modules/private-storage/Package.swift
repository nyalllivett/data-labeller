// swift-tools-version:5.9
import PackageDescription

// Host unit tests only: no Expo, Pods, application build, signing or device.
let package = Package(
  name: "PrivateStoragePolicy",
  platforms: [.macOS(.v10_15), .iOS("16.4")],
  targets: [
    .target(name: "PrivateStoragePolicy", path: "ios/Policy"),
    .testTarget(
      name: "PrivateStoragePolicyTests", dependencies: ["PrivateStoragePolicy"], path: "tests/ios"
    )
  ]
)
