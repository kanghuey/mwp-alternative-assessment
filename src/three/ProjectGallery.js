import * as THREE from 'three';

/**
 * ProjectGallery
 * Interactive Three.js "coverflow" carousel for the Project Gallery section.
 *
 * Reads project data (image, title, description, tech tags) straight from
 * the existing `.projects-grid .project-card` markup, so the 3D showcase
 * always matches whatever projects are listed in index.html. The original
 * grid is kept in the DOM as a no-JS fallback and is hidden once the 3D
 * gallery has successfully initialized.
 *
 * Requirement coverage for this section:
 *  - Interactive gallery / 3D showcase -> drag-to-spin carousel, prev/next
 *    buttons, keyboard left/right navigation, click-to-open detail modal.
 */
export class ProjectGallery {
  constructor(container, canvas, { prevButton, nextButton, modal, dataSource } = {}) {
    this.container = container;
    this.canvas = canvas;
    this.prevButton = prevButton;
    this.nextButton = nextButton;
    this.modal = modal;
    this.dataSource = dataSource;

    this.cards = [];
    this.currentIndex = 0;
    this.wheelAngle = 0;
    this.targetWheelAngle = 0;
    this.radius = 5.2;
    this.isVisible = false;
    this.isHovering = false;

    this.drag = { active: false, lastX: 0, moved: 0 };
    this.clock = new THREE.Clock();
    this.frameId = null;

    this._bind();
    this._readProjectData();
    this._initScene();
    this._initLights();
    this._buildCards();
    this._initEvents();
    this._observeVisibility();
    this._onResize();
    this._tick();

    if (this.dataSource) {
      this.dataSource.classList.add('js-gallery-active');
    }
  }

  _bind() {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
    this._goPrev = () => this._navigate(-1);
    this._goNext = () => this._navigate(1);
    this._onMouseEnter = () => (this.isHovering = true);
    this._onMouseLeave = () => (this.isHovering = false);
    this._onModalClose = () => this.closeModal();
    this._onModalKeyDown = (e) => {
      if (e.key === 'Escape') this.closeModal();
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Data                                                                    */
  /* ---------------------------------------------------------------------- */

  _readProjectData() {
    const cardEls = this.dataSource
      ? Array.from(this.dataSource.querySelectorAll('.project-card'))
      : [];

    this.data = cardEls.map((el) => ({
      image: el.querySelector('.project-image img')?.getAttribute('src') || '',
      title: el.querySelector('.project-content h3')?.textContent?.trim() || 'Project',
      description: el.querySelector('.project-content p')?.textContent?.trim() || '',
      tech: Array.from(el.querySelectorAll('.project-tech span'))
        .map((s) => s.textContent.trim())
        .filter(Boolean),
    }));

    if (this.data.length === 0) {
      this.data = [{ image: '', title: 'Project', description: 'Add project details.', tech: [] }];
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Setup                                                                   */
  /* ---------------------------------------------------------------------- */

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  _initLights() {
    // Technique 1: ambient fill so cards are never fully dark on their back face
    this.scene.add(new THREE.AmbientLight(0xf7efe4, 0.7));

    // Technique 2: a light that orbits with the camera view, giving each
    // card a subtle moving highlight as the carousel spins
    this.keyLight = new THREE.PointLight(0x6d4aff, 22, 40, 2);
    this.keyLight.position.set(0, 4, 8);
    this.scene.add(this.keyLight);
  }

  _makeFallbackTexture(title) {
    const cvs = document.createElement('canvas');
    cvs.width = 512;
    cvs.height = 341;
    const ctx = cvs.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 512, 341);
    gradient.addColorStop(0, '#6d4aff');
    gradient.addColorStop(1, '#00f0ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 341);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 32px "Poppins", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 256, 170);
    const texture = new THREE.CanvasTexture(cvs);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _buildCards() {
    const width = 3.1;
    const height = 2.05;
    const loader = new THREE.TextureLoader();

    this.data.forEach((project, i) => {
      const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.05,
        transparent: true,
        side: THREE.DoubleSide,
        map: this._makeFallbackTexture(project.title),
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.index = i;

      if (project.image) {
        loader.load(
          project.image,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            material.map = tex;
            material.needsUpdate = true;
          },
          undefined,
          () => {
            /* keep fallback texture on load error */
          }
        );
      }

      this.group.add(mesh);
      this.cards.push(mesh);
    });

    this.anglePerCard = (Math.PI * 2) / this.cards.length;
    this._snapTo(0, false);
  }

  /* ---------------------------------------------------------------------- */
  /* Navigation                                                              */
  /* ---------------------------------------------------------------------- */

  _navigate(direction) {
    this.currentIndex = (this.currentIndex + direction + this.cards.length) % this.cards.length;
    this._snapTo(this.currentIndex);
  }

  _snapTo(index, animate = true) {
    this.currentIndex = index;
    this.targetWheelAngle = -index * this.anglePerCard;
    if (!animate) this.wheelAngle = this.targetWheelAngle;
  }

  openModal(index) {
    if (!this.modal) return;
    const project = this.data[index];
    this.modal.querySelector('#modal-project-image').src = project.image;
    this.modal.querySelector('#modal-project-image').alt = project.title;
    this.modal.querySelector('#modal-project-title').textContent = project.title;
    this.modal.querySelector('#modal-project-description').textContent = project.description;

    const techContainer = this.modal.querySelector('#modal-project-tech');
    techContainer.innerHTML = '';
    project.tech.forEach((tag) => {
      const span = document.createElement('span');
      span.textContent = tag;
      techContainer.appendChild(span);
    });

    this.modal.hidden = false;
    this.modal.querySelector('.project-modal-close')?.focus();
  }

  closeModal() {
    if (this.modal) this.modal.hidden = true;
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
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('resize', this._onResize);

    this.container.addEventListener('mouseenter', this._onMouseEnter);
    this.container.addEventListener('mouseleave', this._onMouseLeave);

    this.prevButton?.addEventListener('click', this._goPrev);
    this.nextButton?.addEventListener('click', this._goNext);

    if (this.modal) {
      this.modal.querySelector('.project-modal-close')?.addEventListener('click', this._onModalClose);
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });
      window.addEventListener('keydown', this._onModalKeyDown);
    }

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
    this.drag.moved = 0;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  _onPointerMove(event) {
    if (!this.drag.active) return;
    const deltaX = event.clientX - this.drag.lastX;
    this.drag.lastX = event.clientX;
    this.drag.moved += Math.abs(deltaX);
    this.targetWheelAngle += deltaX * 0.008;
  }

  _onPointerUp(event) {
    if (!this.drag.active) return;
    this.drag.active = false;
    this.canvas.style.cursor = 'grab';

    // A drag with barely any movement counts as a click/tap
    if (this.drag.moved < 4) {
      this._handleClick(event);
      return;
    }

    // Snap to the nearest card so the carousel always settles on one
    const nearest = Math.round(-this.targetWheelAngle / this.anglePerCard);
    this._snapTo(((nearest % this.cards.length) + this.cards.length) % this.cards.length);
  }

  _handleClick(event) {
    this._updatePointerNDC(event);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.cards);
    if (hits.length === 0) return;

    const index = hits[0].object.userData.index;
    if (index === this.currentIndex) {
      this.openModal(index);
    } else {
      this._snapTo(index);
    }
  }

  _onKeyDown(event) {
    // Only steer the carousel with arrow keys while the user is actually
    // hovering/focused on this section, so it doesn't fight the hero scene.
    if (!this.isHovering && !this.isVisible) return;
    if (event.key === 'ArrowLeft') {
      this._navigate(-1);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this._navigate(1);
      event.preventDefault();
    }
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

    this.wheelAngle += (this.targetWheelAngle - this.wheelAngle) * 0.1;

    this.camera.position.set(0, 0.4, this.radius + 6);
    this.camera.lookAt(0, 0, 0);

    this.keyLight.position.x = Math.sin(elapsed * 0.4) * 5;
    this.keyLight.position.z = 6 + Math.cos(elapsed * 0.4) * 2;

    this.cards.forEach((card, i) => {
      const angle = this.wheelAngle + i * this.anglePerCard;
      const depth = (Math.cos(angle) + 1) / 2; // 0 = back, 1 = front

      card.position.set(Math.sin(angle) * this.radius, Math.sin(elapsed * 0.6 + i) * 0.08, Math.cos(angle) * this.radius);
      card.lookAt(this.camera.position);

      const scale = 0.72 + depth * 0.55;
      card.scale.set(scale, scale, 1);
      card.material.opacity = 0.3 + depth * 0.7;
      card.renderOrder = Math.round(depth * 100);
    });

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.frameId) cancelAnimationFrame(this.frameId);

    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keydown', this._onModalKeyDown);
    window.removeEventListener('resize', this._onResize);
    this.container.removeEventListener('mouseenter', this._onMouseEnter);
    this.container.removeEventListener('mouseleave', this._onMouseLeave);
    this.prevButton?.removeEventListener('click', this._goPrev);
    this.nextButton?.removeEventListener('click', this._goNext);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._intersectionObserver) this._intersectionObserver.disconnect();

    this.cards.forEach((card) => {
      card.geometry.dispose();
      if (card.material.map) card.material.map.dispose();
      card.material.dispose();
    });

    this.renderer.dispose();
  }
}