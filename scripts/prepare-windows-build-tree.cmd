@echo off
rem Prepares a fresh AnF checkout/snapshot so the Windows installer builds first time.
rem Usage: prepare-windows-build-tree.cmd OLD_TREE NEW_TREE [TARGET_DIR]
rem   OLD_TREE   a tree that already built (has windows\local-ai, windows\media, windows\target)
rem   NEW_TREE   the fresh snapshot (repo root)
rem   TARGET_DIR optional cargo target dir to reuse (default OLD_TREE\windows\target)
rem Copies the gitignored bundle resources and junctions NEW_TREE\windows\target to the target dir.
rem Exit codes: 0 ok, 2 bad arguments, 3 missing source resource, 4 copy failed, 5 junction failed.
setlocal enableextensions
set "OLD=%~1"
set "NEW=%~2"
set "TGT=%~3"
if "%OLD%"=="" goto usage
if "%NEW%"=="" goto usage
if "%TGT%"=="" set "TGT=%OLD%\windows\target"
if not exist "%OLD%\windows\local-ai\" (echo [prepare] ERROR: missing %OLD%\windows\local-ai & exit /b 3)
if not exist "%OLD%\windows\media\ffmpeg.exe" (echo [prepare] ERROR: missing %OLD%\windows\media\ffmpeg.exe & exit /b 3)
if not exist "%OLD%\windows\local-ai\llama-server.exe" (echo [prepare] ERROR: missing llama-server.exe in old tree & exit /b 3)
if not exist "%OLD%\windows\local-ai\model.gguf" (echo [prepare] ERROR: missing model.gguf in old tree & exit /b 3)
if not exist "%OLD%\windows\local-ai\model-fast.gguf" (echo [prepare] ERROR: missing model-fast.gguf in old tree & exit /b 3)
if not exist "%NEW%\windows\src-tauri\tauri.conf.json" (echo [prepare] ERROR: %NEW% is not an AnF tree & exit /b 2)

echo [prepare] copying windows\local-ai (gguf, llama-server.exe, dll, rten, licences, NOTICE.txt)
robocopy "%OLD%\windows\local-ai" "%NEW%\windows\local-ai" /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1
if errorlevel 8 (echo [prepare] ERROR: robocopy local-ai failed & exit /b 4)
echo [prepare] copying windows\media (ffmpeg.exe, SOURCES.txt, FFmpeg-LICENSE.txt, NOTICE.txt)
robocopy "%OLD%\windows\media" "%NEW%\windows\media" /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1
if errorlevel 8 (echo [prepare] ERROR: robocopy media failed & exit /b 4)

if exist "%NEW%\windows\target\" (
  echo [prepare] windows\target already exists in new tree, leaving it
) else (
  if not exist "%TGT%\" (echo [prepare] note: %TGT% does not exist; creating it & mkdir "%TGT%")
  mklink /J "%NEW%\windows\target" "%TGT%"
  if errorlevel 1 (echo [prepare] ERROR: junction failed & exit /b 5)
)

if not exist "%NEW%\NotchBuddy\Resources\sounds\" echo [prepare] note: NotchBuddy\Resources\sounds is absent, the build will ship without audio
echo [prepare] OK
exit /b 0
:usage
echo usage: %~nx0 OLD_TREE NEW_TREE [TARGET_DIR]
exit /b 2
