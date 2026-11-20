// swift-tools-version: 5.9
import PackageDescription

// The Swift client for bwf live streams. SwiftPM reads this file from the root of the repository,
// so the sources live in swift/ and are pointed at from here.
let package = Package(
  name: "RealtimeLive",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "RealtimeLive", targets: ["RealtimeLive"])],
  targets: [
    .target(name: "RealtimeLive", path: "swift/Sources/RealtimeLive"),
    .testTarget(name: "RealtimeLiveTests", dependencies: ["RealtimeLive"], path: "swift/Tests/RealtimeLiveTests"),
  ]
)
