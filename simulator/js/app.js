/**
 * Main Application Controller & Camera Perspective Manager
 * - Manages dual WebGL rendering: Main Viewport + Picture-in-Picture (PiP)
 * - Implements 4 camera modes:
 *     1. Robot First-Person View (FPV) - onboard eye perspective
 *     2. Follow / Chase Camera - smooth over-the-shoulder tracking
 *     3. Free Orbit Camera - 360° mouse rotation, pan, zoom
 *     4. Top-Down Camera - aerial 2D/3D map projection
 * - PiP Swap mechanism: click PiP mini-window to promote FPV to full screen
 * - Teleoperation, autonomous path navigation, and live HUD updates
 */

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.pipContainer = document.getElementById('pip-container');
    this.pipCanvas = document.getElementById('pip-canvas');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);
    this.scene.fog = new THREE.FogExp2(0x0a0e17, 0.04);

    // Clock
    this.clock = new THREE.Clock();

    // 1. Setup Renderers (Main + PiP)
    this.initRenderers();

    // 2. Setup Cameras
    this.activeCameraMode = 'follow'; // 'fpv', 'follow', 'orbit', 'topdown'
    this.initCameras();

    // 3. Build 3D Simulation World & TurtleBot 3 Model
    this.world = new World(this.scene);
    this.turtlebot = new TurtleBot3(this.scene);
    this.kinematics = new Kinematics(this.world, this.scene);
    this.navigator = new Navigator(this.kinematics, this.world, this.scene);
    this.rosBridge = new ROSBridge();

    // 4. Initial Pose (matching Gazebo spawn: x=-2.0, y=-0.5, yaw=0.0)
    this.turtlebot.setPose(this.kinematics.x, this.kinematics.y, this.kinematics.yaw);

    // 5. Interactive Raycaster (Click-to-Goal)
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // 6. Bind UI Controls & Events
    this.bindUI();

    // 7. Start Animation Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    console.log('[App] TurtleBot 3 3D Simulator initialized successfully.');
  }

  initRenderers() {
    // Main Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // PiP Renderer (Separate canvas in corner)
    this.pipRenderer = new THREE.WebGLRenderer({ canvas: this.pipCanvas, antialias: true });
    this.pipRenderer.setSize(this.pipContainer.clientWidth, this.pipContainer.clientHeight);
    this.pipRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.pipRenderer.shadowMap.enabled = true;

    // Resize listener
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.orbitCam.aspect = width / height;
      this.orbitCam.updateProjectionMatrix();

      this.followCam.aspect = width / height;
      this.followCam.updateProjectionMatrix();

      this.fpvCam.aspect = width / height;
      this.fpvCam.updateProjectionMatrix();

      this.topDownCam.aspect = width / height;
      this.topDownCam.updateProjectionMatrix();

      this.renderer.setSize(width, height);
      this.pipRenderer.setSize(this.pipContainer.clientWidth, this.pipContainer.clientHeight);
    });
  }

  initCameras() {
    const aspect = window.innerWidth / window.innerHeight;

    // 1. Free Orbit Camera
    this.orbitCam = new THREE.PerspectiveCamera(60, aspect, 0.1, 50);
    this.orbitCam.position.set(-2.5, 2.5, 3.2);

    this.controls = new THREE.OrbitControls(this.orbitCam, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't dip below floor
    this.controls.target.set(-1.0, 0.2, 0.5);

    // 2. Follow / Chase Camera
    this.followCam = new THREE.PerspectiveCamera(60, aspect, 0.1, 50);

    // 3. Robot First-Person Perspective (FPV)
    this.fpvCam = new THREE.PerspectiveCamera(75, aspect, 0.05, 50);

    // 4. Top-Down Orthographic/Perspective Map Camera
    this.topDownCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 50);
    this.topDownCam.position.set(0, 6.0, 0);
    this.topDownCam.lookAt(0, 0, 0);

    // PiP Camera reference
    this.pipCam = new THREE.PerspectiveCamera(75, this.pipContainer.clientWidth / this.pipContainer.clientHeight, 0.05, 50);
  }

  setCameraMode(mode) {
    this.activeCameraMode = mode;

    // Update active class on toolbar buttons
    document.querySelectorAll('.cam-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn-cam-' + mode);
    if (activeBtn) activeBtn.classList.add('active');

    // Controls enable only in orbit mode
    this.controls.enabled = (mode === 'orbit');

    // Crosshair visibility (visible only in full FPV mode)
    const crosshair = document.getElementById('fpv-crosshair');
    if (crosshair) crosshair.style.display = (mode === 'fpv') ? 'block' : 'none';

    // Update PiP badge label
    const pipBadgeText = document.getElementById('pip-label-text');
    if (pipBadgeText) {
      pipBadgeText.textContent = (mode === 'fpv') ? 'CHASE CAM' : 'ROBOT FPV';
    }
  }

  updateCameras(dt) {
    const robotPos = this.turtlebot.group.position; // Three.js position (x, y, z)
    const yaw = this.kinematics.yaw;

    // Forward direction in Three.js (Three.js yaw rotates around Y axis)
    // When yaw=0, robot faces along +X: (cos(yaw), 0, -sin(yaw))
    const forwardX = Math.cos(yaw);
    const forwardZ = -Math.sin(yaw);

    // ─── 1. Update FPV Camera (Robot Onboard Eye Perspective) ───
    const eyeY = 0.145; // Height of LiDAR/onboard camera
    const eyePos = new THREE.Vector3(
      robotPos.x + forwardX * 0.09,
      eyeY,
      robotPos.z + forwardZ * 0.09
    );
    this.fpvCam.position.copy(eyePos);
    this.fpvCam.lookAt(
      eyePos.x + forwardX * 2.0,
      eyeY - 0.02,
      eyePos.z + forwardZ * 2.0
    );

    // ─── 2. Update Follow / Chase Camera ───
    const followDist = 0.85; // Distance behind
    const followHeight = 0.40; // Height above
    const targetFollowPos = new THREE.Vector3(
      robotPos.x - forwardX * followDist,
      followHeight,
      robotPos.z - forwardZ * followDist
    );

    // Smooth Lerp for cinematic chase cam
    this.followCam.position.lerp(targetFollowPos, Math.min(1.0, dt * 10.0));
    this.followCam.lookAt(robotPos.x + forwardX * 0.2, 0.12, robotPos.z + forwardZ * 0.2);

    // ─── 3. Top-Down Camera tracking ───
    if (this.activeCameraMode === 'topdown') {
      this.topDownCam.position.set(0, 6.2, 0);
      this.topDownCam.lookAt(0, 0, 0);
    }
  }

  bindUI() {
    // 1. Camera toolbar buttons
    document.getElementById('btn-cam-fpv').addEventListener('click', () => this.setCameraMode('fpv'));
    document.getElementById('btn-cam-follow').addEventListener('click', () => this.setCameraMode('follow'));
    document.getElementById('btn-cam-orbit').addEventListener('click', () => this.setCameraMode('orbit'));
    document.getElementById('btn-cam-topdown').addEventListener('click', () => this.setCameraMode('topdown'));

    // Keyboard shortcuts [1], [2], [3], [4]
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return; // Don't trigger when typing in inputs
      if (e.key === '1') this.setCameraMode('fpv');
      else if (e.key === '2') this.setCameraMode('follow');
      else if (e.key === '3') this.setCameraMode('orbit');
      else if (e.key === '4') this.setCameraMode('topdown');
    });

    // 2. PiP Viewport Click-to-Swap
    this.pipContainer.addEventListener('click', () => {
      if (this.activeCameraMode === 'fpv') {
        this.setCameraMode('follow');
      } else {
        this.setCameraMode('fpv');
      }
    });

    // 3. Dispatch Target Goal Button
    document.getElementById('btn-send-goal').addEventListener('click', () => {
      const gx = parseFloat(document.getElementById('input-goal-x').value);
      const gy = parseFloat(document.getElementById('input-goal-y').value);
      const gw = parseFloat(document.getElementById('input-goal-w').value);

      if (!isNaN(gx) && !isNaN(gy) && !isNaN(gw)) {
        this.navigator.sendGoal(gx, gy, gw);
        if (this.rosBridge.connected) {
          this.rosBridge.sendGoal(gx, gy, gw);
        }
      }
    });

    // 4. Cancel Goal Button
    document.getElementById('btn-cancel-goal').addEventListener('click', () => {
      this.navigator.cancelGoal();
    });

    // 5. Reset Robot to Spawn Button
    document.getElementById('btn-reset-pose').addEventListener('click', () => {
      this.navigator.cancelGoal();
      this.kinematics.setPose(-2.0, -0.5, 0.0);
      this.turtlebot.setPose(-2.0, -0.5, 0.0);
    });

    // 6. Quick Waypoint Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const x = parseFloat(chip.dataset.x);
        const y = parseFloat(chip.dataset.y);
        const w = parseFloat(chip.dataset.w || 1.0);

        document.getElementById('input-goal-x').value = x;
        document.getElementById('input-goal-y').value = y;
        document.getElementById('input-goal-w').value = w;

        this.navigator.sendGoal(x, y, w);
        if (this.rosBridge.connected) {
          this.rosBridge.sendGoal(x, y, w);
        }
      });
    });

    // 7. Click on Floor to Set Goal (Raycasting)
    this.container.addEventListener('pointerdown', (e) => {
      // Only set goal on Left Click and when not dragging Orbit controls
      if (e.button !== 0) return;

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      const activeCam = this.getActiveCamera();
      this.raycaster.setFromCamera(this.mouse, activeCam);

      const intersectionPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.floorPlane, intersectionPoint)) {
        // Map coords: (x, y) = (intersection.x, -intersection.z)
        const mapX = Math.round(intersectionPoint.x * 100) / 100;
        const mapY = Math.round(-intersectionPoint.z * 100) / 100;

        // Check if within arena bounds
        if (Math.abs(mapX) <= 2.3 && Math.abs(mapY) <= 2.3) {
          document.getElementById('input-goal-x').value = mapX;
          document.getElementById('input-goal-y').value = mapY;

          this.navigator.sendGoal(mapX, mapY, 1.0);
          if (this.rosBridge.connected) {
            this.rosBridge.sendGoal(mapX, mapY, 1.0);
          }
        }
      }
    });

    // 8. LiDAR Toggle Switch
    const lidarSwitch = document.getElementById('switch-lidar');
    if (lidarSwitch) {
      lidarSwitch.addEventListener('change', (e) => {
        this.kinematics.lidarEnabled = e.target.checked;
        this.kinematics.lidarPointCloud.visible = e.target.checked;
      });
    }

    // 9. ROS Bridge Toggle Switch
    const rosSwitch = document.getElementById('switch-ros');
    if (rosSwitch) {
      rosSwitch.addEventListener('change', (e) => {
        if (e.target.checked) {
          const url = document.getElementById('input-ros-url').value;
          this.rosBridge.connect(url);
        } else {
          this.rosBridge.disconnect();
        }
      });

      // Auto-connect on page load
      if (rosSwitch.checked) {
        const url = document.getElementById('input-ros-url').value;
        this.rosBridge.connect(url);
      }
    }

    // ROS Bridge callbacks
    this.rosBridge.onConnectionChange = (connected, msg) => {
      const badge = document.getElementById('ros-status-badge');
      if (badge) {
        badge.textContent = connected ? 'ROS CONNECTED' : 'STANDALONE';
        badge.className = connected ? 'status-pill green' : 'status-pill';
      }
    };

    this.rosBridge.onOdomReceived = (x, y, yaw) => {
      // Mirror physical Gazebo position
      this.kinematics.setPose(x, y, yaw);
    };

    // Navigator status callbacks
    this.navigator.onStatusChange = (state, message) => {
      const badge = document.getElementById('nav-badge');
      if (badge) {
        badge.textContent = state;
        badge.className = 'nav-state-badge ' + state.toLowerCase();
      }
      const bannerMsg = document.getElementById('nav-status-desc');
      if (bannerMsg) {
        bannerMsg.textContent = message;
      }
    };
  }

  getActiveCamera() {
    switch (this.activeCameraMode) {
      case 'fpv': return this.fpvCam;
      case 'follow': return this.followCam;
      case 'topdown': return this.topDownCam;
      case 'orbit':
      default: return this.orbitCam;
    }
  }

  getPiPCamera() {
    // If main view is FPV, PiP shows Chase Follow Cam.
    // If main view is Follow, Orbit, or TopDown, PiP shows Robot FPV.
    if (this.activeCameraMode === 'fpv') {
      return this.followCam;
    } else {
      return this.fpvCam;
    }
  }

  updateHUD() {
    // Coordinate & Telemetry Displays
    const xEl = document.getElementById('telem-x');
    const yEl = document.getElementById('telem-y');
    const yawEl = document.getElementById('telem-yaw');
    const vEl = document.getElementById('telem-v');
    const wEl = document.getElementById('telem-w');

    if (xEl) xEl.textContent = this.kinematics.x.toFixed(2);
    if (yEl) yEl.textContent = this.kinematics.y.toFixed(2);

    if (yawEl) {
      const deg = Math.round(this.kinematics.yaw * (180 / Math.PI));
      yawEl.textContent = deg + '° (' + this.kinematics.yaw.toFixed(2) + ' rad)';
    }

    if (vEl) vEl.textContent = this.kinematics.linearVel.toFixed(2) + ' m/s';
    if (wEl) wEl.textContent = this.kinematics.angularVel.toFixed(2) + ' rad/s';
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    // 1. Update Autonomous Navigator (controls cmdLinear & cmdAngular if ACTIVE)
    this.navigator.update(dt);

    // 2. Step Physics & Kinematics
    const isAutonomous = (this.navigator.state === 'ACTIVE');
    this.kinematics.update(dt, isAutonomous);

    // 3. Update 3D Model position & animation (wheels, LiDAR, heartbeat)
    this.turtlebot.setPose(this.kinematics.x, this.kinematics.y, this.kinematics.yaw);
    this.turtlebot.update(this.kinematics.linearVel, this.kinematics.angularVel, dt);

    // 4. Update Cameras (FPV eye position, chase cam lerp, etc.)
    this.updateCameras(dt);

    // 5. Update OrbitControls if enabled
    if (this.controls.enabled) {
      this.controls.update();
    }

    // 6. Update HUD Telemetry text
    this.updateHUD();

    // 7. Render Primary Viewport
    const mainCam = this.getActiveCamera();
    this.renderer.render(this.scene, mainCam);

    // 8. Render Picture-in-Picture (PiP) Viewport
    const pipCam = this.getPiPCamera();
    this.pipRenderer.render(this.scene, pipCam);
  }
}

// Bootstrap on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.simulatorApp = new App();
});

