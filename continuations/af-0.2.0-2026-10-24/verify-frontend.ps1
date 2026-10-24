param([string]$EvidenceDirectory = '')
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskSourceRoot = Join-Path $taskRoot 'af/work/coucou'
if (!(Test-Path -LiteralPath $taskSourceRoot)) { $taskSourceRoot = Join-Path $taskRoot 'work/coucou' }
$taskWindows = Join-Path $taskSourceRoot 'windows'
$taskAndroid = Join-Path $taskSourceRoot 'android'
$taskEvidence = Join-Path $taskRoot 'verification'
if ($EvidenceDirectory) { $taskEvidence = [IO.Path]::GetFullPath($EvidenceDirectory) }
New-Item -ItemType Directory -Force $taskEvidence | Out-Null
$taskEsbuild = Join-Path $taskWindows 'node_modules/@esbuild/win32-x64/esbuild.exe'
$taskChecks = @(
  @('workspace', "$taskWindows/dev/workspace-check.cjs", "$taskWindows/src/workspace/main.ts"),
  @('mobile-workspace', "$taskAndroid/workspace-check.cjs", "$taskAndroid/web/main.ts"),
  @('audio-hub', "$taskWindows/dev/audio-hub-check.cjs", "$taskEvidence/audio-hub-entry.ts"),
  @('audio-player', "$taskWindows/dev/audio-player-check.cjs", "$taskWindows/src/workspace/audio-studio.ts"),
  @('native-music', "$taskAndroid/native-music-check.cjs", "$taskAndroid/web/native-music.ts"),
  @('speech', "$taskWindows/dev/speech-check.cjs", "$taskWindows/src/workspace/speech-player.ts"),
  @('knowledge', "$taskWindows/dev/knowledge-check.cjs", "$taskWindows/src/workspace/knowledge-data.ts"),
  @('writing-guard', "$taskWindows/dev/writing-guard-check.cjs", "$taskWindows/dev/writing-guard-entry.ts"),
  @('dashboard-ui', "$taskWindows/dev/dashboard-ui-check.cjs", "$taskWindows/src/workspace/dashboard.ts"),
  @('search-ui', "$taskWindows/dev/search-ui-check.cjs", "$taskWindows/src/workspace/studio.ts"),
  @('capture-ui', "$taskWindows/dev/capture-ui-check.cjs", "$taskWindows/src/workspace/quick-capture.ts"),
  @('snapshot-ui', "$taskWindows/dev/snapshot-ui-check.cjs", "$taskWindows/src/workspace/snapshot-panel.ts"),
  @('reader-ui', "$taskWindows/dev/reader-ui-check.cjs", "$taskWindows/src/workspace/reader.ts"),
  @('reader', "$taskWindows/dev/reader-check.cjs", "$taskWindows/src/workspace/reader-data.ts"),
  @('library', "$taskWindows/dev/library-check.cjs", "$taskWindows/src/workspace/library-data.ts"),
  @('dashboard', "$taskWindows/dev/dashboard-check.cjs", "$taskWindows/src/workspace/dashboard-data.ts"),
  @('response-pages', "$taskWindows/dev/response-pages-check.cjs", "$taskWindows/src/workspace/response-pages.ts"),
  @('followups', "$taskWindows/dev/followups-check.cjs", "$taskWindows/src/workspace/followups.ts"),
  @('vault', "$taskWindows/dev/vault-check.cjs", "$taskAndroid/web/native-vault.ts"),
  @('mobile-storage', "$taskAndroid/storage-check.cjs", "$taskAndroid/web/storage.ts"),
  @('mobile-sync', "$taskAndroid/sync-check.cjs", "$taskAndroid/web/sync.ts"),
  @('mobile-project-data', "$taskAndroid/project-data-check.cjs", "$taskAndroid/web/project-data.ts"),
  @('mobile-playback-handoff', "$taskAndroid/native-media-check.cjs", "$taskAndroid/web/native-media.ts")
)
$taskImportRoot = $taskWindows.Replace('\','/')
"export * from '$taskImportRoot/src/workspace/audio-queue';`nexport * from '$taskImportRoot/src/workspace/audio-denoise';" | Set-Content "$taskEvidence/audio-hub-entry.ts"
$taskResults = @()
foreach ($taskCheck in $taskChecks) {
  $taskName, $taskTest, $taskInput = $taskCheck
  if (!(Test-Path -LiteralPath $taskInput)) { throw "Missing test input: $taskInput" }
  $taskBundle = Join-Path $taskEvidence "$taskName.cjs"
  if ($taskName -eq 'vault') {
    & $taskEsbuild $taskInput --bundle --platform=browser --format=iife --global-name=Vault "--outfile=$taskBundle"
  } elseif ($taskName -in @('workspace','mobile-workspace')) {
    & $taskEsbuild $taskInput --bundle --platform=browser --format=iife "--outfile=$taskBundle"
  } else {
    & $taskEsbuild $taskInput --bundle --platform=node --format=cjs "--outfile=$taskBundle"
  }
  if ($LASTEXITCODE) { throw "Failed to bundle $taskName" }
  $taskOutput = & node $taskTest $taskBundle 2>&1
  $taskCode = $LASTEXITCODE
  $taskOutput | Set-Content (Join-Path $taskEvidence "$taskName.log")
  Write-Output "$taskName : exit $taskCode"
  $taskResults += [pscustomobject]@{ name = $taskName; exitCode = $taskCode; output = ($taskOutput -join "`n") }
}
$taskResults | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $taskEvidence 'frontend-tests.json')
if (@($taskResults | Where-Object exitCode -ne 0).Count) { exit 1 }
foreach ($taskModule in @('audio-data','workflows','encrypted-pack')) {
  & $taskEsbuild "$taskWindows/src/workspace/$taskModule.ts" --bundle --platform=node --format=cjs "--outfile=$taskEvidence/$taskModule.cjs"
  if ($LASTEXITCODE) { throw "Failed to bundle $taskModule" }
}
foreach ($taskExtra in @(@('audio', "$taskEvidence/audio-data.cjs", "$taskEvidence/workflows.cjs", "$taskEvidence/test-tone.wav"), @('studio', "$taskEvidence/knowledge.cjs", "$taskEvidence/encrypted-pack.cjs"))) {
  $taskName = $taskExtra[0]
  $taskArgs = $taskExtra[1..($taskExtra.Length-1)]
  $taskOutput = & node "$taskWindows/dev/$taskName-check.cjs" @taskArgs 2>&1
  $taskCode = $LASTEXITCODE
  $taskOutput | Set-Content "$taskEvidence/$taskName.log"
  $taskResults += [pscustomobject]@{name=$taskName;exitCode=$taskCode;output=($taskOutput -join "`n")}
  Write-Output "$taskName : exit $taskCode"
}
$taskResults | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $taskEvidence 'frontend-tests.json')
if (@($taskResults | Where-Object exitCode -ne 0).Count) { exit 1 }
