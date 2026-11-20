// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "RealtimeLive",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "RealtimeLive", targets: ["RealtimeLive"])],
  targets: [
    .target(name: "RealtimeLive"),
    .testTarget(name: "RealtimeLiveTests", dependencies: ["RealtimeLive"]),
  ]
)
