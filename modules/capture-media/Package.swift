// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "CaptureMediaPolicy",
  platforms: [.macOS(.v10_15), .iOS("16.4")],
  targets: [
    .target(name: "CaptureMediaPolicy", path: "ios/Policy"),
    .testTarget(name: "CaptureMediaPolicyTests", dependencies: ["CaptureMediaPolicy"], path: "tests/ios")
  ]
)
