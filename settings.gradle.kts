// Only the Kotlin client is a Gradle build. JitPack builds from the root of the repository.
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories { mavenCentral() }
}

rootProject.name = "realtime"

include(":kotlin")
project(":kotlin").name = "realtime-live"
