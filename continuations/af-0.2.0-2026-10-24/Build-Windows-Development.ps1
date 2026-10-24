param([switch]$CheckOnly,[switch]$TestsOnly,[string]$TargetDirectory=(Join-Path $env:USERPROFILE '.codex/af-native-target-01a16a65'))
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskWorkspace=Join-Path $taskRoot 'af/work/coucou/windows'
$taskEvidence=Join-Path $taskRoot 'verification/windows-native-2026-10-24'
$taskTarget=[IO.Path]::GetFullPath($TargetDirectory)
$env:CARGO_HOME=Join-Path $taskRoot 'tools/cargo'
$env:RUSTUP_HOME=Join-Path $taskRoot 'tools/rustup'
$env:CARGO_TARGET_DIR=$taskTarget
$env:PATH="$env:CARGO_HOME/bin;$(Join-Path $taskRoot 'tools/strawberry/perl/bin');$env:PATH"
$env:LANG='C';$env:LC_ALL='C'
New-Item -ItemType Directory -Force $taskEvidence | Out-Null
# Reuse the verified vendored OpenSSL installation produced by the first native
# check, rather than recompiling its C sources for each Cargo profile.
$taskCrypto=Get-ChildItem "$taskTarget/debug/build" -Directory -Filter 'openssl-sys-*' -ErrorAction SilentlyContinue | Where-Object {Test-Path (Join-Path $_.FullName 'out/openssl-build/install/include/openssl/ssl.h')} | Select-Object -First 1
if($taskCrypto){$env:OPENSSL_DIR=Join-Path $taskCrypto.FullName 'out/openssl-build/install';$env:OPENSSL_NO_VENDOR='1';$env:OPENSSL_STATIC='1'}
$env:CARGO_PROFILE_RELEASE_LTO='false';$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16';$env:CARGO_PROFILE_RELEASE_OPT_LEVEL='1'
# The current native source embeds its real hook relay at a legacy relative
# target path. Build it, then stage that exact binary there for custom targets.
cargo build --manifest-path "$taskWorkspace/Cargo.toml" --release -p coucou-hook
if($LASTEXITCODE){throw 'Windows hook build failed'}
New-Item -ItemType Directory -Force "$taskWorkspace/target/release" | Out-Null
Copy-Item -LiteralPath "$taskTarget/release/coucou-hook.exe" -Destination "$taskWorkspace/target/release/coucou-hook.exe"
if($CheckOnly -or $TestsOnly){
  $env:TAURI_CONFIG='{"bundle":{"resources":[]}}'
  if($CheckOnly){cargo check --manifest-path "$taskWorkspace/Cargo.toml" -p coucou;exit $LASTEXITCODE}
  # Native storage tests must never see the user's actual Coucou data/key slot.
  $taskSandbox=Join-Path $taskEvidence ('test-profile-'+[Guid]::NewGuid().ToString('N'))
  $env:APPDATA=Join-Path $taskSandbox 'Roaming';$env:LOCALAPPDATA=Join-Path $taskSandbox 'Local';$env:USERPROFILE=$taskSandbox
  New-Item -ItemType Directory -Force $env:APPDATA,$env:LOCALAPPDATA | Out-Null
  cargo test --manifest-path "$taskWorkspace/Cargo.toml" -p coucou --lib -- --test-threads=1
  exit $LASTEXITCODE
}
# The checkout has no Windows offline-AI pack. Remove those optional resource
# mappings explicitly for this base development installer, without changing the
# production configuration or inventing placeholder runtime/model files.
$taskResources=@{}
foreach($taskName in @('../local-ai/*.dll','../local-ai/llama-server.exe','../local-ai/model.gguf','../local-ai/model-fast.gguf','../local-ai/*.rten','../local-ai/*LICENSE*','../local-ai/NOTICE.txt','../target/release/coucou-hook.exe')){$taskResources[$taskName]=$null}
$taskResources[(Join-Path $taskTarget 'release/coucou-hook.exe').Replace('\','/')]='coucou-hook.exe'
$taskConfig=@{build=@{beforeBuildCommand=$null};bundle=@{resources=$taskResources}}|ConvertTo-Json -Depth 5
$taskConfigPath=Join-Path $taskEvidence 'windows-base-development.config.json'
$taskConfig|Set-Content -LiteralPath $taskConfigPath
# Avoid a costly LTO build while establishing a development binary; no claim of
# production release optimization, code signing or acceptance is made.
$env:CARGO_PROFILE_RELEASE_LTO='false';$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16';$env:CARGO_PROFILE_RELEASE_OPT_LEVEL='1'
Remove-Item Env:TAURI_CONFIG -ErrorAction SilentlyContinue
Push-Location $taskWorkspace
try{
  node node_modules/typescript/bin/tsc --noEmit
  if($LASTEXITCODE){throw 'Windows frontend typecheck failed'}
  node node_modules/vite/bin/vite.js build
  if($LASTEXITCODE){throw 'Windows frontend build failed'}
  node node_modules/@tauri-apps/cli/tauri.js build --bundles nsis --config $taskConfigPath
  exit $LASTEXITCODE
}finally{Pop-Location}
