@echo off
setlocal
cd /d "%~dp0"
python "%~dp0serve.py" --host 127.0.0.1 --port 8000 --fallback-port 3900
