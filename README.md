# Autonomous Navigation & 3D Simulator for TurtleBot 3 (Burger) in ROS 1 (Melodic / Noetic)

[![ROS 1](https://img.shields.io/badge/ROS-Melodic%20%7C%20Noetic-brightgreen.svg)](http://wiki.ros.org/)
[![Robot](https://img.shields.io/badge/Robot-TurtleBot3%20Burger-blue.svg)](https://emanual.robotis.com/docs/en/platform/turtlebot3/overview/)
[![Simulation](https://img.shields.io/badge/Simulation-Gazebo%20%7C%20Three.js-orange.svg)](http://gazebosim.org/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

An end-to-end autonomous navigation package (`autonav`) and **interactive 3D WebGL simulator** designed for ROS 1 (compatible with both Ubuntu 18.04 Melodic and Ubuntu 20.04 Noetic). This project demonstrates how to programmatically control and navigate a **TurtleBot 3 Burger** mobile robot inside a simulated Gazebo environment using AMCL localization and the ROS `move_base` action server pipeline, as well as view and interact with the robot in **3D first-person perspective (FPV)** directly inside your web browser.

---

## Table of Contents
1. [What is This Project?](#what-is-this-project)
2. [3D Web Simulator & Robot Perspectives (FPV)](#3d-web-simulator--robot-perspectives-fpv)
   - [Camera Perspectives](#camera-perspectives)
   - [How to Run the 3D Simulator](#how-to-run-the-3d-simulator)
   - [Live Synchronization with ROS](#live-synchronization-with-ros)
3. [Why Do We Need It?](#why-do-we-need-it)
   - [The Problem with Manual Navigation (RViz)](#the-problem-with-manual-navigation-rviz)
   - [Why Synchronize Odometry and AMCL (`init_pose.py`)?](#why-synchronize-odometry-and-amcl-init_posepy)
   - [Why Use an Action Client (`goal_pose.py`)?](#why-use-an-action-client-goal_posepy)
4. [System Architecture & Data Flow](#system-architecture--data-flow)
5. [Package Structure](#package-structure)
6. [Script Deep-Dive](#script-deep-dive)
   - [`init_pose.py`](#init_posepy-overview)
   - [`goal_pose.py`](#goal_posepy-overview)
7. [Prerequisites & System Requirements](#prerequisites--system-requirements)
8. [Installation & Build Guide](#installation--build-guide)
9. [Step-by-Step Execution Walkthrough](#step-by-step-execution-walkthrough)
10. [Action Server Status Codes Reference](#action-server-status-codes-reference)
11. [Troubleshooting & Common Pitfalls](#troubleshooting--common-pitfalls)

---

## What is This Project?

This repository contains two interconnected components:
1. **The `autonav` ROS Package:** Programmatic scripts written in Python (`rospy`) to:
   - Synchronize robot localization in AMCL using simulated ground-truth odometry from Gazebo (`init_pose.py`).
   - Command the robot to navigate to target coordinates (`x=2.0`, `y=0.5`, `w=1.0`) by interfacing with the `move_base` action server (`goal_pose.py`).
   - Monitor navigation lifecycle in real time through active notifications, throttled feedback coordinates, and status code verification (`status == 3` for SUCCEEDED).
2. **The 3D Web Simulator (`simulator/`):** A zero-install WebGL simulator running directly in any modern browser (Chrome, Edge, Firefox) on Windows or Linux, rendering the TurtleBot3 Burger in 3D with a **first-person perspective (FPV)**, differential-drive physics, 360° LiDAR, and click-on-floor autonomous path planning.

---

## 3D Web Simulator & Robot Perspectives (FPV)

While RViz provides a 2D top-down occupancy grid, the included **3D Web Simulator** allows you to visualize and drive the TurtleBot 3 in full 3D with authentic physics, dynamic lighting, and multiple camera angles.

### Camera Perspectives

| Mode | Shortcut | Description |
|:---|:---:|:---|
| **👁️ Robot First-Person View (FPV)** | `1` | Camera is mounted at the front eye of TurtleBot 3, looking forward into the world with a reticle crosshair. Experience exactly what the robot "sees" as it drives. |
| **🎥 Follow / Chase Cam** | `2` | Smooth cinematic over-the-shoulder third-person camera trailing behind the robot. |
| **🌐 Free Orbit View** | `3` | 360° free rotation, panning, and zooming around the arena using the mouse. |
| **🗺️ Top-Down Map View** | `4` | High-altitude aerial orthographic-style projection showing the full coordinate grid. |
| **🖼️ Picture-in-Picture (PiP)** | Click PiP | A live video-style feed in the bottom-right corner showing the alternate perspective (FPV). **Click the PiP window to instantly promote FPV to full screen!** |

### How to Run the 3D Simulator

#### Option A: One-Click Windows Launcher (Easiest)
Double-click **`run_simulator.bat`** in the repository root. This automatically spins up a local web server and opens the 3D simulator in your default browser.

#### Option B: Python Command Line
```bash
python -m http.server 8000 --directory simulator
```
Then visit **[http://localhost:8000](http://localhost:8000)** in your browser.

#### Option C: Direct File Opening
Double-click `simulator/index.html` to open directly in Chrome, Edge, or Firefox.

### Simulator Features:
* **Interactive Floor Click Goal:** Click anywhere on the 3D arena floor to dispatch a target waypoint; the simulated robot plans an obstacle-clearing path and navigates to the target.
* **Keyboard Teleoperation:** Drive manually with `W`, `A`, `S`, `D` or Arrow keys; press `Space` to brake.
* **360° LiDAR Scan Points:** Real-time distance raycasting against the 9 pillars and walls.
* **Telemetry HUD:** Live readouts of $X, Y$, Heading Yaw ($\theta$), Linear Velocity ($v$), and Angular Velocity ($\omega$).

### Live Synchronization with ROS

You can connect the 3D Web Simulator directly to your running Gazebo simulation:
1. In your ROS (Docker / WSL / Linux) terminal, launch the ROSBridge server:
   ```bash
   roslaunch autonav web_telemetry.launch
   ```
2. In the 3D Simulator web panel, turn on the toggle: **Connect Live to ROS (WebSocket)**.
3. The 3D robot in your browser will mirror the physical/Gazebo TurtleBot3 movement in real-time!

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
       │                                                                   │
       │ /odom (actual pose)                                               │ /odom, /cmd_vel
       ▼                                                                   ▼
+-----------------------+                                         +-----------------------+
|     init_pose.py      |                                         |  3D Web Simulator     |
|  - One-shot /odom sub |                                         |  - Three.js / WebGL   |
|  - Frame: 'map'       |                                         |  - Robot FPV Cam (1)  |
|  - Pub: /initialpose  |                                         |  - Chase Cam (2)      |
+-----------------------+                                         |  - Orbit Cam (3)      |
       │                                                          |  - Picture-in-Picture |
       │ /initialpose                                             |  - Click-to-Goal      |
       ▼                                                          +-----------------------+
+-----------------------+                                                     ▲
|  AMCL (Localization)  |                                                     │ (Optional)
|  - Aligns particles   |                                                     │ WebSocket
|  - TF: map -> odom    |                                                     │ Port 9090
+-----------------------+                                                     │
       ▲                                                          +-----------------------+
       │ localization                                             |  rosbridge_websocket  |
       ▼                                                          |  (web_telemetry)      |
+-----------------------------------------------------------------+-----------------------+
|                                      goal_pose.py                                       |
|  - SimpleActionClient for 'move_base'                                                    |
|  - Constructs MoveBaseGoal (x=2.0, y=0.5, w=1.0) in 'map' frame                         |
|  - Registers: active_callback, feedback_callback, done_callback (status == 3 check)     |
|  - Implements on_shutdown cancel hook to halt robot on Ctrl+C                           |
+-----------------------------------------------------------------------------------------+
                                          │
           /move_base/goal                │  /move_base/feedback & /move_base/result
                                          ▼
+-----------------------------------------------------------------------------------------+
|                                       move_base                                         |
|  - Global Planner (NavFn / Global Planner): Computes path on Global Costmap             |
|  - Local Planner (DWA / Trajectory Rollout): Computes velocity commands (/cmd_vel)      |
|  - Costmaps: Obstacle Layer, Inflation Layer                                            |
|  - Recovery Behaviors: Rotate in place, clear costmaps                                  |
+-----------------------------------------------------------------------------------------+
                                          │
                                          │ /cmd_vel (geometry_msgs/Twist)
                                          ▼
                                    TurtleBot 3 Moves
```

---

## Package Structure

```
Robotics ESE/
├── run_simulator.bat                   # Windows 1-click launcher for the 3D Web Simulator
├── simulator/                          # 3D WebGL Simulation Engine (Three.js)
│   ├── index.html                      # Complete 3D dashboard interface with WebGL canvas
│   ├── README.md                       # Simulator usage and control reference
│   ├── css/
│   │   └── style.css                   # Glassmorphism dark-mode UI & PiP styling
│   └── js/
│       ├── app.js                      # Main controller, camera manager (FPV, Chase, Orbit)
│       ├── turtlebot3.js               # Procedural 3D TurtleBot3 Burger model & animations
│       ├── world.js                    # turtlebot3_world 3D layout (9 pillars, walls, grid)
│       ├── kinematics.js               # Differential drive physics & 360° LiDAR raycasting
│       ├── navigator.js                # Autonomous pathfinder (move_base behavior)
│       └── ros_bridge.js               # roslibjs WebSocket connector for live ROS telemetry
├── catkin_ws/
│   └── src/
│       └── autonav/
│           ├── CMakeLists.txt          # Catkin build configuration, scripts & launch install
│           ├── package.xml             # Package metadata and ROS dependencies
│           ├── launch/
│           │   ├── autonav.launch      # Launch file to run goal_pose with custom coordinates
│           │   ├── init_pose.launch    # Launch file for init_pose node
│           │   └── web_telemetry.launch # ROSBridge WebSocket server for the 3D simulator
│           ├── scripts/
│           │   ├── init_pose.py        # Node 1: AMCL synchronization node (executable)
│           │   └── goal_pose.py        # Node 2: Navigation action client node (executable)
│           └── README.md               # Package documentation
└── README.md                           # Master repository documentation
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

- **Operating System:** Ubuntu 18.04 LTS (for ROS Melodic), Ubuntu 20.04 LTS (for ROS Noetic), or Docker container on Windows/WSL
- **Web Browser:** Chrome, Edge, Firefox, or Safari (WebGL enabled)
- **TurtleBot3 Packages (Linux):**
  ```bash
  # For ROS Noetic (Ubuntu 20.04 / Docker):
  sudo apt-get update
  sudo apt-get install -y ros-noetic-turtlebot3 ros-noetic-turtlebot3-msgs ros-noetic-turtlebot3-simulations ros-noetic-navigation ros-noetic-rosbridge-server python-is-python3

  # For ROS Melodic (Ubuntu 18.04):
  sudo apt-get update
  sudo apt-get install -y ros-melodic-turtlebot3 ros-melodic-turtlebot3-msgs ros-melodic-turtlebot3-simulations ros-melodic-navigation ros-melodic-rosbridge-server
  ```

---

## Installation & Build Guide

### Step 1: Set Robot Model
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

```bash
cd ~/catkin_ws
catkin_make
source devel/setup.bash
```

---

## Step-by-Step Execution Walkthrough

Follow this sequence across your terminals:

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
|  $ source ~/catkin_ws/devel/setup.bash                                   |
|  $ rosrun autonav init_pose.py                                           |
+--------------------------------------------------------------------------+
                                    │ (Wait for confirmation log)
                                    ▼
+--------------------------------------------------------------------------+
|  TERMINAL 4: Dispatch Navigation Goal via goal_pose                      |
|  $ source ~/catkin_ws/devel/setup.bash                                   |
|  $ rosrun autonav goal_pose.py                                           |
+--------------------------------------------------------------------------+
```

### Passing Custom Target Coordinates:
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

### 4. Running the 3D Simulator on Windows
- If Python is installed, simply double-click `run_simulator.bat`.
- Alternatively, opening `simulator/index.html` directly in your browser provides full standalone simulation and perspective switching with zero setup.

---

## Authors & Maintenance
Developed as a modular autonomous navigation template and 3D visualizer for TurtleBot3 ROS 1 (Melodic / Noetic).
Licensed under the [MIT License](LICENSE).
