@echo off
setlocal
title TurtleBot 3 Burger - Autonomous Navigation ^& 3D Simulator
color 0B

echo =====================================================================
echo           TURTLEBOT 3 BURGER - AUTONOMOUS NAVIGATION
echo              ROS 1 Melodic/Noetic ^& 3D Web Simulator
echo =====================================================================
echo.
echo [1/2] Initializing simulation environment...
echo [2/2] Launching 3D Web Visualizer in your default browser...
echo.

:: Detect Python for local server; fallback to direct file opening
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Python detected. Hosting local server on http://localhost:8000
    start "" "http://localhost:8000"
    echo.
    echo =====================================================================
    echo   Simulator is now running!
    echo   - Press 1: Robot First-Person Perspective (FPV Eye View)
    echo   - Press 2: Follow / Chase Camera
    echo   - Press 3: Free 360 Orbit Camera
    echo   - Drive: WASD / Arrow Keys ^| Click floor to set 2D Nav Goal
    echo =====================================================================
    echo.
    echo [NOTE] Keep this window open while using the simulator.
    echo Press Ctrl+C in this window when you wish to stop the server.
    echo.
    python -m http.server 8000 --directory "%~dp0simulator"
) else (
    echo [NOTE] Python not found in system PATH.
    echo Opening 3D Simulator directly in your default browser...
    start "" "%~dp0simulator\index.html"
    echo.
    echo =====================================================================
    echo   Simulator opened in browser!
    echo =====================================================================
    pause
)
