@echo off
rem One-click Windows installer build for a fresh AnF snapshot (double-click, or run from cmd).
rem Usage: build-windows-from-snapshot.cmd [OLD_TREE]
rem   OLD_TREE defaults to %ANF_OLD_TREE%. If the new tree already has windows\local-ai and
rem   windows\media, OLD_TREE may be omitted. The new tree is the repo containing this script.
rem Log: %USERPROFILE%\anf-build-YYYYMMDD-HHMMSS.log  (result line: BUILD-RESULT exit=N)
rem Set ANF_NOPAUSE=1 to skip the final pause. About 12 minutes when the target dir is warm.
setlocal enableextensions
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%t"
set "LOG=%USERPROFILE%\anf-build-%STAMP%.log"
set "NEW=%~dp0.."
for %%i in ("%NEW%") do set "NEW=%%~fi"
set "OLD=%~1"
if "%OLD%"=="" set "OLD=%ANF_OLD_TREE%"
echo Building %NEW%
echo Log: %LOG%
call :main > "%LOG%" 2>&1
set "RC=%errorlevel%"
echo BUILD-RESULT exit=%RC%>> "%LOG%"
echo BUILD-RESULT exit=%RC%  (log: %LOG%)
if not defined ANF_NOPAUSE pause
exit /b %RC%

:main
echo [build] start %DATE% %TIME% tree=%NEW% old=%OLD%
set CARGO_BUILD_JOBS=1
set CARGO_INCREMENTAL=0
set CL=/Zm500
if not exist "%NEW%\windows\local-ai\llama-server.exe" (
  if "%OLD%"=="" (echo [build] ERROR: no local-ai in new tree and no OLD_TREE given & exit /b 10)
  call "%NEW%\scripts\prepare-windows-build-tree.cmd" "%OLD%" "%NEW%"
  if errorlevel 1 (echo [build] ERROR: prepare failed & exit /b 11)
) else (
  echo [build] resources already present, skipping prepare
)
if not exist "%NEW%\windows\target\" (
  echo [build] note: no windows\target, this will be a cold build ^(much slower^)
)
cd /d "%NEW%\windows" || exit /b 12
echo [build] npm ci
call npm ci
if errorlevel 1 (echo [build] ERROR: npm ci failed & exit /b 13)
echo [build] npm run pack
call npm run pack
if errorlevel 1 (echo [build] ERROR: npm run pack failed & exit /b 14)
dir /b "%NEW%\windows\release"
echo [build] done %DATE% %TIME%
exit /b 0
