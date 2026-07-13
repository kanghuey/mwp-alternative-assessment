import * as THREE from 'three';

export class BackgroundScene {
    constructor(canvas, section) {
        this.canvas = canvas;
        this.section = section;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            42,
            1,
            0.1,
            100
        );

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });

        this.renderer.setClearColor(0x000000, 0);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );

        this.clock = new THREE.Clock();

        this.pointerTarget = new THREE.Vector2();
        this.pointerCurrent = new THREE.Vector2();

        this.scrollTarget = 0;
        this.scrollProgress = 0;

        this.startColor = new THREE.Color(0x6d4aff);
        this.endColor = new THREE.Color(0x38bdf8);

        this.cameraFocus = new THREE.Vector3();
        this.isMobile = false;
        this.isDisposed = false;

        this.createLights();
        this.createCube();

        this.animate = this.animate.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerLeave = this.handlePointerLeave.bind(this);
        this.handleScroll = this.handleScroll.bind(this);

        this.section.addEventListener(
            'pointermove',
            this.handlePointerMove
        );

        this.section.addEventListener(
            'pointerleave',
            this.handlePointerLeave
        );

        window.addEventListener(
            'resize',
            this.handleResize
        );

        window.addEventListener(
            'scroll',
            this.handleScroll,
            { passive: true }
        );

        this.handleResize();
        this.handleScroll();
    }

    createLights() {
        const hemisphereLight = new THREE.HemisphereLight(
            0xfff4dc,
            0x665066,
            2.5
        );

        const directionalLight = new THREE.DirectionalLight(
            0xffffff,
            3
        );

        directionalLight.position.set(4, 6, 6);

        this.scene.add(
            hemisphereLight,
            directionalLight
        );
    }

    createCube() {
        const geometry = new THREE.BoxGeometry(
            2.4,
            2.4,
            2.4
        );

        const material = new THREE.MeshStandardMaterial({
            color: this.startColor,
            roughness: 0.35,
            metalness: 0.12
        });

        this.cube = new THREE.Mesh(
            geometry,
            material
        );

        this.cube.rotation.set(
            0.25,
            0.4,
            0
        );

        this.scene.add(this.cube);
    }

    start() {
        if (this.isDisposed) {
            return;
        }

        this.clock.start();
        this.renderer.setAnimationLoop(this.animate);
    }

    animate() {
        const elapsedTime = this.clock.getElapsedTime();

        this.pointerCurrent.lerp(
            this.pointerTarget,
            0.025
        );

        this.scrollProgress = THREE.MathUtils.lerp(
            this.scrollProgress,
            this.scrollTarget,
            0.055
        );

        const scrollAmount = this.smoothStep(
            this.scrollProgress
        );

        this.cube.material.color.lerpColors(
            this.startColor,
            this.endColor,
            scrollAmount
        );

        this.cube.rotation.x =
            0.25 +
            elapsedTime * 0.1 +
            scrollAmount * 0.45;

        this.cube.rotation.y =
            0.4 +
            elapsedTime * 0.14 +
            scrollAmount * 0.8;

        this.cube.position.y =
            Math.sin(elapsedTime * 1.25) * 0.1;

        this.updateCamera();

        this.renderer.render(
            this.scene,
            this.camera
        );
    }

    updateCamera() {
        const radius = this.isMobile ? 7.8 : 7.2;

        const horizontalAngle =
            this.pointerCurrent.x * 0.15;

        const verticalOffset =
            this.pointerCurrent.y * 0.5;

        const focusOffset =
            this.isMobile ? 0 : 2.5;

        this.cameraFocus.set(
            this.cube.position.x - focusOffset,
            this.cube.position.y,
            this.cube.position.z
        );

        this.camera.position.x =
            this.cameraFocus.x +
            Math.sin(horizontalAngle) * radius;

        this.camera.position.z =
            this.cameraFocus.z +
            Math.cos(horizontalAngle) * radius;

        this.camera.position.y =
            this.cameraFocus.y +
            0.8 -
            verticalOffset;

        this.camera.lookAt(
            this.cameraFocus.x,
            this.cameraFocus.y -
            this.pointerCurrent.y * 0.08,
            this.cameraFocus.z
        );
    }

    smoothStep(value) {
        const amount = THREE.MathUtils.clamp(
            value,
            0,
            1
        );

        return (
            amount *
            amount *
            (3 - 2 * amount)
        );
    }

    handlePointerMove(event) {
        const bounds =
            this.section.getBoundingClientRect();

        const pointerX =
            ((event.clientX - bounds.left) /
                bounds.width) *
            2 -
            1;

        const pointerY =
            ((event.clientY - bounds.top) /
                bounds.height) *
            2 -
            1;

        this.pointerTarget.set(
            THREE.MathUtils.clamp(
                pointerX,
                -1,
                1
            ),
            THREE.MathUtils.clamp(
                pointerY,
                -1,
                1
            )
        );
    }

    handlePointerLeave() {
        this.pointerTarget.set(0, 0);
    }

    handleScroll() {
        const bounds =
            this.section.getBoundingClientRect();

        this.scrollTarget =
            THREE.MathUtils.clamp(
                -bounds.top /
                (bounds.height * 0.7),
                0,
                1
            );
    }

    handleResize() {
        const width = this.section.clientWidth;
        const height = this.section.clientHeight;

        this.isMobile = width < 800;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(
            width,
            height,
            false
        );

        this.renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio,
                2
            )
        );

        this.cube.position.x =
            this.isMobile ? 0 : 2.8;

        this.updateCamera();
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;

        this.renderer.setAnimationLoop(null);

        this.section.removeEventListener(
            'pointermove',
            this.handlePointerMove
        );

        this.section.removeEventListener(
            'pointerleave',
            this.handlePointerLeave
        );

        window.removeEventListener(
            'resize',
            this.handleResize
        );

        window.removeEventListener(
            'scroll',
            this.handleScroll
        );

        this.cube.geometry.dispose();
        this.cube.material.dispose();

        this.renderer.dispose();
    }
}