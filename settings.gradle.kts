// Decision: only the Kotlin client is a Gradle build. It sits at the root because JitPack builds from there.
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
