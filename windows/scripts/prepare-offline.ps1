$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
node scripts/prepare-offline.mjs
if ($LASTEXITCODE) { throw 'Offline component download failed' }
$extractDirectory = Join-Path $PWD 'target/offline-runtime'
Expand-Archive -LiteralPath local-ai/runtime.zip -DestinationPath $extractDirectory -Force
Get-ChildItem $extractDirectory -Recurse -File -Filter '*.dll' | Copy-Item -Destination local-ai
Get-ChildItem $extractDirectory -Recurse -File -Filter 'llama-server.exe' | Copy-Item -Destination local-ai
Get-ChildItem $extractDirectory -Recurse -File -Filter 'LICENSE*' | Copy-Item -Destination local-ai
if (Test-Path -LiteralPath local-ai/runtime-vulkan.zip) {
  $vulkanExtract = Join-Path $PWD 'target/offline-runtime-vulkan'
  Expand-Archive -LiteralPath local-ai/runtime-vulkan.zip -DestinationPath $vulkanExtract -Force
  Get-ChildItem $vulkanExtract -Recurse -File -Filter '*.dll' | Copy-Item -Destination local-ai -Force
}
