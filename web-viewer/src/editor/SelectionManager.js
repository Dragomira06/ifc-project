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

        // Масив за история на изтритите обекти
        this.deletedObjects = [];

        // 1. Инициализиране на 3D стрелките
        this.transformControls = new TransformControls(
            this.engine.camera, 
            this.engine.renderer.domElement
        );
        this.transformControls.setSize(0.75); // Визуален размер на стрелките
        this.engine.scene.add(this.transformControls);

        // Пауза на камерата при плъзгане със стрелките
        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (this.engine.controls) {
                this.engine.controls.enabled = !event.value;
            }
        });

        this.createInspectorUI();
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

            // Филтрираме стрелките да не се селектират сами себе си
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
        
        this.updateUI();

        if (this.inspector && typeof this.inspector.selectMesh === 'function') {
            this.inspector.selectMesh(mesh);
        }
    }

    deselect() {
        this.selectedMesh = null;
        this.transformControls.detach();
        if (this.panel) this.panel.style.display = 'none';
    }

    createInspectorUI() {
        this.panel = document.createElement('div');
        this.panel.id = 'objectEditorPanel';
        this.panel.style.cssText = `
            position: fixed; bottom: 20px; left: 20px; z-index: 100;
            padding: 14px; background: rgba(30, 39, 46, 0.95); color: white;
            border: 1px solid #3c6382; border-radius: 8px; font-size: 13px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4); display: none; flex-direction: column; gap: 10px;
            backdrop-filter: blur(5px); font-family: sans-serif; min-width: 230px;
        `;

        this.panel.innerHTML = `
            <div style="font-weight: bold; border-bottom: 1px solid #485460; padding-bottom: 4px; display: flex; justify-content: space-between;">
                <span>🛠️ Управление на обект</span>
                <span id="closeEditorBtn" style="cursor: pointer; color: #ff5e57;">✕</span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label>📐 Индивидуален мащаб:</label>
                <input type="range" id="objScaleInput" min="-5" max="0.7" step="0.01" value="-4" style="cursor: pointer;">
                <span id="objScaleVal" style="font-size: 11px; color: #dcdde1; text-align: right;">1.0</span>
            </div>

            <div style="display: flex; gap: 6px; margin-top: 4px;">
                <button id="deleteObjBtn" style="flex: 1; padding: 7px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">🗑️ Изтрий обекта</button>
            </div>

            <div style="display: flex; gap: 6px; border-top: 1px solid #485460; padding-top: 8px;">
                <button id="undoDeleteBtn" style="flex: 1; padding: 6px; background: #2980b9; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">↩️ Върни изтрит обект</button>
            </div>
        `;

        document.body.appendChild(this.panel);

        this.panel.querySelector('#closeEditorBtn').onclick = () => this.deselect();

        // 1. Изтриване
        this.panel.querySelector('#deleteObjBtn').onclick = () => {
            if (this.selectedMesh) {
                const target = this.selectedMesh;
                const parent = target.parent || this.engine.scene;

                this.deletedObjects.push({
                    object: target,
                    parent: parent
                });

                parent.remove(target);
                this.deselect();
            }
        };

        // 2. Върни последно изтрития обект (Undo)
        this.panel.querySelector('#undoDeleteBtn').onclick = () => {
            if (this.deletedObjects.length > 0) {
                const lastDeleted = this.deletedObjects.pop();
                lastDeleted.parent.add(lastDeleted.object);
            }
        };

        // 3. Индивидуално мащабиране
        const scaleInput = this.panel.querySelector('#objScaleInput');
        const scaleValDisplay = this.panel.querySelector('#objScaleVal');

        scaleInput.addEventListener('input', (e) => {
            if (!this.selectedMesh) return;

            const mesh = this.selectedMesh;
            const matType = mesh.userData?.materialType;

            // БЕЗОПАСНОСТ: За стъкло не променяме скалата, за да не чупим материалите му
            if (matType === 'glass') {
                return;
            }

            const expValue = Math.pow(10, parseFloat(e.target.value));
            scaleValDisplay.textContent = expValue < 0.01 ? expValue.toFixed(5) : expValue.toFixed(2);

            // 1. Ако няма uScale (не е Triplanar материал), му прилагаме PBR материал
            if (!mesh.material?.userData?.uScale) {
                if (this.materialManager) {
                    this.materialManager.applyPBRMaterial(mesh);
                }
            }

            // 2. Ако материалът не е уникален за този обект, създаваме ново ИСТИНСКО копие с onBeforeCompile
            if (!mesh.userData.hasUniqueMaterial && mesh.material) {
                const oldMat = mesh.material;
                
                // Прилагаме отново PBR материала, което генерира нов чист Triplanar с работещ onBeforeCompile
                if (this.materialManager) {
                    const typeToApply = matType || 'stone';
                    const currentColor = oldMat.color ? oldMat.color.clone() : null;
                    this.materialManager.applyPBRMaterial(mesh, typeToApply, currentColor);
                }

                mesh.userData.hasUniqueMaterial = true;
            }

            // Маркираме обекта като персонализиран
            mesh.userData.isCustomScaled = true;

            // 3. Задаваме новата стойност на мащаба, само ако съществува
            if (mesh.material?.userData?.uScale) {
                mesh.material.userData.uScale.value = expValue;
            }
        });
    }

    updateUI() {
        if (!this.selectedMesh) return;
        this.panel.style.display = 'flex';

        const scaleInput = this.panel.querySelector('#objScaleInput');
        const scaleValDisplay = this.panel.querySelector('#objScaleVal');

        const mat = this.selectedMesh.material;
        const isGlass = this.selectedMesh.userData?.materialType === 'glass';

        // Ако е селектирано стъкло, деактивираме слайдера за мащаб
        if (isGlass) {
            scaleInput.disabled = true;
            scaleValDisplay.textContent = "N/A (Стъкло)";
        } else {
            scaleInput.disabled = false;
            // Четем текущата скала от материала и настройваме слайдера
            if (mat && mat.userData && mat.userData.uScale) {
                const currentVal = mat.userData.uScale.value;
                scaleInput.value = Math.log10(currentVal);
                scaleValDisplay.textContent = currentVal < 0.01 ? currentVal.toFixed(5) : currentVal.toFixed(2);
            } else {
                scaleInput.value = Math.log10(1.0);
                scaleValDisplay.textContent = "1.00";
            }
        }
    }
}