@echo off
setlocal enabledelayedexpansion
title TurtleBot 3 Burger - 3D Simulator Launcher
color 0B

echo ============================================================
echo   Launching TurtleBot 3 Burger 3D Web Simulator...
echo ============================================================

set PORT=8000
python -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', 8000)); s.close()" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] Port 8000 is occupied by another service/container.
    echo [INFO] Automatically using port 8001...
    set PORT=8001
)

echo Starting local web server on http://localhost:!PORT!...
start "" "http://localhost:!PORT!"
python -m http.server !PORT! --bind 127.0.0.1 --directory "%~dp0simulator"
pause
