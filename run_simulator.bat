@echo off
title TurtleBot 3 Burger - 3D Simulator Launcher
echo ============================================================
echo   Launching TurtleBot 3 Burger 3D Web Simulator...
echo ============================================================
echo Starting local web server on port 8000...
start "" "http://localhost:8000"
python -m http.server 8000 --directory "%~dp0simulator"
pause
