$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$url = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip'
$expected = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
$cache = Join-Path $PWD 'target/media-runtime'
New-Item -ItemType Directory -Force $cache | Out-Null
$archive = Join-Path $cache 'ffmpeg.zip'
if (!(Test-Path $archive)) {
    Invoke-WebRequest -Uri $url -OutFile "$archive.partial"
    if ((Get-FileHash "$archive.partial" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'FFmpeg archive checksum mismatch'
    }
    Move-Item "$archive.partial" $archive
}
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Cached FFmpeg archive checksum mismatch'
}
Expand-Archive -LiteralPath $archive -DestinationPath $cache -Force
$binary = Get-ChildItem $cache -Recurse -File -Filter 'ffmpeg.exe' | Select-Object -First 1
$license = Get-ChildItem $cache -Recurse -File -Filter 'LICENSE*' | Select-Object -First 1
if (!$binary -or !$license) { throw 'FFmpeg archive is missing its executable or license' }
New-Item -ItemType Directory -Force media | Out-Null
Copy-Item $binary.FullName media/ffmpeg.exe -Force
Copy-Item $license.FullName media/FFmpeg-LICENSE.txt -Force
@"
FFmpeg 8.1.2 essentials build, distributed by Gyan.
Verified archive: $url
SHA-256: $expected
Build configuration and source information: https://www.gyan.dev/ffmpeg/builds/
Upstream source: https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz
Bundled license: FFmpeg-LICENSE.txt
"@ | Set-Content media/SOURCES.txt
& (Join-Path $PWD 'media/ffmpeg.exe') -version
if ($LASTEXITCODE) { throw 'FFmpeg runtime validation failed' }
