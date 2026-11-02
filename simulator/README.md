# TurtleBot 3 Burger - 3D Web Simulator & Visualizer

A zero-install, real-time 3D simulation of the **TurtleBot 3 (Burger)** mobile robot in the Gazebo `turtlebot3_world` environment. Built using Three.js and WebGL.

---

## Key Features

1. **Multiple Camera Perspectives:**
   - **👁️ Robot First-Person View (FPV):** Mounts the camera at the front eye of the TurtleBot 3, showing the world exactly as seen from the robot's onboard perspective.
   - **🎥 Follow / Chase Cam:** Dynamic third-person camera trailing smoothly behind the robot.
   - **🌐 Free Orbit View:** 360° mouse rotation, panning, and zoom around the entire arena.
   - **🗺️ Top-Down Map View:** Aerial orthographic-style projection showing the full coordinate grid.
2. **Picture-in-Picture (PiP) Display:**
   - Live corner viewport continuously streaming the alternative camera perspective (FPV by default).
   - **Click the PiP window** to swap perspectives instantly!
3. **Differential Drive Kinematics & Physics:**
   - Non-holonomic unicycle motion model ($\dot{x} = v \cos\theta, \dot{y} = v \sin\theta, \dot{\theta} = \omega$).
   - Collision detection with the 9 cylindrical pillars and boundary walls.
   - Dual drive wheel rotation and spinning LDS-01 LiDAR sensor turret.
4. **Autonomous Navigation (move_base behavior):**
   - Click anywhere on the floor arena to dispatch a navigation goal.
   - Computes obstacle-clearing waypoints and turns smoothly to align with target orientation.
   - Dispatches `Status 3: SUCCEEDED` upon arrival.
5. **360° Raycast LiDAR Scanner:**
   - Projects simulated laser distance points onto obstacles and walls.
6. **Optional Live ROS Bridge:**
   - Toggle WebSocket connection (`ws://localhost:9090`) via `rosbridge_server` to mirror your real Gazebo / ROS Noetic robot live in your Windows browser!

---

## How to Run

### Method 1: One-Click Windows Launcher
Double-click **`run_simulator.bat`** in the repository root. It launches a local web server and opens the simulator in your default browser.

### Method 2: Python Command Line
From the repository root:
```bash
python -m http.server 8000 --directory simulator
```
Then open your browser to **[http://localhost:8000](http://localhost:8000)**.

### Method 3: Direct File Open
Double-click `simulator/index.html` to open directly in Chrome, Edge, or Firefox.

---

## Controls Reference

| Control | Action |
|:---|:---|
| **`W` / `↑`** | Drive Forward |
| **`S` / `↓`** | Drive Backward |
| **`A` / `←`** | Turn Left |
| **`D` / `→`** | Turn Right |
| **`SPACE`** | Emergency Brake |
| **`1`** | Switch to **Robot FPV (Eye Perspective)** |
| **`2`** | Switch to **Follow / Chase Cam** |
| **`3`** | Switch to **Free Orbit Cam** (drag with mouse to rotate) |
| **`4`** | Switch to **Top-Down Map View** |
| **Click Floor** | Dispatch 2D Navigation Goal to coordinates |
| **Click PiP Window** | Swap main camera and Picture-in-Picture view |

---

## Live Synchronization with ROS 1 (Melodic / Noetic)

If you are running Gazebo or the ROS navigation stack in Docker/WSL:

1. Inside your ROS environment, install and run `rosbridge_server`:
   ```bash
   sudo apt-get install ros-noetic-rosbridge-server
   roslaunch rosbridge_server rosbridge_websocket.launch
   ```
   *(Or run `roslaunch autonav web_telemetry.launch`)*
2. In the 3D simulator web interface, enable the toggle: **Connect Live to ROS (WebSocket)**.
3. The 3D robot in your browser will now mirror the real Gazebo robot in real-time!
