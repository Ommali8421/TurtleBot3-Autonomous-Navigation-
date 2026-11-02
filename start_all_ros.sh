#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Master Linux / WSL / Docker Synchronized Launcher
# Launches all 4 ROS navigation nodes in synchronized order
# ═══════════════════════════════════════════════════════════════

set -e

echo "====================================================================="
echo "       TURTLEBOT 3 BURGER - MASTER SYNCHRONIZED ROS LAUNCHER"
echo "====================================================================="

# Check if running natively with ROS Noetic installed, or from outside container
if [ ! -f "/opt/ros/noetic/setup.bash" ]; then
    echo "[INFO] ROS Noetic was not found on this host (Ubuntu 22.04)."
    echo "[INFO] ROS Noetic runs inside the Docker container (osrf/ros:noetic-desktop-full)."
    echo ""

    if command -v docker >/dev/null 2>&1; then
        echo "[INFO] Attempting to connect to ROS Docker container..."
        # Try exec into existing running container
        if docker ps -q --filter "name=turtlebot3_sim" | grep -q .; then
            echo "[OK] Found running 'turtlebot3_sim' container. Running launcher inside..."
            exec docker exec -it turtlebot3_sim bash /root/catkin_ws/start_all_ros.sh
        fi

        # Try starting stopped container
        if docker ps -a -q --filter "name=turtlebot3_sim" | grep -q .; then
            echo "[INFO] Starting stopped 'turtlebot3_sim' container..."
            docker start turtlebot3_sim >/dev/null 2>&1
            exec docker exec -it turtlebot3_sim bash /root/catkin_ws/start_all_ros.sh
        fi

        # Spawn new container
        echo "[INFO] Starting new container 'turtlebot3_sim'..."
        exec docker run -it --net=host -e DISPLAY -v /tmp/.X11-unix:/tmp/.X11-unix:rw -v "$PWD/catkin_ws:/root/catkin_ws" --name turtlebot3_sim osrf/ros:noetic-desktop-full bash /root/catkin_ws/start_all_ros.sh
    else
        echo "[ERROR] Docker is not reachable. Please start Docker Desktop on Windows!"
        exit 1
    fi
fi

# Inside ROS Noetic environment
source /opt/ros/noetic/setup.bash
export TURTLEBOT3_MODEL=burger

if [ -f "/root/catkin_ws/devel/setup.bash" ]; then
    source /root/catkin_ws/devel/setup.bash
elif [ -f "$HOME/catkin_ws/devel/setup.bash" ]; then
    source "$HOME/catkin_ws/devel/setup.bash"
elif [ -f "./catkin_ws/devel/setup.bash" ]; then
    source "./catkin_ws/devel/setup.bash"
fi

echo ""
echo "[1/4] Launching Terminal 1: Gazebo Simulation World..."
roslaunch turtlebot3_gazebo turtlebot3_world.launch &
GAZEBO_PID=$!

echo "[WAIT] Waiting 8 seconds for Gazebo physics and roscore..."
sleep 8

echo ""
echo "[2/4] Launching Terminal 2: Navigation Stack, 2D RViz View, and ROSBridge..."
(roslaunch autonav navigation_with_bridge.launch || roslaunch turtlebot3_navigation turtlebot3_navigation.launch map_file:=/opt/ros/noetic/share/turtlebot3_navigation/maps/map.yaml) &
NAV_PID=$!

echo "[WAIT] Waiting 12 seconds for AMCL localization and costmaps..."
sleep 12

echo ""
echo "[3/4] Launching Terminal 3: AMCL Pose Synchronizer (init_pose.py)..."
rosrun autonav init_pose.py

echo "[WAIT] Waiting 4 seconds for particle cloud convergence..."
sleep 4

echo ""
echo "[4/4] Launching Terminal 4: Autonomous Navigation Goal (goal_pose.py)..."
rosrun autonav goal_pose.py

# Keep session alive
wait $NAV_PID
