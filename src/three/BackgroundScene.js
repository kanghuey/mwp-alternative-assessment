import * as THREE from 'three';

export class BackgroundScene {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.container = container;

    this.objects = [];
    this.clock = new THREE.Clock();
    this.frameId = null;

    // Interaction state
    this.pointer = new THREE.Vector2(0, 0);       // normalized -1..1
    this.targetPointer = new THREE.Vector2(0, 0);
    this.keyRotation = { x: 0, y: 0 };
    this.scrollProgress = 0;

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);

    this._initScene();
    this._initLights();
    this._initObjects();
    this._initEvents();
    this._onResize();
  }

  /* Setup */

  _initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      this._size().width / this._size().height,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 12);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Group everything so keyboard rotation can spin the whole scene
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  _initLights() {
    // Technique 1: soft ambient fill light (no shadows, even illumination)
    this.ambientLight = new THREE.AmbientLight(0xf7efe4, 0.55);
    this.scene.add(this.ambientLight);

    // Technique 2: moving point light that orbits the scene, creating
    // dynamic specular highlights on the standard materials below
    this.pointLight = new THREE.PointLight(0x6d4aff, 18, 40, 2);
    this.pointLight.position.set(5, 4, 6);
    this.scene.add(this.pointLight);

    // Small accent rim light for depth
    this.rimLight = new THREE.PointLight(0x00f0ff, 6, 30, 2);
    this.rimLight.position.set(-6, -3, -4);
    this.scene.add(this.rimLight);
  }

  _makeCodeTexture() {
    // Procedural canvas texture styled like an editor showing a snippet of
    // "our" code, so the hub object visually reads as "the project" rather
    // than a generic textured sphere. Zero external asset dependencies
    // (satisfies the "one textured 3D object" requirement).
    const width = 640;
    const height = 640;
    const cvs = document.createElement('canvas');
    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext('2d');

    // Editor background
    ctx.fillStyle = '#23212b';
    ctx.fillRect(0, 0, width, height);

    // Title bar dots
    ctx.fillStyle = '#ff5f56';
    ctx.beginPath(); ctx.arc(26, 26, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffbd2e';
    ctx.beginPath(); ctx.arc(50, 26, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#27c93f';
    ctx.beginPath(); ctx.arc(74, 26, 8, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(width, 48);
    ctx.stroke();

    // Faux syntax-highlighted lines: [indent, color, text]
    const lines = [
      [0, '#ff7a00', 'function CyberForge() {'],
      [1, '#6d4aff', 'const team = ['],
      [2, '#00f0ff', "'Kang Huey', 'Jie Min',"],
      [2, '#00f0ff', "'Jian Ai', 'Hui Yi'"],
      [1, '#6d4aff', '];'],
      [1, '#ffffff', ''],
      [1, '#ff7a00', 'return team.map(build);'],
      [0, '#ff7a00', '}'],
      [0, '#5c547a', '// UTM · Faculty of Computing'],
    ];

    ctx.font = '600 22px "Fira Code", Consolas, monospace';
    ctx.textBaseline = 'top';
    let y = 80;
    const lineHeight = 34;
    lines.forEach(([indent, color, text]) => {
      ctx.fillStyle = color;
      ctx.fillText(text, 30 + indent * 26, y);
      y += lineHeight;
    });

    // Repeat the snippet down the rest of the canvas so it tiles cleanly
    // across the icosahedron's UVs instead of leaving blank space.
    const blockHeight = y + 20;
    const srcBlock = ctx.getImageData(0, 48, width, blockHeight - 48);
    let cursorY = blockHeight;
    while (cursorY < height) {
      ctx.putImageData(srcBlock, 0, cursorY);
      cursorY += blockHeight - 48;
    }

    const texture = new THREE.CanvasTexture(cvs);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  _makeStarShape(outerRadius, innerRadius, points) {
    const shape = new THREE.Shape();
    const step = Math.PI / points;
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = i * step - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }

  _makeGearShape(outerRadius, innerRadius, teeth) {
    const shape = new THREE.Shape();
    const toothStep = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a0 = i * toothStep;
      const a1 = a0 + toothStep * 0.35;
      const a2 = a0 + toothStep * 0.5;
      const a3 = a0 + toothStep * 0.85;

      const p0 = [Math.cos(a0) * innerRadius, Math.sin(a0) * innerRadius];
      const p1 = [Math.cos(a1) * outerRadius, Math.sin(a1) * outerRadius];
      const p2 = [Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius];
      const p3 = [Math.cos(a3) * innerRadius, Math.sin(a3) * innerRadius];

      if (i === 0) shape.moveTo(p0[0], p0[1]);
      else shape.lineTo(p0[0], p0[1]);
      shape.lineTo(p1[0], p1[1]);
      shape.lineTo(p2[0], p2[1]);
      shape.lineTo(p3[0], p3[1]);
    }
    shape.closePath();

    const hole = new THREE.Path();
    hole.absarc(0, 0, innerRadius * 0.45, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    return shape;
  }

  _initObjects() {
    const baseMaterialProps = { roughness: 0.35, metalness: 0.15 };

    // 1) Textured "project hub" — the shared codebase, at the center
    const codeTexture = this._makeCodeTexture();
    const hub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.5, 1),
      new THREE.MeshStandardMaterial({ map: codeTexture, ...baseMaterialProps })
    );
    hub.position.set(0, 0, 0);
    hub.userData.label = 'Project Hub';

    // 2-5) One node per teammate, arranged around the hub like a
    // collaboration/network graph — each gets its own name + accent color.
    const memberInfo = [
      { name: 'Kang Huey', color: 0x6d4aff },
      { name: 'Jie Min', color: 0x00f0ff },
      { name: 'Jian Ai', color: 0xff7a00 },
      { name: 'Hui Yi', color: 0xffffff },
    ];
    const nodeRadius = 4.6;
    const memberNodes = memberInfo.map((info, i) => {
      const angle = (i / memberInfo.length) * Math.PI * 2;
      const node = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.62, 0),
        new THREE.MeshStandardMaterial({
          color: info.color,
          ...baseMaterialProps,
          flatShading: true,
        })
      );
      node.position.set(
        Math.cos(angle) * nodeRadius,
        Math.sin(angle * 1.3) * 1.4,
        Math.sin(angle) * nodeRadius - 1.5
      );
      node.userData.label = info.name;
      return node;
    });

    // 6) Gear — represents the team's technical skills
    const gear = new THREE.Mesh(
      new THREE.ExtrudeGeometry(this._makeGearShape(0.85, 0.6, 10), {
        depth: 0.35,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.03,
        bevelSegments: 2,
      }),
      new THREE.MeshStandardMaterial({ color: 0x5c547a, ...baseMaterialProps, metalness: 0.5 })
    );
    gear.position.set(-3.6, -2.6, -2.5);
    gear.userData.label = 'Skills';

    // 7) Star — represents achievements/certifications
    const star = new THREE.Mesh(
      new THREE.ExtrudeGeometry(this._makeStarShape(0.9, 0.4, 5), {
        depth: 0.25,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.04,
        bevelSegments: 2,
      }),
      new THREE.MeshStandardMaterial({ color: 0xffbd2e, ...baseMaterialProps, metalness: 0.3 })
    );
    star.position.set(3.8, 2.8, -3);
    star.userData.label = 'Achievements';

    this.meshes = [hub, ...memberNodes, gear, star];
    this.memberNodes = memberNodes;
    this.hub = hub;

    this.meshes.forEach((mesh, i) => {
      // Store per-object animation parameters so rotation/float speeds differ
      mesh.userData.rotationSpeed = new THREE.Vector3(
        0.15 + Math.random() * 0.25,
        0.1 + Math.random() * 0.3,
        0.05 + Math.random() * 0.15
      );
      mesh.userData.floatSpeed = 0.4 + Math.random() * 0.4;
      mesh.userData.floatOffset = i * 1.3;
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.baseScale = mesh.scale.x;

      this.group.add(mesh);
      this.objects.push(mesh);
    });

    // Connection lines from the hub to each member node — visualizes the
    // team as a network. Positions are refreshed every frame in _tick()
    // since the nodes bob up and down independently.
    this.connectionLines = memberNodes.map((node) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        hub.position.clone(),
        node.position.clone(),
      ]);
      const material = new THREE.LineBasicMaterial({
        color: node.material.color,
        transparent: true,
        opacity: 0.35,
      });
      const line = new THREE.Line(geometry, material);
      line.userData.target = node;
      this.group.add(line);
      return line;
    });
  }

  /* Events / interaction */

  _initEvents() {
    window.addEventListener('mousemove', this._onPointerMove, { passive: true });
    window.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize);

    if ('ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.container);
    }

    this.raycaster = new THREE.Raycaster();
  }

  _onPointerMove(event) {
    // Normalize mouse position to -1..1 for parallax + raycasting
    this.targetPointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.targetPointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  _onClick(event) {
    this.raycaster.setFromCamera(this.targetPointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.objects, false);
    if (hits.length > 0) {
      const mesh = hits[0].object;
      // Simple "pulse" interaction feedback: quick scale-up that eases back
      // down inside the render loop via userData.pulse.
      mesh.userData.pulse = 1.4;
    }
  }

  _onKeyDown(event) {
    const step = 0.12;
    switch (event.key) {
      case 'ArrowLeft':
        this.keyRotation.y -= step;
        break;
      case 'ArrowRight':
        this.keyRotation.y += step;
        break;
      case 'ArrowUp':
        this.keyRotation.x -= step;
        break;
      case 'ArrowDown':
        this.keyRotation.x += step;
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  _onScroll() {
    const rect = this.container.getBoundingClientRect();
    const total = rect.height + window.innerHeight;
    const passed = window.innerHeight - rect.top;
    this.scrollProgress = Math.min(Math.max(passed / total, 0), 1);
  }

  _size() {
    const rect = this.container.getBoundingClientRect();
    return { width: rect.width || window.innerWidth, height: rect.height || window.innerHeight };
  }

  _onResize() {
    const { width, height } = this._size();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /* Render loop */

  start() {
    this.clock.start();
    this._tick();
  }

  _tick() {
    this.frameId = requestAnimationFrame(this._tick);

    const elapsed = this.clock.getElapsedTime();
    const delta = this.clock.getDelta();

    // Ease pointer toward target for smooth parallax
    this.pointer.x += (this.targetPointer.x - this.pointer.x) * 0.05;
    this.pointer.y += (this.targetPointer.y - this.pointer.y) * 0.05;

    // --- Camera navigation ---
    // Slow continuous orbit around the group
    const orbitRadius = 13 + this.scrollProgress * 4; // dolly out on scroll
    const orbitSpeed = 0.05;
    const orbitAngle = elapsed * orbitSpeed;
    this.camera.position.x = Math.sin(orbitAngle) * 1.5 + this.pointer.x * 1.5;
    this.camera.position.y = Math.cos(orbitAngle * 0.7) * 0.8 + this.pointer.y * 1.2;
    this.camera.position.z = orbitRadius;
    this.camera.lookAt(0, 0, 0);

    // Keyboard-driven scene rotation (arrow keys)
    this.group.rotation.y += (this.keyRotation.y - this.group.rotation.y) * 0.08;
    this.group.rotation.x += (this.keyRotation.x - this.group.rotation.x) * 0.08;

    // Point light gently orbits too, sweeping specular highlights across objects
    this.pointLight.position.x = Math.cos(elapsed * 0.6) * 6;
    this.pointLight.position.z = Math.sin(elapsed * 0.6) * 6;

    // --- Per-object animation ---
    this.objects.forEach((mesh) => {
      // Animation 1: continuous rotation, unique speed per axis/object
      mesh.rotation.x += mesh.userData.rotationSpeed.x * delta;
      mesh.rotation.y += mesh.userData.rotationSpeed.y * delta;
      mesh.rotation.z += mesh.userData.rotationSpeed.z * delta;

      // Animation 2: sine-wave floating/bobbing motion
      mesh.position.y =
        mesh.userData.baseY +
        Math.sin(elapsed * mesh.userData.floatSpeed + mesh.userData.floatOffset) * 0.4;

      // Click "pulse" feedback easing back to base scale
      if (mesh.userData.pulse && mesh.userData.pulse > 1) {
        mesh.userData.pulse += (1 - mesh.userData.pulse) * 0.15;
        const s = mesh.userData.baseScale * mesh.userData.pulse;
        mesh.scale.set(s, s, s);
      }
    });

    // Keep the hub -> member-node connection lines glued to their
    // endpoints now that the nodes have moved via the float animation.
    if (this.connectionLines) {
      this.connectionLines.forEach((line) => {
        const positions = line.geometry.attributes.position;
        positions.setXYZ(0, this.hub.position.x, this.hub.position.y, this.hub.position.z);
        positions.setXYZ(
          1,
          line.userData.target.position.x,
          line.userData.target.position.y,
          line.userData.target.position.z
        );
        positions.needsUpdate = true;
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.frameId) cancelAnimationFrame(this.frameId);

    window.removeEventListener('mousemove', this._onPointerMove);
    window.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    if (this._resizeObserver) this._resizeObserver.disconnect();

    this.objects.forEach((mesh) => {
      mesh.geometry.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    });

    if (this.connectionLines) {
      this.connectionLines.forEach((line) => {
        line.geometry.dispose();
        line.material.dispose();
      });
    }

    this.renderer.dispose();
  }
}