// ---  OrbitControls, PointerLockControls (First-Person), свободния скрол, гравитацията и десния клик за фокус ---
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class CameraManager {
    constructor(engine, models) {
        this.engine = engine;
        this.models = models;
        this.isFirstPerson = false;
        
        this.clock = new THREE.Clock();
        this.moveState = { forward: false, backward: false, left: false, right: false };
        this.PLAYER_HEIGHT = 1.7;
        this.MOVE_SPEED = 5.0;
        this.verticalVelocity = 0;
        this.GRAVITY = 18.0;
        this.floorRaycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 3.0);

        this.initControls();
        this.setupFreeZoom();
        this.setupContextMenuPivot();
        this.setupKeyboardListeners();
        this.setupUIEvents();
    }

    initControls() {
        this.orbitControls = new OrbitControls(this.engine.camera, this.engine.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.minDistance = 0.001;
        this.orbitControls.maxDistance = 1000;

        this.fpControls = new PointerLockControls(this.engine.camera, document.body);

        this.fpControls.addEventListener('lock', () => {
            this.isFirstPerson = true;
            const navModeBtn = document.getElementById('navModeBtn');
            if (navModeBtn) {
                navModeBtn.textContent = "🔍 Външен изглед (Orbit)";
                navModeBtn.style.background = "#e67e22";
            }
            document.getElementById('fpInstructions')?.classList.remove('hidden');
        });

        this.fpControls.addEventListener('unlock', () => {
            this.isFirstPerson = false;
            this.orbitControls.enabled = true;
            const navModeBtn = document.getElementById('navModeBtn');
            if (navModeBtn) {
                navModeBtn.textContent = "🚶 Влез вътре (First-Person)";
                navModeBtn.style.background = "#27ae60";
            }
            document.getElementById('fpInstructions')?.classList.add('hidden');
        });
    }

    setupFreeZoom() {
        this.engine.renderer.domElement.addEventListener('wheel', (event) => {
            if (this.isFirstPerson) return;
            const vector = new THREE.Vector3();
            this.engine.camera.getWorldDirection(vector);
            const zoomSpeed = 1.5;

            if (event.deltaY < 0) {
                this.engine.camera.position.addScaledVector(vector, zoomSpeed);
                this.orbitControls.target.addScaledVector(vector, zoomSpeed);
            } else {
                this.engine.camera.position.addScaledVector(vector, -zoomSpeed);
                this.orbitControls.target.addScaledVector(vector, -zoomSpeed);
            }
        }, { passive: true });
    }

    setupContextMenuPivot() {
        const mouse = new THREE.Vector2();
        const raycaster = new THREE.Raycaster();

        window.addEventListener('contextmenu', (event) => {
            if (this.isFirstPerson || event.target.closest('.panel') || event.target.closest('.btn-panel')) return;
            event.preventDefault();

            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, this.engine.camera);
            const visibleMeshes = [...this.models[1].meshes, ...this.models[2].meshes].filter(m => m.visible);
            const intersects = raycaster.intersectObjects(visibleMeshes);

            if (intersects.length > 0) {
                this.orbitControls.target.copy(intersects[0].point);
                this.orbitControls.update();
            }
        });
    }

    setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (!this.isFirstPerson) return;
            switch (e.code) {
                case 'KeyW': this.moveState.forward = true; break;
                case 'KeyS': this.moveState.backward = true; break;
                case 'KeyA': this.moveState.left = true; break;
                case 'KeyD': this.moveState.right = true; break;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (!this.isFirstPerson) return;
            switch (e.code) {
                case 'KeyW': this.moveState.forward = false; break;
                case 'KeyS': this.moveState.backward = false; break;
                case 'KeyA': this.moveState.left = false; break;
                case 'KeyD': this.moveState.right = false; break;
            }
        });
    }

    setupUIEvents() {
        const navModeBtn = document.getElementById('navModeBtn');
        navModeBtn?.addEventListener('click', () => {
            if (!this.isFirstPerson) {
                this.orbitControls.enabled = false;
                const currentPos = this.engine.camera.position.clone();
                this.fpControls.lock();
                this.engine.camera.position.set(
                    currentPos.x,
                    currentPos.y < this.PLAYER_HEIGHT ? this.PLAYER_HEIGHT : currentPos.y,
                    currentPos.z
                );
            } else {
                this.fpControls.unlock();
            }
        });
    }

    update() {
        const delta = this.clock.getDelta();
        if (this.isFirstPerson) {
            this.updateFirstPersonMovement(delta);
        } else {
            this.orbitControls.update();
        }
    }

    updateFirstPersonMovement(delta) {
        const moveDistance = this.MOVE_SPEED * delta;
        if (this.moveState.forward) this.fpControls.moveForward(moveDistance);
        if (this.moveState.backward) this.fpControls.moveForward(-moveDistance);
        if (this.moveState.left) this.fpControls.moveRight(-moveDistance);
        if (this.moveState.right) this.fpControls.moveRight(moveDistance);

        this.floorRaycaster.ray.origin.copy(this.engine.camera.position);
        const visibleMeshes = [...this.models[1].meshes, ...this.models[2].meshes].filter(m => m.visible);
        const intersections = this.floorRaycaster.intersectObjects(visibleMeshes);

        if (intersections.length > 0) {
            const hit = intersections[0];
            const targetY = hit.point.y + this.PLAYER_HEIGHT;

            if (this.engine.camera.position.y <= targetY + 0.3) {
                this.engine.camera.position.y = THREE.MathUtils.lerp(this.engine.camera.position.y, targetY, 0.2);
                this.verticalVelocity = 0;
            } else {
                this.verticalVelocity -= this.GRAVITY * delta;
                this.engine.camera.position.y += this.verticalVelocity * delta;
            }
        } else {
            if (this.engine.camera.position.y > this.PLAYER_HEIGHT) {
                this.verticalVelocity -= this.GRAVITY * delta;
                this.engine.camera.position.y += this.verticalVelocity * delta;
            } else {
                this.engine.camera.position.y = this.PLAYER_HEIGHT;
                this.verticalVelocity = 0;
            }
        }
    }
}
