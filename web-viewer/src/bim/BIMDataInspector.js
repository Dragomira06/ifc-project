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

        this.setupCoreUI(); // Динамично създаване на UI бутоните
        this.initInfoPanel();
        this.setupClickSelection();
        this.setupClashDetection();
        this.setupRenderSwitchButton();
        this.setupEnvironmentUI(); // НОВ РЕД: Инициализира атмосферното меню
    }

    getTypeName(typeCode) {
        return this.typeNames[typeCode] || `Тип ${typeCode}`;
    }

    


    setupCoreUI() {
        // 1. Скрит Input за качване на втори файл
        let fileInput2 = document.getElementById('fileInput2');
        if (!fileInput2) {
            fileInput2 = document.createElement('input');
            fileInput2.type = 'file';
            fileInput2.id = 'fileInput2';
            fileInput2.className = 'fileInput hidden';
            fileInput2.accept = '.ifc';
            document.body.appendChild(fileInput2);
        }

        fileInput2.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && this.ifcLoaderService) {
                const buffer = await file.arrayBuffer();
                await this.ifcLoaderService.loadIfcFile(buffer, 2);
                this.buildElementPanel();
            }
        });

        // 2. Главен панел с бутони (Горе вдясно, ширина 210px)
        let btnPanel = document.querySelector('.btn-panel');
        if (!btnPanel) {
            btnPanel = document.createElement('div');
            btnPanel.className = 'btn-panel';
            btnPanel.style.cssText = `
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                left: auto !important;
                bottom: auto !important;
                width: 250px !important; /* Точна ширина на панела */
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 50;
            `;
            btnPanel.innerHTML = `
                <button id="addModelBtn" class="btn" style="width: 100%; box-sizing: border-box;">+ Добави втори модел</button>
                <button id="clashBtn" class="btn" style="width: 100%; box-sizing: border-box;">Провери за колизии</button>
                <button id="navModeBtn" class="btn" style="width: 100%; box-sizing: border-box; background: #0077b6; border: 1px solid #90e0ef;">🚶 Влез вътре (First-Person)</button>
            `;
            document.body.appendChild(btnPanel);
        }

        // Закачане на събития към бутоните
        document.getElementById('addModelBtn')?.addEventListener('click', () => fileInput2.click());
        
        document.getElementById('navModeBtn')?.addEventListener('click', () => {
            if (this.cameraManager && this.cameraManager.toggleFirstPersonMode) {
                const isFP = this.cameraManager.toggleFirstPersonMode();
                const fpInstructions = document.getElementById('fpInstructions');
                if (fpInstructions) {
                    fpInstructions.classList.toggle('hidden', !isFP);
                }
            }
        });

        // Логика за бутона "Провери за колизии" (Превключвател / Toggle)
document.getElementById('clashBtn')?.addEventListener('click', () => {
    // Проверяваме дали режимът на колизии е активен в момента
    if (this.isClashActive) {
        this.exitClashMode(); // Затваряме режима
    } else {
        this.runClashDetection(); // Стартираме проверката
    }
});

        

        // 3. Инструкции за FP режим
        let fpInstructions = document.getElementById('fpInstructions');
        if (!fpInstructions) {
            fpInstructions = document.createElement('div');
            fpInstructions.id = 'fpInstructions';
            fpInstructions.className = 'hidden';
            fpInstructions.style.cssText = `
                position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(10,17,40,0.9); color: white; padding: 12px 24px; border-radius: 20px;
                font-size: 13px; pointer-events: none; z-index: 60; border: 1px solid #0077b6; box-shadow: 0 0 15px rgba(0,0,0,0.8);
            `;
            fpInstructions.innerHTML = 'Ходене: <b>W, A, S, D</b> | Завъртане: <b>Мишка</b> | Изход: <b>ESC</b>';
            document.body.appendChild(fpInstructions);
        }

       // 4. Панел с елементи (Фиксиран ДОЛУ ВДЯСНО с отстояние)
        let elementPanel = document.getElementById('elementPanel');
        if (!elementPanel) {
            elementPanel = document.createElement('div');
            elementPanel.id = 'elementPanel';
            elementPanel.className = 'panel hidden';
            elementPanel.style.cssText = `
                position: fixed !important;
                top: auto !important;         /* Премахва позиционирането отгоре */
                bottom: 20px !important;      /* Отстояние от долния ръб */
                right: 20px !important;       /* Отстояние от десния ръб */
                width: 220px;                 /* По-тесен панел */
                max-height: 320px;
                display: flex;
                flex-direction: column;
                z-index: 40;
            `;
            elementPanel.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 14px;">Елементи в модела</h3>
                <div class="panel-actions" style="margin-bottom: 8px;">
                    <button id="showAllBtn" class="btn-small">Покажи всички</button>
                    <button id="hideAllBtn" class="btn-small">Скрий всички</button>
                </div>
                <div id="elementList" style="max-height: 230px; overflow-y: auto; padding-right: 5px;"></div>
            `;
            document.body.appendChild(elementPanel);
        }
     // 5. Панел с колизии
let clashPanel = document.getElementById('clashPanel');
if (!clashPanel) {
    clashPanel = document.createElement('div');
    clashPanel.id = 'clashPanel';
    clashPanel.className = 'panel hidden';
    clashPanel.style.bottom = '10px';
    clashPanel.style.left = '10px';
    
    // Задаваме малки размери на панела:
    clashPanel.style.width = '300px';        // Фиксирана ширина (по-тясна)
    clashPanel.style.maxHeight = '300px';     // Ограничаваме височината, за да не се разпъва нагоре
    clashPanel.style.overflowY = 'auto';      // Включваме скрол за списъка

    clashPanel.innerHTML = `
        <h3 style="margin:0 0 15px 0; font-size:12px;">Списък на колизиите (<span id="clashCount">0</span>)</h3>
        <div id="clashList"></div>
    `;
    document.body.appendChild(clashPanel);
}
    }

    setupRenderSwitchButton() {
        if (!this.materialManager) return;

        let btn = document.getElementById('renderSwitchBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'renderSwitchBtn';
            btn.innerHTML = 'PBR Реалистичен режим: ИЗКЛ';
            btn.style.cssText = `
                position: fixed; top: 12px; left: 20px; z-index: 50;
                padding: 10px 16px; background: #2c3e50; color: white;
                border: 1px solid #34495e; border-radius: 6px; cursor: pointer;
                font-weight: bold; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                transition: all 0.3s ease;
            `;
            document.body.appendChild(btn);
        }

        const oldSlider = document.getElementById('pbrScaleContainer');
        if (oldSlider) oldSlider.remove();

        btn.onclick = () => {
            const isRealistic = this.materialManager.toggleRealisticMode(this.models);
            btn.innerHTML = isRealistic ? 'PBR Реалистичен режим: ВКЛ' : 'PBR Реалистичен режим: ИЗКЛ';
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
                position: fixed; top: 210px; right: 20px; z-index: 50;
                background: rgba(30, 77, 170, 0.9); color: white;
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
                position: fixed; top: 60px; left: 20px;
                background: rgba(56, 139, 186, 0.85); color: white;
                padding: 12px; border-radius: 6px;
                font-size: 13px; width: 220px; display: none; z-index: 40;
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
            labelContainer.style.cssText = 'display: flex; align-items: center; cursor: pointer; color: white; font-size: 12px;';

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

        const elementPanel = document.getElementById('elementPanel');
        if (elementPanel) {
            elementPanel.classList.remove('hidden');
            elementPanel.style.display = 'flex';
        }

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
    // Флаг за следене дали режимът е активен
    this.isClashActive = false;
}

runClashDetection() {
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
    this.isClashActive = true;

    // Външният бутон става червен с опция за изход
    const clashBtn = document.getElementById('clashBtn');
    if (clashBtn) {
        clashBtn.textContent = `❌ Изход от колизии (${this.detectedClashes.length})`;
        clashBtn.style.background = '#e74c3c';
    }

    const clashCountLabel = document.getElementById('clashCount');
    if (clashCountLabel) clashCountLabel.textContent = this.detectedClashes.length;

    this.buildClashInspectorUI();
}

 exitClashMode() {
    this.isClashActive = false;

    // 1. Скриване на панела за колизии
    const clashPanel = document.getElementById('clashPanel');
    if (clashPanel) {
        clashPanel.classList.add('hidden');
        clashPanel.style.display = 'none';
    }

    // 2. Почистване на маркерите
    this.clearClashMarkers();
    this.detectedClashes = [];

    // 3. Възстановяване на нормалния вид на модела (Изход от X-Ray)
    const allMeshes = [
        ...(this.models[1]?.meshes || []),
        ...(this.models[2]?.meshes || [])
    ];

    allMeshes.forEach(mesh => {
        if (!mesh.material) return;

        const disableXRay = (mat) => {
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.depthWrite = true; // Връщаме нормалното рендиране на дълбочина
            mat.needsUpdate = true;
        };

        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(disableXRay);
        } else {
            disableXRay(mesh.material);
        }
    });

    // 4. Връщане на бутона
    const clashBtn = document.getElementById('clashBtn');
    if (clashBtn) {
        clashBtn.textContent = 'Провери за колизии';
        clashBtn.style.background = '';
    }
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
    // Всички 3D обекти от заредените модели
    const allMeshes = [
        ...(this.models[1]?.meshes || []),
        ...(this.models[2]?.meshes || [])
    ];

    allMeshes.forEach(mesh => {
        if (!mesh.material) return;

        // Функция за налагане на полупрозрачност (X-Ray ефект)
        const applyXRay = (mat) => {
            mat.transparent = true;
            mat.opacity = 0.25; // Прозрачност на сградата
            mat.depthWrite = false; // Важно: предотвратява графични артефакти при застъпване
            mat.needsUpdate = true;
        };

        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(applyXRay);
        } else {
            applyXRay(mesh.material);
        }
    });
}

    buildClashInspectorUI() {
    const clashList = document.getElementById('clashList');
    if (!clashList) return;

    clashList.innerHTML = '';

    // Бутон най-отгоре в панела за бърз изход
    const exitBtn = document.createElement('button');
    exitBtn.style.cssText = 'width: 100%; margin-bottom: 4px; background: #555; color: white; border: none; padding: 6px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px;';
    exitBtn.textContent = '🚪 Излез и затвори колизиите';
    exitBtn.addEventListener('click', () => this.exitClashMode());
    clashList.appendChild(exitBtn);

    if (this.detectedClashes.length === 0) {
        const noClashMsg = document.createElement('p');
        noClashMsg.style.cssText = 'color:#2ecc71; padding:5px; margin:0; font-size:12px;';
        noClashMsg.textContent = '✓ Няма открити колизии.';
        clashList.appendChild(noClashMsg);
    } else {
        const showAllBtn = document.createElement('button');
        showAllBtn.style.cssText = 'width: 100%; margin-bottom: 5px; background: #e74c3c; color: white; border: none; padding: 6px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px;';
        showAllBtn.textContent = '👁 Покажи всички колизии наведнъж';
        showAllBtn.addEventListener('click', () => this.highlightAllClashes());
        clashList.appendChild(showAllBtn);

        this.detectedClashes.forEach((clash, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 4px; margin: 2px 0; background: rgba(250,250,250,0.06); border-left: 2px solid #e74c3c; cursor: pointer; border-radius: 3px; transition: 0.2s;';

            const nameA = this.getTypeName ? this.getTypeName(clash.itemA.typeCode) : 'Стена/Плоча';
            const nameB = this.getTypeName ? this.getTypeName(clash.itemB.typeCode) : 'Тръба/Канал';
            const pos = clash.center;

            item.innerHTML = `
                <div style="font-weight:bold; color:#ff6b6b; font-size:12px;">Колизия #${index + 1}</div>
                <div style="font-size:10px; color:#ccc; margin-top:1px;">
                    ${nameA} [ID: ${clash.idA}] ↔ ${nameB} [ID: ${clash.idB}]
                </div>
                <div style="font-size:8px; color:#aaa; margin-top:1px;">
                    Обем: ${(clash.volume * 1000).toFixed(2)} dm³ | XYZ: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})
                </div>
            `;

            item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.2)');
            item.addEventListener('mouseleave', () => item.style.background = 'rgba(255,255,255,0.08)');
            item.addEventListener('click', () => this.focusOnClash(clash));
            clashList.appendChild(item);
        });
    }

    const clashPanel = document.getElementById('clashPanel');
    if (clashPanel) {
        clashPanel.classList.remove('hidden');
        clashPanel.style.display = 'block';
    }
}

    focusOnClash(clash) {
        const targetPos = clash.center.clone();

        if (this.cameraManager) {
            this.cameraManager.focusOn(targetPos, 2.5);
        }

        this.enableXRayMode();

        const highlightElement = (item, colorHex) => {
            const mesh = item.mesh;
            if (!mesh || !mesh.material) return;
            const setMat = (m) => {
                m.transparent = false;
                m.opacity = 1.0;
                if (m.color) m.color.setHex(colorHex);
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
        if (this.cameraManager) {
            this.cameraManager.isClashFocused = false;
        }

        this.enableXRayMode();
        this.clearClashMarkers();

        const highlightElement = (item, colorHex) => {
            const mesh = item.mesh;
            if (!mesh || !mesh.material) return;
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
    }
}