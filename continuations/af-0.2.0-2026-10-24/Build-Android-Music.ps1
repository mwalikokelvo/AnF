$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskTools = Join-Path $taskRoot 'tools'
$taskModule = Join-Path $taskRoot 'af/work/af_music'
$env:JAVA_HOME = (Get-ChildItem "$taskTools/jdk17" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $taskTools 'android-sdk'
$env:ANDROID_USER_HOME = Join-Path $taskTools 'android-user'
$env:GRADLE_USER_HOME = Join-Path $taskTools 'gradle-cache'
$env:PUB_CACHE = Join-Path $taskTools 'pub-cache'
$env:FLUTTER_SUPPRESS_ANALYTICS = 'true'
$env:PATH = "$env:JAVA_HOME/bin;$taskTools/flutter/bin;$env:PATH"
$taskJvm = '-Xms64m -Xmx1536m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8 -Duser.country=US -Duser.language=en -Duser.variant'
$env:JAVA_OPTS = "$taskJvm -javaagent:$taskTools/gradle-8.11.1/lib/agents/gradle-instrumentation-agent-8.11.1.jar"
$taskDefine = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('AF_EMBEDDED=true'))
if (Test-Path "$taskRoot/verification/android-music-build.log") {
    Copy-Item "$taskRoot/verification/android-music-build.log" "$taskRoot/verification/android-music-build-previous.log" -Force
}
# Invoke the official Flutter AAR initialization script and its documented
# assemble task directly so pub get cannot overwrite bounded JVM settings.
& "$taskTools/gradle-8.11.1/bin/gradle.bat" -p "$taskModule/.android" --no-daemon "-Dorg.gradle.jvmargs=$taskJvm" --init-script "$taskRoot/android-commandline-javac.gradle" --init-script "$taskTools/flutter/packages/flutter_tools/gradle/aar_init_script.gradle" "-Pflutter-root=$taskTools/flutter" "-Poutput-dir=$taskModule/build/host" '-Pis-plugin=false' '-PbuildNumber=0.2.0' '-Ptarget=lib/main.dart' "-Pdart-defines=$taskDefine" '-Ptarget-platform=android-arm,android-arm64,android-x64' '-Ptree-shake-icons=true' assembleAarRelease --console=plain --stacktrace --info '-Dorg.gradle.internal.http.connectionTimeout=20000' '-Dorg.gradle.internal.http.socketTimeout=20000' *> "$taskRoot/verification/android-music-build.log"
if ($LASTEXITCODE) { throw "Android music AAR build failed ($LASTEXITCODE). See verification/android-music-build.log" }


