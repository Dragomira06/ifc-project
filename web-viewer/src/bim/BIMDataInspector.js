import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export class BIMDataInspector {
    constructor(engine, models, ifcLoaderService, cameraManager) {
        this.engine = engine;
        this.models = models;
        this.ifcLoaderService = ifcLoaderService;
        this.cameraManager = cameraManager;

        this.currentlySelected = null;
        this.detectedClashes = [];
        this.structuralTypes = [
            WebIFC.IFCWALLSTANDARDCASE, WebIFC.IFCWALL,
            WebIFC.IFCSLAB, WebIFC.IFCBEAM, WebIFC.IFCROOF, WebIFC.IFCFOOTING
        ];
        this.mepTypes = [WebIFC.IFCFLOWSEGMENT];

        this.initInfoPanel();
        this.setupClickRaycaster();
        this.setupClashDetection();
    }

    initInfoPanel() {
        this.infoPanel = document.createElement('div');
        this.infoPanel.style.cssText = `
            position: fixed; top: 10px; left: 220px;
            background: rgba(0,0,0,0.85); color: white;
            padding: 12px; border-radius: 6px;
            font-size: 13px; max-width: 280px; display: none; z-index: 40;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        document.body.appendChild(this.infoPanel);
    }

    buildElementPanel() {
        const elementList = document.getElementById('elementList');
        if (!elementList) return;
        elementList.innerHTML = '';

        const grouped = {};
        for (const slot of [1, 2]) {
            for (const mesh of this.models[slot].meshes) {
                const typeName = WebIFC.IfcElements ? (WebIFC.IfcElements[mesh.userData.typeCode] || 'Неизвестен') : `Тип ${mesh.userData.typeCode}`;
                if (!grouped[typeName]) grouped[typeName] = [];
                grouped[typeName].push(mesh);
            }
        }

        const sortedTypes = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);

        for (const typeName of sortedTypes) {
            const meshes = grouped[typeName];
            const row = document.createElement('div');
            row.style.cssText = 'margin: 4px 0; display: flex; align-items: center; justify-content: space-between;';

            const labelContainer = document.createElement('label');
            labelContainer.style.cssText = 'display: flex; align-items: center; cursor: pointer;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.style.marginRight = '8px';
            checkbox.addEventListener('change', () => {
                for (const mesh of meshes) {
                    mesh.visible = checkbox.checked;
                }
            });

            const labelText = document.createElement('span');
            labelText.textContent = `${typeName} (${meshes.length})`;

            labelContainer.appendChild(checkbox);
            labelContainer.appendChild(labelText);
            row.appendChild(labelContainer);
            elementList.appendChild(row);
        }

        document.getElementById('elementPanel')?.classList.remove('hidden');

        // Коригирани Event Listeners:
        const showBtn = document.getElementById('showAllBtn');
        if (showBtn) showBtn.onclick = () => this.toggleAllElements(true);

        const hideBtn = document.getElementById('hideAllBtn');
        if (hideBtn) hideBtn.onclick = () => this.toggleAllElements(false);
    }

    toggleAllElements(visible) {
        const checkboxes = document.querySelectorAll('#elementList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = visible;
            cb.dispatchEvent(new Event('change'));
        });
    }

    setupClickRaycaster() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        window.addEventListener('click', (event) => {
            if (this.cameraManager.isFirstPerson || event.target.closest('.panel') || event.target.closest('.btn-panel')) return;

            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, this.engine.camera);
            const visibleMeshes = [...this.models[1].meshes, ...this.models[2].meshes].filter(m => m.visible);
            const intersects = raycaster.intersectObjects(visibleMeshes);

            if (intersects.length > 0) {
                const clicked = intersects[0].object;
                const expressID = clicked.userData.expressID;
                const slot = clicked.userData.modelSlot;
                const ifcApi = this.ifcLoaderService.ifcApi;

                if (expressID !== undefined && ifcApi) {
                    this.currentlySelected = clicked;
                    const props = ifcApi.GetLine(this.models[slot].modelID, expressID);
                    const currentColor = '#' + clicked.material.color.getHexString();

                    this.infoPanel.style.display = 'block';
                    this.infoPanel.innerHTML = `
                        <strong>Модел слот:</strong> ${slot}<br>
                        <strong>Тип:</strong> ${props.constructor?.name || 'IFC Element'}<br>
                        <strong>Име:</strong> ${props.Name?.value || 'няма'}<br>
                        <strong>GUID:</strong> ${props.GlobalId?.value || 'няма'}<br>
                        <strong>Express ID:</strong> ${expressID}<br>
                        <br>
                        <label>Промени цвят: <input type="color" id="colorPicker" value="${currentColor}"></label>
                    `;

                    document.getElementById('colorPicker')?.addEventListener('input', (e) => {
                        this.currentlySelected.material.color.set(new THREE.Color(e.target.value));
                    });
                }
            } else {
                this.infoPanel.style.display = 'none';
            }
        });
    }

    setupClashDetection() {
        const clashBtn = document.getElementById('clashBtn');
        clashBtn?.addEventListener('click', () => {
            this.detectedClashes = [];
            const clashList = document.getElementById('clashList');
            if (clashList) clashList.innerHTML = '';

            const structural = this.models[1].meshes.filter(m => this.structuralTypes.includes(m.userData.typeCode));
            const mep = this.models[2].meshes.filter(m => this.mepTypes.includes(m.userData.typeCode));

            const boxA = new THREE.Box3();
            const boxB = new THREE.Box3();

            for (const meshA of structural) {
                boxA.copy(meshA.geometry.boundingBox).applyMatrix4(meshA.matrixWorld);
                for (const meshB of mep) {
                    boxB.copy(meshB.geometry.boundingBox).applyMatrix4(meshB.matrixWorld);

                    if (boxA.intersectsBox(boxB)) {
                        const intersectionBox = boxA.clone().intersect(boxB);
                        const center = new THREE.Vector3();
                        intersectionBox.getCenter(center);

                        this.detectedClashes.push({
                            meshA, meshB, center,
                            idA: meshA.userData.expressID,
                            idB: meshB.userData.expressID
                        });

                        meshA.material.color.set(0xff0000);
                        meshB.material.color.set(0xff0000);
                        meshB.material.opacity = 1;
                    }
                }
            }

            clashBtn.textContent = `Колизии: ${this.detectedClashes.length} ✓`;
            const clashCountLabel = document.getElementById('clashCount');
            if (clashCountLabel) clashCountLabel.textContent = this.detectedClashes.length;

            this.buildClashInspectorUI();
        });
    }

    buildClashInspectorUI() {
        const clashList = document.getElementById('clashList');
        if (!clashList) return;

        if (this.detectedClashes.length === 0) {
            clashList.innerHTML = '<p style="color:#aaa;">Няма намерени колизии.</p>';
            return;
        }

        this.detectedClashes.slice(0, 50).forEach((clash, index) => {
            const item = document.createElement('div');
            item.className = 'clash-item';

            const nameA = WebIFC.IfcElements ? (WebIFC.IfcElements[clash.meshA.userData.typeCode] || 'Архитектура') : 'Архитектура';
            const nameB = WebIFC.IfcElements ? (WebIFC.IfcElements[clash.meshB.userData.typeCode] || 'Инсталация') : 'Инсталация';

            item.innerHTML = `
                <div class="title">Колизия #${index + 1}</div>
                <div class="details">${nameA} [ID: ${clash.idA}] ↔ ${nameB} [ID: ${clash.idB}]</div>
            `;

            item.addEventListener('click', () => this.focusOnClash(clash));
            clashList.appendChild(item);
        });

        document.getElementById('clashPanel')?.classList.remove('hidden');
    }

    focusOnClash(clash) {
        if (this.cameraManager.isFirstPerson) this.cameraManager.fpControls.unlock();

        const targetPos = clash.center;
        this.cameraManager.orbitControls.target.copy(targetPos);
        this.engine.camera.position.set(targetPos.x + 4, targetPos.y + 4, targetPos.z + 4);
        this.cameraManager.orbitControls.update();

        clash.meshA.material.color.set(0xffff00);
        clash.meshB.material.color.set(0xffff00);
    }
}