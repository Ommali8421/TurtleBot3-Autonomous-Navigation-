# autonav ROS Package

Autonomous Navigation Package for TurtleBot 3 (Burger) in ROS 1 (Melodic / Noetic) using AMCL and move_base Action Client.

See the root [README.md](../../../README.md) for full project architecture, theoretical foundations, and walkthrough guide.

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

# 4. Dispatch autonomous navigation goal (with optional custom coordinates)
rosrun autonav goal_pose.py
# or: rosrun autonav goal_pose.py 2.0 0.5 1.0
```
