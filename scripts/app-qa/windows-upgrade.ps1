param([Parameter(Mandatory=$true)][string]$Baseline, [Parameter(Mandatory=$true)][string]$Candidate, [ValidateSet('Legacy','Modern')][string]$Identity='Legacy')
$ErrorActionPreference='Stop'
# Production installers use real registry names despite AppData overrides.
# Restrict this harness to disposable GitHub-hosted Windows workers.
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Run installed upgrade QA only on a disposable GitHub-hosted runner'}
$dataName=if($Identity -eq 'Legacy'){'Coucou'}else{'AnF'}
$env:ANF_QA_DATA_NAME=$dataName
$testRoot=Join-Path $env:RUNNER_TEMP 'anf-app-upgrade'
$env:APPDATA=Join-Path $testRoot 'roaming'
$env:LOCALAPPDATA=Join-Path $testRoot 'local'
$install=Join-Path $env:LOCALAPPDATA $dataName
$env:ANF_QA_OUTPUT=Join-Path $testRoot 'results'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'
# Apply the official WebView2 per-user override in this disposable runner too.
$debugPolicy='HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
New-Item -Path $debugPolicy -Force | Out-Null
New-ItemProperty -Path $debugPolicy -Name '*' -Value $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -PropertyType String -Force | Out-Null
New-Item -ItemType Directory -Force $install,$env:APPDATA,$env:LOCALAPPDATA,$env:ANF_QA_OUTPUT | Out-Null
function Install-App([string]$installer, [bool]$upgrading=$false) {
  $arguments=if($upgrading){@('/S')}else{@('/S',"/D=$install")}
  $process=Start-Process -FilePath (Resolve-Path $installer) -ArgumentList $arguments -Wait -PassThru
  if($process.ExitCode -ne 0){throw "Installer failed with code $($process.ExitCode)"}
  if(!(Test-Path "$install/coucou.exe") -and !(Test-Path "$install/AnF.exe")){throw 'Installer did not produce the application'}
  if($upgrading){
    if(!(Test-Path "$install/AnF.exe")){throw 'Renamed installer did not find the existing installation'}
    $record=Get-ItemProperty ("HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\"+$dataName)
    if($record.DisplayName -ne 'AnF'){throw 'Installed application is not branded AnF'}
    if(Test-Path "$install/coucou.exe"){throw 'Upgrade left the old application executable behind'}
  }
}
function Stop-TestProcesses {
  # A WebView browser may outlive its host. Stop only this test's executable and
  # browser profile, then wait for the profile's shared process to release it.
  Get-Process coucou,AnF -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq "$install\coucou.exe" -or $_.Path -eq "$install\AnF.exe"} |
    ForEach-Object {taskkill /PID $_.Id /T /F | Out-Null}
  $deadline=(Get-Date).AddSeconds(20)
  do {
    $browsers=@(Get-CimInstance Win32_Process -Filter "name='msedgewebview2.exe'" |
      Where-Object {$_.CommandLine -and $_.CommandLine.Contains($env:LOCALAPPDATA)})
    $browsers | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
    if(!$browsers.Count){break}
    Start-Sleep -Milliseconds 500
  }while((Get-Date) -lt $deadline)
  Start-Sleep -Seconds 2
}
function Exercise-App([string]$phase) {
  Stop-TestProcesses
  $binary=if(Test-Path "$install/AnF.exe"){Join-Path $install 'AnF.exe'}else{Join-Path $install 'coucou.exe'}
  $originalHash=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
  $log=Join-Path (Join-Path $env:LOCALAPPDATA $dataName) $(if($phase -eq 'seed' -and $Identity -eq 'Legacy'){'coucou.log'}else{'anf.log'})
  $offset=if(Test-Path $log){(Get-Content $log -Raw).Length}else{0}
  # First prove the unmodified shipping executable opens its real workspace.
  $process=Start-Process -FilePath $binary -PassThru
  try {
    $deadline=(Get-Date).AddSeconds(90)
    $ready=$false
    while((Get-Date) -lt $deadline -and !$process.HasExited) {
      if(Test-Path $log){$text=Get-Content $log -Raw;if($text.Length -ge $offset -and $text.Substring($offset).Contains('workspace ready')){$ready=$true;break}}
      Start-Sleep -Milliseconds 500
    }
    if(!$ready){throw 'Unmodified application did not complete workspace startup'}
    # Exercise the exact installed executable. CDP uses supported WebView2
    # environment/policy options in this disposable worker; never patch the
    # shipping PE image or replace protection flags to make QA connect.
    node scripts/app-qa/windows-ui.mjs $phase
    if($LASTEXITCODE){throw "Installed application $phase test failed"}
  }finally {
    $log=Join-Path (Join-Path $env:LOCALAPPDATA $dataName) $(if($phase -eq 'seed' -and $Identity -eq 'Legacy'){'coucou.log'}else{'anf.log'})
    if(Test-Path $log){Copy-Item $log (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-startup.log")}
    Get-Process coucou,AnF,msedgewebview2 -ErrorAction SilentlyContinue |
      Select-Object Id,ProcessName,Path | ConvertTo-Json |
      Set-Content (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-processes.json")
    Get-CimInstance Win32_Process -Filter "name='msedgewebview2.exe'" |
      Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json |
      Set-Content (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-webview-arguments.json")
    # Stop only the application process owned by this isolated test.
    if(!$process.HasExited){taskkill /PID $process.Id /T /F | Out-Null}
    Stop-TestProcesses
    $finalHash=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
    @{phase=$phase;sha256=$originalHash;afterSha256=$finalHash;executableUnmodified=($originalHash -eq $finalHash)} |
      ConvertTo-Json | Set-Content (Join-Path $env:ANF_QA_OUTPUT "windows-$phase-executable.json")
    if($originalHash -ne $finalHash){throw 'Installed executable changed during QA; results are invalid'}
  }
}
Install-App $Baseline
Exercise-App 'seed'
Install-App $Candidate $true
Exercise-App 'verify'
Exercise-App 'reopen'
"PASS: $Identity lineage installation, encryption, document import, offline AI and restart"
