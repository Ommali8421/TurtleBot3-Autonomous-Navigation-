@echo off
setlocal enabledelayedexpansion
title TurtleBot 3 Burger - Master Synchronized Orchestrator
color 0B

echo =====================================================================
echo           TURTLEBOT 3 BURGER - MASTER PROJECT LAUNCHER
echo     Synchronized 3D FPV + 2D RViz + Gazebo + Navigation Pipeline
echo =====================================================================
echo.

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 1: Launch Local Web Server & 3D Web Simulator
:: ─────────────────────────────────────────────────────────────────────────
echo [STEP 1/5] Starting 3D Web Simulator and FPV Visualizer...

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    start "TurtleBot 3 - Local Web Server" /min cmd /c "python -m http.server 8000 --directory \"%~dp0simulator\""
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8000"
    echo   [OK] 3D Simulator launched on http://localhost:8000
) else (
    start "" "%~dp0simulator\index.html"
    echo   [OK] 3D Simulator opened directly in default browser
)

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 2: Detect ROS Environment (Docker / WSL)
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 2/5] Detecting ROS Noetic Environment...

set CID=
set USE_WSL=0

:: 1. Probe Windows Docker CLI
del /f /q "%TEMP%\tb3_docker_ps.txt" >nul 2>&1
docker ps -q > "%TEMP%\tb3_docker_ps.txt" 2>nul

if exist "%TEMP%\tb3_docker_ps.txt" (
    set /p FIRST_CID=<"%TEMP%\tb3_docker_ps.txt"
    if not "!FIRST_CID!"=="" (
        set CID=!FIRST_CID!
        echo   [OK] Found running Docker container: !CID!
    )
)

:: 2. If no running container found in Windows Docker, probe WSL Docker
if "!CID!"=="" (
    where wsl >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        del /f /q "%TEMP%\tb3_wsl_ps.txt" >nul 2>&1
        wsl -e docker ps -q > "%TEMP%\tb3_wsl_ps.txt" 2>nul
        if exist "%TEMP%\tb3_wsl_ps.txt" (
            set /p WSL_CID=<"%TEMP%\tb3_wsl_ps.txt"
            if not "!WSL_CID!"=="" (
                set CID=!WSL_CID!
                set USE_WSL=1
                echo   [OK] Found running Docker container inside WSL: !CID!
            )
        )
    )
)

:: 3. If still no running container, try starting stopped 'turtlebot3_sim'
if "!CID!"=="" (
    echo   [INFO] Checking for existing 'turtlebot3_sim' container...
    docker start turtlebot3_sim >nul 2>&1
    timeout /t 2 /nobreak >nul
    for /f "tokens=1" %%c in ('docker ps -q --filter "name=turtlebot3_sim" 2^>nul') do set CID=%%c
    if not "!CID!"=="" (
        echo   [OK] Started existing container: !CID!
    )
)

:: 4. If no container exists, try launching a new one
if "!CID!"=="" (
    echo   [INFO] Starting new ROS container (turtlebot3_sim)...
    docker run -d --name turtlebot3_sim --net=host -e DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix:rw -v "%CD%\catkin_ws:/root/catkin_ws" osrf/ros:noetic-desktop-full tail -f /dev/null >nul 2>&1
    timeout /t 2 /nobreak >nul
    for /f "tokens=1" %%c in ('docker ps -q --filter "name=turtlebot3_sim" 2^>nul') do set CID=%%c
)

:: If Docker is completely unreachable, give clear options
if "!CID!"=="" (
    echo.
    echo   [NOTICE] No active ROS Docker container detected.
    echo   Please make sure Docker Desktop is running, OR launch your ROS container manually:
    echo     docker run -it --net=host -v "%CD%\catkin_ws:/root/catkin_ws" osrf/ros:noetic-desktop-full
    echo.
    echo   The 3D Web Simulator is already running in your browser in Standalone Mode!
    echo   You can drive with WASD and test autonomous navigation right in the browser.
    echo.
    pause
    exit /b
)

:: Configure command runner prefix depending on whether container is host or WSL
if "!USE_WSL!"=="1" (
    set DEXEC=wsl -e docker exec -it !CID!
    set DEXEC_BG=wsl -e docker exec !CID!
) else (
    set DEXEC=docker exec -it !CID!
    set DEXEC_BG=docker exec !CID!
)

:: Ensure Catkin workspace is compiled inside container
echo   [INFO] Verifying Catkin workspace inside container...
!DEXEC_BG! bash -c "source /opt/ros/noetic/setup.bash && [ -f /root/catkin_ws/devel/setup.bash ] || (cd /root/catkin_ws && catkin_make)" >nul 2>&1

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 3: Terminal 1 - Gazebo Simulation World
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 3/5] Starting Terminal 1: Gazebo Simulation World...
start "Terminal 1: Gazebo 3D Simulation" cmd /k "color 0A && echo =================================================== && echo   TERMINAL 1: GAZEBO 3D SIMULATION WORLD && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && export TURTLEBOT3_MODEL=burger && roslaunch turtlebot3_gazebo turtlebot3_world.launch\""

echo   [WAIT] Waiting 8 seconds for Gazebo physics and roscore to initialize...
timeout /t 8 /nobreak >nul

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 4: Terminal 2 - Navigation Stack, 2D RViz View, and ROSBridge
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 4/5] Starting Terminal 2: Navigation Stack, 2D RViz, and ROSBridge...
start "Terminal 2: Navigation & 2D RViz" cmd /k "color 0B && echo =================================================== && echo   TERMINAL 2: NAVIGATION STACK, 2D RVIZ, ROSBRIDGE && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && export TURTLEBOT3_MODEL=burger && (roslaunch autonav navigation_with_bridge.launch || roslaunch turtlebot3_navigation turtlebot3_navigation.launch map_file:=/opt/ros/noetic/share/turtlebot3_navigation/maps/map.yaml)\""

echo   [WAIT] Waiting 12 seconds for AMCL localization and costmaps to initialize...
timeout /t 12 /nobreak >nul

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 5: Terminal 3 & 4 - Pose Sync & Autonomous Goal
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 5/5] Launching Synchronized AMCL Initialization and Goal Navigation...

:: Terminal 3: AMCL Initial Pose Synchronization
start "Terminal 3: AMCL Localization Sync" cmd /k "color 0E && echo =================================================== && echo   TERMINAL 3: AMCL LOCALIZATION SYNCHRONIZATION && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav init_pose.py\""

echo   [WAIT] Waiting 4 seconds for AMCL particle cloud to converge...
timeout /t 4 /nobreak >nul

:: Terminal 4: Autonomous Goal Pose Action Client
start "Terminal 4: Autonomous Goal Navigation" cmd /k "color 0D && echo =================================================== && echo   TERMINAL 4: AUTONOMOUS GOAL ACTION CLIENT && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav goal_pose.py\""

echo.
echo =====================================================================
echo   ALL 4 TERMINALS AND 3D BROWSER VIEW ARE NOW SYNCHRONIZED!
echo.
echo   - Browser Window: 3D Simulator (FPV Eye View and Chase Cam)
echo   - Terminal 1: Gazebo Simulation World (3D Physics)
echo   - Terminal 2: Navigation Stack and RViz (2D Map and Costmaps)
echo   - Terminal 3: AMCL Initial Pose Synchronizer
echo   - Terminal 4: Autonomous Goal Dispatcher (Streaming Coordinates)
echo =====================================================================
echo.
pause
