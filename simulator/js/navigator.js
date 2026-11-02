/**
 * Autonomous Navigation Manager for TurtleBot 3 (move_base behavior)
 * - Simulates ActionLib SimpleActionClient / move_base pipeline
 * - Waypoint planner with obstacle inflation avoidance
 * - Dynamic trajectory tracker with smooth arrival deceleration
 * - Status codes & done callbacks (status 3 == SUCCEEDED)
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
    this.xyTolerance = 0.08;   // 8 cm goal arrival tolerance
    this.yawTolerance = 0.12;  // ~7 degrees orientation tolerance

    // Visual Path Ribbon & Goal Beacon
    this.pathLine = null;
    this.goalBeacon = null;
    this.initVisuals();

    // Callbacks
    this.onStatusChange = null;
    this.onFeedback = null;
    this.lastFeedbackTime = 0;
  }

  initVisuals() {
    // 1. Path Ribbon
    const pathGeo = new THREE.BufferGeometry();
    const pathMat = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    this.pathLine = new THREE.Line(pathGeo, pathMat);
    this.scene.add(this.pathLine);

    // 2. Target Goal Beacon
    this.goalBeacon = new THREE.Group();
    this.goalBeacon.visible = false;

    // Glowing target cylinder ring
    const ringGeo = new THREE.RingGeometry(0.12, 0.15, 32);
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
   * @param {number} x - Target map X
   * @param {number} y - Target map Y
   * @param {number} w - Target quaternion orientation W (facing angle)
   */
  sendGoal(x, y, w = 1.0) {
    // Convert quaternion W to planar yaw angle (assuming identity x=0, y=0, z=0)
    // For 2D planar rotation: yaw = 2 * atan2(z, w) -> for z=0, yaw = 0 (or calculated from w)
    let targetYaw = 0.0;
    if (w <= 1.0 && w >= -1.0) {
      targetYaw = 2.0 * Math.acos(Math.max(-1.0, Math.min(1.0, w)));
    }

    this.target = { x, y, yaw: targetYaw };
    this.setState('PLANNING', 'Computing obstacle-aware global path...');

    // 1. Check if target is out of bounds or inside an obstacle
    if (this.isObstacle(x, y, 0.20)) {
      this.setState('ABORTED', 'Target goal is inside an obstacle or wall!');
      this.goalBeacon.visible = false;
      this.clearPath();
      return false;
    }

    // 2. Generate waypoints using obstacle-clearing pathfinder
    this.waypoints = this.computePath(this.kinematics.x, this.kinematics.y, x, y);
    this.currentWpIndex = 0;

    // 3. Update Visuals
    this.updatePathVisuals();
    this.goalBeacon.position.set(x, 0.01, -y);
    this.goalBeacon.rotation.y = targetYaw;
    this.goalBeacon.visible = true;

    this.setState('ACTIVE', 'Goal active. Navigating along trajectory...');
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

    // Feedback logging throttle (every 1 second)
    const now = Date.now();
    if (now - this.lastFeedbackTime > 1000) {
      this.lastFeedbackTime = now;
      if (this.onFeedback) {
        this.onFeedback(this.kinematics.x, this.kinematics.y);
      }
    }

    if (this.currentWpIndex >= this.waypoints.length) {
      // Waypoints reached, align final orientation
      this.alignFinalYaw(dt);
      return;
    }

    const currentWp = this.waypoints[this.currentWpIndex];
    const dx = currentWp.x - this.kinematics.x;
    const dy = currentWp.y - this.kinematics.y;
    const dist = Math.hypot(dx, dy);

    // If close enough to current waypoint, advance to next
    if (dist < 0.15 && this.currentWpIndex < this.waypoints.length - 1) {
      this.currentWpIndex++;
      this.updatePathVisuals();
      return;
    }

    // If on the final waypoint and reached within tolerance:
    if (this.currentWpIndex === this.waypoints.length - 1 && dist < this.xyTolerance) {
      this.alignFinalYaw(dt);
      return;
    }

    // Pure Pursuit Steering Controller
    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = targetAngle - this.kinematics.yaw;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Proportional angular velocity
    this.kinematics.cmdAngular = Math.max(-this.kinematics.maxAngularVel, Math.min(this.kinematics.maxAngularVel, angleDiff * 3.5));

    // Linear velocity ramps down if turning sharply or approaching goal
    if (Math.abs(angleDiff) > 0.6) {
      // Turn in place if heading error is large
      this.kinematics.cmdLinear = 0.02;
    } else {
      const approachDecel = Math.min(1.0, dist / 0.5);
      this.kinematics.cmdLinear = this.kinematics.maxLinearVel * approachDecel * (1.0 - Math.abs(angleDiff) / 0.8);
    }
  }

  alignFinalYaw(dt) {
    let yawDiff = this.target.yaw - this.kinematics.yaw;
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;

    this.kinematics.cmdLinear = 0;

    if (Math.abs(yawDiff) < this.yawTolerance) {
      // Reached both position and orientation!
      this.kinematics.cmdAngular = 0;
      this.setState('SUCCEEDED', 'Status 3: SUCCEEDED (TurtleBot3 has reached the goal!)');
      this.clearPath();
      this.target = null;
    } else {
      // Rotate in place towards target orientation
      this.kinematics.cmdAngular = Math.sign(yawDiff) * Math.min(1.5, Math.max(0.4, Math.abs(yawDiff) * 2.0));
    }
  }

  computePath(startX, startY, goalX, goalY) {
    // Check if direct line-of-sight is clear
    const directIntersects = this.checkPathCollision(startX, startY, goalX, goalY);
    if (!directIntersects) {
      return [{ x: goalX, y: goalY }];
    }

    // If an obstacle blocks direct line, skirt around the intersecting pillar
    const obs = directIntersects;
    const inflation = obs.radius + 0.32; // clearance buffer

    // Generate two bypass candidates (clockwise and counterclockwise tangents)
    const angleToGoal = Math.atan2(goalY - startY, goalX - startX);
    const p1 = { x: obs.x + Math.cos(angleToGoal + Math.PI / 2) * inflation, y: obs.y + Math.sin(angleToGoal + Math.PI / 2) * inflation };
    const p2 = { x: obs.x + Math.cos(angleToGoal - Math.PI / 2) * inflation, y: obs.y + Math.sin(angleToGoal - Math.PI / 2) * inflation };

    // Pick candidate with shorter overall distance and no wall penetration
    const d1 = Math.hypot(startX - p1.x, startY - p1.y) + Math.hypot(goalX - p1.x, goalY - p1.y);
    const d2 = Math.hypot(startX - p2.x, startY - p2.y) + Math.hypot(goalX - p2.x, goalY - p2.y);

    const midPoint = (!this.isObstacle(p1.x, p1.y) && d1 <= d2) ? p1 : p2;

    return [midPoint, { x: goalX, y: goalY }];
  }

  checkPathCollision(x1, y1, x2, y2) {
    const steps = 30;
    for (let i = 1; i < steps; i++) {
      const interpX = x1 + (x2 - x1) * (i / steps);
      const interpY = y1 + (y2 - y1) * (i / steps);

      for (const obs of this.world.obstacles) {
        if (Math.hypot(interpX - obs.x, interpY - obs.y) < (obs.radius + 0.22)) {
          return obs;
        }
      }
    }
    return null;
  }

  isObstacle(x, y, buffer = 0.15) {
    // Check boundaries
    if (x < this.world.boundaryMinX + buffer || x > this.world.boundaryMaxX - buffer) return true;
    if (y < this.world.boundaryMinY + buffer || y > this.world.boundaryMaxY - buffer) return true;

    // Check cylinders
    for (const obs of this.world.obstacles) {
      if (Math.hypot(x - obs.x, y - obs.y) < (obs.radius + buffer)) return true;
    }
    return false;
  }

  updatePathVisuals() {
    const points = [];
    // Start from current robot position
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
