param([string]$Destination = (Join-Path $PSScriptRoot '../local-ai'))
$ErrorActionPreference = 'Stop'
$taskVswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $taskVswhere)) { throw 'Install the Microsoft C++ Build Tools first.' }
$taskVs = & $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $taskVs) { throw 'No complete Microsoft C++ toolchain was found.' }
$taskRedistRoot = Join-Path $taskVs 'VC/Redist/MSVC'
$taskRedistVersion = Get-ChildItem -LiteralPath $taskRedistRoot -Directory |
    Where-Object Name -Match '^\d+\.\d+\.\d+$' |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $taskRedistVersion) { throw 'The Microsoft C++ redistributable files are missing.' }
$taskCrt = Join-Path $taskRedistVersion.FullName 'x64/Microsoft.VC143.CRT'
foreach ($taskRequired in 'vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll') {
    if (-not (Test-Path -LiteralPath (Join-Path $taskCrt $taskRequired))) { throw "Missing redistributable: $taskRequired" }
}
$taskOutput = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force $taskOutput | Out-Null
$taskNotices = @(
    'Microsoft Visual C++ v14 runtime — unmodified x64 redistributable files.',
    'Copyright Microsoft Corporation. All rights reserved.',
    'Source: Visual Studio 2022 VC/Redist/MSVC/<version>/x64/Microsoft.VC143.CRT.',
    'Redistribution list: https://aka.ms/vs/17/redist.txt',
    'License terms: https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/',
    ''
)
foreach ($taskDll in (Get-ChildItem -LiteralPath $taskCrt -File -Filter '*.dll')) {
    $taskSignature = Get-AuthenticodeSignature -LiteralPath $taskDll.FullName
    if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw "Microsoft runtime signature verification failed: $($taskDll.Name)"
    }
    $taskHash = (Get-FileHash -LiteralPath $taskDll.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskDestination = Join-Path $taskOutput $taskDll.Name
    Copy-Item -LiteralPath $taskDll.FullName -Destination $taskDestination -Force
    if ((Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskHash) {
        throw "Runtime copy verification failed: $($taskDll.Name)"
    }
    $taskNotices += "$($taskDll.Name)  version=$($taskDll.VersionInfo.FileVersion)  sha256=$taskHash"
}
$taskNotices | Set-Content -LiteralPath (Join-Path $taskOutput 'MSVC-LICENSE.txt') -Encoding utf8
Write-Output "Verified and bundled the Microsoft x64 runtime in $taskOutput."
