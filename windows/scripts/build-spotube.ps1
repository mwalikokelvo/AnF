param([string]$Flutter = $env:FLUTTER_BIN)
$ErrorActionPreference = 'Stop'
if (-not $Flutter) { $Flutter = (Get-Command flutter -ErrorAction Stop).Source }
if(Test-Path -LiteralPath $Flutter){$Flutter=(Resolve-Path -LiteralPath $Flutter).Path}else{$Flutter=(Get-Command $Flutter -ErrorAction Stop).Source}
$taskVersion = (& $Flutter --version --machine | Out-String | ConvertFrom-Json).frameworkVersion
if ($LASTEXITCODE -or $taskVersion -ne '3.35.2') { throw 'Embedded Spotube requires Flutter 3.35.2.' }
$env:FLUTTER_BIN = $Flutter
$taskWindows = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPreviousPath=$env:PATH
$taskPreviousGit=$env:ANF_BUILD_REAL_GIT
Push-Location $taskWindows
try {
    $taskVswhere=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
    if(-not(Test-Path -LiteralPath $taskVswhere)){throw 'Install Visual Studio C++ Build Tools with the ATL component.'}
    $taskVs=& $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    $taskAtl=if($taskVs){Get-ChildItem (Join-Path $taskVs 'VC/Tools/MSVC') -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'atlmfc/include/atlstr.h')}}
    if(-not $taskAtl){throw 'Add Microsoft.VisualStudio.Component.VC.ATL to C++ Build Tools; the Windows secure-storage plugin needs atlstr.h.'}
    if(-not(Get-Command nuget -ErrorAction SilentlyContinue)){
        $taskTools=Join-Path $taskWindows 'target/build-tools'
        New-Item -ItemType Directory -Force $taskTools | Out-Null
        $taskNuget=Join-Path $taskTools 'nuget.exe'
        if(-not(Test-Path -LiteralPath $taskNuget)){
            Invoke-WebRequest 'https://dist.nuget.org/win-x86-commandline/v6.14.0/nuget.exe' -OutFile $taskNuget
        }
        $taskSignature=Get-AuthenticodeSignature -LiteralPath $taskNuget
        if($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){
            throw 'Microsoft NuGet signature verification failed.'
        }
        $env:PATH=$taskTools+';'+$env:PATH
    }
    # Dart 3.9's Git cache validation uses backslashes in --git-dir. Newer
    # Git for Windows can misidentify that directory and repeatedly reclone it.
    $taskGit=if($env:ANF_BUILD_REAL_GIT){$env:ANF_BUILD_REAL_GIT}else{(Get-Command git -ErrorAction Stop).Source}
    $taskProbe=Join-Path $taskWindows 'target/git-path-check'
    git init --bare $taskProbe | Out-Null
    if($LASTEXITCODE){throw 'Git path check could not initialize.'}
    Push-Location $taskProbe
    try {$taskInside=& $taskGit "--git-dir=$taskProbe" rev-parse --is-inside-git-dir} finally {Pop-Location}
    if($taskInside -ne 'true'){
        $taskAdapter=Join-Path $taskWindows 'target/git-compat'
        New-Item -ItemType Directory -Force $taskAdapter | Out-Null
        $taskSource=Join-Path $taskWindows '../integrations/spotube/windows_git_compat.cpp'
        & cl.exe /nologo /O2 /MT /EHsc /std:c++17 $taskSource "/Fo$taskAdapter/git.obj" "/Fe$taskAdapter/git.exe" /link shell32.lib
        if($LASTEXITCODE){throw 'Run from the Visual Studio Developer PowerShell to build the Git compatibility adapter.'}
        $env:ANF_BUILD_REAL_GIT=$taskGit
        $env:PATH=$taskAdapter+';'+$env:PATH
    }
    node ../integrations/spotube/prepare.mjs --windows
    if ($LASTEXITCODE) { throw 'Pinned Spotube preparation failed.' }
    Push-Location spotube-native
    try {
        & $Flutter build windows --release
        if ($LASTEXITCODE) { throw 'Embedded Spotube Windows build failed.' }
    } finally { Pop-Location }
    & (Join-Path $PSScriptRoot 'prepare-vcruntime.ps1') -Destination (Join-Path $taskWindows 'spotube-native/build/windows/x64/runner/Release')
} finally { Pop-Location; $env:PATH=$taskPreviousPath; $env:ANF_BUILD_REAL_GIT=$taskPreviousGit }
