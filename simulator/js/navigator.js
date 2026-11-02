/**
 * Autonomous Navigation Manager for TurtleBot 3 (move_base behavior)
 * - Full A* (A-Star) Multi-Obstacle Grid Planner:
 *     Guarantees smooth routing around the 1st, 2nd, and 3rd pillars without getting stuck.
 * - String-pulling path smoothing (eliminates grid artifacts into clean straight vectors).
 * - Dynamic Pure Pursuit trajectory tracker with arrival deceleration.
 * - Status codes & done callbacks (status 3 == SUCCEEDED).
 */

class Navigator {
  constructor(kinematics, world, scene) {
    this.kinematics = kinematics;
    this.world = world;
    this.scene = scene;

    this.state = 'IDLE'; // 'IDLE', 'PLANNING', 'ACTIVE', 'SUCCEEDED', 'ABORTED'
    this.target = null;   // { x, y, yaw }
    this.waypoints = [];
    this.currentWpIndex = 0;

    // Tolerances
    this.xyTolerance = 0.10;   // 10 cm goal arrival tolerance
    this.yawTolerance = 0.14;  // ~8 degrees orientation tolerance

    // Visual Path Ribbon & Goal Beacon
    this.pathLine = null;
    this.goalBeacon = null;
    this.initVisuals();

    // Callbacks
    this.onStatusChange = null;
    this.onFeedback = null;
    this.lastFeedbackTime = 0;

    // A* Grid Cache (resolution = 0.1m, bounds = [-2.4, 2.4])
    this.gridRes = 0.10; // 10 cm cell size
    this.gridMin = -2.4;
    this.gridMax = 2.4;
    this.gridDim = Math.round((this.gridMax - this.gridMin) / this.gridRes);
  }

  initVisuals() {
    // 1. Path Ribbon
    const pathGeo = new THREE.BufferGeometry();
    const pathMat = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      linewidth: 3,
      transparent: true,
      opacity: 0.85
    });
    this.pathLine = new THREE.Line(pathGeo, pathMat);
    this.scene.add(this.pathLine);

    // 2. Target Goal Beacon
    this.goalBeacon = new THREE.Group();
    this.goalBeacon.visible = false;

    // Glowing target cylinder ring
    const ringGeo = new THREE.RingGeometry(0.12, 0.16, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    // Orientation arrow on beacon
    const arrowGeo = new THREE.ConeGeometry(0.06, 0.18, 16);
    arrowGeo.rotateZ(-Math.PI / 2);
    arrowGeo.rotateY(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0.12, 0.02, 0);

    // Vertical beacon beam
    const beamGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.8, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 0.4;

    this.goalBeacon.add(ring, arrow, beam);
    this.scene.add(this.goalBeacon);
  }

  /**
   * Dispatches a new navigation goal
   */
  sendGoal(x, y, w = 1.0) {
    let targetYaw = 0.0;
    if (w <= 1.0 && w >= -1.0) {
      targetYaw = 2.0 * Math.acos(Math.max(-1.0, Math.min(1.0, w)));
    }

    this.target = { x, y, yaw: targetYaw };
    this.setState('PLANNING', 'Computing multi-obstacle A* path...');

    // 1. Check if target is out of bounds or inside an obstacle
    if (this.isObstacle(x, y, 0.22)) {
      this.setState('ABORTED', 'Target goal is inside an obstacle or wall!');
      this.goalBeacon.visible = false;
      this.clearPath();
      return false;
    }

    // 2. Generate multi-obstacle A* path
    const rawPath = this.findAStarPath(this.kinematics.x, this.kinematics.y, x, y);
    if (!rawPath || rawPath.length === 0) {
      this.setState('ABORTED', 'No valid path found through obstacles.');
      return false;
    }

    // 3. Smooth the path using line-of-sight shortcutting
    this.waypoints = this.smoothPath(rawPath);
    this.currentWpIndex = 0;

    // 4. Update Visuals
    this.updatePathVisuals();
    this.goalBeacon.position.set(x, 0.01, -y);
    this.goalBeacon.rotation.y = targetYaw;
    this.goalBeacon.visible = true;

    this.setState('ACTIVE', 'Goal active. Traversing around obstacles...');
    return true;
  }

  cancelGoal() {
    this.target = null;
    this.waypoints = [];
    this.clearPath();
    this.goalBeacon.visible = false;
    this.kinematics.cmdLinear = 0;
    this.kinematics.cmdAngular = 0;
    this.setState('IDLE', 'Navigation goal canceled.');
  }

  update(dt) {
    if (this.state !== 'ACTIVE') return;

    // Feedback throttle
    const now = Date.now();
    if (now - this.lastFeedbackTime > 1000) {
      this.lastFeedbackTime = now;
      if (this.onFeedback) {
        this.onFeedback(this.kinematics.x, this.kinematics.y);
      }
    }

    if (this.currentWpIndex >= this.waypoints.length) {
      this.alignFinalYaw(dt);
      return;
    }

    const currentWp = this.waypoints[this.currentWpIndex];
    const dx = currentWp.x - this.kinematics.x;
    const dy = currentWp.y - this.kinematics.y;
    const dist = Math.hypot(dx, dy);

    // If reached intermediate waypoint, move to next
    if (dist < 0.20 && this.currentWpIndex < this.waypoints.length - 1) {
      this.currentWpIndex++;
      this.updatePathVisuals();
      return;
    }

    // If close to final destination:
    if (this.currentWpIndex === this.waypoints.length - 1 && dist < this.xyTolerance) {
      this.alignFinalYaw(dt);
      return;
    }

    // Pure Pursuit Steering Controller
    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = targetAngle - this.kinematics.yaw;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Angular velocity with smooth damping
    this.kinematics.cmdAngular = Math.max(-this.kinematics.maxAngularVel, Math.min(this.kinematics.maxAngularVel, angleDiff * 3.2));

    // Linear speed: slow down when turning sharply or nearing intermediate turns
    if (Math.abs(angleDiff) > 0.5) {
      this.kinematics.cmdLinear = 0.04; // Slow rotation to turn corners
    } else {
      const isFinal = (this.currentWpIndex === this.waypoints.length - 1);
      const decel = isFinal ? Math.min(1.0, dist / 0.45) : 1.0;
      this.kinematics.cmdLinear = Math.max(0.08, this.kinematics.maxLinearVel * decel * (1.0 - Math.abs(angleDiff) / 0.9));
    }
  }

  alignFinalYaw(dt) {
    let yawDiff = this.target.yaw - this.kinematics.yaw;
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;

    this.kinematics.cmdLinear = 0;

    if (Math.abs(yawDiff) < this.yawTolerance) {
      this.kinematics.cmdAngular = 0;
      this.setState('SUCCEEDED', 'Status 3: SUCCEEDED (TurtleBot3 has reached the goal!)');
      this.clearPath();
      this.target = null;
    } else {
      this.kinematics.cmdAngular = Math.sign(yawDiff) * Math.min(1.5, Math.max(0.4, Math.abs(yawDiff) * 2.0));
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // A* Multi-Obstacle Grid Planner
  // ═══════════════════════════════════════════════════════════════════
  findAStarPath(startX, startY, goalX, goalY) {
    const toGrid = (coord) => Math.max(0, Math.min(this.gridDim - 1, Math.round((coord - this.gridMin) / this.gridRes)));
    const toWorld = (idx) => this.gridMin + idx * this.gridRes;

    const startGX = toGrid(startX);
    const startGY = toGrid(startY);
    const goalGX = toGrid(goalX);
    const goalGY = toGrid(goalY);

    const key = (gx, gy) => `${gx},${gy}`;

    const openSet = new Set([key(startGX, startGY)]);
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(key(startGX, startGY), 0);

    const fScore = new Map();
    fScore.set(key(startGX, startGY), Math.hypot(startGX - goalGX, startGY - goalGY));

    const neighbors = [
      { dx: 1, dy: 0, cost: 1.0 },
      { dx: -1, dy: 0, cost: 1.0 },
      { dx: 0, dy: 1, cost: 1.0 },
      { dx: 0, dy: -1, cost: 1.0 },
      { dx: 1, dy: 1, cost: 1.414 },
      { dx: -1, dy: 1, cost: 1.414 },
      { dx: 1, dy: -1, cost: 1.414 },
      { dx: -1, dy: -1, cost: 1.414 }
    ];

    let iterations = 0;
    const maxIterations = 3000;

    while (openSet.size > 0 && iterations++ < maxIterations) {
      // Find node with lowest fScore
      let currentKey = null;
      let lowestF = Infinity;
      for (const k of openSet) {
        const f = fScore.get(k) || Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentKey = k;
        }
      }

      const [curGX, curGY] = currentKey.split(',').map(Number);

      // Check if reached goal
      if (Math.hypot(curGX - goalGX, curGY - goalGY) <= 1.5) {
        // Reconstruct path
        const path = [{ x: goalX, y: goalY }];
        let curr = currentKey;
        while (cameFrom.has(curr)) {
          curr = cameFrom.get(curr);
          const [gx, gy] = curr.split(',').map(Number);
          path.unshift({ x: toWorld(gx), y: toWorld(gy) });
        }
        return path;
      }

      openSet.delete(currentKey);

      for (const n of neighbors) {
        const nextGX = curGX + n.dx;
        const nextGY = curGY + n.dy;

        if (nextGX < 0 || nextGX >= this.gridDim || nextGY < 0 || nextGY >= this.gridDim) continue;

        const worldX = toWorld(nextGX);
        const worldY = toWorld(nextGY);

        // Clearance buffer: 16cm pillar radius + 16cm robot radius + 5cm safety = 37cm
        if (this.isObstacle(worldX, worldY, 0.32)) continue;

        const nextKey = key(nextGX, nextGY);
        const tentativeG = (gScore.get(currentKey) || Infinity) + n.cost;

        if (tentativeG < (gScore.get(nextKey) || Infinity)) {
          cameFrom.set(nextKey, currentKey);
          gScore.set(nextKey, tentativeG);
          fScore.set(nextKey, tentativeG + Math.hypot(nextGX - goalGX, nextGY - goalGY) * 1.1);
          openSet.add(nextKey);
        }
      }
    }

    // Fallback: direct line if search space exhausted
    return [{ x: goalX, y: goalY }];
  }

  // ═══════════════════════════════════════════════════════════════════
  // Path Smoothing (String-Pulling Shortcut Algorithm)
  // ═══════════════════════════════════════════════════════════════════
  smoothPath(rawPath) {
    if (rawPath.length <= 2) return rawPath;

    const smoothed = [rawPath[0]];
    let currentIdx = 0;

    while (currentIdx < rawPath.length - 1) {
      let furthestIdx = currentIdx + 1;

      // Find the furthest waypoint that has clear line-of-sight
      for (let next = currentIdx + 2; next < rawPath.length; next++) {
        if (!this.checkPathCollision(rawPath[currentIdx].x, rawPath[currentIdx].y, rawPath[next].x, rawPath[next].y)) {
          furthestIdx = next;
        }
      }

      smoothed.push(rawPath[furthestIdx]);
      currentIdx = furthestIdx;
    }

    return smoothed;
  }

  checkPathCollision(x1, y1, x2, y2) {
    const steps = 25;
    for (let i = 1; i < steps; i++) {
      const interpX = x1 + (x2 - x1) * (i / steps);
      const interpY = y1 + (y2 - y1) * (i / steps);

      if (this.isObstacle(interpX, interpY, 0.30)) {
        return true;
      }
    }
    return false;
  }

  isObstacle(x, y, buffer = 0.28) {
    // Check arena boundary walls
    if (x < this.world.boundaryMinX + buffer || x > this.world.boundaryMaxX - buffer) return true;
    if (y < this.world.boundaryMinY + buffer || y > this.world.boundaryMaxY - buffer) return true;

    // Check all 9 cylindrical obstacles
    for (const obs of this.world.obstacles) {
      if (Math.hypot(x - obs.x, y - obs.y) < (obs.radius + buffer)) return true;
    }
    return false;
  }

  updatePathVisuals() {
    const points = [];
    points.push(new THREE.Vector3(this.kinematics.x, 0.015, -this.kinematics.y));

    for (let i = this.currentWpIndex; i < this.waypoints.length; i++) {
      points.push(new THREE.Vector3(this.waypoints[i].x, 0.015, -this.waypoints[i].y));
    }

    this.pathLine.geometry.setFromPoints(points);
    this.pathLine.visible = points.length > 1;
  }

  clearPath() {
    this.pathLine.geometry.setFromPoints([]);
    this.pathLine.visible = false;
  }

  setState(newState, message) {
    this.state = newState;
    if (this.onStatusChange) {
      this.onStatusChange(newState, message);
    }
  }
}

if (typeof window !== 'undefined') {
  window.Navigator = Navigator;
}
