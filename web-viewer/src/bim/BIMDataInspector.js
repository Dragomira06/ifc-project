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
        this.selectedObjectData = null;
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

                let nextSlot = 1;
                while (this.models[nextSlot] && this.models[nextSlot].meshes && this.models[nextSlot].meshes.length > 0) {
                    nextSlot++;
                }

                await this.ifcLoaderService.loadIfcFile(buffer, nextSlot);
                this.buildElementPanel();
                e.target.value = '';
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
            { id: 'btnPbr', icon: '✨', tooltip: 'PBR Настройки & Управление', panel: 'pbrPanelUI' },
            { id: 'btnAddModel', icon: '➕', tooltip: 'Добави втори модел', action: 'addModel' },
            { id: 'btnClashes', icon: '⚡', tooltip: 'Проверка за колизии', panel: 'clashPanel' },
            { id: 'btnFirstPerson', icon: '🚶', tooltip: 'Влез вътре (First-Person)', action: 'toggleFP' },
            { id: 'btnEnv', icon: '🌅', tooltip: 'Атмосфера и Осветление', panel: 'envPanelUI' },
            { id: 'btnElements', icon: '📑', tooltip: 'Елементи в модела', panel: 'elementPanel' },
            { id: 'btnProject', icon: '💾', tooltip: 'Запази / Зареди проект', panel: 'projectPanel' }
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
                if (item.action === 'addModel') {
                    fileInput2.click();
                } else if (item.action === 'toggleFP') {
                    this.toggleFirstPersonNavigation();
                } else if (item.panel) {
                    this.toggleSidePanel(item.panel, btn);
                }
            });
        });

        this.initFlyoutPanels();
    }

    toggleFirstPersonNavigation() {
        if (!this.cameraManager) {
            console.error("CameraManager липсва!");
            return;
        }

        let isFP = false;

        if (typeof this.cameraManager.toggleFirstPersonMode === 'function') {
            isFP = this.cameraManager.toggleFirstPersonMode();
        } 
        else if (typeof this.cameraManager.setFirstPersonMode === 'function') {
            this.cameraManager.isFirstPerson = !this.cameraManager.isFirstPerson;
            this.cameraManager.setFirstPersonMode(this.cameraManager.isFirstPerson);
            isFP = this.cameraManager.isFirstPerson;
        }

        const fpInst = document.getElementById('fpInstructions');
        if (fpInst) {
            fpInst.style.display = isFP ? 'block' : 'none';
            fpInst.classList.toggle('hidden', !isFP);
        }

        const btnFP = document.getElementById('btnFirstPerson');
        if (btnFP) {
            btnFP.style.background = isFP ? '#e74c3c' : 'rgba(255, 255, 255, 0.08)';
            btnFP.style.boxShadow = isFP ? '0 0 10px #e74c3c' : 'none';
        }
    }

    toggleSidePanel(panelId, targetBtn) {
        const panel = document.getElementById(panelId);
        if (!panel) return;

        const allPanels = ['infoPanel', 'pbrPanelUI', 'envPanelUI', 'elementPanel', 'clashPanel', 'objectEditorPanel', 'projectPanel'];
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

            if (panelId === 'pbrPanelUI') {
                this.renderPBRPanelContent();
            }

            if (panelId === 'elementPanel') {
                this.buildElementPanel();
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

        let infoPanel = document.getElementById('infoPanel');
        if (!infoPanel) {
            infoPanel = document.createElement('div');
            infoPanel.id = 'infoPanel';
            infoPanel.style.cssText = basePanelStyle;
            infoPanel.innerHTML = `<div id="infoContent">Кликнете върху обект за преглед.</div>`;
            document.body.appendChild(infoPanel);
        }
        this.infoPanel = infoPanel;

        let pbrPanel = document.getElementById('pbrPanelUI');
        if (!pbrPanel) {
            pbrPanel = document.createElement('div');
            pbrPanel.id = 'pbrPanelUI';
            pbrPanel.style.cssText = basePanelStyle;
            document.body.appendChild(pbrPanel);
        }
        this.pbrPanel = pbrPanel;

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

        let elementPanel = document.getElementById('elementPanel');
        if (!elementPanel) {
            elementPanel = document.createElement('div');
            elementPanel.id = 'elementPanel';
            elementPanel.style.cssText = basePanelStyle + ` flex-direction: column; max-height: 380px;`;
            elementPanel.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color:#90e0ef;">📑 Елементи в модела</h3>
                <div style="display:flex; gap:6px; margin-bottom: 8px;">
                    <button id="showAllBtn" style="flex:1; padding:5px; background:#0077b6; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Покажи всички</button>
                    <button id="hideAllBtn" style="flex:1; padding:5px; background:#374151; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Скрий всички</button>
                </div>
                <div id="elementList" style="max-height: 280px; overflow-y: auto; padding-right: 5px;"></div>
            `;
            document.body.appendChild(elementPanel);
        }

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

        let projectPanel = document.getElementById('projectPanel');
        if (!projectPanel) {
            projectPanel = document.createElement('div');
            projectPanel.id = 'projectPanel';
            projectPanel.style.cssText = basePanelStyle;
            projectPanel.innerHTML = `
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color:#90e0ef;">💾 Управление на проект</h3>
                <div style="margin-bottom: 12px;">
                    <label style="display:block; margin-bottom:4px; font-size:12px; color:#ccc;">Име на проекта:</label>
                    <input type="text" id="projectNameInput" placeholder="например: MyBIMProject" style="width:100%; padding:6px; background:#111827; color:white; border:1px solid #374151; border-radius:6px; outline:none; font-size:12px;">
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                    <button id="saveProjectJson" style="flex:1; padding:8px; background:#2ecc71; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">💾 Запази</button>
                    <button id="loadProjectJson" style="flex:1; padding:8px; background:#3498db; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">📂 Зареди</button>
                    <input type="file" id="importJsonInput" accept=".json" style="display: none;">
                </div>
                <div style="font-size: 11px; color: #aaa; line-height: 1.4; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                    <b>Как работи:</b><br>
                    1. Заредете 3D модела (.ifc).<br>
                    2. Направете редакции, материали или изтривания.<br>
                    3. Запазете пълното състояние чрез "Запази".<br>
                    4. При следващо зареждане натиснете "Зареди" за пълно възстановяване.
                </div>
            `;
            document.body.appendChild(projectPanel);
        }

        document.getElementById('saveProjectJson')?.addEventListener('click', () => {
            this.exportProjectToJson();
        });

        const loadBtn = document.getElementById('loadProjectJson');
        const fileInput = document.getElementById('importJsonInput');

        loadBtn?.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importProjectFromJson(file);
            }
            fileInput.value = '';
        });
    }

    /* =========================================================
       3. ИНФОРМАЦИЯ ЗА ОБЕКТА & PBR МАТЕРИАЛИ
       ========================================================= */
    setupClickSelection() {
        if (this.cameraManager) {
            this.cameraManager.onObjectSelected = (data) => this.updateObjectPropertiesData(data);
        }
    }

    updateObjectPropertiesData(data) {
        if (!data) return;
        this.currentlySelected = data.mesh;
        this.selectedObjectData = data;

        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel && infoPanel.style.display === 'block') {
            this.renderPropertiesContent();
        }

        const pbrPanel = document.getElementById('pbrPanelUI');
        if (pbrPanel && pbrPanel.style.display === 'block') {
            this.renderPBRPanelContent();
        }
    }

    // ПАНЕЛ: ИНФОРМАЦИЯ ЗА ОБЕКТА
    renderPropertiesContent() {
        if (!this.infoPanel) return;

        if (!this.currentlySelected) {
            this.infoPanel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; margin-bottom:8px;">
                    <strong style="font-size:14px; color:#90e0ef;">Информация за обекта</strong>
                    <button id="closeInfoBtn" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px;">✕</button>
                </div>
                <div style="color:#aaa; font-style:italic; margin-bottom: 12px;">Моля, кликнете върху обект в модела, за да видите свойствата му.</div>
                <button id="restoreObjectBtn" style="width:100%; background:#2980b9; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">↩️ Върни изтрития обект</button>
            `;
            document.getElementById('closeInfoBtn').onclick = () => { this.infoPanel.style.display = 'none'; };
            document.getElementById('restoreObjectBtn').onclick = () => { this.restoreLastDeletedObject(); };
            return;
        }

        const mesh = this.currentlySelected;
        const data = this.selectedObjectData || {};
        const expressID = data.expressID || mesh.userData?.expressID || 'няма';
        const slot = data.modelSlot || mesh.userData?.modelSlot || 1;
        const typeCode = data.typeCode || mesh.userData?.typeCode;
        const typeName = this.getTypeName ? this.getTypeName(typeCode) : (typeCode || 'Неизвестен');

        let name = 'няма';
        let guid = 'няма';

        if (mesh.userData && mesh.userData.instancesData && data.instanceId !== undefined) {
            const instData = mesh.userData.instancesData[data.instanceId];
            if (instData) {
                if (instData.Name) name = instData.Name;
                if (instData.GlobalId) guid = instData.GlobalId;
            }
        }

        const currentScale = mesh.userData?.currentScale || (mesh.scale.x > 0 ? mesh.scale.x : 1.0);

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

            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;" />
            <div style="margin-bottom: 12px;">
                <label style="display:block; margin-bottom:4px; font-size:12px; color:#ccc;">Мащабиране (<span id="scaleValLabel">${currentScale.toFixed(1)}</span>x):</label>
                <input type="range" id="objectScaleSlider" min="0.1" max="3.0" step="0.1" value="${currentScale}" style="width:100%; cursor:pointer;">
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
                <button id="deleteObjectBtn" style="width:100%; background:#e74c3c; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">🗑 Изтрий обекта</button>
                <button id="restoreObjectBtn" style="width:100%; background:#2980b9; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">↩️ Върни изтрития обект</button>
            </div>
        `;

        document.getElementById('closeInfoBtn').onclick = () => {
            this.infoPanel.style.display = 'none';
        };

        document.getElementById('objectScaleSlider')?.addEventListener('input', (e) => {
            const factor = parseFloat(e.target.value);
            document.getElementById('scaleValLabel').textContent = factor.toFixed(1);
            this.scaleSelectedObject(factor);
        });

        document.getElementById('deleteObjectBtn')?.addEventListener('click', () => {
            this.deleteSelectedObject();
        });

        document.getElementById('restoreObjectBtn')?.addEventListener('click', () => {
            this.restoreLastDeletedObject();
        });
    }

    // ПАНЕЛ: PBR МАТЕРИАЛИ И ТЕКСТУРИ
    renderPBRPanelContent() {
        if (!this.pbrPanel) return;

        const isRealistic = this.materialManager ? this.materialManager.isRealisticMode : false;

        let currentColor = '#ffffff';
        let currentMatType = 'plaster';
        let currentUScaleLog = Math.log10(1.0);
        let currentUScaleVal = "1.00";
        let isGlass = false;

        if (this.currentlySelected) {
            const mesh = this.currentlySelected;
            if (mesh.userData?.customColor) {
                currentColor = mesh.userData.customColor;
            } else if (mesh.material && mesh.material.color) {
                currentColor = '#' + mesh.material.color.getHexString();
            }

            // Точно определяне на активния материал
            if (mesh.userData?.materialType) {
                currentMatType = mesh.userData.materialType;
            } else if (isRealistic) {
                currentMatType = this.materialManager?.detectMaterialType(mesh.userData?.typeCode) || 'default';
            } else {
                currentMatType = 'default';
            }

            isGlass = (currentMatType === 'glass');

            const uScaleVal = mesh.material?.userData?.uScale?.value ?? mesh.userData?.textureScale ?? 1.0;
            currentUScaleLog = Math.log10(Math.max(uScaleVal, 0.00001));
            currentUScaleVal = uScaleVal < 0.01 ? uScaleVal.toFixed(5) : uScaleVal.toFixed(2);
        }

        this.pbrPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; margin-bottom:10px;">
                <strong style="font-size:14px; color:#2ecc71;">✨ PBR & Управление</strong>
                <button id="closePbrBtn" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px;">✕</button>
            </div>

            <!-- Превключвател за PBR Режим -->
            <div style="margin-bottom: 12px; display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
                <span style="font-size:12px; font-weight:bold;">Реалистичен режим:</span>
                <button id="togglePbrModeBtn" style="padding:4px 10px; background:${isRealistic ? '#2ecc71' : '#374151'}; color:white; border:none; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">
                    ${isRealistic ? 'ВКЛЮЧЕН' : 'ИЗКЛЮЧЕН'}
                </button>
            </div>

            ${!this.currentlySelected ? `
                <div style="color:#aaa; font-style:italic; font-size:12px; text-align:center; padding:10px 0;">
                    Моля, маркирайте обект в сцената, за да го управлявате.
                </div>
            ` : `
                <!-- Избор на Текстура -->
                <div style="margin-bottom: 10px;">
                    <label style="display:block; margin-bottom:4px; font-size:12px; color:#ccc;">Текстура / Материал:</label>
                    <select id="materialSelector" style="width:100%; padding:6px; background:#111827; color:white; border:1px solid #374151; border-radius:6px; outline:none;">
                        <option value="default" ${currentMatType === 'default' ? 'selected' : ''}>Чертожен вид</option>
                        <option value="plaster" ${currentMatType === 'plaster' ? 'selected' : ''}>Мазилка</option>
                        <option value="stone" ${currentMatType === 'stone' ? 'selected' : ''}>Каменна облицовка</option>
                        <option value="wood" ${currentMatType === 'wood' ? 'selected' : ''}>Дърво</option>
                        <option value="glass" ${currentMatType === 'glass' ? 'selected' : ''}>Стъкло</option>
                        <option value="metal" ${currentMatType === 'metal' ? 'selected' : ''}>Метал</option>
                    </select>
                </div>

                <!-- Избор на Цвят -->
                <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; margin-bottom: 10px; background:rgba(255,255,255,0.05); padding:6px 8px; border-radius:6px;">
                    <span style="font-size:12px; color:#ccc;">Нюанс / Цвят:</span>
                    <input type="color" id="colorPicker" value="${currentColor}" style="border:none; width:28px; height:28px; cursor:pointer; background:none;">
                </label>

                <!-- Слайдер за Индивидуален мащаб на Текстурата -->
                <div style="margin-bottom: 12px; background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <label style="font-size:12px; color:#ccc;">📐 Мащаб на текстурата:</label>
                        <span id="objScaleVal" style="font-size:11px; color:#2ecc71; font-weight:bold;">${isGlass || currentMatType === 'default' ? 'N/A' : currentUScaleVal}</span>
                    </div>
                    <input type="range" id="objScaleInput" min="-5" max="0.7" step="0.01" value="${currentUScaleLog}" ${isGlass || currentMatType === 'default' ? 'disabled' : ''} style="width:100%; cursor:pointer;">
                </div>

                <!-- Бутони Изтрий и Върни -->
                <div style="display:flex; gap:8px;">
                    <button id="deleteObjBtn" style="flex:1; padding:8px; background:#e74c3c; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">🗑️ Изтрий</button>
                    <button id="undoDeleteBtn" style="flex:1; padding:8px; background:#2980b9; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">↩️ Върни</button>
                </div>
            `}
        `;

        document.getElementById('closePbrBtn').onclick = () => {
            this.pbrPanel.style.display = 'none';
        };

        // Бутон за превключване на реалистичния режим
        document.getElementById('togglePbrModeBtn')?.addEventListener('click', () => {
            if (this.materialManager) {
                this.materialManager.toggleRealisticMode(this.models);
                this.renderPBRPanelContent();
                if (this.engine && typeof this.engine.render === 'function') {
                    this.engine.render();
                }
            }
        });

        const updateColorAndMaterialDirectly = (rebuildPanel = false) => {
            if (!this.currentlySelected) return;
            const colorPicker = document.getElementById('colorPicker');
            const materialSelector = document.getElementById('materialSelector');
            if (!colorPicker || !materialSelector) return;

            const newColor = colorPicker.value;
            const newMatType = materialSelector.value;
            const mesh = this.currentlySelected;

            // Ако потребителят избира текстура от PBR панела, а режимът е изключен,
            // активираме режима, за да стане текстурата веднага видима на екрана!
            if (newMatType !== 'default' && this.materialManager && !this.materialManager.isRealisticMode) {
                this.materialManager.setRealisticMode(true, this.models);
                rebuildPanel = true;
            }

            if (this.materialManager) {
                const currentUScale = mesh.material?.userData?.uScale?.value ?? mesh.userData?.textureScale;
                this.materialManager.updateObjectColorAndMaterial(mesh, newColor, newMatType, currentUScale);
            } else if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => {
                        if (m.color) m.color.set(newColor);
                        m.needsUpdate = true;
                    });
                } else {
                    if (mesh.material.color) mesh.material.color.set(newColor);
                    mesh.material.needsUpdate = true;
                }
            }

            if (this.engine && typeof this.engine.render === 'function') {
                this.engine.render();
            }

            if (rebuildPanel) {
                this.renderPBRPanelContent();
            }
        };

        const colorInput = document.getElementById('colorPicker');
        if (colorInput) {
            colorInput.addEventListener('input', () => {
                updateColorAndMaterialDirectly(false);
            });
            colorInput.addEventListener('change', () => {
                updateColorAndMaterialDirectly(false);
            });
        }

        document.getElementById('materialSelector')?.addEventListener('change', () => {
            updateColorAndMaterialDirectly(true);
        });

        document.getElementById('objScaleInput')?.addEventListener('input', (e) => {
            if (!this.currentlySelected) return;

            const mesh = this.currentlySelected;
            const matType = mesh.userData?.materialType || 'stone';
            if (matType === 'glass' || matType === 'default') return;

            const expValue = Math.pow(10, parseFloat(e.target.value));
            const valLabel = document.getElementById('objScaleVal');
            if (valLabel) valLabel.textContent = expValue < 0.01 ? expValue.toFixed(5) : expValue.toFixed(2);

            if (!mesh.userData) mesh.userData = {};
            mesh.userData.textureScale = expValue;
            mesh.userData.hasUniqueMaterial = true;

            // Ако потребителят мести слайдера за мащабиране, а режимът е изключен, го включваме
            if (this.materialManager && !this.materialManager.isRealisticMode) {
                this.materialManager.setRealisticMode(true, this.models);
                const btn = document.getElementById('togglePbrModeBtn');
                if (btn) {
                    btn.textContent = 'ВКЛЮЧЕН';
                    btn.style.background = '#2ecc71';
                }
            }

            if (mesh.material?.userData?.uScale) {
                mesh.material.userData.uScale.value = expValue;
            } else if (this.materialManager && this.materialManager.isRealisticMode) {
                const currentColor = mesh.userData?.customColor || (mesh.material?.color ? '#' + mesh.material.color.getHexString() : '#ffffff');
                this.materialManager.applyPBRMaterial(mesh, matType, new THREE.Color(currentColor), expValue);
            }

            if (this.engine && typeof this.engine.render === 'function') {
                this.engine.render();
            }
        });

        document.getElementById('deleteObjBtn')?.addEventListener('click', () => {
            this.deleteSelectedObject();
        });

        document.getElementById('undoDeleteBtn')?.addEventListener('click', () => {
            this.restoreLastDeletedObject();
        });
    }

    scaleSelectedObject(factor) {
        if (!this.currentlySelected) return;
        if (!this.currentlySelected.userData) this.currentlySelected.userData = {};
        this.currentlySelected.userData.currentScale = factor;
        this.currentlySelected.scale.set(factor, factor, factor);
        this.currentlySelected.updateMatrixWorld();

        if (this.engine && typeof this.engine.render === 'function') {
            this.engine.render();
        }
    }

    deleteSelectedObject() {
        if (!this.currentlySelected) return;
        const mesh = this.currentlySelected;

        if (!this.deletedObjectsStack) this.deletedObjectsStack = [];

        let slot = mesh.userData?.modelSlot || '1';
        let index = -1;
        if (this.models) {
            for (const s of Object.keys(this.models)) {
                const mData = this.models[s];
                if (mData && mData.meshes) {
                    const idx = mData.meshes.indexOf(mesh);
                    if (idx !== -1) {
                        slot = s;
                        index = idx;
                        break;
                    }
                }
            }
        }

        const previousScale = mesh.scale.clone();
        if (previousScale.x === 0 && previousScale.y === 0 && previousScale.z === 0) {
            const fallback = mesh.userData?.currentScale || 1.0;
            previousScale.set(fallback, fallback, fallback);
        }

        this.deletedObjectsStack.push({
            slot: String(slot),
            index: index,
            expressID: mesh.userData?.expressID || null,
            mesh: mesh,
            visible: mesh.visible,
            scale: previousScale
        });

        if (!mesh.userData) mesh.userData = {};
        mesh.userData.isDeleted = true;
        mesh.visible = false;
        mesh.scale.set(0, 0, 0);
        mesh.updateMatrixWorld();

        if (this.pbrPanel) this.pbrPanel.style.display = 'none';
        if (this.infoPanel) this.infoPanel.style.display = 'none';
        this.currentlySelected = null;

        this.buildElementPanel();
        if (this.engine && typeof this.engine.render === 'function') {
            this.engine.render();
        }
    }

    restoreLastDeletedObject() {
        if (!this.deletedObjectsStack || this.deletedObjectsStack.length === 0) {
            alert('Няма изтрити обекти за възстановяване.');
            return;
        }

        const lastDeleted = this.deletedObjectsStack.pop();
        if (!lastDeleted) return;

        let mesh = lastDeleted.mesh;
        if (!mesh && lastDeleted.slot && this.models && this.models[lastDeleted.slot]) {
            const meshes = this.models[lastDeleted.slot].meshes || [];
            if (lastDeleted.index !== undefined && lastDeleted.index >= 0 && meshes[lastDeleted.index]) {
                mesh = meshes[lastDeleted.index];
            } else if (lastDeleted.expressID) {
                mesh = meshes.find(m => m.userData?.expressID === lastDeleted.expressID);
            }
        }

        if (mesh) {
            if (!mesh.userData) mesh.userData = {};
            mesh.userData.isDeleted = false;
            mesh.visible = true;

            const s = lastDeleted.scale?.x || (typeof lastDeleted.scale === 'number' ? lastDeleted.scale : 1.0);
            mesh.scale.set(s, s, s);
            mesh.userData.currentScale = s;
            mesh.updateMatrixWorld();

            this.currentlySelected = mesh;
            if (typeof this.updateObjectPropertiesData === 'function') {
                this.updateObjectPropertiesData({
                    mesh: mesh,
                    modelSlot: lastDeleted.slot,
                    expressID: mesh.userData?.expressID,
                    typeCode: mesh.userData?.typeCode
                });
            }
        }

        this.buildElementPanel();
        if (this.engine && typeof this.engine.render === 'function') {
            this.engine.render();
        }
    }

    /* =========================================================
       4. ПАНЕЛ ЕЛЕМЕНТИ И ПРОВЕРКА ЗА КОЛИЗИИ
       ========================================================= */
    buildElementPanel() {
        const elementList = document.getElementById('elementList');
        if (!elementList) return;
        elementList.innerHTML = '';

        const groupedBySlot = {};
        const slots = Object.keys(this.models || {});

        for (const slot of slots) {
            const modelData = this.models[slot];
            if (!modelData || !modelData.meshes || modelData.meshes.length === 0) continue;

            groupedBySlot[slot] = {};

            for (const mesh of modelData.meshes) {
                const typeCode = mesh.userData?.typeCode;
                const typeName = this.getTypeName ? this.getTypeName(typeCode) : typeCode;

                if (!groupedBySlot[slot][typeName]) {
                    groupedBySlot[slot][typeName] = [];
                }
                groupedBySlot[slot][typeName].push(mesh);
            }
        }

        const activeSlots = Object.keys(groupedBySlot);

        if (activeSlots.length === 0) {
            elementList.innerHTML = `<div style="color:#aaa; font-style:italic; text-align:center; padding:10px; font-size:12px;">Няма заредени модели.</div>`;
            return;
        }

        for (const slot of activeSlots) {
            const slotTypes = groupedBySlot[slot];

            const modelContainer = document.createElement('div');
            modelContainer.style.cssText = `
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 8px;
                margin-bottom: 10px;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                padding-bottom: 6px;
                margin-bottom: 6px;
            `;

            header.innerHTML = `
                <span style="font-weight:bold; color:#90e0ef; font-size:12px;">📦 Модел ${slot}</span>
                <div style="display:flex; gap:4px;">
                    <button class="slot-show-btn" style="background:#2ecc71; border:none; color:white; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer; font-weight:bold;">👁️ Покажи</button>
                    <button class="slot-hide-btn" style="background:#e74c3c; border:none; color:white; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer; font-weight:bold;">🙈 Скрий</button>
                </div>
            `;
            modelContainer.appendChild(header);

            const sortedTypes = Object.keys(slotTypes).sort((a, b) => slotTypes[b].length - slotTypes[a].length);

            for (const typeName of sortedTypes) {
                const meshes = slotTypes[typeName];

                const row = document.createElement('div');
                row.style.cssText = 'margin: 4px 0; display: flex; align-items: center; justify-content: space-between;';

                const labelContainer = document.createElement('label');
                labelContainer.style.cssText = 'display: flex; align-items: center; cursor: pointer; color: white; font-size: 12px;';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = `model-chk-${slot}`;
                checkbox.style.marginRight = '8px';

                const nonDeletedMeshes = meshes.filter(m => !m.userData?.isDeleted);
                const visibleCount = nonDeletedMeshes.filter(m => m.visible).length;
                const hasVisible = visibleCount > 0;
                const allVisible = nonDeletedMeshes.length > 0 && visibleCount === nonDeletedMeshes.length;

                checkbox.checked = hasVisible;
                checkbox.indeterminate = hasVisible && !allVisible;

                checkbox.addEventListener('change', () => {
                    const isVisible = checkbox.checked;
                    checkbox.indeterminate = false;
                    for (const mesh of meshes) {
                        if (mesh.userData?.isDeleted) continue;

                        mesh.visible = isVisible;
                        const s = mesh.userData?.currentScale || (mesh.scale.x > 0 ? mesh.scale.x : 1.0);
                        if (isVisible) {
                            mesh.scale.set(s, s, s);
                        } else {
                            if (mesh.scale.x > 0) mesh.userData.currentScale = mesh.scale.x;
                            mesh.scale.set(0, 0, 0);
                        }
                        mesh.updateMatrixWorld();
                    }
                    if (this.engine && typeof this.engine.render === 'function') {
                        this.engine.render();
                    }
                });

                const labelText = document.createElement('span');
                const totalCount = meshes.length;
                const delCount = meshes.filter(m => m.userData?.isDeleted).length;
                labelText.textContent = delCount > 0 
                    ? `${typeName} (${totalCount - delCount}/${totalCount})` 
                    : `${typeName} (${totalCount})`;

                labelContainer.appendChild(checkbox);
                labelContainer.appendChild(labelText);
                row.appendChild(labelContainer);
                modelContainer.appendChild(row);
            }

            elementList.appendChild(modelContainer);

            header.querySelector('.slot-show-btn').onclick = () => {
                modelContainer.querySelectorAll(`.model-chk-${slot}`).forEach(cb => {
                    if (!cb.checked || cb.indeterminate) {
                        cb.checked = true;
                        cb.indeterminate = false;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            };

            header.querySelector('.slot-hide-btn').onclick = () => {
                modelContainer.querySelectorAll(`.model-chk-${slot}`).forEach(cb => {
                    if (cb.checked || cb.indeterminate) {
                        cb.checked = false;
                        cb.indeterminate = false;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            };
        }

        const showBtn = document.getElementById('showAllBtn');
        if (showBtn) showBtn.onclick = () => this.toggleAllElements(true);

        const hideBtn = document.getElementById('hideAllBtn');
        if (hideBtn) hideBtn.onclick = () => this.toggleAllElements(false);
    }

    toggleAllElements(visible) {
        const elementList = document.getElementById('elementList');
        if (!elementList) return;
        elementList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked !== visible || cb.indeterminate) {
                cb.checked = visible;
                cb.indeterminate = false;
                cb.dispatchEvent(new Event('change'));
            }
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
                if (!mesh.userData || !mesh.visible || mesh.userData.isDeleted) return;
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

    /* =========================================================
       5. JSON ЗАПАЗВАНЕ И ЗАРЕЖДАНЕ НА ПРОЕКТА (STATE PERSISTENCE)
       ========================================================= */
    exportProjectToJson() {
        const projectNameInput = document.getElementById('projectNameInput');
        const projectName = projectNameInput?.value?.trim() || 'bim_project_state';

        let envMode = this.envManager?.currentMode;
        if (!envMode) {
            const select = document.getElementById('envSelectUI');
            envMode = select ? select.value : 'day';
        }

        let sunRot = 0;
        if (typeof this.envManager?.getSunRotation === 'function') {
            sunRot = this.envManager.getSunRotation();
        } else {
            const slider = document.getElementById('sunRotUI');
            if (slider) sunRot = parseFloat(slider.value) || 0;
        }

        let exposure = 1.0;
        if (typeof this.envManager?.getLightIntensity === 'function') {
            exposure = this.envManager.getLightIntensity();
        } else {
            const slider = document.getElementById('exposureUI');
            if (slider) exposure = parseFloat(slider.value) || 1.0;
        }

        const projectData = {
            version: "2.0",
            projectName: projectName,
            timestamp: new Date().toISOString(),
            environment: {
                mode: envMode,
                sunRotation: sunRot,
                exposure: exposure
            },
            materialsState: {
                isRealisticMode: this.materialManager ? !!this.materialManager.isRealisticMode : false
            },
            deletedObjects: (this.deletedObjectsStack || []).map(item => ({
                slot: String(item.slot || '1'),
                index: item.index,
                expressID: item.expressID || item.mesh?.userData?.expressID || null,
                scale: item.scale ? (item.scale.x !== undefined ? item.scale.x : item.scale) : 1.0
            })),
            objectModifications: []
        };

        if (this.models) {
            Object.keys(this.models).forEach(slotKey => {
                const modelData = this.models[slotKey];
                if (!modelData) return;

                const meshes = modelData.meshes || (modelData.mesh ? [modelData.mesh] : []);
                if (!meshes || meshes.length === 0) return;

                meshes.forEach((mesh, index) => {
                    if (!mesh) return;

                    const colorHex = mesh.userData?.customColor || 
                        (mesh.material && mesh.material.color ? '#' + mesh.material.color.getHexString() : '#cccccc');
                    
                    const materialType = mesh.userData?.materialType || 'default';
                    
                    let textureScale = 1.0;
                    if (mesh.material?.userData?.uScale?.value !== undefined) {
                        textureScale = mesh.material.userData.uScale.value;
                    } else if (mesh.userData?.textureScale !== undefined) {
                        textureScale = mesh.userData.textureScale;
                    }

                    const currentScale = mesh.userData?.currentScale || (mesh.scale.x > 0 ? mesh.scale.x : 1.0);
                    const isDeleted = !!mesh.userData?.isDeleted;
                    const hasUniqueMaterial = !!mesh.userData?.hasUniqueMaterial;

                    projectData.objectModifications.push({
                        slot: String(slotKey),
                        index: index,
                        expressID: mesh.userData?.expressID || null,
                        typeCode: mesh.userData?.typeCode || null,
                        visible: mesh.visible,
                        isDeleted: isDeleted,
                        scale: currentScale,
                        color: colorHex,
                        materialType: materialType,
                        textureScale: textureScale,
                        hasUniqueMaterial: hasUniqueMaterial
                    });
                });
            });
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const fileName = `${projectName.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.json`;
        downloadAnchor.setAttribute("download", fileName);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    importProjectFromJson(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const projectData = JSON.parse(e.target.result);

                // 1. Възстановяване на името на проекта
                if (projectData.projectName) {
                    const input = document.getElementById('projectNameInput');
                    if (input) input.value = projectData.projectName;
                }

                // 2. Възстановяване на атмосферата и осветлението
                if (projectData.environment && this.envManager) {
                    const env = projectData.environment;
                    if (env.mode) this.envManager.setEnvironment(env.mode);
                    if (typeof this.envManager.setSunRotation === 'function' && env.sunRotation !== undefined) {
                        this.envManager.setSunRotation(env.sunRotation);
                    }
                    if (typeof this.envManager.setLightIntensity === 'function' && env.exposure !== undefined) {
                        this.envManager.setLightIntensity(env.exposure);
                    }

                    const envSelect = document.getElementById('envSelectUI');
                    if (envSelect && env.mode) envSelect.value = env.mode;

                    const sunSlider = document.getElementById('sunRotUI');
                    if (sunSlider && env.sunRotation !== undefined) sunSlider.value = env.sunRotation;

                    const exposureSlider = document.getElementById('exposureUI');
                    if (exposureSlider && env.exposure !== undefined) exposureSlider.value = env.exposure;
                }

                // 3. Възстановяване на състоянието на MaterialManager (Реалистичен режим)
                const isRealistic = projectData.materialsState?.isRealisticMode ?? false;

                // 4. Възстановяване на модификациите на обектите
                if (projectData.objectModifications && Array.isArray(projectData.objectModifications)) {
                    projectData.objectModifications.forEach(mod => {
                        const slot = String(mod.slot);
                        const modelData = this.models ? this.models[slot] : null;
                        if (!modelData) return;

                        const meshes = modelData.meshes || (modelData.mesh ? [modelData.mesh] : []);
                        if (!meshes || meshes.length === 0) return;

                        let mesh = null;
                        if (mod.index !== undefined && mod.index >= 0 && mod.index < meshes.length) {
                            const candidate = meshes[mod.index];
                            if (!mod.expressID || candidate.userData?.expressID === mod.expressID) {
                                mesh = candidate;
                            }
                        }
                        if (!mesh && mod.expressID) {
                            mesh = meshes.find(m => m.userData?.expressID === mod.expressID);
                        }

                        if (!mesh) return;

                        // 4.1. Запазваме чистия оригинален CAD материал в MaterialManager
                        if (this.materialManager) {
                            this.materialManager.saveOriginalMaterial(mesh);
                        }

                        // 4.2. Инициализиране на вътрешните свойства в userData
                        if (!mesh.userData) mesh.userData = {};
                        mesh.userData.modelSlot = slot;
                        const matType = mod.materialType || 'default';
                        mesh.userData.materialType = matType;
                        mesh.userData.customColor = mod.color || '#cccccc';
                        mesh.userData.textureScale = (mod.textureScale !== undefined) ? mod.textureScale : 1.0;
                        mesh.userData.hasUniqueMaterial = (mod.hasUniqueMaterial !== undefined) 
                            ? !!mod.hasUniqueMaterial 
                            : (matType !== 'default');
                        mesh.userData.isDeleted = !!mod.isDeleted;
                        mesh.userData.currentScale = (mod.scale !== undefined && mod.scale > 0) ? mod.scale : 1.0;

                        // 4.3. Видимост и мащабиране
                        const isVisible = (mod.visible !== false) && !mod.isDeleted;
                        mesh.visible = isVisible;
                        if (isVisible) {
                            const s = mesh.userData.currentScale;
                            mesh.scale.set(s, s, s);
                        } else {
                            mesh.scale.set(0, 0, 0);
                        }

                        mesh.updateMatrixWorld(true);
                    });
                }

                // 4.4. Сега синхронизираме реалното състояние на материалите според isRealistic!
                if (this.materialManager) {
                    this.materialManager.setRealisticMode(isRealistic, this.models);
                }

                // 5. Възстановяване на списъка с изтрити обекти (deletedObjectsStack)
                this.deletedObjectsStack = [];
                if (projectData.deletedObjects && Array.isArray(projectData.deletedObjects)) {
                    projectData.deletedObjects.forEach(delItem => {
                        const slot = String(delItem.slot || '1');
                        const modelData = this.models ? this.models[slot] : null;
                        if (!modelData) return;

                        const meshes = modelData.meshes || (modelData.mesh ? [modelData.mesh] : []);
                        let mesh = null;
                        if (delItem.index !== undefined && delItem.index >= 0 && delItem.index < meshes.length) {
                            const candidate = meshes[delItem.index];
                            if (!delItem.expressID || candidate.userData?.expressID === delItem.expressID) {
                                mesh = candidate;
                            }
                        }
                        if (!mesh && delItem.expressID) {
                            mesh = meshes.find(m => m.userData?.expressID === delItem.expressID);
                        }

                        if (mesh) {
                            if (!mesh.userData) mesh.userData = {};
                            mesh.userData.isDeleted = true;
                            mesh.visible = false;
                            mesh.scale.set(0, 0, 0);
                            mesh.updateMatrixWorld(true);

                            const s = delItem.scale || 1.0;
                            this.deletedObjectsStack.push({
                                slot: slot,
                                index: delItem.index,
                                expressID: delItem.expressID,
                                mesh: mesh,
                                visible: false,
                                scale: new THREE.Vector3(s, s, s)
                            });
                        }
                    });
                }

                // 6. Пълно преизграждане на интерфейсните панели и чекбоксове
                if (typeof this.buildElementPanel === 'function') {
                    this.buildElementPanel();
                }

                if (this.currentlySelected && typeof this.updateObjectPropertiesData === 'function') {
                    this.updateObjectPropertiesData({ 
                        mesh: this.currentlySelected,
                        modelSlot: this.currentlySelected.userData?.modelSlot,
                        expressID: this.currentlySelected.userData?.expressID,
                        typeCode: this.currentlySelected.userData?.typeCode
                    });
                } else {
                    if (this.pbrPanel && this.pbrPanel.style.display === 'block') {
                        this.renderPBRPanelContent();
                    }
                    if (this.infoPanel && this.infoPanel.style.display === 'block') {
                        this.renderPropertiesContent();
                    }
                }

                if (this.engine && typeof this.engine.render === 'function') {
                    this.engine.render();
                }

                alert("Проектът с всички модели е зареден успешно!");

            } catch (error) {
                console.error("Грешка при четене на JSON файла:", error);
                alert("Невалиден JSON файл на проекта!");
            }
        };
        reader.readAsText(file);
    }
}
