$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Disposable hosted runner required'}
$root=(Get-Location).Path
$binary=Join-Path $root 'windows/target/debug/AnF.exe'
if(!(Test-Path -LiteralPath $binary)){throw 'Actual native debug host required'}
$env:ANF_QA_OUTPUT=Join-Path $env:RUNNER_TEMP 'anf-spotube-workspace-qa/results'
$env:APPDATA=Join-Path $env:RUNNER_TEMP 'anf-spotube-workspace-qa/roaming'
$env:LOCALAPPDATA=Join-Path $env:RUNNER_TEMP 'anf-spotube-workspace-qa/local'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
$env:ANF_NATIVE_QA_CDP='1'
New-Item -ItemType Directory -Path $env:ANF_QA_OUTPUT,$env:APPDATA,$env:LOCALAPPDATA -Force | Out-Null
$process=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
$env:ANF_QA_HOST_PID=[string]$process.Id
try{
 node scripts/app-qa/windows-workspace-spotube.mjs
 if($LASTEXITCODE){throw 'Actual workspace Spotube integration test failed'}
}finally{
 if(!$process.HasExited){taskkill /PID $process.Id /T /F | Out-Null;$process.WaitForExit()}
}
