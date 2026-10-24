$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
node scripts/prepare-offline.mjs
if ($LASTEXITCODE) { throw 'Offline component download failed' }
$extractDirectory = Join-Path $PWD 'target/offline-runtime'
Expand-Archive -LiteralPath local-ai/runtime.zip -DestinationPath $extractDirectory -Force
Get-ChildItem $extractDirectory -Recurse -File -Filter '*.dll' | Copy-Item -Destination local-ai
Get-ChildItem $extractDirectory -Recurse -File -Filter 'llama-server.exe' | Copy-Item -Destination local-ai
Get-ChildItem $extractDirectory -Recurse -File -Filter 'LICENSE*' | Copy-Item -Destination local-ai
if (-not (Test-Path -LiteralPath local-ai/model.gguf)) {
  $taskQuantizer = Get-ChildItem $extractDirectory -Recurse -File -Filter 'llama-quantize.exe' | Select-Object -First 1
  & $taskQuantizer.FullName --allow-requantize local-ai/model-source.gguf local-ai/model.gguf Q4_K_M 4
  if ($LASTEXITCODE) { throw 'Balanced model quantization failed' }
}
$taskModelHash = (Get-FileHash -LiteralPath local-ai/model.gguf -Algorithm SHA256).Hash.ToLowerInvariant()
if ($taskModelHash -ne '54c0f1203a724e9f33e76916beab3bdfaffef56cf7b42a93b1bc21319fc0bf97') { throw 'Balanced model checksum mismatch. Quantization may differ on this CPU; review before packaging.' }
