plugins {
    `maven-publish`
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
}

dependencies {
    api("com.squareup.okhttp3:okhttp:4.12.0")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    testImplementation(kotlin("test-junit"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

tasks.test { useJUnit() }

java { withSourcesJar() }

publishing {
    publications {
        create<MavenPublication>("release") {
            from(components["java"])
            artifactId = "realtime-live"
        }
    }
}
