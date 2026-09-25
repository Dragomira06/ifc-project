import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export class BIMDataInspector {
    constructor(engine, models, ifcLoaderService, cameraManager, materialManager = null, envManager = null) {
        this.engine = engine;
        this.models = models;
        this.ifcLoaderService = ifcLoaderService;
        this.cameraManager = cameraManager;
        this.materialManager = materialManager;
        this.envManager = envManager;

        this.currentlySelected = null;
        this.detectedClashes = [];
        this.deletedObjectsStack = [];
        this.activePanelId = null;

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

        this.initToolbarNavigation();
        this.setupClickSelection();
        this.setupClashDetection();
    }

    getTypeName(typeCode) {
        return this.typeNames[typeCode] || `Тип ${typeCode}`;
    }

    /* =========================================================
       1. СТРАНИЧНО МЕНЮ С ИКОНКИ & FLYOUT ПАНЕЛИ
       ========================================================= */
    initToolbarNavigation() {
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

        let navBar = document.getElementById('sideIconNav');
        if (!navBar) {
            navBar = document.createElement('div');
            navBar.id = 'sideIconNav';
            navBar.style.cssText = `
                position: fixed;
                top: 50%;
                right: 20px;
                transform: translateY(-50%);
                width: 60px;
                background: rgba(18, 24, 38, 0.85);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 30px;
                padding: 12px 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                z-index: 100;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            `;
            document.body.appendChild(navBar);
        }

        const navItems = [
            { id: 'btnInfo', icon: 'ℹ️', tooltip: 'Информация за обект', panel: 'infoPanel' },
            { id: 'btnPbr', icon: '✨', tooltip: 'PBR Реалистичен режим', action: 'togglePBR' },
            { id: 'btnAddModel', icon: '➕', tooltip: 'Добави втори модел', action: 'addModel' },
            { id: 'btnClashes', icon: '⚡', tooltip: 'Проверка за колизии', panel: 'clashPanel' },
            { id: 'btnFirstPerson', icon: '🚶', tooltip: 'Влез вътре (First-Person)', action: 'toggleFP' },
            { id: 'btnRestore', icon: '↺', tooltip: 'Върни изтрит обект', action: 'restoreObject' },
            { id: 'btnObjectEditor', icon: '🛠️', tooltip: 'Управление на обект', panel: 'objectEditorPanel' },
            { id: 'btnEnv', icon: '🌅', tooltip: 'Атмосфера и Осветление', panel: 'envPanelUI' },
            { id: 'btnElements', icon: '📑', tooltip: 'Елементи в модела', panel: 'elementPanel' }
        ];

        navBar.innerHTML = '';

        navItems.forEach(item => {
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `position: relative; display: flex; align-items: center;`;

            const btn = document.createElement('button');
            btn.id = item.id;
            btn.innerHTML = item.icon;
            btn.style.cssText = `
                width: 42px;
                height: 42px;
                border-radius: 50%;
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: #fff;
                font-size: 17px;
                cursor: pointer;
                transition: all 0.25s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const tooltip = document.createElement('div');
            tooltip.textContent = item.tooltip;
            tooltip.style.cssText = `
                position: absolute;
                right: 54px;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(10, 15, 26, 0.95);
                color: #fff;
                padding: 6px 12px;
                border-radius: 8px;
                font-size: 12px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;

            btnContainer.appendChild(tooltip);
            btnContainer.appendChild(btn);
            navBar.appendChild(btnContainer);

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(255, 255, 255, 0.25)';
                btn.style.transform = 'scale(1.1)';
                tooltip.style.opacity = '1';
            });

            btn.addEventListener('mouseleave', () => {
                if (this.activePanelId !== item.panel) {
                    btn.style.background = 'rgba(255, 255, 255, 0.08)';
                }
                btn.style.transform = 'scale(1)';
                tooltip.style.opacity = '0';
            });

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.action === 'togglePBR') {
                    if (this.materialManager) {
                        const isRealistic = this.materialManager.toggleRealisticMode(this.models);
                        btn.style.border = isRealistic ? '2px solid #2ecc71' : 'none';
                    }
                } else if (item.action === 'addModel') {
                    fileInput2.click();
                } else if (item.action === 'toggleFP') {
                    this.toggleFirstPersonNavigation();
                } else if (item.action === 'restoreObject') {
                    this.restoreLastDeletedObject();
                } else if (item.panel) {
                    this.toggleSidePanel(item.panel, btn);
                }
            });
        });

        let fpInstructions = document.getElementById('fpInstructions');
        if (!fpInstructions) {
            fpInstructions = document.createElement('div');
            fpInstructions.id = 'fpInstructions';
            fpInstructions.className = 'hidden';
            fpInstructions.style.cssText = `
                position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(10,17,40,0.9); color: white; padding: 12px 24px; border-radius: 20px;
                font-size: 13px; pointer-events: none; z-index: 120; border: 1px solid #0077b6;
                display: none;
            `;
            fpInstructions.innerHTML = 'Ходене: <b>W, A, S, D</b> | Завъртане: <b>Мишка</b> | Изход: <b>ESC</b>';
            document.body.appendChild(fpInstructions);
        }

        this.initFlyoutPanels();
    }

    // Изчистен метод без излишни PointerLock условия
    toggleFirstPersonNavigation() {
        if (!this.cameraManager) {
            console.error("CameraManager липсва!");
            return;
        }

        let isFP = false;

        // Първи опит: през стандартния метод
        if (typeof this.cameraManager.toggleFirstPersonMode === 'function') {
            isFP = this.cameraManager.toggleFirstPersonMode();
        } 
        // Втори опит (резервен): ако режимът се съхранява в променлива
        else if (typeof this.cameraManager.setFirstPersonMode === 'function') {
            this.cameraManager.isFirstPerson = !this.cameraManager.isFirstPerson;
            this.cameraManager.setFirstPersonMode(this.cameraManager.isFirstPerson);
            isFP = this.cameraManager.isFirstPerson;
        }

        // Показване / скриване на подсказката
        const fpInst = document.getElementById('fpInstructions');
        if (fpInst) {
            fpInst.style.display = isFP ? 'block' : 'none';
            fpInst.classList.toggle('hidden', !isFP);
        }

        // Оцветяване на бутона в червено, когато е активен
        const btnFP = document.getElementById('btnFirstPerson');
        if (btnFP) {
            btnFP.style.background = isFP ? '#e74c3c' : 'rgba(255, 255, 255, 0.08)';
            btnFP.style.boxShadow = isFP ? '0 0 10px #e74c3c' : 'none';
        }
    }

   toggleSidePanel(panelId, targetBtn) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // Всички панели в менюто (включително и за управление на обект)
    const allPanels = ['infoPanel', 'envPanelUI', 'elementPanel', 'clashPanel', 'objectEditorPanel'];
    allPanels.forEach(id => {
        if (id !== panelId) {
            const p = document.getElementById(id);
            if (p) p.style.display = 'none';
        }
    });

    if (panel.style.display === 'block' || panel.style.display === 'flex') {
        panel.style.display = 'none';
        this.activePanelId = null;
        if (targetBtn) targetBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    } else {
        panel.style.display = (panelId === 'elementPanel') ? 'flex' : 'block';
        this.activePanelId = panelId;
        if (targetBtn) targetBtn.style.background = '#0077b6';

        if (panelId === 'infoPanel') {
            this.renderPropertiesContent();
        }

        if (panelId === 'clashPanel' && !this.isClashActive) {
            this.runClashDetection();
        }
    }
}

    /* =========================================================
       2. ИЗСКАЧАЩИ ПАНЕЛИ ДО МЕНЮТО (FLYOUTS)
       ========================================================= */
    initFlyoutPanels() {
        const basePanelStyle = `
            position: fixed;
            top: 50%;
            right: 85px;
            transform: translateY(-50%);
            width: 270px;
            background: rgba(18, 24, 38, 0.92);
            backdrop-filter: blur(16px);
            color: white;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            font-size: 13px;
            display: none;
            z-index: 90;
        `;

        // ПАНЕЛ ИНФОРМАЦИЯ ЗА ОБЕКТА (Преместен вдясно до менюто)
        let infoPanel = document.getElementById('infoPanel');
        if (!infoPanel) {
            infoPanel = document.createElement('div');
            infoPanel.id = 'infoPanel';
            infoPanel.style.cssText = basePanelStyle;
            infoPanel.innerHTML = `<div id="infoContent">Кликнете върху обект за преглед.</div>`;
            document.body.appendChild(infoPanel);
        }
        this.infoPanel = infoPanel;

        // АТМОСФЕРА
        let envPanel = document.getElementById('envPanelUI');
        if (!envPanel) {
            envPanel = document.createElement('div');
            envPanel.id = 'envPanelUI';
            envPanel.style.cssText = basePanelStyle;
            envPanel.innerHTML = `
                <div style="font-weight:bold; margin-bottom:12px; font-size:14px; color:#90e0ef; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                    🌅 Атмосфера & Осветление
                </div>
                <div style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:4px; color:#ccc;">Режим:</label>
                    <select id="envSelectUI" style="width:100%; padding:6px; background:#111827; color:white; border:1px solid #374151; border-radius:6px; outline:none;">
                        <option value="day">☀️ Дневен режим</option>
                        <option value="night">🌙 Нощен режим</option>
                    </select>
                </div>
                <div style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:2px; color:#ccc;">Позиция на слънцето:</label>
                    <input type="range" id="sunRotUI" min="0" max="360" value="0" style="width:100%; cursor:pointer;">
                </div>
                <div>
                    <label style="display:block; margin-bottom:2px; color:#ccc;">Яркост (Експозиция):</label>
                    <input type="range" id="exposureUI" min="0.2" max="2.5" step="0.1" value="1.0" style="width:100%; cursor:pointer;">
                </div>
            `;
            document.body.appendChild(envPanel);

            document.getElementById('envSelectUI')?.addEventListener('change', (e) => this.envManager?.setEnvironment(e.target.value));
            document.getElementById('sunRotUI')?.addEventListener('input', (e) => this.envManager?.setSunRotation(parseFloat(e.target.value)));
            document.getElementById('exposureUI')?.addEventListener('input', (e) => this.envManager?.setLightIntensity(parseFloat(e.target.value)));
        }

        // ЕЛЕМЕНТИ
        let elementPanel = document.getElementById('elementPanel');
        if (!elementPanel) {
            elementPanel = document.createElement('div');
            elementPanel.id = 'elementPanel';
            elementPanel.style.cssText = basePanelStyle + ` flex-direction: column; max-height: 380px;`;
            elementPanel.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color:#90e0ef;">📑 Елементи в модела</h3>
                <div style="display:flex; gap:6px; margin-bottom: 8px;">
                    <button id="showAllBtn" style="flex:1; padding:5px; background:#0077b6; color:white; border:none; border-radius:4px; cursor:pointer;">Покажи всички</button>
                    <button id="hideAllBtn" style="flex:1; padding:5px; background:#374151; color:white; border:none; border-radius:4px; cursor:pointer;">Скрий всички</button>
                </div>
                <div id="elementList" style="max-height: 280px; overflow-y: auto; padding-right: 5px;"></div>
            `;
            document.body.appendChild(elementPanel);
        }

        // КОЛИЗИИ
        let clashPanel = document.getElementById('clashPanel');
        if (!clashPanel) {
            clashPanel = document.createElement('div');
            clashPanel.id = 'clashPanel';
            clashPanel.style.cssText = basePanelStyle + ` max-height: 380px; overflow-y: auto;`;
            clashPanel.innerHTML = `
                <h3 style="margin:0 0 10px 0; font-size:14px; color:#e74c3c;">⚡ Колизии (<span id="clashCount">0</span>)</h3>
                <div id="clashList"></div>
            `;
            document.body.appendChild(clashPanel);
        }
    }

    /* =========================================================
       3. ИНФОРМАЦИЯ ЗА ОБЕКТА (УПРАВЛЕНИЕ)
       ========================================================= */
    setupClickSelection() {
        if (this.cameraManager) {
            this.cameraManager.onObjectSelected = (data) => this.updateObjectPropertiesData(data);
        }
    }

    // Обновява данните без да отваря панела автоматично
    updateObjectPropertiesData(data) {
        this.currentlySelected = data.mesh;
        this.selectedObjectData = data; // Запазваме данните за обекта

        // Ако панелът вече е отворен от потребителя, го обновяваме веднага
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel && infoPanel.style.display === 'block') {
            this.renderPropertiesContent();
        }
    }

    // Функция за визуализиране на съдържанието в панела
    renderPropertiesContent() {
        if (!this.infoPanel) return;

        if (!this.currentlySelected || !this.selectedObjectData) {
            this.infoPanel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; margin-bottom:8px;">
                    <strong style="font-size:14px; color:#90e0ef;">Информация за обекта</strong>
                    <button id="closeInfoBtn" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px;">✕</button>
                </div>
                <div style="color:#aaa; font-style:italic;">Моля, кликнете върху обект в модела, за да видите свойствата му.</div>
            `;
            document.getElementById('closeInfoBtn').onclick = () => { this.infoPanel.style.display = 'none'; };
            return;
        }

        const data = this.selectedObjectData;
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
        const currentScale = data.mesh.scale.x || 1.0;

        this.infoPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; margin-bottom:8px;">
                <strong style="font-size:14px; color:#90e0ef;">Информация за обекта</strong>
                <button id="closeInfoBtn" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px;">✕</button>
            </div>
            <b>Модел слот:</b> ${slot}<br>
            <b>Тип:</b> ${typeName}<br>
            <b>Име:</b> ${name}<br>
            <b>GUID:</b> ${guid}<br>
            <b>Express ID:</b> ${expressID}<br>
            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:8px 0;" />
            
            <div style="margin-bottom: 8px;">
                <label style="display:block; margin-bottom:4px; font-size:12px; color:#ccc;">Текстура / Материал:</label>
                <select id="materialSelector" style="width:100%; padding:5px; background:#111827; color:white; border:1px solid #374151; border-radius:4px; outline:none;">
                    <option value="default" ${currentMatType === 'default' ? 'selected' : ''}>Чертожен вид</option>
                    <option value="plaster" ${currentMatType === 'plaster' ? 'selected' : ''}>Мазилка</option>
                    <option value="stone" ${currentMatType === 'stone' ? 'selected' : ''}>Каменна облицовка</option>
                    <option value="wood" ${currentMatType === 'wood' ? 'selected' : ''}>Дърво</option>
                    <option value="glass" ${currentMatType === 'glass' ? 'selected' : ''}>Стъкло</option>
                    <option value="metal" ${currentMatType === 'metal' ? 'selected' : ''}>Метал</option>
                </select>
            </div>

            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; margin-bottom: 8px;">
                <span>Нюанс / Цвят:</span>
                <input type="color" id="colorPicker" value="${currentColor}" style="border:none; width:28px; height:28px; cursor:pointer; background:none;">
            </label>

            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:8px 0;" />
            <div style="margin-bottom: 8px;">
                <label style="display:block; margin-bottom:2px; font-size:12px; color:#ccc;">Мащабиране (<span id="scaleValLabel">${currentScale.toFixed(1)}</span>x):</label>
                <input type="range" id="objectScaleSlider" min="0.1" max="3.0" step="0.1" value="${currentScale}" style="width:100%; cursor:pointer;">
            </div>

            <button id="deleteObjectBtn" style="width:100%; background:#e74c3c; color:white; border:none; padding:6px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">🗑 Изтрий обекта</button>
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

        document.getElementById('objectScaleSlider')?.addEventListener('input', (e) => {
            const factor = parseFloat(e.target.value);
            document.getElementById('scaleValLabel').textContent = factor.toFixed(1);
            this.scaleSelectedObject(factor);
        });

        document.getElementById('deleteObjectBtn')?.addEventListener('click', () => {
            this.deleteSelectedObject();
        });
    }

    scaleSelectedObject(factor) {
        if (!this.currentlySelected) return;
        this.currentlySelected.scale.set(factor, factor, factor);
        this.currentlySelected.updateMatrixWorld();
    }

    deleteSelectedObject() {
        if (!this.currentlySelected) return;

        this.deletedObjectsStack.push({
            mesh: this.currentlySelected,
            visible: this.currentlySelected.visible,
            scale: this.currentlySelected.scale.clone()
        });

        this.currentlySelected.visible = false;
        this.currentlySelected.scale.set(0, 0, 0);
        this.currentlySelected.updateMatrixWorld();

        this.infoPanel.style.display = 'none';
        this.currentlySelected = null;
    }

    restoreLastDeletedObject() {
        if (this.deletedObjectsStack.length === 0) {
            alert('Няма изтрити обекти за възстановяване.');
            return;
        }

        const lastDeleted = this.deletedObjectsStack.pop();
        if (lastDeleted && lastDeleted.mesh) {
            lastDeleted.mesh.visible = true;
            lastDeleted.mesh.scale.copy(lastDeleted.scale);
            lastDeleted.mesh.updateMatrixWorld();
        }
    }

    /* =========================================================
       4. ПАНЕЛ ЕЛЕМЕНТИ И ПРОВЕРКА ЗА КОЛИЗИИ
       ========================================================= */
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
        this.isClashActive = false;
    }

    runClashDetection() {
        this.clearClashMarkers();
        this.detectedClashes = [];

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

        const clashCountLabel = document.getElementById('clashCount');
        if (clashCountLabel) clashCountLabel.textContent = this.detectedClashes.length;

        this.buildClashInspectorUI();
    }

    exitClashMode() {
        this.isClashActive = false;

        const clashPanel = document.getElementById('clashPanel');
        if (clashPanel) clashPanel.style.display = 'none';

        this.clearClashMarkers();
        this.detectedClashes = [];

        const allMeshes = [
            ...(this.models[1]?.meshes || []),
            ...(this.models[2]?.meshes || [])
        ];

        allMeshes.forEach(mesh => {
            if (!mesh.material) return;
            const disableXRay = (mat) => {
                mat.transparent = false;
                mat.opacity = 1.0;
                mat.depthWrite = true;
                mat.needsUpdate = true;
            };
            if (Array.isArray(mesh.material)) mesh.material.forEach(disableXRay);
            else disableXRay(mesh.material);
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
            const applyXRay = (mat) => {
                mat.transparent = true;
                mat.opacity = 0.25;
                mat.depthWrite = false;
                mat.needsUpdate = true;
            };
            if (Array.isArray(mesh.material)) mesh.material.forEach(applyXRay);
            else applyXRay(mesh.material);
        });
    }

    buildClashInspectorUI() {
        const clashList = document.getElementById('clashList');
        if (!clashList) return;

        clashList.innerHTML = '';

        const exitBtn = document.createElement('button');
        exitBtn.style.cssText = 'width: 100%; margin-bottom: 6px; background: #374151; color: white; border: none; padding: 6px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px;';
        exitBtn.textContent = '🚪 Излез от колизиите';
        exitBtn.addEventListener('click', () => this.exitClashMode());
        clashList.appendChild(exitBtn);

        if (this.detectedClashes.length === 0) {
            const noClashMsg = document.createElement('p');
            noClashMsg.style.cssText = 'color:#2ecc71; padding:5px; margin:0; font-size:12px;';
            noClashMsg.textContent = '✓ Няма открити колизии.';
            clashList.appendChild(noClashMsg);
        } else {
            // ВЪЗСТАНОВЕН БУТОН ЗА ПОКАЗВАНЕ НА ВСИЧКИ КОЛИЗИИ
            const showAllBtn = document.createElement('button');
            showAllBtn.style.cssText = 'width: 100%; margin-bottom: 8px; background: #e74c3c; color: white; border: none; padding: 6px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px;';
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
    }

    focusOnClash(clash) {
        if (this.cameraManager) {
            this.cameraManager.focusOn(clash.center.clone(), 2.5);
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
        this.enableXRayMode();
        this.clearClashMarkers();

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

        this.detectedClashes.forEach(clash => {
            highlightElement(clash.itemB, 0xffff00);
            if (clash.intersectionBox) {
                this.createClashMarker(clash.intersectionBox);
            }
        });
    }
}