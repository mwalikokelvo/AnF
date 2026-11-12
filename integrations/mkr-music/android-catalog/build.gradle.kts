import org.gradle.api.file.FileSystemOperations
import javax.inject.Inject
import java.security.MessageDigest
import java.util.HexFormat
import java.util.zip.ZipFile
import groovy.json.JsonOutput
import org.gradle.api.publish.PublishingExtension
import org.gradle.api.publish.maven.MavenPublication
import org.gradle.jvm.tasks.Jar

// AnF build adapter is MIT. Prepared MKR and InnerTubeX retain their own GPL
// licenses. This engineering library is not linked into the release application.
plugins {
    id("com.android.library") version "9.2.1"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.3.10"
}

group = "com.anf.mkr"
version = "0.1.0-prototype"
dependencyLocking { lockAllConfigurations() }

// Separate strict build, not a composite build: an enclosing build would ignore
// this library's verification metadata. Publish only to this generated local repo.
if (providers.gradleProperty("mkrReviewPublication").orNull == "true") {
    apply(plugin = "maven-publish")
    android { publishing { singleVariant("release") { withSourcesJar() } } }
    val reviewPublishing = extensions.getByType<PublishingExtension>()
    reviewPublishing.repositories.maven {
        name = "Review"
        url = uri(layout.buildDirectory.dir("review-repository"))
    }
    afterEvaluate {
        reviewPublishing.publications.create<MavenPublication>("review") {
            from(components["release"])
            groupId = project.group.toString()
            artifactId = project.name
            version = project.version.toString()
            pom {
                name.set("AnF MKR isolated review runtime")
                description.set("Private review only. MKR-derived catalog retains GPL-3.0; AnF adapters retain MIT. Full dependency/JNI corresponding-source review remains pending.")
                licenses { license {
                    name.set("GPL-3.0 catalog and separately licensed MIT adapters; see bundled notices")
                    url.set("https://www.gnu.org/licenses/gpl-3.0.html")
                } }
            }
        }
    }
    tasks.withType<Jar>().configureEach {
        if (name == "sourceReleaseJar") {
            from("../engine/vendor/mkr/LICENSE") { into("META-INF/licenses/mkr") }
            from("../engine/PRIMARY-LICENSE.txt") { into("META-INF/licenses/primary") }
            from("../README.md") { into("META-INF"); rename { "MKR-REVIEW-NOTICE.md" } }
        }
    }
}

val sourceGate by tasks.registering(Exec::class) {
    workingDir(projectDir)
    commandLine("node", "../prepare-catalog.mjs")
}
abstract class PrepareCatalogKotlin : DefaultTask() {
    @get:InputFiles @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sources: ConfigurableFileCollection
    @get:Input abstract val selected: ListProperty<String>
    @get:Input abstract val excluded: ListProperty<String>
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @get:Inject abstract val fileSystem: FileSystemOperations
    @TaskAction fun prepare() {
        fileSystem.sync {
            from(sources)
            include(selected.get())
            exclude(excluded.get())
            into(outputDirectory)
        }
    }
}
val prepareAndroidCatalogSources by tasks.registering(PrepareCatalogKotlin::class) {
    dependsOn(sourceGate)
    sources.from("../engine/src/main/kotlin", "../engine/vendor/mkr/innertube/src/main/kotlin")
    selected.set(listOf("**/*.kt"))
    excluded.set(listOf("**/CatalogProbe.kt"))
    outputDirectory.convention(layout.buildDirectory.dir("generated/catalog/main"))
}
val prepareAndroidCatalogTests by tasks.registering(PrepareCatalogKotlin::class) {
    sources.from("../engine/src/test/kotlin")
    selected.set(listOf("**/MkrCatalogTest.kt", "**/PrimaryRequestPolicyTest.kt",
        "**/PrimaryRequestContractTest.kt", "**/PlayerResponseDiagnosticsTest.kt", "**/ResolutionFailureTest.kt",
        "**/SinglePlaybackClientTest.kt", "**/StreamRequirementsTest.kt"))
    excluded.set(emptyList())
    outputDirectory.convention(layout.buildDirectory.dir("generated/catalog/test"))
}

android {
    namespace = "com.anf.mkr.catalog"
    compileSdk = 37
    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}
// Use the supported variant API. AGP9.2.1's library sourceSets DSL has an
// interface-cast regression; don't disable built-in Kotlin to work around it.
androidComponents.onVariants { variant ->
    variant.sources.kotlin!!.addGeneratedSourceDirectory(prepareAndroidCatalogSources) { it.outputDirectory }
    variant.hostTests.values.forEach { test ->
        test.sources.kotlin!!.addGeneratedSourceDirectory(prepareAndroidCatalogTests) { it.outputDirectory }
    }
}

dependencies {
    // Match the already shipped AnF app requirement rather than downgrading it
    // or relaxing the combined runtime checksum gate.
    constraints { implementation("androidx.core:core:1.9.0") }
    implementation("androidx.media3:media3-datasource:1.6.1")
    implementation("androidx.media3:media3-exoplayer:1.6.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("com.squareup.okhttp3:okhttp:5.3.2")
    implementation(platform("io.ktor:ktor-bom:3.5.2"))
    implementation("io.ktor:ktor-client-core")
    implementation("io.ktor:ktor-client-okhttp")
    implementation("io.ktor:ktor-client-content-negotiation")
    implementation("io.ktor:ktor-serialization-kotlinx-json")
    implementation("io.ktor:ktor-client-encoding")
    implementation("org.brotli:dec:0.1.2")
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.26.1")
    // Resolve the Android variant from the upstream multiplatform publication;
    // never package its desktop/JVM native library in an APK.
    implementation("com.github.MetrolistGroup.innertubex:innertubex:v0.7.2")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.3.10")
    testImplementation("io.ktor:ktor-client-mock")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    // The extractor's implementation dependency is runtime-only to consumers.
    // JNI acceptance needs its already-pinned Android variant on the test compile path.
    androidTestImplementation("io.github.dokar3:quickjs-kt:1.0.14")
}

tasks.register("auditAndroidCatalogRuntime") {
    doLast {
        val artifacts = configurations.getByName("debugRuntimeClasspath").resolvedConfiguration.resolvedArtifacts
        check(artifacts.none { it.name.endsWith("-desktop") }) { "Desktop native runtime must not enter the Android library." }
        check(artifacts.any { it.moduleVersion.id.group == "com.github.MetrolistGroup.innertubex" && it.extension == "aar" }) {
            "The actual Android InnerTubeX AAR is required."
        }
        check(artifacts.filter { it.moduleVersion.id.group == "io.ktor" }.all { it.moduleVersion.id.version == "3.5.2" }) {
            "Android Ktor runtime versions diverged."
        }
        val entries = artifacts.sortedBy { it.moduleVersion.id.toString() }.map { artifact ->
            val hash = artifact.file.inputStream().use { input ->
                val digest = MessageDigest.getInstance("SHA-256")
                val buffer = ByteArray(65536)
                while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
                HexFormat.of().formatHex(digest.digest())
            }
            val native = ZipFile(artifact.file).use { archive -> archive.entries().asSequence()
                .filter { !it.isDirectory && (it.name.startsWith("jni/") || it.name.endsWith(".dll") || it.name.endsWith(".dylib")) }
                .map { it.name }.toList() }
            check(native.none { it.endsWith(".dll") || it.endsWith(".dylib") }) { "Non-Android native binary in runtime." }
            mapOf("coordinate" to artifact.moduleVersion.id.toString(), "file" to artifact.file.absolutePath,
                "sha256" to hash, "nativeEntries" to native, "sourceReviewRequired" to true)
        }
        val output = layout.buildDirectory.file("reports/android-runtime.json").get().asFile
        output.parentFile.mkdirs()
        output.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(mapOf("schema" to 1,
            "dependencies" to entries, "readyForPublication" to false, "deviceAndProviderPlaybackVerified" to false))))
        logger.lifecycle("PASS: actual Android runtime variants, aligned Ktor and native-entry inventory; no player availability claim.")
    }
}
