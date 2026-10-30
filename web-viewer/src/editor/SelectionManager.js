import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

export class SelectionManager {
    constructor(engine, materialManager, inspector = null) {
        this.engine = engine;
        this.materialManager = materialManager;
        this.inspector = inspector;
        
        this.selectedMesh = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // 1. Инициализиране на 3D стрелките (Gizmo)
        this.transformControls = new TransformControls(
            this.engine.camera, 
            this.engine.renderer.domElement
        );
        this.transformControls.setSize(0.75);
        this.engine.scene.add(this.transformControls);

        // ⚡ On-Demand Rendering: Прерисува при местене с 3D стрелките
        this.transformControls.addEventListener('change', () => {
            if (this.engine) this.engine.requestRender(2);
        });

        // Пауза на въртенето на камерата при плъзгане със стрелките
        this.transformControls.addEventListener('dragging-changed', (event) => {
            const orbit = this.inspector?.cameraManager?.orbitControls || this.engine?.orbitControls;
            if (orbit) {
                orbit.enabled = !event.value;
            }
            if (this.engine) this.engine.requestRender(2);
        });

        this.initEvents();
    }

    setInspector(inspector) {
        this.inspector = inspector;
    }

    initEvents() {
        const dom = this.engine.renderer.domElement;

        dom.addEventListener('click', (event) => {
            if (this.transformControls.dragging) return;

            const rect = dom.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.engine.camera);
            
            // ⚡ Оптимизация на търсенето: Използваме директно видимите мешове на модела
            // вместо тежък рекурсивен traverse на цялата сцена с всички светлини и помощни обекти
            const candidateMeshes = this.inspector?.cameraManager
                ? this.inspector.cameraManager.getAllVisibleMeshes()
                : this.engine.scene.children;

            const intersects = this.raycaster.intersectObjects(candidateMeshes, false);

            const validHits = intersects.filter(hit => 
                hit.object.type === 'Mesh' || hit.object.isInstancedMesh
            );

            if (validHits.length > 0) {
                this.selectObject(validHits[0].object);
            } else {
                this.deselect();
            }
        });
    }

    selectObject(mesh) {
        this.selectedMesh = mesh;
        
        // Закрепваме 3D стрелките към обекта
        this.transformControls.attach(mesh);

        if (this.inspector && typeof this.inspector.updateObjectPropertiesData === 'function') {
            this.inspector.updateObjectPropertiesData({ mesh: mesh });
        }

        if (this.engine) this.engine.requestRender(2);
    }

    deselect() {
        this.selectedMesh = null;
        this.transformControls.detach();
        if (this.engine) this.engine.requestRender(2);
    }
}
