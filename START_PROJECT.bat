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
echo [STEP 1/5] Starting 3D Web Simulator & FPV Visualizer...

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    start "TurtleBot 3 - Local Web Server" /min cmd /c "python -m http.server 8000 --directory \"%~dp0simulator\""
    start "" "http://localhost:8000"
    echo   [OK] 3D Simulator launched on http://localhost:8000
) else (
    start "" "%~dp0simulator\index.html"
    echo   [OK] 3D Simulator opened directly in default browser
)

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 2: Detect or Start ROS Docker Container
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 2/5] Connecting to ROS Noetic Environment...

set CID=
:: Check for already running ROS Noetic container
for /f "tokens=1" %%c in ('docker ps -q --filter "ancestor=osrf/ros:noetic-desktop-full" 2^>nul') do set CID=%%c

if "%CID%"=="" (
    :: Check if container named turtlebot3_sim exists stopped
    for /f "tokens=1" %%c in ('docker ps -a -q --filter "name=turtlebot3_sim" 2^>nul') do set CID=%%c
    if not "!CID!"=="" (
        echo   [INFO] Starting existing container 'turtlebot3_sim'...
        docker start turtlebot3_sim >nul 2>&1
    )
)

if "%CID%"=="" (
    :: Check if any docker container exists
    for /f "tokens=1" %%c in ('docker ps -q 2^>nul') do set CID=%%c
)

if "%CID%"=="" (
    :: Spawn new container
    echo   [INFO] Spawning new ROS Noetic container (turtlebot3_sim)...
    for /f "tokens=*" %%i in ('docker run -d --name turtlebot3_sim --net=host -e DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix:rw -v "%CD%\catkin_ws:/root/catkin_ws" osrf/ros:noetic-desktop-full tail -f /dev/null 2^>nul') do set CID=%%i
)

if "%CID%"=="" (
    echo.
    echo   [WARNING] Docker is not running or not responding.
    echo   If you are running ROS natively inside WSL, open WSL and run:
    echo     cd ~/catkin_ws ^&^& catkin_make ^&^& source devel/setup.bash
    echo.
    echo   The 3D Web Simulator is running in your browser in Standalone Mode.
    pause
    exit /b
)

echo   [OK] Connected to Container: !CID!

:: Ensure workspace is built and dependencies are ready
echo   [INFO] Ensuring Catkin workspace is built inside container...
docker exec !CID! bash -c "source /opt/ros/noetic/setup.bash && cd /root/catkin_ws && catkin_make >/dev/null 2>&1" >nul 2>&1

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 3: Terminal 1 - Gazebo Simulation World (3D Physics)
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 3/5] Starting Terminal 1: Gazebo Simulation World...
start "Terminal 1: Gazebo 3D Simulation" cmd /k "color 0A && echo =================================================== && echo   TERMINAL 1: GAZEBO 3D SIMULATION WORLD && echo =================================================== && docker exec -it !CID! bash -c \"source /opt/ros/noetic/setup.bash && export TURTLEBOT3_MODEL=burger && roslaunch turtlebot3_gazebo turtlebot3_world.launch\""

echo   [WAIT] Waiting 8 seconds for Gazebo physics and roscore to initialize...
timeout /t 8 /nobreak >nul

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 4: Terminal 2 - Navigation Stack, 2D RViz View, and ROSBridge
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 4/5] Starting Terminal 2: Navigation Stack, 2D RViz, and ROSBridge...
start "Terminal 2: Navigation & 2D RViz" cmd /k "color 0B && echo =================================================== && echo   TERMINAL 2: NAVIGATION STACK, 2D RVIZ, ROSBRIDGE && echo =================================================== && docker exec -it !CID! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && export TURTLEBOT3_MODEL=burger && (roslaunch autonav navigation_with_bridge.launch || roslaunch turtlebot3_navigation turtlebot3_navigation.launch map_file:=/opt/ros/noetic/share/turtlebot3_navigation/maps/map.yaml)\""

echo   [WAIT] Waiting 12 seconds for AMCL localization and costmaps to initialize...
timeout /t 12 /nobreak >nul

:: ─────────────────────────────────────────────────────────────────────────
:: STEP 5: Terminal 3 & 4 - Pose Sync & Autonomous Goal
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 5/5] Launching Synchronized AMCL Initialization and Goal Navigation...

:: Terminal 3: AMCL Initial Pose Synchronization
start "Terminal 3: AMCL Localization Sync" cmd /k "color 0E && echo =================================================== && echo   TERMINAL 3: AMCL LOCALIZATION SYNCHRONIZATION && echo =================================================== && docker exec -it !CID! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav init_pose.py\""

echo   [WAIT] Waiting 4 seconds for AMCL particle cloud to converge...
timeout /t 4 /nobreak >nul

:: Terminal 4: Autonomous Goal Pose Action Client
start "Terminal 4: Autonomous Goal Navigation" cmd /k "color 0D && echo =================================================== && echo   TERMINAL 4: AUTONOMOUS GOAL ACTION CLIENT && echo =================================================== && docker exec -it !CID! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav goal_pose.py\""

echo.
echo =====================================================================
echo   ALL 4 TERMINALS AND 3D BROWSER VIEW ARE NOW SYNCHRONIZED!
echo.
echo   - Browser Window: 3D Simulator (FPV Eye View ^& Chase Cam)
echo   - Terminal 1: Gazebo Simulation World (3D Physics)
echo   - Terminal 2: Navigation Stack ^& RViz (2D Map ^& Costmaps)
echo   - Terminal 3: AMCL Initial Pose Synchronizer (Done)
echo   - Terminal 4: Autonomous Goal Dispatcher (Streaming Live Coordinates)
echo =====================================================================
echo.
pause
