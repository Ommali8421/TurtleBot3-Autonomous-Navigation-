@echo off
setlocal enabledelayedexpansion
title TurtleBot 3 Burger - Set Robot Location
color 0E

echo =====================================================================
echo           TURTLEBOT 3 BURGER - RELOCATE ROBOT POSE
echo     Synchronizes Gazebo Physics + RViz AMCL Localization + Costmaps
echo =====================================================================
echo.

REM Read arguments if passed via CLI: SET_LOCATION.bat <X> <Y> [YAW_DEG]
set TARGET_X=%1
set TARGET_Y=%2
set TARGET_YAW=%3

if "%TARGET_X%"=="" (
    echo Enter target coordinates for TurtleBot3:
    echo (Press ENTER to use default spawn location: X=-2.0, Y=-0.5, Yaw=0)
    echo.
    set /p "TARGET_X=  Target X (meters, e.g. -2.0): "
    if "!TARGET_X!"=="" set TARGET_X=-2.0
)

if "%TARGET_Y%"=="" (
    set /p "TARGET_Y=  Target Y (meters, e.g. -0.5): "
    if "!TARGET_Y!"=="" set TARGET_Y=-0.5
)

if "%TARGET_YAW%"=="" (
    set /p "TARGET_YAW=  Target Yaw (degrees, e.g. 0 or 90): "
    if "!TARGET_YAW!"=="" set TARGET_YAW=0.0
)

echo.
echo [INFO] Relocating robot to: X=!TARGET_X!, Y=!TARGET_Y!, Yaw=!TARGET_YAW! deg
echo.

REM Detect Docker Environment
set TB_STATUS=
set TB_MODE=
set TB_CID=

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=1,2 delims==" %%a in ('python "%~dp0detect_env.py"') do (
        set TB_%%a=%%b
    )
)

if "!TB_STATUS!"=="RUNNING" (
    set CID=!TB_CID!
    echo [OK] Connected to running ROS container: !CID!
    if "!TB_MODE!"=="WSL" (
        wsl -e docker exec -it !CID! bash -c "source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav set_pose.py !TARGET_X! !TARGET_Y! !TARGET_YAW!"
    ) else (
        docker exec -it !CID! bash -c "source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav set_pose.py !TARGET_X! !TARGET_Y! !TARGET_YAW!"
    )
    goto DONE
)

REM If not auto-detected, try standard container name turtlebot3_sim
echo [INFO] Attempting execution in container 'turtlebot3_sim'...
docker exec -it turtlebot3_sim bash -c "source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav set_pose.py !TARGET_X! !TARGET_Y! !TARGET_YAW!" 2>nul
if %ERRORLEVEL% equ 0 goto DONE

REM Try WSL directly
echo [INFO] Attempting execution via WSL...
wsl -e bash -c "source /opt/ros/noetic/setup.bash && source ~/catkin_ws/devel/setup.bash 2>/dev/null || source /root/catkin_ws/devel/setup.bash 2>/dev/null; rosrun autonav set_pose.py !TARGET_X! !TARGET_Y! !TARGET_YAW!" 2>nul
if %ERRORLEVEL% equ 0 goto DONE

echo.
echo [ERROR] Could not reach ROS container or WSL.
echo If container is running, execute directly inside bash:
echo   docker exec -it turtlebot3_sim bash -c "source /opt/ros/noetic/setup.bash && source /root/catkin_ws/devel/setup.bash && rosrun autonav set_pose.py !TARGET_X! !TARGET_Y! !TARGET_YAW!"
echo.

:DONE
echo.
echo Press any key to close...
pause >nul
