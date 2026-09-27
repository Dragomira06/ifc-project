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

        // Пауза на камерата при плъзгане със стрелките
        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (this.engine.controls) {
                this.engine.controls.enabled = !event.value;
            }
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
            
            const intersects = this.raycaster.intersectObjects(this.engine.scene.children, true);

            const validHits = intersects.filter(hit => 
                hit.object.type === 'Mesh' && 
                !hit.object.isTransformControls && 
                hit.object.parent !== this.transformControls &&
                hit.object.name !== 'transformControl'
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
    }

    deselect() {
        this.selectedMesh = null;
        this.transformControls.detach();
    }
}