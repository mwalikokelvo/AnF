# Alternative to Vite when Node child-process launching is restricted.
# Requires Rust, Node, and an MSVC developer PowerShell environment.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!(Test-Path local-ai/llama-server.exe) -or !(Test-Path local-ai/model.gguf)) {
    & scripts/prepare-offline.ps1
}
cargo build --release --locked -p coucou-hook
if ($LASTEXITCODE) { throw 'Hook build failed' }
node node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE) { throw 'TypeScript check failed' }
& node_modules/@esbuild/win32-x64/esbuild.exe src/main.ts src/settings/main.ts src/workspace/main.ts --bundle --format=esm --minify --target=chrome110 --outbase=src --outdir=dist/assets
if ($LASTEXITCODE) { throw 'Frontend build failed' }
New-Item -ItemType Directory -Force dist/sounds | Out-Null
Copy-Item ../NotchBuddy/Resources/sounds/*.wav dist/sounds
foreach ($entry in @(@('index.html','main'), @('settings.html','settings/main'), @('workspace.html','workspace/main'))) {
  $html = Get-Content $entry[0] -Raw
  $html = $html -replace '/src/[^"\s]+\.ts', ('/assets/' + $entry[1] + '.js')
  $html = $html.Replace('</head>', ('<link rel="stylesheet" href="/assets/' + $entry[1] + '.css"></head>'))
  Set-Content ('dist/' + $entry[0]) $html -Encoding utf8NoBOM
}
cargo build --release --locked --features tauri/custom-protocol --bin coucou
if ($LASTEXITCODE) { throw 'Application build failed' }
node node_modules/@tauri-apps/cli/tauri.js bundle --bundles nsis --ci --no-binary-patching --config '{"bundle":{"useLocalToolsDir":true}}'
if ($LASTEXITCODE) { throw 'Installer packaging failed' }
