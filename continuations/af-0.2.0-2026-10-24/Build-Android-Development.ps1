param([string]$MusicRepository, [switch]$DebugOnly, [string]$EvidenceDirectory = '')
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskAndroid = Join-Path $taskRoot 'af/work/coucou/android'
$taskTools = Join-Path $taskRoot 'tools'
$taskEvidence = Join-Path $taskRoot 'verification'
if ($EvidenceDirectory) { $taskEvidence = [IO.Path]::GetFullPath($EvidenceDirectory) }
New-Item -ItemType Directory -Force -Path $taskEvidence | Out-Null
if ($MusicRepository) { $MusicRepository = (Resolve-Path -LiteralPath $MusicRepository).Path }
$env:JAVA_HOME = (Get-ChildItem "$taskTools/jdk17" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $taskTools 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $taskTools 'android-user'
$env:GRADLE_USER_HOME = Join-Path $taskTools 'gradle-cache'
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
# Match the requested build JVM and attach Gradle's own instrumentation agent.
# This permits --no-daemon execution in the launcher and avoids this host's
# failing Java Unix-domain wakeup pipe when connecting to a daemon.
$taskJvm = '-Xms64m -Xmx1536m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8 -Duser.country=US -Duser.language=en -Duser.variant'
$env:JAVA_OPTS = "$taskJvm -javaagent:$taskTools/gradle-9.3.1/lib/agents/gradle-instrumentation-agent-9.3.1.jar"
if (!(Test-Path "$env:ANDROID_HOME/build-tools/36.0.0")) {
    $taskFrom = (Resolve-Path "$env:ANDROID_HOME/build-tools/android-16").Path
    $taskTo = [IO.Path]::GetFullPath("$env:ANDROID_HOME/build-tools/36.0.0")
    if (!$taskFrom.StartsWith($taskTools,[StringComparison]::OrdinalIgnoreCase) -or !$taskTo.StartsWith($taskTools,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid tool path' }
    Move-Item -LiteralPath $taskFrom -Destination $taskTo
}
New-Item -ItemType Directory -Force "$taskTools/dev-keys","$taskAndroid/build/assets/web","$taskRoot/verification" | Out-Null
$taskDevelopmentKey = Join-Path $taskTools 'dev-keys/af-development.jks'
if (!(Test-Path $taskDevelopmentKey)) {
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $taskDevelopmentKey -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=AandF Development,O=Local Development,C=US' -noprompt
    if ($LASTEXITCODE) { throw 'Development signing-key creation failed' }
}
function Check-Step([string]$name) { if ($LASTEXITCODE) { throw "$name failed ($LASTEXITCODE)" } }
Push-Location $taskAndroid
try {
    node ../windows/node_modules/typescript/bin/tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM web/main.ts
    Check-Step 'Android interface typecheck'
    & ../windows/node_modules/@esbuild/win32-x64/esbuild.exe web/main.ts --bundle --minify --format=esm --target=chrome110 --outfile=build/assets/web/main.js
    Check-Step 'Android interface bundle'
    Copy-Item web/index.html build/assets/web/index.html -Force
    $taskNotices = @('web/THIRD-PARTY-LICENSES.txt','web/THIRD-PARTY-NATIVE-MEDIA-LICENSES.txt','../windows/THIRD-PARTY-STORAGE-LICENSES.txt','../windows/THIRD-PARTY-AUDIO-LICENSES.txt')
    ($taskNotices | ForEach-Object { Get-Content $_ -Raw }) -join "`n" | Set-Content build/assets/web/THIRD-PARTY-LICENSES.txt -Encoding utf8NoBOM
    Copy-Item node_modules/pdfjs-dist/build/pdf.worker.mjs build/assets/web/pdf.worker.mjs -Force
    foreach ($taskAsset in @('cmaps','standard_fonts','wasm')) { Copy-Item "node_modules/pdfjs-dist/$taskAsset" build/assets/web -Recurse -Force }
    Copy-Item ../windows/src-tauri/icons/128x128.png res/drawable/icon.png -Force
    if (Test-Path "$taskEvidence/android-native-build.log") {
        Copy-Item "$taskEvidence/android-native-build.log" "$taskEvidence/android-native-build-previous.log" -Force
    }
    $taskBuildArguments = @('-p', $taskAndroid, '--no-daemon', "-Dorg.gradle.jvmargs=$taskJvm", '--init-script', "$taskRoot/android-commandline-javac.gradle")
    if ($MusicRepository) {
        $taskResolvedMusic = (Resolve-Path -LiteralPath $MusicRepository).Path
        if (!(Test-Path -LiteralPath "$taskResolvedMusic/com/coucou/workspace/af_music/flutter_release/0.2.0/flutter_release-0.2.0.aar")) { throw 'A verified music repository with the expected release AAR is required.' }
        $taskBuildArguments += "-PafMusicRepository=$taskResolvedMusic"
    }
    $taskBuildArguments += @('assembleDebug')
    if (!$DebugOnly) { $taskBuildArguments += @('assembleRelease') }
    $taskBuildArguments += @('audioRuntimeInventory', '--console=plain', '--stacktrace')
    & "$taskTools/gradle-9.3.1/bin/gradle.bat" @taskBuildArguments *> "$taskEvidence/android-native-build.log"
    Check-Step 'Android native compilation and packaging'
} finally { Pop-Location }
