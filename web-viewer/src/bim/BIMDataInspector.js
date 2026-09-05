import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export class BIMDataInspector {
    // 1. Добавихме envManager като 6-ти параметър
    constructor(engine, models, ifcLoaderService, cameraManager, materialManager = null, envManager = null) {
        this.engine = engine;
        this.models = models;
        this.ifcLoaderService = ifcLoaderService;
        this.cameraManager = cameraManager;
        this.materialManager = materialManager;
        this.envManager = envManager; // НОВ РЕД: Запазваме референция към атмосферата

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
        this.setupRenderSwitchButton();
        this.setupEnvironmentUI(); // НОВ РЕД: Инициализира атмосферното меню
    }

    getTypeName(typeCode) {
        return this.typeNames[typeCode] || `Тип ${typeCode}`;
    }

    setupRenderSwitchButton() {
        if (!this.materialManager) return;

        let btn = document.getElementById('renderSwitchBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'renderSwitchBtn';
            btn.innerHTML = '🎨 PBR Реалистичен режим: ИЗКЛ';
            btn.style.cssText = `
                position: fixed; top: 12px; right: 20px; z-index: 50;
                padding: 10px 16px; background: #2c3e50; color: white;
                border: 1px solid #34495e; border-radius: 6px; cursor: pointer;
                font-weight: bold; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                transition: all 0.3s ease;
            `;
            document.body.appendChild(btn);
        }

        btn.onclick = () => {
            const isRealistic = this.materialManager.toggleRealisticMode(this.models);
            btn.innerHTML = isRealistic ? '✨ PBR Реалистичен режим: ВКЛ' : '🎨 PBR Реалистичен режим: ИЗКЛ';
            btn.style.background = isRealistic ? '#27ae60' : '#2c3e50';
        };
    }

    setupEnvironmentUI() {
    if (!this.envManager) return;

    let panel = document.getElementById('envPanelUI');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'envPanelUI';
        panel.style.cssText = `
            position: fixed; top: 60px; right: 20px; z-index: 50;
            background: rgba(20, 25, 35, 0.9); color: white;
            padding: 12px 16px; border-radius: 8px; width: 220px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 4px 15px rgba(0,0,0,0.4); font-size: 12px;
        `;

        panel.innerHTML = `
            <div style="font-weight:bold; margin-bottom:8px; font-size:13px; color:#4a90e2; border-bottom:1px solid #333; padding-bottom:4px;">
                🌅 Атмосфера & Осветление
            </div>

            <div style="margin-bottom:8px;">
                <label style="display:block; margin-bottom:4px; color:#ccc;">Режим:</label>
                <select id="envSelectUI" style="width:100%; padding:5px; background:#111; color:white; border:1px solid #444; border-radius:4px; outline:none; cursor:pointer;">
                    <option value="day">☀️ Дневен режим</option>
                    <option value="night">🌙 Нощен режим</option>
                </select>
            </div>

            <div style="margin-bottom:8px;">
                <label style="display:block; margin-bottom:2px; color:#ccc;">Позиция на слънцето:</label>
                <input type="range" id="sunRotUI" min="0" max="360" value="0" style="width:100%; cursor:pointer;">
            </div>

            <div>
                <label style="display:block; margin-bottom:2px; color:#ccc;">Яркост (Експозиция):</label>
                <input type="range" id="exposureUI" min="0.2" max="2.5" step="0.1" value="1.0" style="width:100%; cursor:pointer;">
            </div>
        `;
        document.body.appendChild(panel);
    }

    // Слушатели за промени от менюто
    document.getElementById('envSelectUI')?.addEventListener('change', (e) => {
        this.envManager.setEnvironment(e.target.value);
    });

    document.getElementById('sunRotUI')?.addEventListener('input', (e) => {
        this.envManager.setSunRotation(parseFloat(e.target.value));
    });

    document.getElementById('exposureUI')?.addEventListener('input', (e) => {
        this.envManager.setLightIntensity(parseFloat(e.target.value));
    });
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
                font-size: 13px; width: 280px; display: none; z-index: 40;
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

        if (data.mesh.userData && data.mesh.userData.instancesData && data.instanceId !== undefined) {
            const instData = data.mesh.userData.instancesData[data.instanceId];
            if (instData) {
                if (instData.Name) name = instData.Name;
                if (instData.GlobalId) guid = instData.GlobalId;
            }
        }

        const currentColor = '#' + data.mesh.material.color.getHexString();
        const currentMatType = data.mesh.userData.materialType || 'plaster';

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
            
            <div style="margin-bottom: 8px;">
                <label style="display:block; margin-bottom:4px; font-size:12px; color:#ccc;">Текстура / Материал:</label>
                <select id="materialSelector" style="width:100%; padding:5px; background:#222; color:white; border:1px solid #555; border-radius:4px; outline:none;">
                    <option value="default" ${currentMatType === 'default' ? 'selected' : ''}>Чертожен вид</option>
                    <option value="plaster" ${currentMatType === 'plaster' ? 'selected' : ''}>Мазилка</option>
                    <option value="stone" ${currentMatType === 'stone' ? 'selected' : ''}>Каменна облицовка (Релеф)</option>
                    <option value="wood" ${currentMatType === 'wood' ? 'selected' : ''}>Дърво</option>
                    <option value="glass" ${currentMatType === 'glass' ? 'selected' : ''}>Стъкло</option>
                    <option value="metal" ${currentMatType === 'metal' ? 'selected' : ''}>Метал</option>
                </select>
            </div>

            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                <span>Нюанс / Цвят:</span>
                <input type="color" id="colorPicker" value="${currentColor}" style="border:none; width:28px; height:28px; cursor:pointer; background:none;">
            </label>
        `;

        document.getElementById('closeInfoBtn').onclick = () => {
            this.infoPanel.style.display = 'none';
        };

        const handleMaterialUpdate = () => {
            if (!this.currentlySelected) return;
            const newColor = document.getElementById('colorPicker').value;
            const newMatType = document.getElementById('materialSelector').value;

            if (this.materialManager && this.materialManager.isRealisticMode) {
                this.materialManager.updateObjectColorAndMaterial(this.currentlySelected, newColor, newMatType);
            } else {
                this.currentlySelected.material.color.set(new THREE.Color(newColor));
                this.currentlySelected.material.needsUpdate = true;
            }
        };

        document.getElementById('colorPicker')?.addEventListener('input', handleMaterialUpdate);
        document.getElementById('materialSelector')?.addEventListener('change', handleMaterialUpdate);
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
            checkbox.checked = true;
            checkbox.style.marginRight = '8px';

            checkbox.addEventListener('change', () => {
                const isVisible = checkbox.checked;
                for (const mesh of meshes) {
                    mesh.visible = isVisible;
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
        this.clearClashMarkers();
        this.detectedClashes = [];
        
        const clashList = document.getElementById('clashList');
        if (clashList) clashList.innerHTML = '';

        const extractInstanceBoxes = (meshes, typeFilter) => {
            const boxes = [];
            const tempMatrix = new THREE.Matrix4();
            const tempBox = new THREE.Box3();

            meshes.forEach(mesh => {
                if (!mesh.userData || !mesh.visible) return;
                if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(mesh.userData.typeCode)) return;
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();

                if (mesh.isInstancedMesh) {
                    for (let i = 0; i < mesh.count; i++) {
                        mesh.getMatrixAt(i, tempMatrix);
                        const worldMatrix = tempMatrix.premultiply(mesh.matrixWorld);
                        tempBox.copy(mesh.geometry.boundingBox).applyMatrix4(worldMatrix);

                        const instData = mesh.userData.instancesData ? mesh.userData.instancesData[i] : null;
                        const expressID = instData ? instData.expressID : mesh.userData.expressID;

                        boxes.push({
                            mesh,
                            instanceId: i,
                            box: tempBox.clone(),
                            expressID: expressID,
                            typeCode: mesh.userData.typeCode
                        });
                    }
                } else {
                    tempBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
                    boxes.push({
                        mesh,
                        instanceId: null,
                        box: tempBox.clone(),
                        expressID: mesh.userData.expressID,
                        typeCode: mesh.userData.typeCode
                    });
                }
            });

            return boxes;
        };

        const structBoxes = extractInstanceBoxes(this.models[1]?.meshes || [], this.structuralTypes);
        const mepBoxes = extractInstanceBoxes(this.models[2]?.meshes || [], this.mepTypes);

        const MIN_OVERLAP_VOLUME = 0.00005; 

        for (const itemA of structBoxes) {
            for (const itemB of mepBoxes) {
                if (itemA.mesh === itemB.mesh && itemA.instanceId === itemB.instanceId) continue;

                if (itemA.box.intersectsBox(itemB.box)) {
                    const intersectionBox = itemA.box.clone().intersect(itemB.box);
                    const size = new THREE.Vector3();
                    intersectionBox.getSize(size);
                    const volume = size.x * size.y * size.z;

                    if (volume > MIN_OVERLAP_VOLUME) {
                        const center = new THREE.Vector3();
                        intersectionBox.getCenter(center);

                        this.detectedClashes.push({
                            itemA, itemB, center, volume,
                            intersectionBox: intersectionBox.clone(),
                            idA: itemA.expressID,
                            idB: itemB.expressID
                        });
                    }
                }
            }
        }

        this.enableXRayMode();

        clashBtn.textContent = `Колизии: ${this.detectedClashes.length} ✓`;
        const clashCountLabel = document.getElementById('clashCount');
        if (clashCountLabel) clashCountLabel.textContent = this.detectedClashes.length;

        this.buildClashInspectorUI();
    });
}

createClashMarker(box3) {
    if (!this.clashMarkersGroup) {
        this.clashMarkersGroup = new THREE.Group();
        this.clashMarkersGroup.name = "ClashMarkersGroup";
        this.engine.scene.add(this.clashMarkersGroup);
    }

    const helper = new THREE.Box3Helper(box3, 0xff0000);
    
    const size = new THREE.Vector3();
    box3.getSize(size);
    const center = new THREE.Vector3();
    box3.getCenter(center);

    const geom = new THREE.BoxGeometry(Math.max(size.x, 0.1), Math.max(size.y, 0.1), Math.max(size.z, 0.1));
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, depthTest: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(center);

    this.clashMarkersGroup.add(helper);
    this.clashMarkersGroup.add(mesh);
}

clearClashMarkers() {
    if (this.clashMarkersGroup) {
        this.engine.scene.remove(this.clashMarkersGroup);
        this.clashMarkersGroup = null;
    }
}

enableXRayMode() {
    const allMeshes = [
        ...(this.models[1]?.meshes || []),
        ...(this.models[2]?.meshes || [])
    ];

    allMeshes.forEach(mesh => {
        if (!mesh.material) return;
        
        if (!mesh.userData.isClashMaterialSet) {
            mesh.material = Array.isArray(mesh.material) 
                ? mesh.material.map(m => m.clone()) 
                : mesh.material.clone();
            mesh.userData.isClashMaterialSet = true;
        }

        const applyTrans = (mat) => {
            mat.transparent = true;
            mat.opacity = 0.25;
        };

        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(applyTrans);
        } else {
            applyTrans(mesh.material);
        }
    });
}

buildClashInspectorUI() {
    const clashList = document.getElementById('clashList');
    if (!clashList) return;

    clashList.innerHTML = '';

    if (this.detectedClashes.length === 0) {
        clashList.innerHTML = '<p style="color:#2ecc71; padding:10px;">✓ Няма открити колизии.</p>';
        return;
    }

    // Добавяне на глобален бутон "Покажи всички"
    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'btn-primary';
    showAllBtn.style.cssText = 'width: 100%; margin-bottom: 10px; background: #e74c3c; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold;';
    showAllBtn.textContent = '👁 Покажи всички колизии наведнъж';
    showAllBtn.addEventListener('click', () => this.highlightAllClashes());
    clashList.appendChild(showAllBtn);

    // Изграждане на списъка
    this.detectedClashes.forEach((clash, index) => {
        const item = document.createElement('div');
        item.className = 'clash-item';
        item.style.cssText = 'padding: 8px; margin: 4px 0; background: rgba(255,255,255,0.08); border-left: 3px solid #e74c3c; cursor: pointer; border-radius: 4px; transition: 0.2s;';

        const nameA = this.getTypeName ? this.getTypeName(clash.itemA.typeCode) : 'Стена/Плоча';
        const nameB = this.getTypeName ? this.getTypeName(clash.itemB.typeCode) : 'Тръба/Канал';
        const pos = clash.center;

        item.innerHTML = `
            <div class="title" style="font-weight:bold; color:#ff6b6b; font-size:13px;">Колизия #${index + 1}</div>
            <div class="details" style="font-size:11px; color:#ccc; margin-top:2px;">
                ${nameA} [ID: ${clash.idA}] ↔ ${nameB} [ID: ${clash.idB}]
            </div>
            <div style="font-size:10px; color:#aaa; margin-top:2px;">
                Обем: ${(clash.volume * 1000).toFixed(2)} dm³ | XYZ: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})
            </div>
        `;

        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.2)');
        item.addEventListener('mouseleave', () => item.style.background = 'rgba(255,255,255,0.08)');
        item.addEventListener('click', () => this.focusOnClash(clash));
        clashList.appendChild(item);
    });

    document.getElementById('clashPanel')?.classList.remove('hidden');
}

  

     
  focusOnClash(clash) {
    if (this.cameraManager && this.cameraManager.isFirstPerson) {
        this.cameraManager.fpControls.unlock();
    }

    const targetPos = clash.center.clone();
    const controls = this.cameraManager?.orbitControls;

    if (controls) {
        // 1. Изключваме автоматичното сместване и заковаваме фокуса
        controls.enablePan = false; 

        // 2. Поставяме фокусната точка ТВОЕНО върху центъра на колизията
        controls.target.set(targetPos.x, targetPos.y, targetPos.z);

        // 3. Наместваме камерата под ъгъл спрямо колизията
        const offset = 2.0;
        this.engine.camera.position.set(
            targetPos.x + offset, 
            targetPos.y + offset * 0.8, 
            targetPos.z + offset
        );

        // 4. Насочваме камерата принудително и обновяваме контролера
        this.engine.camera.lookAt(targetPos);
        controls.update();
    }

    this.enableXRayMode();

    const highlightElement = (item, colorHex) => {
        const mesh = item.mesh;
        if (!mesh.material) return;
        const setMat = (m) => {
            m.transparent = false;
            m.opacity = 1.0;
            m.color?.setHex(colorHex);
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(setMat);
        else setMat(mesh.material);
    };

    highlightElement(clash.itemB, 0xffff00);

    if (clash.intersectionBox) {
        this.clearClashMarkers();
        this.createClashMarker(clash.intersectionBox);
    }
}

highlightAllClashes() {
    this.enableXRayMode();
    this.clearClashMarkers();

    const highlightElement = (item, colorHex) => {
        const mesh = item.mesh;
        if (!mesh.material) return;
        const setMat = (m) => {
            m.transparent = false;
            m.opacity = 1.0;
            m.color?.setHex(colorHex);
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(setMat);
        else setMat(mesh.material);
    };

    this.detectedClashes.forEach(clash => {
        highlightElement(clash.itemB, 0xffff00);
        if (clash.intersectionBox) {
            this.createClashMarker(clash.intersectionBox);
        }
    });

    // Безопасно възстановяване на контролите за цялата сграда
    const controls = this.cameraManager?.orbitControls;
    if (controls) {
        controls.enablePan = true; // Тук вече е вътре в метода и няма да даде грешка

        const buildingBox = new THREE.Box3();
        if (this.models[1]?.meshes) {
            this.models[1].meshes.forEach(m => {
                if (m.geometry?.boundingBox) {
                    const tempBox = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
                    buildingBox.union(tempBox);
                }
            });
        }
        
        const buildingCenter = new THREE.Vector3();
        buildingBox.getCenter(buildingCenter);

        controls.target.copy(buildingCenter);
        controls.update();
    }
}
}