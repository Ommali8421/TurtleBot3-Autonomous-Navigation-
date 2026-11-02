/**
 * Kinematics & Physics Engine for TurtleBot 3 Burger
 * - Differential drive non-holonomic kinematic update:
 *     dx = v * cos(theta) * dt
 *     dy = v * sin(theta) * dt
 *     dtheta = w * dt
 * - Collision detection with cylindrical pillars and outer walls
 * - 360° LiDAR raycaster generating simulated LaserScan ranges
 */

class Kinematics {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;

    // Robot Pose (ROS coordinate convention: X=forward, Y=left, Yaw=counter-clockwise)
    // Starting at Gazebo spawn pose: x = -2.0, y = -0.5, yaw = 0.0
    this.x = -2.0;
    this.y = -0.5;
    this.yaw = 0.0;

    // Velocities
    this.linearVel = 0.0;   // m/s
    this.angularVel = 0.0;  // rad/s

    // Target command velocities from teleop or autonomous planner
    this.cmdLinear = 0.0;
    this.cmdAngular = 0.0;

    // Physical Limits (TurtleBot3 Burger Specifications)
    this.maxLinearVel = 0.22;   // 0.22 m/s
    this.maxAngularVel = 2.84;  // 2.84 rad/s
    this.linearAccel = 1.2;     // m/s^2
    this.angularAccel = 6.0;    // rad/s^2
    this.friction = 4.0;        // stopping deceleration

    // Physical Footprint
    this.robotRadius = 0.11;    // 11 cm radius

    // Keyboard state
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      brake: false
    };

    // LiDAR Simulation
    this.lidarRays = 72; // 72 rays (every 5 degrees)
    this.lidarMaxRange = 3.5; // meters
    this.lidarEnabled = true;
    this.lidarPoints = [];
    this.lidarPointCloud = null;

    this.initKeyboard();
    this.initLidarVisuals();
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.up = true;
          this.highlightKey('key-w', true);
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.down = true;
          this.highlightKey('key-s', true);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          this.highlightKey('key-a', true);
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          this.highlightKey('key-d', true);
          break;
        case 'Space':
          this.keys.brake = true;
          this.highlightKey('key-space', true);
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.up = false;
          this.highlightKey('key-w', false);
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.down = false;
          this.highlightKey('key-s', false);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          this.highlightKey('key-a', false);
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          this.highlightKey('key-d', false);
          break;
        case 'Space':
          this.keys.brake = false;
          this.highlightKey('key-space', false);
          break;
      }
    });
  }

  highlightKey(id, pressed) {
    const el = document.getElementById(id);
    if (el) {
      if (pressed) el.classList.add('pressed');
      else el.classList.remove('pressed');
    }
  }

  initLidarVisuals() {
    // Laser scan dots rendered on the floor
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(this.lidarRays * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xff0044,
      size: 0.04,
      transparent: true,
      opacity: 0.85
    });

    this.lidarPointCloud = new THREE.Points(geom, mat);
    this.scene.add(this.lidarPointCloud);
  }

  /**
   * Main simulation step
   * @param {number} dt - delta time in seconds
   * @param {boolean} isAutonomous - true if navigator is controlling cmd velocities
   */
  update(dt, isAutonomous = false) {
    // 1. Process Keyboard Teleop if not controlled by autonomous navigator
    if (!isAutonomous) {
      if (this.keys.brake) {
        this.cmdLinear = 0;
        this.cmdAngular = 0;
      } else {
        if (this.keys.up) this.cmdLinear = this.maxLinearVel;
        else if (this.keys.down) this.cmdLinear = -this.maxLinearVel;
        else this.cmdLinear = 0;

        if (this.keys.left) this.cmdAngular = this.maxAngularVel;
        else if (this.keys.right) this.cmdAngular = -this.maxAngularVel;
        else this.cmdAngular = 0;
      }
    }

    // 2. Smoothly accelerate / decelerate towards commanded velocities
    if (this.cmdLinear > this.linearVel) {
      this.linearVel = Math.min(this.cmdLinear, this.linearVel + this.linearAccel * dt);
    } else if (this.cmdLinear < this.linearVel) {
      this.linearVel = Math.max(this.cmdLinear, this.linearVel - this.linearAccel * dt);
    }

    if (this.cmdAngular > this.angularVel) {
      this.angularVel = Math.min(this.cmdAngular, this.angularVel + this.angularAccel * dt);
    } else if (this.cmdAngular < this.angularVel) {
      this.angularVel = Math.max(this.cmdAngular, this.angularVel - this.angularAccel * dt);
    }

    // 3. Integrate Differential Drive Kinematics
    const nextYaw = this.yaw + this.angularVel * dt;
    const nextX = this.x + this.linearVel * Math.cos(nextYaw) * dt;
    const nextY = this.y + this.linearVel * Math.sin(nextYaw) * dt;

    // 4. Collision Detection & Wall Sliding
    const resolved = this.resolveCollisions(nextX, nextY);
    this.x = resolved.x;
    this.y = resolved.y;
    this.yaw = nextYaw;

    // Keep yaw normalized between -PI and +PI
    while (this.yaw > Math.PI) this.yaw -= 2 * Math.PI;
    while (this.yaw < -Math.PI) this.yaw += 2 * Math.PI;

    // 5. Update LiDAR Raycasting
    if (this.lidarEnabled) {
      this.computeLidarScan();
    }
  }

  resolveCollisions(targetX, targetY) {
    let finalX = targetX;
    let finalY = targetY;

    // 1. Check outer boundaries
    finalX = Math.max(this.world.boundaryMinX + this.robotRadius, Math.min(this.world.boundaryMaxX - this.robotRadius, finalX));
    finalY = Math.max(this.world.boundaryMinY + this.robotRadius, Math.min(this.world.boundaryMaxY - this.robotRadius, finalY));

    // 2. Check cylindrical obstacles
    for (const obs of this.world.obstacles) {
      const dx = finalX - obs.x;
      const dy = finalY - obs.y;
      const dist = Math.hypot(dx, dy);
      const minDist = obs.radius + this.robotRadius;

      if (dist < minDist) {
        // Push robot out along the collision normal (elastic / slide reaction)
        const angle = Math.atan2(dy, dx);
        finalX = obs.x + Math.cos(angle) * minDist;
        finalY = obs.y + Math.sin(angle) * minDist;
        // Dampen velocity on impact
        this.linearVel *= 0.2;
      }
    }

    return { x: finalX, y: finalY };
  }

  computeLidarScan() {
    const positions = this.lidarPointCloud.geometry.attributes.position.array;

    for (let i = 0; i < this.lidarRays; i++) {
      const angle = this.yaw + (i / this.lidarRays) * (2 * Math.PI);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      let minDistance = this.lidarMaxRange;

      // Check distance to boundary walls
      // West Wall (x = minX)
      if (dirX < -1e-4) {
        const d = (this.world.boundaryMinX - this.x) / dirX;
        if (d > 0 && d < minDistance) minDistance = d;
      }
      // East Wall (x = maxX)
      if (dirX > 1e-4) {
        const d = (this.world.boundaryMaxX - this.x) / dirX;
        if (d > 0 && d < minDistance) minDistance = d;
      }
      // South Wall (y = minY)
      if (dirY < -1e-4) {
        const d = (this.world.boundaryMinY - this.y) / dirY;
        if (d > 0 && d < minDistance) minDistance = d;
      }
      // North Wall (y = maxY)
      if (dirY > 1e-4) {
        const d = (this.world.boundaryMaxY - this.y) / dirY;
        if (d > 0 && d < minDistance) minDistance = d;
      }

      // Check distance to all 9 cylindrical obstacles (ray-cylinder intersection)
      for (const obs of this.world.obstacles) {
        const ocX = this.x - obs.x;
        const ocY = this.y - obs.y;
        const b = ocX * dirX + ocY * dirY;
        const c = (ocX * ocX + ocY * ocY) - (obs.radius * obs.radius);
        const discriminant = b * b - c;

        if (discriminant >= 0) {
          const t = -b - Math.sqrt(discriminant);
          if (t > 0 && t < minDistance) {
            minDistance = t;
          }
        }
      }

      // Compute hit point coordinate in Three.js space: (x, y) -> (x, y_pos, -y)
      const hitX = this.x + dirX * minDistance;
      const hitY = this.y + dirY * minDistance;

      const idx = i * 3;
      positions[idx] = hitX;
      positions[idx + 1] = 0.04; // Slightly above ground
      positions[idx + 2] = -hitY;
    }

    this.lidarPointCloud.geometry.attributes.position.needsUpdate = true;
  }

  setPose(x, y, yaw) {
    this.x = x;
    this.y = y;
    this.yaw = yaw;
    this.linearVel = 0;
    this.angularVel = 0;
  }
}

if (typeof window !== 'undefined') {
  window.Kinematics = Kinematics;
}

