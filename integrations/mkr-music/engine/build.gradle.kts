import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.SecureRandom
import java.time.Duration
import java.util.HexFormat
import java.security.MessageDigest
import java.util.zip.ZipFile
import groovy.json.JsonOutput

// Independently authored build/adapter source is MIT. The prepared MKR core is
// GPL-3.0; any combined engine distribution must meet its corresponding-source
// obligations. This does not change the AnF repository-wide source license.
plugins {
    kotlin("jvm") version "2.3.10"
    kotlin("plugin.serialization") version "2.3.10"
}

group = "com.anf.mkr"
version = "0.1.0-prototype"
dependencyLocking { lockAllConfigurations() }
kotlin { jvmToolchain(21) }

val prepared = layout.projectDirectory.dir("vendor/mkr")
val sourceGate by tasks.registering(Exec::class) {
    workingDir(projectDir)
    commandLine("node", "../prepare-catalog.mjs")
}
sourceSets.main { kotlin.srcDir(prepared.dir("innertube/src/main/kotlin")) }
// JDK loopback transport is Windows-host-only; never include this directory in
// the future Android catalog library or substitute it for a native Media3 host.
sourceSets.main { kotlin.srcDir("src/windowsMain/kotlin") }
tasks.named("compileKotlin") { dependsOn(sourceGate) }

// Use the already-selected core version across compile/runtime/plugins, not a
// mixture of 3.4.0 compile APIs and 3.5.2 runtime APIs. Ktor's supported BOM:
// https://ktor.io/docs/client-dependencies.html#using-the-ktor-bom-dependency
val ktorVersion = "3.5.2"
dependencies {
    implementation(platform("io.ktor:ktor-bom:$ktorVersion"))
    implementation("io.ktor:ktor-client-core")
    implementation("io.ktor:ktor-client-okhttp")
    implementation("io.ktor:ktor-client-content-negotiation")
    implementation("io.ktor:ktor-serialization-kotlinx-json")
    implementation("io.ktor:ktor-client-encoding")
    implementation("org.brotli:dec:0.1.2")
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.26.1")
    implementation("com.github.MetrolistGroup.innertubex:innertubex-desktop:v0.7.2")
    testImplementation(kotlin("test-junit"))
    testImplementation("io.ktor:ktor-client-mock")
}

val verifyKtorAlignment by tasks.registering {
    doLast {
        val selected = listOf("compileClasspath","runtimeClasspath","testCompileClasspath","testRuntimeClasspath").associateWith { name ->
            configurations.getByName(name).resolvedConfiguration.resolvedArtifacts
                .filter { it.moduleVersion.id.group == "io.ktor" }
                .map { it.moduleVersion.id.version }.toSortedSet().toList()
        }
        check(selected.values.all { it == listOf(ktorVersion) }) {
            "Ktor compile/runtime/plugin versions diverged; resolve the graph before packaging."
        }
        layout.buildDirectory.file("reports/ktor-alignment.json").get().asFile.apply {
            parentFile.mkdirs();writeText(JsonOutput.prettyPrint(JsonOutput.toJson(mapOf("schema" to 1,"expectedVersion" to ktorVersion,"configurations" to selected,"readyForPublication" to false))))
        }
        logger.lifecycle("PASS: Ktor compile/runtime/test modules all use $ktorVersion. Source and publication review remain required.")
    }
}
tasks.named("test") { dependsOn(verifyKtorAlignment) }
tasks.named("check") { dependsOn(verifyKtorAlignment) }

tasks.withType<Jar>().configureEach {
    from(prepared.file("LICENSE")) { into("META-INF/mkr") }
    from(prepared.file("source-manifest.json")) { into("META-INF/mkr") }
    from("PRIMARY-LICENSE.txt") { into("META-INF/innertubex") }
    from("PRIMARY-SOURCE.json") { into("META-INF/innertubex") }
    from("../../../LICENSE") { into("META-INF/anf") }
    manifest.attributes["MKR-Upstream-Revision"] = "78ac80c5101c293a5591a4cd5a1ebc90ccbc3138"
}

// Explicit engineering probe only. No automatic service request in tests/builds.
tasks.register<JavaExec>("probeCatalog") {
    dependsOn("classes")
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.anf.mkr.CatalogProbeKt")
    args(providers.gradleProperty("mkrProbeQuery").getOrElse("Beethoven"))
}

tasks.register<JavaExec>("probeResolution") {
    dependsOn("classes")
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.anf.mkr.CatalogProbeKt")
    doFirst {
        val id = providers.gradleProperty("mkrProbeVideoId").orNull
            ?: error("Pass an explicitly selected public music ID with -PmkrProbeVideoId; there is no default live fixture.")
        require(Regex("[A-Za-z0-9_-]{11}").matches(id)) { "Invalid public video ID." }
        args("--legacy-resolve", id)
    }
}

tasks.register<JavaExec>("probePrimaryResolution") {
    dependsOn("classes")
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.anf.mkr.CatalogProbeKt")
    doFirst {
        val id = providers.gradleProperty("mkrProbeVideoId").orNull
            ?: error("Pass an explicitly selected public music ID with -PmkrProbeVideoId; there is no default live fixture.")
        require(Regex("[A-Za-z0-9_-]{11}").matches(id)) { "Invalid public video ID." }
        args("--resolve", id)
    }
}

// Deliberately opt-in, generated fixture only; ordinary tests launch no native
// executable and this task performs no provider/service request.
tasks.register<JavaExec>("probeWindowsNativeBridge") {
    dependsOn("testClasses")
    classpath = sourceSets.test.get().runtimeClasspath
    mainClass.set("com.anf.mkr.WindowsBridgeNativeProbeKt")
}

// Real child-process handshake/shutdown QA, no provider search/resolution. Its
// stdout stays captured; never forward private sidecar frames to a UI/log sink.
tasks.register<JavaExec>("probeWindowsCatalogLifecycle") {
    dependsOn("classes")
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.anf.mkr.windows.WindowsCatalogSidecarKt")
    timeout.set(Duration.ofSeconds(30))
    val replies = ByteArrayOutputStream()
    val errors = ByteArrayOutputStream()
    standardOutput = replies
    errorOutput = errors
    doFirst {
        val nonce = HexFormat.of().formatHex(ByteArray(32).also { SecureRandom().nextBytes(it) })
        environment("ANF_MKR_SESSION_NONCE", nonce)
        val frames = """{"protocol":1,"id":1,"command":"hello","nonce":"$nonce"}
{"protocol":1,"id":2,"command":"shutdown"}
"""
        standardInput = ByteArrayInputStream(frames.toByteArray(Charsets.UTF_8))
    }
    doLast {
        check(replies.size() <= 8192 && errors.size() <= 8192) { "Sidecar lifecycle output exceeded its bound." }
        val lines = replies.toString("UTF-8").trim().lines()
        check(lines.size == 2 && lines.all { it.contains("\"protocol\":1") && it.contains("\"ok\":true") } &&
            lines[0].contains("\"id\":1") && lines[0].contains("\"embedded\":false") &&
            lines[1].contains("\"id\":2") && lines.none { it.contains("\"nonce\"") }) {
            "Sidecar lifecycle protocol check failed; no private frames retained in logs."
        }
        logger.lifecycle("PASS: actual catalog child private-pipe handshake/shutdown; embedded remains false. No provider request.")
    }
}

tasks.register<Exec>("probeOwnedWindowsCatalog") {
    dependsOn("testClasses")
    timeout.set(Duration.ofSeconds(60))
    val nativeOutput=ByteArrayOutputStream()
    standardOutput=nativeOutput
    errorOutput=nativeOutput
    isIgnoreExitValue=true
    doFirst {
        val executable=System.getenv("ANF_MKR_NATIVE_TEST_EXE") ?: error("Select the compiled native engineering test harness.")
        val launcher=javaToolchains.launcherFor { languageVersion.set(JavaLanguageVersion.of(21)) }.get()
        environment("ANF_MKR_TEST_JAVA",launcher.executablePath.asFile.absolutePath)
        environment("ANF_MKR_TEST_CLASSPATH",sourceSets.test.get().runtimeClasspath.asPath)
        commandLine(executable,"--exact","catalog::tests::real_catalog_process_prepares_owned_native_audio","--ignored","--test-threads=1")
    }
    doLast {
        val report=nativeOutput.toString("UTF-8").take(65_536)
            .replace(Regex("https?://[^\\s\"']+"),"<redacted-uri>")
            .replace(Regex("\\b[a-fA-F0-9]{64}\\b"),"<redacted-token>")
        layout.buildDirectory.file("reports/owned-native-fixture.log").get().asFile.apply {
            parentFile.mkdirs();writeText(report)
        }
        check(executionResult.get().exitValue==0 && nativeOutput.size()<=65_536 && nativeOutput.toString("UTF-8").contains("1 passed; 0 failed")) {
            "Owned catalog/native fixture failed; no private process frames emitted."
        }
        logger.lifecycle("PASS: actual Rust-owned JVM session -> typed lease -> muted native audio, with explicit revocation. No provider request or AnF UI capability.")
    }
}

// Engineering inventory only. Resolved dependencies still require a complete
// license/corresponding-source review before a bundled runtime may be published.
tasks.register("auditWindowsRuntime") {
    dependsOn("jar")
    doLast {
        fun digest(file:File):String {
            val hash=MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer=ByteArray(65_536)
                while(true) { val count=input.read(buffer);if(count<0)break;hash.update(buffer,0,count) }
            }
            return HexFormat.of().formatHex(hash.digest())
        }
        val artifacts=configurations.runtimeClasspath.get().resolvedConfiguration.resolvedArtifacts
            .sortedBy { it.moduleVersion.id.toString()+":"+it.file.name }
            .map { artifact ->
                val notices=ZipFile(artifact.file).use { zip -> zip.entries().asSequence()
                    .filter { !it.isDirectory && Regex("(?i)(^|/)(licen[sc]e|notice|copying|copyright|dependencies)([._/-]|$)").containsMatchIn(it.name) }
                    .map { it.name }.take(100).toList() }
                mapOf("coordinate" to artifact.moduleVersion.id.toString(),"file" to artifact.file.absolutePath,
                    "name" to artifact.file.name,"bytes" to artifact.file.length(),"sha256" to digest(artifact.file),
                    "noticeEntries" to notices,"sourceReviewRequired" to true)
            }
        val archive=tasks.named<Jar>("jar").get().archiveFile.get().asFile
        val launcher=javaToolchains.launcherFor { languageVersion.set(JavaLanguageVersion.of(21)) }.get()
        val report=mapOf("schema" to 1,"jdkHome" to launcher.metadata.installationPath.asFile.absolutePath,
            "engine" to mapOf("file" to archive.absolutePath,"sha256" to digest(archive),"bytes" to archive.length()),
            "dependencies" to artifacts,"sourceCompleteDistributionPrepared" to false,"readyForPublication" to false)
        val file=layout.buildDirectory.file("reports/runtime-dependencies.json").get().asFile
        file.parentFile.mkdirs();file.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(report)))
        logger.lifecycle("Prepared engineering dependency/hash/notice inventory. Publication remains blocked pending source/license review.")
    }
}

tasks.register<Exec>("probeWindowsPlaybackHost") {
    dependsOn("testClasses")
    timeout.set(Duration.ofSeconds(60))
    val captured=ByteArrayOutputStream()
    standardOutput=captured;errorOutput=captured;isIgnoreExitValue=true
    doFirst {
        val executable=System.getenv("ANF_MKR_NATIVE_TEST_EXE") ?: error("Select compiled native fixture harness.")
        val audio=System.getenv("ANF_MKR_TEST_AUDIO") ?: error("Select a generated AAC fixture with ANF_MKR_TEST_AUDIO before native host QA.")
        check(File(audio).isFile && File(audio).length() in 1..5_242_880) { "Expected a bounded generated AAC fixture file." }
        val launcher=javaToolchains.launcherFor {languageVersion.set(JavaLanguageVersion.of(21))}.get()
        environment("ANF_MKR_TEST_JAVA",launcher.executablePath.asFile.absolutePath)
        environment("ANF_MKR_TEST_CLASSPATH",sourceSets.test.get().runtimeClasspath.asPath)
        commandLine(executable,"--exact","host::tests::real_host_queue_pause_and_superseded_play","--ignored","--test-threads=1")
    }
    doLast {
        val report=captured.toString("UTF-8").take(65_536)
            .replace(Regex("https?://[^\\s\"']+"),"<redacted-uri>")
            .replace(Regex("\\b[a-fA-F0-9]{64}\\b"),"<redacted-token>")
        layout.buildDirectory.file("reports/playback-host-fixture.log").get().asFile.apply{parentFile.mkdirs();writeText(report)}
        check(executionResult.get().exitValue==0&&captured.size()<=65_536&&report.contains("1 passed; 0 failed")){"Playback host fixture failed; inspect the bounded redacted report."}
        logger.lifecycle("PASS: real native controller queue/search/resume and pause during slow catalog work; superseded play blocked. No provider request or AnF app availability implied.")
    }
}
