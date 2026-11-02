# autonav ROS Package

Autonomous Navigation Package and 3D Web Visualizer for TurtleBot 3 (Burger) in ROS 1 (Melodic / Noetic).

See the root [README.md](../../../README.md) for full project architecture, 3D simulator perspectives, and theoretical foundations.

### Quick Run
```bash
# 1. Grant execution permissions
chmod +x scripts/init_pose.py scripts/goal_pose.py

# 2. Build in catkin workspace
cd ~/catkin_ws
catkin_make
source devel/setup.bash

# 3. Synchronize initial pose with AMCL
rosrun autonav init_pose.py

# 4. Dispatch autonomous navigation goal
rosrun autonav goal_pose.py
# or with coordinates: rosrun autonav goal_pose.py 2.0 0.5 1.0

# 5. Optional: Stream live telemetry to the 3D Web Simulator
roslaunch autonav web_telemetry.launch
```
