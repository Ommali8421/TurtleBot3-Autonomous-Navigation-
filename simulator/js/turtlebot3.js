/**
 * TurtleBot 3 Burger - Procedural 3D Model & Animation
 * Accurately replicates the physical layout:
 * - 3 circular layered plates with brass standoffs
 * - 2 differential drive wheels + rear ball caster
 * - Rotating 360° LDS LiDAR sensor on top deck
 * - Microcontroller / OpenCR board with status LEDs
 * - Front headlight and eye-level FPV camera anchor
 */

class TurtleBot3 {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'TurtleBot3';

    // Model Dimensions (meters, matching TurtleBot3 Burger specifications)
    this.radius = 0.105;     // 10.5 cm radius footprint
    this.height = 0.192;     // 19.2 cm total height
    this.wheelRadius = 0.033; // 66 mm wheel diameter
    this.wheelTrack = 0.160;  // 160 mm distance between wheels

    // References for dynamic animation
    this.leftWheel = null;
    this.rightWheel = null;
    this.lidarTurret = null;
    this.laserBeamGroup = null;
    this.heartbeatLed = null;
    this.fpvCameraAnchor = null;

    this.buildModel();
    this.scene.add(this.group);
  }

  buildModel() {
    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x1f242d,
      roughness: 0.6,
      metalness: 0.3
    });

    const standoffMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brass standoff pillars
      roughness: 0.3,
      metalness: 0.8
    });

    const wheelRubberMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9,
      metalness: 0.1
    });

    const wheelRimMat = new THREE.MeshStandardMaterial({
      color: 0xff6600, // TurtleBot orange wheel rims
      roughness: 0.4,
      metalness: 0.4
    });

    const lidarBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.5,
      metalness: 0.5
    });

    const lidarRotorMat = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.3,
      metalness: 0.7
    });

    // ─── 1. TIER 1: Bottom Chassis Plate ───
    const plateGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.004, 32);
    const bottomPlate = new THREE.Mesh(plateGeo, chassisMat);
    bottomPlate.position.y = 0.033; // Elevated at wheel axle height
    bottomPlate.castShadow = true;
    bottomPlate.receiveShadow = true;
    this.group.add(bottomPlate);

    // ─── 2. TIER 2: Middle Electronics Plate ───
    const middlePlate = new THREE.Mesh(plateGeo, chassisMat);
    middlePlate.position.y = 0.080;
    middlePlate.castShadow = true;
    this.group.add(middlePlate);

    // ─── 3. TIER 3: Top LiDAR Plate ───
    const topPlate = new THREE.Mesh(plateGeo, chassisMat);
    topPlate.position.y = 0.130;
    topPlate.castShadow = true;
    this.group.add(topPlate);

    // Standoff pillars connecting plates (4 posts per tier)
    const standoffGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.047, 12);
    const postAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    const postDist = 0.075;

    postAngles.forEach(ang => {
      // Lower tier standoffs
      const post1 = new THREE.Mesh(standoffGeo, standoffMat);
      post1.position.set(Math.cos(ang) * postDist, 0.056, Math.sin(ang) * postDist);
      post1.castShadow = true;
      this.group.add(post1);

      // Upper tier standoffs
      const post2 = new THREE.Mesh(standoffGeo, standoffMat);
      post2.position.set(Math.cos(ang) * postDist, 0.105, Math.sin(ang) * postDist);
      post2.castShadow = true;
      this.group.add(post2);
    });

    // ─── 4. Wheels & Motors ───
    const wheelGeo = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.018, 24);
    const rimGeo = new THREE.CylinderGeometry(this.wheelRadius * 0.65, this.wheelRadius * 0.65, 0.019, 16);

    // Left Wheel
    this.leftWheel = new THREE.Group();
    const lTire = new THREE.Mesh(wheelGeo, wheelRubberMat);
    lTire.rotation.z = Math.PI / 2;
    lTire.castShadow = true;
    const lRim = new THREE.Mesh(rimGeo, wheelRimMat);
    lRim.rotation.z = Math.PI / 2;
    this.leftWheel.add(lTire, lRim);
    this.leftWheel.position.set(0, this.wheelRadius, this.wheelTrack / 2);
    this.group.add(this.leftWheel);

    // Right Wheel
    this.rightWheel = new THREE.Group();
    const rTire = new THREE.Mesh(wheelGeo, wheelRubberMat);
    rTire.rotation.z = Math.PI / 2;
    rTire.castShadow = true;
    const rRim = new THREE.Mesh(rimGeo, wheelRimMat);
    rRim.rotation.z = Math.PI / 2;
    this.rightWheel.add(rTire, rRim);
    this.rightWheel.position.set(0, this.wheelRadius, -this.wheelTrack / 2);
    this.group.add(this.rightWheel);

    // Rear Caster Ball
    const casterGeo = new THREE.SphereGeometry(0.009, 16, 16);
    const casterMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.1 });
    const caster = new THREE.Mesh(casterGeo, casterMat);
    caster.position.set(-0.065, 0.009, 0);
    caster.castShadow = true;
    this.group.add(caster);

    // ─── 5. Top LDS-01 LiDAR Sensor ───
    const lidarBaseGeo = new THREE.CylinderGeometry(0.038, 0.040, 0.025, 24);
    const lidarBase = new THREE.Mesh(lidarBaseGeo, lidarBaseMat);
    lidarBase.position.y = 0.145;
    lidarBase.castShadow = true;
    this.group.add(lidarBase);

    this.lidarTurret = new THREE.Group();
    this.lidarTurret.position.y = 0.160;

    const turretCapGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.015, 24);
    const turretCap = new THREE.Mesh(turretCapGeo, lidarRotorMat);
    turretCap.castShadow = true;

    // Laser optical diode indicator
    const diodeGeo = new THREE.BoxGeometry(0.01, 0.008, 0.015);
    const diodeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    const diode = new THREE.Mesh(diodeGeo, diodeMat);
    diode.position.set(0.025, 0, 0);

    this.lidarTurret.add(turretCap, diode);
    this.group.add(this.lidarTurret);

    // ─── 6. Onboard Electronics & Status LEDs ───
    // Raspberry Pi / OpenCR board on middle tier
    const pcbGeo = new THREE.BoxGeometry(0.085, 0.005, 0.055);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.4 });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.position.set(0, 0.085, 0);
    this.group.add(pcb);

    // Green Heartbeat LED
    const ledGeo = new THREE.SphereGeometry(0.003, 8, 8);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.heartbeatLed = new THREE.Mesh(ledGeo, ledMat);
    this.heartbeatLed.position.set(-0.02, 0.090, 0.015);
    this.group.add(this.heartbeatLed);

    // Blue Power LED
    const blueLedMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
    const blueLed = new THREE.Mesh(ledGeo, blueLedMat);
    blueLed.position.set(-0.02, 0.090, -0.015);
    this.group.add(blueLed);

    // ─── 7. Front Directional Arrow / Headlight Beam ───
    const arrowGeo = new THREE.ConeGeometry(0.012, 0.03, 16);
    arrowGeo.rotateZ(-Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0.095, 0.085, 0);
    this.group.add(arrow);

    // Subtle front headlight spotlight
    const frontLight = new THREE.SpotLight(0x00f0ff, 0.6, 2.5, Math.PI / 6, 0.4);
    frontLight.position.set(0.09, 0.09, 0);
    frontLight.target.position.set(1.5, 0.05, 0);
    this.group.add(frontLight);
    this.group.add(frontLight.target);

    // ─── 8. FPV Camera Mounting Anchor ───
    // Camera is placed right at the front eye of the robot
    this.fpvCameraAnchor = new THREE.Object3D();
    this.fpvCameraAnchor.position.set(0.095, 0.140, 0);
    this.group.add(this.fpvCameraAnchor);
  }

  /**
   * Update wheel rotation, LiDAR spin, and heartbeat LED each animation frame
   * @param {number} linearVel - forward velocity in m/s
   * @param {number} angularVel - rotational velocity in rad/s
   * @param {number} delta - elapsed frame delta time in seconds
   */
  update(linearVel, angularVel, delta) {
    // 1. Rotate LDS-01 LiDAR scanner (spinning at ~300 RPM = 5 rev/sec)
    if (this.lidarTurret) {
      this.lidarTurret.rotation.y += delta * 30.0;
    }

    // 2. Animate wheel rotation based on differential kinematics
    if (this.leftWheel && this.rightWheel) {
      const vLeft = linearVel - (angularVel * this.wheelTrack / 2.0);
      const vRight = linearVel + (angularVel * this.wheelTrack / 2.0);

      // Roll angle delta = (velocity / wheelRadius) * delta
      const dAngleLeft = (vLeft / this.wheelRadius) * delta;
      const dAngleRight = (vRight / this.wheelRadius) * delta;

      this.leftWheel.children.forEach(mesh => mesh.rotation.x += dAngleLeft);
      this.rightWheel.children.forEach(mesh => mesh.rotation.x += dAngleRight);
    }

    // 3. Pulse Heartbeat LED
    if (this.heartbeatLed) {
      const t = Date.now() * 0.005;
      const intensity = 0.5 + 0.5 * Math.sin(t);
      this.heartbeatLed.material.color.setRGB(0, intensity, 0.4 * intensity);
    }
  }

  /**
   * Set world position and heading
   */
  setPose(x, y, yaw) {
    // In Three.js: X is horizontal, Z is depth, Y is up
    // Map coords: (x, y) maps to Three.js (x, -y) or (x, z)
    this.group.position.set(x, 0, -y);
    // Yaw rotates around Y axis (Three.js world up)
    this.group.rotation.y = yaw;
  }

  getPose() {
    return {
      x: this.group.position.x,
      y: -this.group.position.z,
      yaw: this.group.rotation.y
    };
  }

  getFPVCameraWorldPosition() {
    const worldPos = new THREE.Vector3();
    this.fpvCameraAnchor.getWorldPosition(worldPos);
    return worldPos;
  }
}

// Export for browser ES module / global
if (typeof window !== 'undefined') {
  window.TurtleBot3 = TurtleBot3;
}

