// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "GhostlineDesktop",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(
      name: "GhostlineDesktop",
      targets: ["GhostlineDesktop"]
    )
  ],
  targets: [
    .executableTarget(
      name: "GhostlineDesktop"
    )
  ]
)
