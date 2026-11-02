/**
 * turtlebot3_world - 3D Environment & Arena Layout
 * Exact 1:1 replica of the official Gazebo turtlebot3_world:
 * - 9 cylindrical obstacle pillars (3x3 grid at x,y in {-1.1, 0.0, 1.1}, radius 0.15m)
 * - Outer boundary walls and 4 outer columns matching Gazebo model.sdf
 * - 1-meter precision floor grid with coordinate markings
 * - Dynamic lighting and shadows
 */

class World {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = []; // Collision cylinders and wall planes

    // Exact Gazebo specifications from turtlebot3_world/model.sdf
    this.pillarRadius = 0.15; // 15 cm radius
    this.pillarHeight = 0.50; // 50 cm tall
    this.arenaSize = 5.0;     // 5m x 5m

    // Boundary limits
    this.boundaryMinX = -2.45;
    this.boundaryMaxX = 2.45;
    this.boundaryMinY = -2.45;
    this.boundaryMaxY = 2.45;

    this.buildLighting();
    this.buildFloor();
    this.buildPillars();
    this.buildOuterColumns();
    this.buildBoundaryWalls();
    this.buildCoordinateAxes();
  }

  buildLighting() {
    // Ambient light for base visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    // Directional sunlight casting shadows
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

    // Subtle blue point lights around arena
    const light1 = new THREE.PointLight(0x00f0ff, 0.35, 8);
    light1.position.set(-2.2, 1.5, -2.2);
    this.scene.add(light1);

    const light2 = new THREE.PointLight(0x0077ff, 0.35, 8);
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
    // Exact Gazebo 3x3 Grid of 9 Cylinders from turtlebot3_world/model.sdf
    const pillarPositions = [
      { name: 'one_one',    x: -1.1, y: -1.1 },
      { name: 'one_two',    x: -1.1, y:  0.0 },
      { name: 'one_three',  x: -1.1, y:  1.1 },
      { name: 'two_one',    x:  0.0, y: -1.1 },
      { name: 'two_two',    x:  0.0, y:  0.0 }, // Center
      { name: 'two_three',  x:  0.0, y:  1.1 },
      { name: 'three_one',  x:  1.1, y: -1.1 },
      { name: 'three_two',  x:  1.1, y:  0.0 },
      { name: 'three_three',x:  1.1, y:  1.1 }
    ];

    const pillarGeo = new THREE.CylinderGeometry(this.pillarRadius, this.pillarRadius, this.pillarHeight, 32);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x283854,
      roughness: 0.35,
      metalness: 0.65
    });

    const pillarRimMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true
    });

    pillarPositions.forEach((pos) => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      // Map coords: (x, y) -> Three.js (x, y_elevation, -y)
      pillar.position.set(pos.x, this.pillarHeight / 2, -pos.y);
      pillar.castShadow = true;
      pillar.receiveShadow = true;

      // Decorative cyan ring on top
      const ringGeo = new THREE.TorusGeometry(this.pillarRadius, 0.005, 8, 32);
      ringGeo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, pillarRimMat);
      ring.position.y = this.pillarHeight / 2 + 0.001;
      pillar.add(ring);

      this.scene.add(pillar);

      // Register obstacle for collision & LiDAR raycasting
      this.obstacles.push({
        type: 'cylinder',
        name: pos.name,
        x: pos.x,
        y: pos.y,
        radius: this.pillarRadius
      });
    });
  }

  buildOuterColumns() {
    // Gazebo 4 outer hexagonal accent markers from model.sdf
    const outerPositions = [
      { x:  1.8, y:  2.4 },
      { x:  1.8, y: -2.4 },
      { x: -1.8, y:  2.4 },
      { x: -1.8, y: -2.4 }
    ];

    const colGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.40, 6); // Hexagonal column
    const colMat = new THREE.MeshStandardMaterial({
      color: 0x1f2b42,
      roughness: 0.5,
      metalness: 0.5
    });

    outerPositions.forEach(pos => {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(pos.x, 0.20, -pos.y);
      col.castShadow = true;
      col.receiveShadow = true;
      this.scene.add(col);

      this.obstacles.push({
        type: 'cylinder',
        name: 'outer_column',
        x: pos.x,
        y: pos.y,
        radius: 0.12
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
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(w.x, wallHeight / 2, w.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);

      // Subtle cyan border trim along the top edge of each wall
      const trimGeo = new THREE.BoxGeometry(w.width, 0.015, w.depth);
      const trim = new THREE.Mesh(trimGeo, borderGlowMat);
      trim.position.set(w.x, wallHeight + 0.005, w.z);
      this.scene.add(trim);
    });
  }

  buildCoordinateAxes() {
    // Origin coordinate axes marker (Red=X forward/east, Green=Z up, Blue=Y left/north)
    const axes = new THREE.AxesHelper(0.5);
    axes.position.set(0, 0.005, 0);
    this.scene.add(axes);
  }
}

if (typeof window !== 'undefined') {
  window.World = World;
}
