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

        this.typeNames = {
            [WebIFC.IFCWALLSTANDARDCASE]: 'Стена',
            [WebIFC.IFCWALL]: 'Стена',
            [WebIFC.IFCWINDOW]: 'Прозорец',
            [WebIFC.IFCDOOR]: 'Врата',
            [WebIFC.IFCSLAB]: 'Плоча / Под',
            [WebIFC.IFCROOF]: 'Покрив',
            [WebIFC.IFCSTAIR]: 'Стълба',
            [WebIFC.IFCSTAIRFLIGHT]: 'Стълба',
            [WebIFC.IFCRAILING]: 'Парапет',
            [WebIFC.IFCFURNISHINGELEMENT]: 'Мебел',
            [WebIFC.IFCCOLUMN]: 'Колона',
            [WebIFC.IFCBEAM]: 'Греда',
            [WebIFC.IFCFLOWSEGMENT]: 'Тръба / Канал'
        };

        this.initInfoPanel();
        this.setupClickSelection();
        this.setupClashDetection();
    }

    getTypeName(typeCode) {
        return this.typeNames[typeCode] || `Тип ${typeCode}`;
    }

    initInfoPanel() {
        let panel = document.getElementById('infoPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'infoPanel';
            panel.className = 'info-panel';
            panel.style.cssText = `
                position: fixed; top: 10px; left: 220px;
                background: rgba(0,0,0,0.85); color: white;
                padding: 12px; border-radius: 6px;
                font-size: 13px; max-width: 280px; display: none; z-index: 40;
                border: 1px solid rgba(255,255,255,0.1);
            `;
            document.body.appendChild(panel);
        }
        this.infoPanel = panel;
    }

    setupClickSelection() {
        if (this.cameraManager) {
            this.cameraManager.onObjectSelected = (data) => this.showPropertiesPanel(data);
        }
    }

    showPropertiesPanel(data) {
        this.currentlySelected = data.mesh;
        const expressID = data.expressID;
        const slot = data.modelSlot;
        const typeName = this.getTypeName(data.typeCode);

        let name = 'няма';
        let guid = 'няма';

        // Дърпаме детайлите от userData
        if (data.mesh.userData && data.mesh.userData.instancesData && data.instanceId !== undefined) {
            const instData = data.mesh.userData.instancesData[data.instanceId];
            if (instData) {
                if (instData.Name) name = instData.Name;
                if (instData.GlobalId) guid = instData.GlobalId;
            }
        }

        const currentColor = '#' + data.mesh.material.color.getHexString();

        this.infoPanel.style.display = 'block';
        this.infoPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; padding-bottom:6px; margin-bottom:8px;">
                <strong style="font-size:14px;">Информация за обекта</strong>
                <button id="closeInfoBtn" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px;">✕</button>
            </div>
            <strong>Модел слот:</strong> ${slot}<br>
            <strong>Тип:</strong> ${typeName}<br>
            <strong>Име:</strong> ${name}<br>
            <strong>GUID:</strong> ${guid}<br>
            <strong>Express ID:</strong> ${expressID}<br>
            <hr style="border:0; border-top:1px solid #444; margin:8px 0;" />
            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                <span>Промени цвят:</span>
                <input type="color" id="colorPicker" value="${currentColor}" style="border:none; width:28px; height:28px; cursor:pointer; background:none;">
            </label>
        `;

        document.getElementById('closeInfoBtn').onclick = () => {
            this.infoPanel.style.display = 'none';
        };

        document.getElementById('colorPicker')?.addEventListener('input', (e) => {
            this.currentlySelected.material.color.set(new THREE.Color(e.target.value));
            this.currentlySelected.material.needsUpdate = true;
        });
    }

    buildElementPanel() {
        const elementList = document.getElementById('elementList');
        if (!elementList) return;
        elementList.innerHTML = '';

        const grouped = {};
        for (const slot of [1, 2]) {
            if (!this.models[slot] || !this.models[slot].meshes) continue;
            for (const mesh of this.models[slot].meshes) {
                const typeName = this.getTypeName(mesh.userData.typeCode);
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
            labelContainer.style.cssText = 'display: flex; align-items: center; cursor: pointer; color: white;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true; // Слагаме ги чекнати по подразбиране
            checkbox.style.marginRight = '8px';

            checkbox.addEventListener('change', () => {
                const isVisible = checkbox.checked;
                for (const mesh of meshes) {
                    mesh.visible = isVisible;
                    // Използваме физическо свиване (scale), за да прескочим Octree преченето
                    if (isVisible) {
                        mesh.scale.set(1, 1, 1);
                    } else {
                        mesh.scale.set(0, 0, 0);
                    }
                    mesh.updateMatrixWorld();
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

    setupClashDetection() {
        const clashBtn = document.getElementById('clashBtn');
        clashBtn?.addEventListener('click', () => {
            this.detectedClashes = [];
            const clashList = document.getElementById('clashList');
            if (clashList) clashList.innerHTML = '';

            const structural = (this.models[1]?.meshes || []).filter(m => this.structuralTypes.includes(m.userData.typeCode));
            const mep = (this.models[2]?.meshes || []).filter(m => this.mepTypes.includes(m.userData.typeCode));

            const boxA = new THREE.Box3();
            const boxB = new THREE.Box3();

            for (const meshA of structural) {
                if (!meshA.geometry.boundingBox) meshA.geometry.computeBoundingBox();
                boxA.copy(meshA.geometry.boundingBox).applyMatrix4(meshA.matrixWorld);

                for (const meshB of mep) {
                    if (!meshB.geometry.boundingBox) meshB.geometry.computeBoundingBox();
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
            item.style.cssText = 'padding: 6px; margin: 4px 0; background: rgba(255,255,255,0.1); cursor: pointer; border-radius: 4px;';

            const nameA = this.getTypeName(clash.meshA.userData.typeCode);
            const nameB = this.getTypeName(clash.meshB.userData.typeCode);

            item.innerHTML = `
                <div class="title" style="font-weight:bold; color:#ff6b6b;">Колизия #${index + 1}</div>
                <div class="details" style="font-size:12px; color:#ccc;">${nameA} [ID: ${clash.idA}] ↔ ${nameB} [ID: ${clash.idB}]</div>
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