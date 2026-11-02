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
:: STEP 2: Non-Blocking Fast ROS Environment Detection
:: ─────────────────────────────────────────────────────────────────────────
echo.
echo [STEP 2/5] Detecting ROS Noetic Environment...

set TB_STATUS=
set TB_MODE=
set TB_CID=
set TB_DOCKER_EXE=

:: Run fast non-blocking python probe (timeout protected, will NEVER freeze)
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=1,2 delims==" %%a in ('python "%~dp0detect_env.py"') do (
        set TB_%%a=%%b
    )
)

if "!TB_STATUS!"=="RUNNING" goto CONTAINER_FOUND
if "!TB_STATUS!"=="STOPPED" goto CONTAINER_STOPPED
if "!TB_STATUS!"=="NO_CONTAINER" goto SPAWN_CONTAINER

:: Docker is not responding or not currently running
echo   [NOTICE] Docker Desktop daemon is not currently active or responsive.
echo.
echo   ---------------------------------------------------------------------
echo   Please select execution mode (Auto-selecting [1] in 5 seconds):
echo   ---------------------------------------------------------------------
echo     [1] Start Docker Desktop and wait for ROS container (Recommended)
echo     [2] Enter an active Container ID or Name manually
echo     [3] Launch all 4 Terminals via WSL / Ubuntu (Linux Native)
echo     [4] Open 4 Terminal windows pre-configured with ROS commands
echo     [5] Continue in 3D Web Simulator Standalone Mode (Browser Only)
echo   ---------------------------------------------------------------------
echo.

choice /C 12345 /T 5 /D 1 /M "Select option (1-5)"
set CHOICE_VAL=%ERRORLEVEL%

if "%CHOICE_VAL%"=="1" goto START_DOCKER_DESKTOP
if "%CHOICE_VAL%"=="2" goto MANUAL_CONTAINER_ID
if "%CHOICE_VAL%"=="3" goto LAUNCH_WSL_TERMINALS
if "%CHOICE_VAL%"=="4" goto LAUNCH_CMD_TERMINALS
if "%CHOICE_VAL%"=="5" goto STANDALONE_MODE

:: ─────────────────────────────────────────────────────────────────────────
:: Option 1: Start Docker Desktop and Poll Daemon
:: ─────────────────────────────────────────────────────────────────────────
:START_DOCKER_DESKTOP
if not "!TB_DOCKER_EXE!"=="" (
    if exist "!TB_DOCKER_EXE!" (
        echo   [INFO] Starting Docker Desktop from: !TB_DOCKER_EXE!...
        start "" "!TB_DOCKER_EXE!"
    )
) else (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" 2>nul
)

echo   [WAIT] Waiting for Docker daemon to initialize (checking up to 30s)...
set /a ATTEMPTS=0

:WAIT_DOCKER_LOOP
timeout /t 3 /nobreak >nul
set /a ATTEMPTS+=1

for /f "tokens=1,2 delims==" %%a in ('python "%~dp0detect_env.py"') do (
    set TB_%%a=%%b
)

if "!TB_STATUS!"=="RUNNING" goto CONTAINER_FOUND
if "!TB_STATUS!"=="STOPPED" goto CONTAINER_STOPPED
if "!TB_STATUS!"=="NO_CONTAINER" goto SPAWN_CONTAINER

if !ATTEMPTS! lss 10 (
    echo   [WAIT] Still waiting for Docker engine (!ATTEMPTS!/10)...
    goto WAIT_DOCKER_LOOP
)

echo.
echo   [WARNING] Docker Desktop took longer than 30s to initialize.
echo   Falling back to opening pre-configured terminal windows...
goto LAUNCH_CMD_TERMINALS

:: ─────────────────────────────────────────────────────────────────────────
:: Option 2: Manual Container ID
:: ─────────────────────────────────────────────────────────────────────────
:MANUAL_CONTAINER_ID
echo.
set /p USER_CID="Enter Container ID or Name: "
if "%USER_CID%"=="" goto STANDALONE_MODE
set CID=%USER_CID%
set DEXEC=docker exec -it !CID!
set DEXEC_BG=docker exec !CID!
goto COMPILE_AND_LAUNCH

:: ─────────────────────────────────────────────────────────────────────────
:: Flow: Resume Stopped Container
:: ─────────────────────────────────────────────────────────────────────────
:CONTAINER_STOPPED
set CID=!TB_CID!
echo   [INFO] Starting existing container !CID!...
if "!TB_MODE!"=="WSL" (
    wsl -e docker start !CID! >nul 2>&1
    set DEXEC=wsl -e docker exec -it !CID!
    set DEXEC_BG=wsl -e docker exec !CID!
) else (
    docker start !CID! >nul 2>&1
    set DEXEC=docker exec -it !CID!
    set DEXEC_BG=docker exec !CID!
)
goto COMPILE_AND_LAUNCH

:: ─────────────────────────────────────────────────────────────────────────
:: Flow: Spawn New ROS Container
:: ─────────────────────────────────────────────────────────────────────────
:SPAWN_CONTAINER
echo   [INFO] Spawning new ROS Noetic container (turtlebot3_sim)...
docker run -d --name turtlebot3_sim --net=host -e DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix:rw -v "%~dp0catkin_ws:/root/catkin_ws" osrf/ros:noetic-desktop-full tail -f /dev/null >nul 2>&1
set CID=turtlebot3_sim
set DEXEC=docker exec -it !CID!
set DEXEC_BG=docker exec !CID!
goto COMPILE_AND_LAUNCH

:: ─────────────────────────────────────────────────────────────────────────
:: Flow: Connected Container Found
:: ─────────────────────────────────────────────────────────────────────────
:CONTAINER_FOUND
set CID=!TB_CID!
echo   [OK] Connected to running ROS container: !CID!
if "!TB_MODE!"=="WSL" (
    set DEXEC=wsl -e docker exec -it !CID!
    set DEXEC_BG=wsl -e docker exec !CID!
) else (
    set DEXEC=docker exec -it !CID!
    set DEXEC_BG=docker exec !CID!
)
goto COMPILE_AND_LAUNCH

:: ─────────────────────────────────────────────────────────────────────────
:: Build Catkin Workspace and Launch Terminals (Docker Mode)
:: ─────────────────────────────────────────────────────────────────────────
:COMPILE_AND_LAUNCH
echo   [INFO] Verifying Catkin workspace inside container...
!DEXEC_BG! bash -c "source /opt/ros/noetic/setup.bash && [ -f /root/catkin_ws/devel/setup.bash ] || (cd /root/catkin_ws && catkin_make)" >nul 2>&1

:: Terminal 1: Gazebo Simulation World
echo.
echo [STEP 3/5] Starting Terminal 1: Gazebo Simulation World...
start "Terminal 1: Gazebo 3D Simulation" cmd /k "color 0A && echo =================================================== && echo   TERMINAL 1: GAZEBO 3D SIMULATION WORLD && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && export TURTLEBOT3_MODEL=burger && roslaunch turtlebot3_gazebo turtlebot3_world.launch\""

echo   [WAIT] Waiting 8 seconds for Gazebo physics and roscore to initialize...
timeout /t 8 /nobreak >nul

:: Terminal 2: Navigation Stack, 2D RViz View, and ROSBridge
echo.
echo [STEP 4/5] Starting Terminal 2: Navigation Stack, 2D RViz, and ROSBridge...
start "Terminal 2: Navigation and 2D RViz" cmd /k "color 0B && echo =================================================== && echo   TERMINAL 2: NAVIGATION STACK, 2D RVIZ, ROSBRIDGE && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && export TURTLEBOT3_MODEL=burger && (roslaunch autonav navigation_with_bridge.launch || roslaunch turtlebot3_navigation turtlebot3_navigation.launch map_file:=/opt/ros/noetic/share/turtlebot3_navigation/maps/map.yaml)\""

echo   [WAIT] Waiting 12 seconds for AMCL localization and costmaps to initialize...
timeout /t 12 /nobreak >nul

:: Step 5: Terminals 3 and 4
echo.
echo [STEP 5/5] Launching Synchronized AMCL Initialization and Goal Navigation...

:: Terminal 3: AMCL Initial Pose Synchronization
start "Terminal 3: AMCL Localization Sync" cmd /k "color 0E && echo =================================================== && echo   TERMINAL 3: AMCL LOCALIZATION SYNCHRONIZATION && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav init_pose.py\""

echo   [WAIT] Waiting 4 seconds for AMCL particle cloud to converge...
timeout /t 4 /nobreak >nul

:: Terminal 4: Autonomous Goal Pose Action Client
start "Terminal 4: Autonomous Goal Navigation" cmd /k "color 0D && echo =================================================== && echo   TERMINAL 4: AUTONOMOUS GOAL ACTION CLIENT && echo =================================================== && !DEXEC! bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav goal_pose.py\""

goto LAUNCH_SUCCESS

:: ─────────────────────────────────────────────────────────────────────────
:: Option 3: Launch Native WSL / Ubuntu Terminals
:: ─────────────────────────────────────────────────────────────────────────
:LAUNCH_WSL_TERMINALS
echo.
echo [STEP 3/5] Starting Terminal 1: Gazebo Simulation World in WSL...
start "Terminal 1: Gazebo (WSL)" wsl -e bash -c "source /opt/ros/noetic/setup.bash && export TURTLEBOT3_MODEL=burger && roslaunch turtlebot3_gazebo turtlebot3_world.launch"

echo   [WAIT] Waiting 8 seconds for Gazebo physics and roscore to initialize...
timeout /t 8 /nobreak >nul

echo.
echo [STEP 4/5] Starting Terminal 2: Navigation Stack and RViz in WSL...
start "Terminal 2: Navigation and RViz (WSL)" wsl -e bash -c "source /opt/ros/noetic/setup.bash && source ~/catkin_ws/devel/setup.bash 2>/dev/null || source /root/catkin_ws/devel/setup.bash 2>/dev/null; export TURTLEBOT3_MODEL=burger && roslaunch autonav navigation_with_bridge.launch"

echo   [WAIT] Waiting 12 seconds for AMCL localization and costmaps to initialize...
timeout /t 12 /nobreak >nul

echo.
echo [STEP 5/5] Launching Terminal 3 and 4 in WSL...
start "Terminal 3: AMCL Localization Sync (WSL)" wsl -e bash -c "source /opt/ros/noetic/setup.bash && source ~/catkin_ws/devel/setup.bash 2>/dev/null || source /root/catkin_ws/devel/setup.bash 2>/dev/null; rosrun autonav init_pose.py"

timeout /t 4 /nobreak >nul
start "Terminal 4: Autonomous Goal Action Client (WSL)" wsl -e bash -c "source /opt/ros/noetic/setup.bash && source ~/catkin_ws/devel/setup.bash 2>/dev/null || source /root/catkin_ws/devel/setup.bash 2>/dev/null; rosrun autonav goal_pose.py"

goto LAUNCH_SUCCESS

:: ─────────────────────────────────────────────────────────────────────────
:: Option 4: Launch Pre-Configured Command Windows
:: ─────────────────────────────────────────────────────────────────────────
:LAUNCH_CMD_TERMINALS
echo.
echo [INFO] Spawning 4 pre-configured terminal windows...

start "Terminal 1: Gazebo Simulation" cmd /k "color 0A && echo =================================================== && echo   TERMINAL 1: GAZEBO 3D SIMULATION && echo   Command: docker exec -it $(docker ps -q -l) bash -c \"source /opt/ros/noetic/setup.bash && export TURTLEBOT3_MODEL=burger && roslaunch turtlebot3_gazebo turtlebot3_world.launch\" && echo ==================================================="

start "Terminal 2: Navigation & RViz" cmd /k "color 0B && echo =================================================== && echo   TERMINAL 2: NAVIGATION STACK, 2D RVIZ, ROSBRIDGE && echo   Command: docker exec -it $(docker ps -q -l) bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && export TURTLEBOT3_MODEL=burger && roslaunch autonav navigation_with_bridge.launch\" && echo ==================================================="

start "Terminal 3: AMCL Sync" cmd /k "color 0E && echo =================================================== && echo   TERMINAL 3: AMCL LOCALIZATION SYNCHRONIZATION && echo   Command: docker exec -it $(docker ps -q -l) bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav init_pose.py\" && echo ==================================================="

start "Terminal 4: Goal Dispatcher" cmd /k "color 0D && echo =================================================== && echo   TERMINAL 4: AUTONOMOUS GOAL ACTION CLIENT && echo   Command: docker exec -it $(docker ps -q -l) bash -c \"source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav goal_pose.py\" && echo ==================================================="

goto LAUNCH_SUCCESS

:: ─────────────────────────────────────────────────────────────────────────
:: Success Notification
:: ─────────────────────────────────────────────────────────────────────────
:LAUNCH_SUCCESS
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
exit /b

:: ─────────────────────────────────────────────────────────────────────────
:: Standalone Mode
:: ─────────────────────────────────────────────────────────────────────────
:STANDALONE_MODE
echo.
echo   [OK] 3D Web Simulator is running at http://localhost:8000
echo   Use WASD to drive or click on the arena to set autonomous nav goals.
echo.
pause
exit /b
