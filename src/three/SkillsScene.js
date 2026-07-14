import * as THREE from 'three';

/**
 * SkillsScene
 * Interactive Three.js visualization for the Skills Showcase section.
 *
 * Reads its data straight from the existing DOM (`#skills .skill-category`)
 * so it always matches whatever names/skills are written in index.html —
 * no separate data file to keep in sync.
 *
 * Each teammate's skills become one rotating "ring" of small 3D nodes with
 * floating text labels. Rings sit at different heights and spin at
 * different speeds so the whole thing reads as "the team's combined skill
 * set" rather than a generic shape cloud.
 *
 * Requirement coverage for this section:
 *  - Interactive/animated 3D elements -> ring rotation + node bobbing,
 *    drag-to-orbit camera, scroll-wheel zoom, hover highlight + tooltip,
 *    click pulse.
 */
export class SkillsScene {
  constructor(container, canvas) {
    this.container = container;
    this.canvas = canvas;
    this.nodes = [];
    this.rings = [];
    this.clock = new THREE.Clock();
    this.frameId = null;
    this.isVisible = false;

    this.drag = { active: false, lastX: 0, lastY: 0 };
    this.rotation = { x: -0.2, y: 0 };
    this.targetRotation = { x: -0.2, y: 0 };
    this.zoom = 15;
    this.targetZoom = 15;

    this._bind();
    this._readSkillData();
    this._initScene();
    this._initLights();
    this._buildNodes();
    this._initTooltip();
    this._initEvents();
    this._observeVisibility();
    this._onResize();
    this._tick();
  }

  _bind() {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  /* ---------------------------------------------------------------------- */
  /* Data                                                                    */
  /* ---------------------------------------------------------------------- */

  _readSkillData() {
    const categories = Array.from(document.querySelectorAll('#skills .skill-category'));
    this.data = categories
      .map((cat) => ({
        name: cat.querySelector('h4')?.textContent?.trim() || 'Member',
        skills: Array.from(cat.querySelectorAll('.skill-tags span'))
          .map((span) => span.textContent.trim())
          .filter(Boolean),
      }))
      .filter((entry) => entry.skills.length > 0);

    if (this.data.length === 0) {
      // Fallback so the scene never renders empty while cards are placeholders
      this.data = [
        { name: 'Team', skills: ['Three.js', 'JavaScript', 'UI/UX', 'Teamwork', 'Design'] },
      ];
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Setup                                                                   */
  /* ---------------------------------------------------------------------- */

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  _initLights() {
    // Technique 1: ambient fill
    this.scene.add(new THREE.AmbientLight(0xf7efe4, 0.6));

    // Technique 2: orbiting point light for moving specular highlights
    this.pointLight = new THREE.PointLight(0x6d4aff, 20, 40, 2);
    this.pointLight.position.set(4, 5, 6);
    this.scene.add(this.pointLight);
  }

  _makeLabelSprite(text, color) {
    const paddingX = 28;
    const fontSize = 40;
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    ctx.font = `700 ${fontSize}px 'Poppins', 'Inter', Arial, sans-serif`;
    const textWidth = ctx.measureText(text).width;

    cvs.width = textWidth + paddingX * 2;
    cvs.height = fontSize * 1.8;

    // Re-set font after resizing (canvas resize clears context state)
    ctx.font = `700 ${fontSize}px 'Poppins', 'Inter', Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const radius = 18;
    ctx.fillStyle = 'rgba(35, 33, 43, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, cvs.width, cvs.height, radius);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, cvs.width - 3, cvs.height - 3, radius);
    ctx.stroke();

    ctx.fillStyle = '#fffaf3';
    ctx.fillText(text, cvs.width / 2, cvs.height / 2 + 2);

    const texture = new THREE.CanvasTexture(cvs);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    const scale = 0.024;
    sprite.scale.set(cvs.width * scale, cvs.height * scale, 1);
    return sprite;
  }

  _buildNodes() {
    const palette = [0x6d4aff, 0x00f0ff, 0xff7a00, 0xffbd2e, 0xff5f56];
    const ringGap = 2.6;
    const totalHeight = (this.data.length - 1) * ringGap;

    this.data.forEach((member, ringIndex) => {
      const ringGroup = new THREE.Group();
      ringGroup.position.y = totalHeight / 2 - ringIndex * ringGap;
      ringGroup.userData.spin = 0.12 + (ringIndex % 2 === 0 ? 0.06 : -0.05);
      this.group.add(ringGroup);
      this.rings.push(ringGroup);

      const radius = 3.4 + (member.skills.length > 5 ? 0.6 : 0);
      const color = palette[ringIndex % palette.length];

      member.skills.forEach((skillName, i) => {
        const angle = (i / member.skills.length) * Math.PI * 2;
        const nodeGroup = new THREE.Group();
        nodeGroup.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);

        const geometry =
          i % 2 === 0 ? new THREE.IcosahedronGeometry(0.34, 0) : new THREE.OctahedronGeometry(0.38, 0);
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.35,
          metalness: 0.2,
          flatShading: true,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.12,
        });
        const node = new THREE.Mesh(geometry, material);
        node.userData.baseEmissive = 0.12;
        node.userData.skillName = skillName;
        node.userData.memberName = member.name;
        node.userData.baseScale = 1;
        node.userData.floatOffset = ringIndex * 2 + i * 0.7;

        const label = this._makeLabelSprite(skillName, `#${color.toString(16).padStart(6, '0')}`);
        label.position.set(0, 0.65, 0);

        nodeGroup.add(node);
        nodeGroup.add(label);
        ringGroup.add(nodeGroup);

        this.nodes.push({ mesh: node, group: nodeGroup, label });
      });

      // A thin ring/orbit line under each member's nodes for readability
      const ringGeometry = new THREE.RingGeometry(radius - 0.02, radius + 0.02, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.rotation.x = Math.PI / 2;
      ringGroup.add(ringMesh);
    });
  }

  _initTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'skill-tooltip';
    this.tooltip.style.opacity = '0';
    this.container.appendChild(this.tooltip);
  }

  /* ---------------------------------------------------------------------- */
  /* Events                                                                  */
  /* ---------------------------------------------------------------------- */

  _initEvents() {
    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    // Wheel listener lives on the canvas itself (not window) so zooming the
    // scene never hijacks normal page scrolling.
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('resize', this._onResize);

    if ('ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.container);
    }
  }

  _observeVisibility() {
    if (!('IntersectionObserver' in window)) {
      this.isVisible = true;
      return;
    }
    this._intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        this.isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    this._intersectionObserver.observe(this.container);
  }

  _updatePointerNDC(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onPointerDown(event) {
    this.drag.active = true;
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    this.canvas.setPointerCapture?.(event.pointerId);

    // Click-to-highlight: raycast for the node under the pointer
    this._updatePointerNDC(event);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh));
    if (hits.length > 0) {
      const hit = this.nodes.find((n) => n.mesh === hits[0].object);
      if (hit) hit.mesh.userData.pulse = 1.6;
    }
  }

  _onPointerMove(event) {
    if (this.drag.active) {
      const deltaX = event.clientX - this.drag.lastX;
      const deltaY = event.clientY - this.drag.lastY;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.targetRotation.y += deltaX * 0.006;
      this.targetRotation.x = Math.max(
        -0.9,
        Math.min(0.9, this.targetRotation.x + deltaY * 0.006)
      );
      this.tooltip.style.opacity = '0';
      return;
    }

    // Hover detection only when the pointer is actually over the canvas
    const rect = this.canvas.getBoundingClientRect();
    const isOver =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!isOver) {
      this.tooltip.style.opacity = '0';
      this.canvas.style.cursor = 'grab';
      return;
    }

    this._updatePointerNDC(event);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh));

    if (hits.length > 0) {
      const hit = this.nodes.find((n) => n.mesh === hits[0].object);
      this.canvas.style.cursor = 'pointer';
      if (hit) {
        this.tooltip.textContent = `${hit.mesh.userData.skillName} — ${hit.mesh.userData.memberName}`;
        this.tooltip.style.opacity = '1';
        this.tooltip.style.left = `${event.clientX - rect.left + 16}px`;
        this.tooltip.style.top = `${event.clientY - rect.top + 8}px`;
      }
    } else {
      this.canvas.style.cursor = 'grab';
      this.tooltip.style.opacity = '0';
    }
  }

  _onPointerUp() {
    this.drag.active = false;
  }

  _onWheel(event) {
    event.preventDefault();
    this.targetZoom = Math.max(8, Math.min(22, this.targetZoom + event.deltaY * 0.01));
  }

  _size() {
    const rect = this.container.getBoundingClientRect();
    return { width: rect.width || 1, height: rect.height || 1 };
  }

  _onResize() {
    const { width, height } = this._size();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /* ---------------------------------------------------------------------- */
  /* Render loop                                                             */
  /* ---------------------------------------------------------------------- */

  _tick() {
    this.frameId = requestAnimationFrame(this._tick);
    if (!this.isVisible) return;

    const elapsed = this.clock.getElapsedTime();
    const delta = Math.min(this.clock.getDelta(), 0.05);

    this.rotation.x += (this.targetRotation.x - this.rotation.x) * 0.08;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * 0.08;
    this.zoom += (this.targetZoom - this.zoom) * 0.1;

    // Idle auto-rotate when the user isn't dragging
    if (!this.drag.active) {
      this.targetRotation.y += delta * 0.05;
    }

    this.group.rotation.x = this.rotation.x;
    this.group.rotation.y = this.rotation.y;

    this.camera.position.set(0, 1, this.zoom);
    this.camera.lookAt(0, 0, 0);

    // Point light sweeps around for dynamic highlights
    this.pointLight.position.x = Math.cos(elapsed * 0.5) * 6;
    this.pointLight.position.z = Math.sin(elapsed * 0.5) * 6;

    // Animation 1: each member's ring spins at its own speed
    this.rings.forEach((ring) => {
      ring.rotation.y += ring.userData.spin * delta;
    });

    // Animation 2: individual nodes bob up and down
    this.nodes.forEach(({ mesh, group }) => {
      group.position.y = Math.sin(elapsed * 0.8 + mesh.userData.floatOffset) * 0.18;

      if (mesh.userData.pulse && mesh.userData.pulse > 1) {
        mesh.userData.pulse += (1 - mesh.userData.pulse) * 0.15;
        const s = mesh.userData.baseScale * mesh.userData.pulse;
        mesh.scale.set(s, s, s);
        mesh.material.emissiveIntensity = mesh.userData.baseEmissive + (mesh.userData.pulse - 1) * 0.6;
      } else {
        mesh.material.emissiveIntensity = mesh.userData.baseEmissive;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.frameId) cancelAnimationFrame(this.frameId);

    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('resize', this._onResize);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._intersectionObserver) this._intersectionObserver.disconnect();

    this.nodes.forEach(({ mesh, label }) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      label.material.map.dispose();
      label.material.dispose();
    });

    this.tooltip.remove();
    this.renderer.dispose();
  }
}