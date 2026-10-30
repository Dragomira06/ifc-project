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

        this.selectionRaycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.onObjectSelected = null;

        this.isClashFocused = false;

        this.initControls();
        this.setupFreeZoom();
        this.setupContextMenuPivot();
        this.setupKeyboardListeners();
        this.setupUIEvents();
        this.setupClickSelection();
    }

    // ⚡ Оптимизирано събиране на видими мешове без излишен GC боклук (без flatMap/filter)
    getAllVisibleMeshes() {
        const visible = [];
        if (!this.models) return visible;

        for (const slot in this.models) {
            const model = this.models[slot];
            if (!model || !model.meshes) continue;
            const meshes = model.meshes;
            const len = meshes.length;
            for (let i = 0; i < len; i++) {
                const m = meshes[i];
                if (m && m.visible && !m.userData?.isDeleted) {
                    visible.push(m);
                }
            }
        }
        return visible;
    }

    initControls() {
        this.orbitControls = new OrbitControls(this.engine.camera, this.engine.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.minDistance = 0.001;
        this.orbitControls.maxDistance = 1000;
        this.orbitControls.screenSpacePanning = true;

        // ⚡ On-Demand Rendering: Прерисува автоматично при движение на камерата
        this.orbitControls.addEventListener('change', () => {
            if (this.engine) this.engine.requestRender(2);
        });

        this.fpControls = new PointerLockControls(this.engine.camera, document.body);

        this.fpControls.addEventListener('change', () => {
            if (this.engine) this.engine.requestRender(2);
        });

        this.fpControls.addEventListener('lock', () => {
            this.isFirstPerson = true;
            const navModeBtn = document.getElementById('navModeBtn');
            if (navModeBtn) {
                navModeBtn.textContent = "🔍 Външен изглед (Orbit)";
                navModeBtn.style.background = "#e67e22";
            }
            document.getElementById('fpInstructions')?.classList.remove('hidden');
            if (this.engine) this.engine.requestRender(2);
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
            if (this.engine) this.engine.requestRender(2);
        });
    }

    setupFreeZoom() {
        this.engine.renderer.domElement.addEventListener('wheel', (event) => {
            if (this.isFirstPerson) return;
            if (this.isClashFocused) return; 

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

            this.orbitControls.update();
            if (this.engine) this.engine.requestRender(2);
        }, { passive: true });
    }

    setupContextMenuPivot() {
        const mouse = new THREE.Vector2();
        const raycaster = new THREE.Raycaster();

        window.addEventListener('contextmenu', (event) => {
            if (this.isFirstPerson || event.target.closest('.panel') || event.target.closest('.btn-panel') || event.target.closest('.info-panel')) return;
            event.preventDefault();

            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, this.engine.camera);
            
            const visibleMeshes = this.getAllVisibleMeshes();
            const intersects = raycaster.intersectObjects(visibleMeshes, false);

            if (intersects.length > 0) {
                this.isClashFocused = false;
                this.orbitControls.target.copy(intersects[0].point);
                this.orbitControls.update();
                if (this.engine) this.engine.requestRender(2);
            }
        });
    }

    setupClickSelection() {
        window.addEventListener('click', (event) => {
            if (this.isFirstPerson || event.target.tagName !== 'CANVAS' || event.target.closest('.panel') || event.target.closest('.info-panel')) return;

            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            this.selectionRaycaster.setFromCamera(this.mouse, this.engine.camera);

            const visibleMeshes = this.getAllVisibleMeshes();
            const intersects = this.selectionRaycaster.intersectObjects(visibleMeshes, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                const mesh = hit.object;
                const instanceId = hit.instanceId;

                if (mesh.userData && instanceId !== undefined && this.onObjectSelected) {
                    const instData = mesh.userData.instancesData ? mesh.userData.instancesData[instanceId] : null;

                    this.onObjectSelected({
                        mesh: mesh,
                        instanceId: instanceId,
                        expressID: instData ? instData.expressID : mesh.userData.expressID,
                        typeCode: mesh.userData.typeCode,
                        modelSlot: mesh.userData.modelSlot
                    });

                    if (this.engine) this.engine.requestRender(2);
                }
            }
        });
    }

    setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (!this.isFirstPerson) return;
            let changed = false;
            switch (e.code) {
                case 'KeyW': this.moveState.forward = true; changed = true; break;
                case 'KeyS': this.moveState.backward = true; changed = true; break;
                case 'KeyA': this.moveState.left = true; changed = true; break;
                case 'KeyD': this.moveState.right = true; changed = true; break;
            }
            if (changed && this.engine) this.engine.requestRender(2);
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

    toggleFirstPersonMode() {
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
        
        if (this.engine) this.engine.requestRender(2);
        return this.isFirstPerson;
    }

    setupUIEvents() {
        document.addEventListener('click', (event) => {
            const fpBtn = event.target.closest('#btnFirstPerson, #navModeBtn');
            if (!fpBtn) return;

            this.toggleFirstPersonMode();
        });

        if (this.fpControls) {
            this.fpControls.addEventListener('lock', () => {
                this.isFirstPerson = true;
                const fpInst = document.getElementById('fpInstructions');
                if (fpInst) {
                    fpInst.style.display = 'block';
                    fpInst.classList.remove('hidden');
                }
            });

            this.fpControls.addEventListener('unlock', () => {
                this.isFirstPerson = false;
                this.orbitControls.enabled = true;
                const fpInst = document.getElementById('fpInstructions');
                if (fpInst) {
                    fpInst.style.display = 'none';
                    fpInst.classList.add('hidden');
                }
            });
        }
    }

    focusOn(targetPos, distance = 2.0) {
        if (this.isFirstPerson) {
            this.fpControls.unlock();
        }

        this.isClashFocused = true;

        this.orbitControls.target.copy(targetPos);

        this.engine.camera.position.set(
            targetPos.x + distance,
            targetPos.y + distance * 0.7,
            targetPos.z + distance
        );

        this.engine.camera.lookAt(targetPos);
        this.orbitControls.update();
        if (this.engine) this.engine.requestRender(3);
    }

    // ⚡ Връща true, ако камерата е в активно движение (за on-demand rendering цикъла)
    update() {
        const delta = this.clock.getDelta();
        if (this.isFirstPerson) {
            return this.updateFirstPersonMovement(delta);
        } else {
            const hasMoved = this.orbitControls.update();
            if (hasMoved && this.engine) {
                this.engine.requestRender(1);
            }
            return hasMoved;
        }
    }

    // ⚡ Оптимизирано движение в First Person:
    // Ако потребителят не натиска клавиши и не пада, прескачаме тежкия Raycast към хиляди полигони!
    updateFirstPersonMovement(delta) {
        const isMoving = this.moveState.forward || this.moveState.backward || 
                         this.moveState.left || this.moveState.right;
        const isAirborne = Math.abs(this.verticalVelocity) > 0.001;

        if (!isMoving && !isAirborne) {
            return false;
        }

        const moveDistance = this.MOVE_SPEED * delta;
        if (this.moveState.forward) this.fpControls.moveForward(moveDistance);
        if (this.moveState.backward) this.fpControls.moveForward(-moveDistance);
        if (this.moveState.left) this.fpControls.moveRight(-moveDistance);
        if (this.moveState.right) this.fpControls.moveRight(moveDistance);

        this.floorRaycaster.ray.origin.copy(this.engine.camera.position);
        
        const visibleMeshes = this.getAllVisibleMeshes();
        const intersections = this.floorRaycaster.intersectObjects(visibleMeshes, false);

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

        if (this.engine) this.engine.requestRender(1);
        return true;
    }
}
