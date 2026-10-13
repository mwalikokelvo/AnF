param([Parameter(Mandatory=$true)][string]$Baseline, [Parameter(Mandatory=$true)][string]$Candidate)
$ErrorActionPreference='Stop'
$testRoot=Join-Path $env:RUNNER_TEMP 'anf-app-upgrade'
$install=Join-Path $testRoot 'app'
$env:APPDATA=Join-Path $testRoot 'roaming'
$env:LOCALAPPDATA=Join-Path $testRoot 'local'
$env:ANF_QA_OUTPUT=Join-Path $testRoot 'results'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
# Apply the official WebView2 per-user override in this disposable runner too.
$debugPolicy='HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
New-Item -Path $debugPolicy -Force | Out-Null
New-ItemProperty -Path $debugPolicy -Name '*' -Value $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -PropertyType String -Force | Out-Null
New-Item -ItemType Directory -Force $install,$env:APPDATA,$env:LOCALAPPDATA,$env:ANF_QA_OUTPUT | Out-Null
function Install-App([string]$installer) {
  $process=Start-Process -FilePath (Resolve-Path $installer) -ArgumentList @('/S',"/D=$install") -Wait -PassThru
  if($process.ExitCode -ne 0){throw "Installer failed with code $($process.ExitCode)"}
  if(!(Test-Path "$install/coucou.exe")){throw 'Installer did not produce the application'}
}
function Exercise-App([string]$phase) {
  $process=Start-Process -FilePath "$install/coucou.exe" -PassThru
  try {
    node scripts/app-qa/windows-ui.mjs $phase
    if($LASTEXITCODE){throw "Installed application $phase test failed"}
  }finally {
    $log=Join-Path $env:LOCALAPPDATA 'Coucou/coucou.log'
    if(Test-Path $log){Copy-Item $log (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-startup.log")}
    Get-Process coucou,msedgewebview2 -ErrorAction SilentlyContinue |
      Select-Object Id,ProcessName,Path | ConvertTo-Json |
      Set-Content (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-processes.json")
    Get-CimInstance Win32_Process -Filter "name='msedgewebview2.exe'" |
      Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json |
      Set-Content (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-webview-arguments.json")
    # Stop only the application process owned by this isolated test.
    if(!$process.HasExited){taskkill /PID $process.Id /T /F | Out-Null}
  }
}
Install-App $Baseline
Exercise-App 'seed'
Install-App $Candidate
Exercise-App 'verify'
Exercise-App 'reopen'
'PASS: Windows 0.1.18 to 0.1.19 installation, encryption, document import, offline AI and restart'
