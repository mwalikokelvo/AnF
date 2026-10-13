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
Add-Type @'
using System;
using System.Text;
public static class AnfQaBrowserArguments {
  public static int Replace(byte[] data,string before,string after) {
    if(after.Length>before.Length)throw new Exception("Test argument exceeds original constant size");
    string image=Encoding.GetEncoding(28591).GetString(data);
    byte[] replacement=Encoding.ASCII.GetBytes(after.PadRight(before.Length));
    int count=0,start=0,index;
    while((index=image.IndexOf(before,start,StringComparison.Ordinal))>=0) {
      Array.Copy(replacement,0,data,index,replacement.Length);count++;start=index+before.Length;
    }
    return count;
  }
}
'@
function Install-App([string]$installer) {
  $process=Start-Process -FilePath (Resolve-Path $installer) -ArgumentList @('/S',"/D=$install") -Wait -PassThru
  if($process.ExitCode -ne 0){throw "Installer failed with code $($process.ExitCode)"}
  if(!(Test-Path "$install/coucou.exe")){throw 'Installer did not produce the application'}
}
function Exercise-App([string]$phase) {
  $binary=Join-Path $install 'coucou.exe'
  $backup=Join-Path $testRoot "original-$phase.exe"
  Copy-Item $binary $backup
  $log=Join-Path $env:LOCALAPPDATA 'Coucou/coucou.log'
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
    taskkill /PID $process.Id /T /F | Out-Null
    $process.WaitForExit()
    # WebView2 ignores external argument overrides here. Change only the fixed
    # browser option in this test copy, retaining its exact size and all app code.
    # Autoplay is unused in these writing/document/AI checks. Restore immediately.
    $bytes=[IO.File]::ReadAllBytes($binary)
    $before='--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required'
    $after='--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9223'
    $count=[AnfQaBrowserArguments]::Replace($bytes,$before,$after)
    if($count -ne 1){throw "Expected one browser argument constant, found $count"}
    [IO.File]::WriteAllBytes($binary,$bytes)
    $process=Start-Process -FilePath $binary -PassThru
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
    Copy-Item $backup $binary -Force
  }
}
Install-App $Baseline
Exercise-App 'seed'
Install-App $Candidate
Exercise-App 'verify'
Exercise-App 'reopen'
'PASS: Windows 0.1.18 to 0.1.19 installation, encryption, document import, offline AI and restart'
