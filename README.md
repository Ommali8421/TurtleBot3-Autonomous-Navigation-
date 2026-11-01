# Autonomous Navigation for TurtleBot 3 (Burger) in ROS 1 (Melodic / Noetic)

[![ROS 1](https://img.shields.io/badge/ROS-Melodic%20%7C%20Noetic-brightgreen.svg)](http://wiki.ros.org/)
[![Robot](https://img.shields.io/badge/Robot-TurtleBot3%20Burger-blue.svg)](https://emanual.robotis.com/docs/en/platform/turtlebot3/overview/)
[![Simulation](https://img.shields.io/badge/Simulation-Gazebo-orange.svg)](http://gazebosim.org/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

An end-to-end autonomous navigation package (`autonav`) designed for ROS 1 (compatible with both Ubuntu 18.04 Melodic and Ubuntu 20.04 Noetic). This project demonstrates how to programmatically control and navigate a **TurtleBot 3 Burger** mobile robot inside a simulated Gazebo environment using AMCL localization and the ROS `move_base` action server pipeline.

---

## Table of Contents
1. [What is This Project?](#what-is-this-project)
2. [Why Do We Need It?](#why-do-we-need-it)
   - [The Problem with Manual Navigation (RViz)](#the-problem-with-manual-navigation-rviz)
   - [Why Synchronize Odometry and AMCL (`init_pose.py`)?](#why-synchronize-odometry-and-amcl-init_posepy)
   - [Why Use an Action Client (`goal_pose.py`)?](#why-use-an-action-client-goal_posepy)
3. [System Architecture & Data Flow](#system-architecture--data-flow)
4. [Package Structure](#package-structure)
5. [Script Deep-Dive](#script-deep-dive)
   - [`init_pose.py`](#init_posepy-overview)
   - [`goal_pose.py`](#goal_posepy-overview)
6. [Prerequisites & System Requirements](#prerequisites--system-requirements)
7. [Installation & Build Guide](#installation--build-guide)
8. [Step-by-Step Execution Walkthrough](#step-by-step-execution-walkthrough)
9. [Action Server Status Codes Reference](#action-server-status-codes-reference)
10. [Troubleshooting & Common Pitfalls](#troubleshooting--common-pitfalls)

---

## What is This Project?

This repository contains the `autonav` ROS package. It provides autonomous programmatic scripts written in Python (`rospy`) to:
1. **Initialize and synchronize robot localization** in AMCL (Adaptive Monte Carlo Localization) using simulated ground-truth odometry from Gazebo (`init_pose.py`).
2. **Command the robot to navigate to target coordinates** (`x=2.0`, `y=0.5`, `w=1.0`) by interfacing with the `move_base` action server (`goal_pose.py`).
3. **Monitor navigation lifecycle in real time** through active notifications, throttled feedback coordinates, and terminal status verification (specifically checking for status code `3` for success).

---

## Why Do We Need It?

In robotics education, industrial automation, and fleet deployment, relying on human operators clicking buttons in a graphical user interface (like RViz's "2D Pose Estimate" or "2D Nav Goal") is impractical.

### 1. The Problem with Manual Navigation (RViz)
- **Non-Automated:** Real-world robotic platforms (e.g., warehouse robots, inspection drones, automated vacuum cleaners) must execute missions scheduled via software APIs, mission planners, or database triggers without human intervention.
- **Human Error:** Clicking an initial pose or target goal in RViz is inaccurate, imprecise, and non-repeatable.
- **No Status Feedback in Code:** RViz gives visual feedback, but backend algorithms cannot query whether a goal succeeded, timed out, or got blocked without subscribing to programmatic ROS actions.

### 2. Why Synchronize Odometry and AMCL (`init_pose.py`)?
- When Gazebo spawns a robot, the physics simulator places it at an exact position (e.g., $x=-2.0, y=-0.5$).
- However, when the navigation stack launches AMCL, AMCL has **no prior knowledge** of where the robot is in the pre-built map. AMCL either spreads a uniform cloud of thousands of particles across the entire map or defaults to $(0,0,0)$.
- This mismatch leads to the infamous **"Kidnapped Robot Problem"** where the laser scans do not match the expected map, preventing global and local planners from generating valid costmaps.
- `init_pose.py` queries `/odom` once, grabs the physical position and orientation from Gazebo, and publishes it with an appropriate covariance to `/initialpose`. This instantly converges the AMCL particle cloud onto the robot's true location.

### 3. Why Use an Action Client (`goal_pose.py`)?
- Standard ROS topics are fire-and-forget; standard ROS services are blocking and lack progress updates.
- Navigation can take seconds or minutes and might encounter obstacles or fail along the way.
- The ROS **ActionLib** paradigm provides:
  - **Asynchronous Execution:** Send a goal and continue running other routines.
  - **Periodic Feedback:** Receive continuous robot coordinates (`feedback_callback`).
  - **Preemption / Cancellation:** Abort or re-plan if a dynamic obstacle blocks the way.
  - **Deterministic Result Codes:** Distinct status codes (e.g., `3 = SUCCEEDED`, `4 = ABORTED`, `2 = PREEMPTED`) enabling automated recovery behaviors.

---

## System Architecture & Data Flow

```
+-----------------------------------------------------------------------------------------+
|                                    GAZEBO SIMULATOR                                     |
|  - Spawns TurtleBot3 Burger in 3D physics environment                                    |
|  - Publishes: /odom (nav_msgs/Odometry), /scan (sensor_msgs/LaserScan), /tf             |
+-----------------------------------------------------------------------------------------+
                                          |
                                          | /odom (actual pose)
                                          v
+-----------------------------------------------------------------------------------------+
|                                      init_pose.py                                       |
|  - One-shot subscription to /odom                                                       |
|  - Constructs PoseWithCovarianceStamped in 'map' frame                                  |
|  - Publishes to /initialpose (latched + multi-publish)                                  |
+-----------------------------------------------------------------------------------------+
                                          |
                                          | /initialpose
                                          v
+-----------------------------------------------------------------------------------------+
|                                 AMCL (Localization)                                     |
|  - Aligns particle cloud with robot's true pose                                         |
|  - Maintains /tf transform: map -> odom                                                 |
+-----------------------------------------------------------------------------------------+
                                          ^
                                          | localization update
                                          v
+-----------------------------------------------------------------------------------------+
|                                      goal_pose.py                                       |
|  - SimpleActionClient for 'move_base'                                                    |
|  - Constructs MoveBaseGoal (x=2.0, y=0.5, w=1.0) in 'map' frame                         |
|  - Registers: active_callback, feedback_callback, done_callback (status == 3 check)     |
|  - Implements on_shutdown cancel hook to halt robot on Ctrl+C                           |
+-----------------------------------------------------------------------------------------+
                                          |
           /move_base/goal                |  /move_base/feedback & /move_base/result
                                          v
+-----------------------------------------------------------------------------------------+
|                                       move_base                                         |
|  - Global Planner (NavFn / Global Planner): Computes path on Global Costmap             |
|  - Local Planner (DWA / Trajectory Rollout): Computes velocity commands (/cmd_vel)      |
|  - Costmaps: Obstacle Layer, Inflation Layer                                            |
|  - Recovery Behaviors: Rotate in place, clear costmaps                                  |
+-----------------------------------------------------------------------------------------+
                                          |
                                          | /cmd_vel (geometry_msgs/Twist)
                                          v
                                    TurtleBot 3 Moves
```

---

## Package Structure

```
catkin_ws/
└── src/
    └── autonav/
        ├── CMakeLists.txt              # Catkin build configuration, scripts and launch install
        ├── package.xml                 # Package metadata and ROS dependencies
        ├── launch/
        │   ├── autonav.launch          # Launch file to run goal_pose with custom coordinates
        │   └── init_pose.launch        # Launch file for init_pose node
        ├── scripts/
        │   ├── init_pose.py            # Node 1: AMCL synchronization node (executable)
        │   └── goal_pose.py            # Node 2: Navigation action client node (executable)
        └── README.md                   # Package documentation
```

---

## Script Deep-Dive

### `init_pose.py` Overview
Located at: `catkin_ws/src/autonav/scripts/init_pose.py`

Key Responsibilities:
1. **Node Initialization:** Calls `rospy.init_node('init_pose')`.
2. **Robust Odometry Listener:** Waits for `/odom` in a responsive loop with progress indicators, preventing timeouts if Gazebo takes time to load.
3. **Frame Definition:** Assigns `header.frame_id = "map"` to match AMCL requirements.
4. **Covariance Matrix:** Sets variance values along diagonal axes:
   - $Var(x) = 0.25$
   - $Var(y) = 0.25$
   - $Var(\theta) = 0.068\text{ rad}^2$
   This conveys high certainty to AMCL's filter.
5. **Connection Verification:** Checks `init_pose_pub.get_num_connections()` to ensure AMCL is actively listening, publishes latched messages with updated timestamps, and allows a brief buffer flush before closing.

### `goal_pose.py` Overview
Located at: `catkin_ws/src/autonav/scripts/goal_pose.py`

Key Responsibilities:
1. **Node Initialization:** Calls `rospy.init_node('goal_pose')`.
2. **Action Client Setup:** Initializes `actionlib.SimpleActionClient('move_base', MoveBaseAction)`.
3. **Responsive Server Wait:** Connects to `move_base` action server without hanging on `Ctrl+C`.
4. **Shutdown Safety Hook:** Automatically cancels any in-flight navigation goal on shutdown (`rospy.on_shutdown(self.cancel_goal)`), preventing the robot from colliding with obstacles if the script is stopped.
5. **Target Construction:** Builds a `MoveBaseGoal`:
   - `target_pose.header.frame_id = "map"`
   - Position: `x = 2.0`, `y = 0.5`, `z = 0.0`
   - Orientation: `w = 1.0` (with non-zero validation)
   *(Supports CLI arguments `x y w`, ROS launch arguments, and private ROS parameters `~goal_x`, `~goal_y`, `~goal_w`)*.
6. **Callback Handling:**
   - **`active_callback()`**: Logs confirmation when `move_base` transitions goal state to active.
   - **`feedback_callback(feedback)`**: Extracts current `(x, y)` position and throttles output to once every 2 seconds.
   - **`done_callback(status, result)`**: Translates `actionlib_msgs/GoalStatus` codes into human-readable descriptions, specifically asserting whether `status == 3` (SUCCEEDED).

---

## Prerequisites & System Requirements

- **Operating System:** Ubuntu 18.04 LTS (for ROS Melodic) OR Ubuntu 20.04 LTS (for ROS Noetic)
- **ROS Version:** ROS Melodic Morenia or ROS Noetic Ninjemys (Desktop-Full install recommended)
- **TurtleBot3 Packages:**
  ```bash
  # For ROS Noetic (Ubuntu 20.04):
  sudo apt-get update
  sudo apt-get install ros-noetic-turtlebot3 ros-noetic-turtlebot3-msgs ros-noetic-turtlebot3-simulations ros-noetic-navigation python-is-python3

  # For ROS Melodic (Ubuntu 18.04):
  sudo apt-get update
  sudo apt-get install ros-melodic-turtlebot3 ros-melodic-turtlebot3-msgs ros-melodic-turtlebot3-simulations ros-melodic-navigation
  ```

---

## Installation & Build Guide

### Step 1: Open Terminal and Set Robot Model
Add the TurtleBot3 model definition to your environment:
```bash
export TURTLEBOT3_MODEL=burger
# To make this permanent across terminal sessions:
echo "export TURTLEBOT3_MODEL=burger" >> ~/.bashrc
```

### Step 2: Make Scripts Executable
Navigate into the `scripts` directory and grant execution permissions:
```bash
cd ~/catkin_ws/src/autonav/scripts
chmod +x init_pose.py goal_pose.py
```

### Step 3: Build the Workspace
Return to the root of your catkin workspace and build:

**Using `catkin_make`:**
```bash
cd ~/catkin_ws
catkin_make
source devel/setup.bash
```

**OR Using `catkin build` (if `catkin-tools` is installed):**
```bash
cd ~/catkin_ws
catkin build autonav
source devel/setup.bash
```

---

## Step-by-Step Execution Walkthrough

Follow this sequence across **4 separate terminals** (ensure each terminal sources your workspace: `source ~/catkin_ws/devel/setup.bash`):

```
+--------------------------------------------------------------------------+
|  TERMINAL 1: Launch Gazebo Simulation World                              |
|  $ export TURTLEBOT3_MODEL=burger                                        |
|  $ roslaunch turtlebot3_gazebo turtlebot3_world.launch                   |
+--------------------------------------------------------------------------+
                                    │ (Wait until Gazebo loads)
                                    ▼
+--------------------------------------------------------------------------+
|  TERMINAL 2: Launch Navigation Stack (AMCL + move_base + RViz)           |
|  $ export TURTLEBOT3_MODEL=burger                                        |
|  $ roslaunch turtlebot3_navigation turtlebot3_navigation.launch \        |
|      map_file:=$(rospack find turtlebot3_navigation)/maps/map.yaml       |
+--------------------------------------------------------------------------+
                                    │ (Wait until RViz opens)
                                    ▼
+--------------------------------------------------------------------------+
|  TERMINAL 3: Synchronize AMCL with Reality via init_pose                 |
|  $ rosrun autonav init_pose.py                                           |
+--------------------------------------------------------------------------+
                                    │ (Wait for confirmation log)
                                    ▼
+--------------------------------------------------------------------------+
|  TERMINAL 4: Dispatch Navigation Goal via goal_pose                      |
|  $ rosrun autonav goal_pose.py                                           |
+--------------------------------------------------------------------------+
```

### Detailed Commands:

#### Terminal 1: Launch Gazebo Simulation
```bash
export TURTLEBOT3_MODEL=burger
roslaunch turtlebot3_gazebo turtlebot3_world.launch
```
*Gazebo will launch with the TurtleBot3 Burger in the standard TurtleBot3 world environment.*

#### Terminal 2: Launch TurtleBot3 Navigation Stack & RViz
```bash
export TURTLEBOT3_MODEL=burger
roslaunch turtlebot3_navigation turtlebot3_navigation.launch map_file:=$(rospack find turtlebot3_navigation)/maps/map.yaml
```
*This launches AMCL, the global/local costmaps, `move_base`, and RViz with the navigation configuration.*

#### Terminal 3: Run `init_pose.py`
```bash
source ~/catkin_ws/devel/setup.bash
rosrun autonav init_pose.py
```
**Expected Console Output:**
```
[INFO] [init_pose] Node initialized. Waiting for /odom to retrieve robot pose...
[INFO] [init_pose] Successfully received initial odometry from /odom.
[INFO] [init_pose] Synchronizing AMCL initial pose:
[INFO]              Position:    (x=-2.000, y=-0.500, z=0.000)
[INFO]              Orientation: (x=0.000, y=0.000, z=0.000, w=1.000)
[INFO] [init_pose] Waiting for subscribers on /initialpose...
[INFO] [init_pose] Initial pose successfully published to /initialpose!
[INFO] [init_pose] AMCL localization synchronization complete.
```
*In RViz, you will see the green AMCL particle cloud snap directly around the robot.*

#### Terminal 4: Run `goal_pose.py`
```bash
source ~/catkin_ws/devel/setup.bash
rosrun autonav goal_pose.py
```
**Expected Console Output:**
```
[INFO] [goal_pose] Initializing goal_pose node...
[INFO] [goal_pose] Waiting for 'move_base' action server to start...
[INFO] [goal_pose] Successfully connected to 'move_base' action server.
============================================================
[INFO] [goal_pose] Sending target goal:
[INFO]              Frame:       map
[INFO]              Target (x,y): (2.00, 0.50)
[INFO]              Orientation: w=1.00
============================================================
[INFO] [goal_pose] [ACTIVE CALLBACK] Goal has been received and is currently being processed by move_base.
[INFO] [goal_pose] [FEEDBACK] Current Robot Position: (x=-1.85, y=-0.48)
[INFO] [goal_pose] [FEEDBACK] Current Robot Position: (x=-1.20, y=-0.30)
...
[INFO] [goal_pose] [FEEDBACK] Current Robot Position: (x=1.92, y=0.49)
============================================================
[INFO] [goal_pose] [DONE CALLBACK] Status 3: SUCCEEDED (Goal target successfully reached!)
[INFO] [goal_pose] SUCCESS: TurtleBot3 has reached the navigation goal!
============================================================
```

#### Passing Custom Coordinates:
You can pass custom goal coordinates using three different methods:
1. **Direct CLI Arguments:**
   ```bash
   rosrun autonav goal_pose.py 1.5 -0.5 1.0
   ```
2. **ROS Launch Arguments:**
   ```bash
   roslaunch autonav autonav.launch goal_x:=1.5 goal_y:=-0.5 goal_w:=1.0
   ```
3. **ROS Parameters:**
   ```bash
   rosrun autonav goal_pose.py _goal_x:=1.5 _goal_y:=-0.5 _goal_w:=1.0
   ```

---

## Action Server Status Codes Reference

The `done_callback` in `goal_pose.py` intercepts `actionlib_msgs/GoalStatus` enumeration values:

| Status Code | Enum Name | Description |
|:-----------:|:---------:|:------------|
| **0** | `PENDING` | The goal has been sent but has not yet been processed by the action server. |
| **1** | `ACTIVE` | The goal is currently being processed by `move_base`. |
| **2** | `PREEMPTED` | The goal received a cancel request or was superseded by a new goal. |
| **3** | `SUCCEEDED` | **The goal was successfully reached by the robot within tolerance limits.** |
| **4** | `ABORTED` | The goal was aborted because no valid trajectory or global plan could be found. |
| **5** | `REJECTED` | The action server rejected the goal because it was malformed or unreachable. |
| **6** | `PREEMPTING` | Cancellation has been requested and is currently in progress. |
| **7** | `RECALLING` | The goal was recalled before it became active. |
| **8** | `RECALLED` | The goal was successfully recalled. |
| **9** | `LOST` | The connection to the action server was terminated unexpectedly. |

---

## Troubleshooting & Common Pitfalls

### 1. Robot Doesn't Move / Goal Aborted (Status 4)
- **Cause:** Target coordinates $(x=2.0, y=0.5)$ might fall inside a wall or obstacle inflation zone in your specific map.
- **Solution:** Check the map in RViz. Adjust the goal to an open area (e.g., `rosrun autonav goal_pose.py 1.0 0.0 1.0`).

### 2. AMCL Particles Do Not Converge
- **Cause:** `init_pose.py` was executed before AMCL finished launching its ROS subscriber on `/initialpose`.
- **Solution:** `init_pose.py` includes a connection check (`init_pose_pub.get_num_connections()`). If needed, rerun `rosrun autonav init_pose.py` once RViz is fully loaded.

### 3. Action Server Timeout / Transform Warnings
- **Cause:** The `move_base` node is not running or failed to launch due to missing costmap configuration files.
- **Solution:** Verify Terminal 2 has no red errors. Ensure `export TURTLEBOT3_MODEL=burger` is set in the terminal launching the navigation stack.

### 4. `env: 'python3\r': No such file or directory` (Windows Line Endings)
- **Cause:** If files were edited on a Windows host and copied to a Linux VM, CRLF line endings may cause bash execution failures.
- **Solution:** Both scripts are saved with pure UNIX LF line endings. If modified in Windows, convert them inside Linux:
  ```bash
  dos2unix catkin_ws/src/autonav/scripts/*.py
  ```

---

## Authors & Maintenance
Developed as a modular autonomous navigation template for TurtleBot3 ROS 1 (Melodic / Noetic).
Licensed under the [MIT License](LICENSE).
