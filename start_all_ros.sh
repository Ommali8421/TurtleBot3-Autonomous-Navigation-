#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Master Linux / WSL / Docker Synchronized Launcher
# Launches all 4 ROS navigation nodes in synchronized order
# ═══════════════════════════════════════════════════════════════

set -e

echo "====================================================================="
echo "       TURTLEBOT 3 BURGER - MASTER SYNCHRONIZED ROS LAUNCHER"
echo "====================================================================="

# Ensure environment
source /opt/ros/noetic/setup.bash
export TURTLEBOT3_MODEL=burger

if [ -f "/root/catkin_ws/devel/setup.bash" ]; then
    source /root/catkin_ws/devel/setup.bash
elif [ -f "$HOME/catkin_ws/devel/setup.bash" ]; then
    source "$HOME/catkin_ws/devel/setup.bash"
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
