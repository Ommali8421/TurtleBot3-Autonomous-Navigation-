/**
 * turtlebot3_world - 3D Environment & Arena Layout
 * Faithfully reproduces the official Gazebo turtlebot3_world:
 * - 9 cylindrical obstacle pillars (symmetrical distribution)
 * - Outer boundary walls (5m x 5m arena)
 * - 1-meter precision floor grid with coordinate markings
 * - Dynamic lighting and shadows
 */

class World {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = []; // Collision cylinders and wall planes

    this.pillarRadius = 0.16; // 16 cm radius
    this.pillarHeight = 0.50; // 50 cm tall
    this.arenaSize = 5.0;     // 5m x 5m

    this.buildLighting();
    this.buildFloor();
    this.buildPillars();
    this.buildBoundaryWalls();
    this.buildCoordinateAxes();
  }

  buildLighting() {
    // Ambient light for base visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    // Directional sunlight casting crisp shadows
    const sun = new THREE.DirectionalLight(0xddeeff, 0.85);
    sun.position.set(4, 7, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 20;
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Subtle blue point lights around the arena for sci-fi robotics atmosphere
    const light1 = new THREE.PointLight(0x00f0ff, 0.4, 6);
    light1.position.set(-2.2, 1.5, -2.2);
    this.scene.add(light1);

    const light2 = new THREE.PointLight(0x0077ff, 0.4, 6);
    light2.position.set(2.2, 1.5, 2.2);
    this.scene.add(light2);
  }

  buildFloor() {
    // 1. Base floor plane
    const floorGeo = new THREE.PlaneGeometry(6.0, 6.0);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d1424,
      roughness: 0.8,
      metalness: 0.2
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. 1-meter precision grid helper
    const gridHelper = new THREE.GridHelper(5.0, 10, 0x00f0ff, 0x1e3050);
    gridHelper.position.y = 0.002;
    this.scene.add(gridHelper);

    // Sub-grid (0.5 meter intervals)
    const subGrid = new THREE.GridHelper(5.0, 50, 0x15253e, 0x121b2d);
    subGrid.position.y = 0.001;
    this.scene.add(subGrid);
  }

  buildPillars() {
    // Official TurtleBot3 World 9 Pillars layout
    const pillarPositions = [
      { x:  0.00, y:  0.00 }, // Center
      { x:  1.25, y:  1.25 }, // Top Right
      { x: -1.25, y:  1.25 }, // Top Left
      { x:  1.25, y: -1.25 }, // Bottom Right
      { x: -1.25, y: -1.25 }, // Bottom Left
      { x:  1.75, y:  0.00 }, // East
      { x: -1.75, y:  0.00 }, // West
      { x:  0.00, y:  1.75 }, // North
      { x:  0.00, y: -1.75 }  // South
    ];

    const pillarGeo = new THREE.CylinderGeometry(this.pillarRadius, this.pillarRadius, this.pillarHeight, 32);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x24324d,
      roughness: 0.4,
      metalness: 0.6
    });

    const pillarRimMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true
    });

    pillarPositions.forEach((pos, idx) => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      // Map coords: (x, y) -> Three.js (x, -y)
      pillar.position.set(pos.x, this.pillarHeight / 2, -pos.y);
      pillar.castShadow = true;
      pillar.receiveShadow = true;

      // Decorative cyan ring on top of each pillar
      const ringGeo = new THREE.TorusGeometry(this.pillarRadius, 0.006, 8, 32);
      ringGeo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, pillarRimMat);
      ring.position.y = this.pillarHeight / 2 + 0.001;
      pillar.add(ring);

      this.scene.add(pillar);

      // Register for collision & LiDAR raycasting
      this.obstacles.push({
        type: 'cylinder',
        x: pos.x,
        y: pos.y,
        radius: this.pillarRadius
      });
    });
  }

  buildBoundaryWalls() {
    const wallHeight = 0.45;
    const wallThickness = 0.12;
    const halfSize = this.arenaSize / 2.0;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x18243b,
      roughness: 0.5,
      metalness: 0.4
    });

    const borderGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.4
    });

    const wallsData = [
      // North Wall (+Y in map -> -Z in Three.js)
      { width: this.arenaSize, depth: wallThickness, x: 0, z: -halfSize },
      // South Wall (-Y in map -> +Z in Three.js)
      { width: this.arenaSize, depth: wallThickness, x: 0, z: halfSize },
      // East Wall (+X in map -> +X in Three.js)
      { width: wallThickness, depth: this.arenaSize, x: halfSize, z: 0 },
      // West Wall (-X in map -> -X in Three.js)
      { width: wallThickness, depth: this.arenaSize, x: -halfSize, z: 0 }
    ];

    wallsData.forEach(w => {
      const wallGeo = new THREE.BoxGeometry(w.width, wallHeight, w.depth);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(w.x, wallHeight / 2, w.z);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;

      // Glowing top border line
      const lineGeo = new THREE.BoxGeometry(w.width, 0.015, w.depth);
      const lineMesh = new THREE.Mesh(lineGeo, borderGlowMat);
      lineMesh.position.set(w.x, wallHeight + 0.005, w.z);

      this.scene.add(wallMesh);
      this.scene.add(lineMesh);
    });

    // Outer boundary collision bounds
    this.boundaryMinX = -halfSize + wallThickness / 2;
    this.boundaryMaxX =  halfSize - wallThickness / 2;
    this.boundaryMinY = -halfSize + wallThickness / 2;
    this.boundaryMaxY =  halfSize - wallThickness / 2;
  }

  buildCoordinateAxes() {
    // Custom visible coordinate axes at origin
    // +X (Red = East), +Y (Green = North in map)
    const axisLen = 0.8;
    const xGeo = new THREE.CylinderGeometry(0.008, 0.008, axisLen, 12);
    xGeo.rotateZ(-Math.PI / 2);
    const xMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
    const xAxis = new THREE.Mesh(xGeo, xMat);
    xAxis.position.set(axisLen / 2, 0.01, 0);
    this.scene.add(xAxis);

    const yGeo = new THREE.CylinderGeometry(0.008, 0.008, axisLen, 12);
    yGeo.rotateX(Math.PI / 2);
    const yMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const yAxis = new THREE.Mesh(yGeo, yMat);
    yAxis.position.set(0, 0.01, -axisLen / 2); // -Z in Three.js is +Y in ROS map
    this.scene.add(yAxis);
  }
}

if (typeof window !== 'undefined') {
  window.World = World;
}

