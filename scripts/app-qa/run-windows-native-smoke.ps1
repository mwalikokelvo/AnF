$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Disposable hosted runner required'}
$root=(Get-Location).Path
$binary=Join-Path $root 'windows/target/debug/AnF.exe'
if(!(Test-Path -LiteralPath $binary)){throw 'Current native binary required'}
$env:ANF_QA_OUTPUT=Join-Path $env:RUNNER_TEMP 'anf-native-source-qa/results'
$env:APPDATA=Join-Path $env:RUNNER_TEMP 'anf-native-source-qa/roaming'
$env:LOCALAPPDATA=Join-Path $env:RUNNER_TEMP 'anf-native-source-qa/local'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
$env:ANF_NATIVE_QA_CDP='1'
New-Item -ItemType Directory -Path $env:ANF_QA_OUTPUT,$env:APPDATA,$env:LOCALAPPDATA -Force | Out-Null
$hash=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
foreach($phase in @('seed','reopen')){
 $process=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
 try{
  node scripts/app-qa/windows-native-smoke.mjs $phase
  if($LASTEXITCODE){throw "Native source UI failed: $phase"}
 }finally{
  if(!$process.HasExited){taskkill /PID $process.Id /T /F | Out-Null;$process.WaitForExit()}
  $actual=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
  @{phase=$phase;sha256=$hash;afterSha256=$actual;executableUnmodified=($actual -eq $hash)} | ConvertTo-Json |
   Set-Content (Join-Path $env:ANF_QA_OUTPUT "$phase-executable.json")
  if($actual -ne $hash){throw 'Native executable changed during QA'}
  $log=Join-Path $env:LOCALAPPDATA 'AnF/anf.log'
  if(Test-Path -LiteralPath $log){Copy-Item -LiteralPath $log -Destination (Join-Path $env:ANF_QA_OUTPUT "$phase-startup.txt")}
 }
 Start-Sleep -Seconds 3
}
