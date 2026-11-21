// swift-tools-version: 5.9
import PackageDescription

// Decision: SwiftPM reads Package.swift from the repository root, so it lives here and points at swift/.
let package = Package(
  name: "RealtimeLive",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "RealtimeLive", targets: ["RealtimeLive"])],
  targets: [
    .target(name: "RealtimeLive", path: "swift/Sources/RealtimeLive"),
    .testTarget(name: "RealtimeLiveTests", dependencies: ["RealtimeLive"], path: "swift/Tests/RealtimeLiveTests"),
  ]
)
