import { Engine } from './core/Engine.js';
import { CameraManager } from './core/CameraManager.js';
import { IFCLoaderService } from './bim/IFCLoaderService.js';
import { BIMDataInspector } from './bim/BIMDataInspector.js';
import { MaterialManager } from './bim/MaterialManager.js';
import { EnvironmentManager } from './graphics/EnvironmentManager.js';
import { SelectionManager } from './editor/SelectionManager.js';

// Поддръжка на 3 слота за модели
const models = {
    1: { modelID: null, meshes: [] },
    2: { modelID: null, meshes: [] },
    3: { modelID: null, meshes: [] }
};

const engine = new Engine('app');
const cameraManager = new CameraManager(engine, models);
const materialManager = new MaterialManager(engine);
const envManager = new EnvironmentManager(engine);
const selectionManager = new SelectionManager(engine, materialManager);

const ifcLoaderService = new IFCLoaderService(engine, models, () => {
    if (inspector) inspector.buildElementPanel();
    if (engine) engine.requestRender(3);
});

const inspector = new BIMDataInspector(engine, models, ifcLoaderService, cameraManager, materialManager, envManager);
selectionManager.setInspector(inspector);

const addModelBtn = document.getElementById('addModelBtn');
const clashBtn = document.getElementById('clashBtn');
const landingScreen = document.getElementById('landingScreen');

// Настройка на Landing Card за Модел 1
ifcLoaderService.setupLandingCard('dropCard1', 'fileInput1', 'browseBtn1', 1, () => {
    hideLandingScreen();
    engine.requestRender(3);
});

function hideLandingScreen() {
    if (landingScreen) {
        landingScreen.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        landingScreen.style.opacity = '0';
        landingScreen.style.transform = 'scale(1.05)';
        setTimeout(() => landingScreen.classList.add('hidden'), 600);
    }
    if (addModelBtn) addModelBtn.classList.remove('hidden');
    if (engine) engine.requestRender(2);
}

// --- ЛОГИКА ЗА ДЕМО МОДАЛА ---
const demoModal = document.getElementById('demoModal');
const demoBtn = document.getElementById('demoBtn');
const closeDemoModal = document.getElementById('closeDemoModal');
const demoLoading = document.getElementById('demoLoading');

demoBtn?.addEventListener('click', () => {
    demoModal.classList.remove('hidden');
});

closeDemoModal?.addEventListener('click', () => {
    demoModal.classList.add('hidden');
});

// Клик върху някоя от Демо Картичките
document.querySelectorAll('.demo-card').forEach(card => {
    card.addEventListener('click', async () => {
        const fileUrl = card.getAttribute('data-url');
        demoLoading.classList.remove('hidden');

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error("Файлът не бе намерен на сървъра.");
            
            const arrayBuffer = await response.arrayBuffer();
            await ifcLoaderService.loadIfcFile(arrayBuffer, 1);

            demoLoading.classList.add('hidden');
            demoModal.classList.add('hidden');
            hideLandingScreen();
            if (engine) engine.requestRender(3);

        } catch (error) {
            alert("Грешка при зареждане на демо файла! Моля проверете дали файлът съществува в папката /demo/ на сървъра.");
            console.error(error);
            demoLoading.classList.add('hidden');
        }
    });
});

// Навигационен бутон "📂 Зареди проект"
document.getElementById('navOpenBtn')?.addEventListener('click', () => {
    document.getElementById('fileInput1')?.click();
});

// Навигационен бутон "❓ Помощ"
document.getElementById('navHelpBtn')?.addEventListener('click', () => {
    alert("ИНСТРУКЦИИ:\n1. Заредете .IFC файл чрез бутона или плъзгане.\n2. Използвайте десния бутон на мишката за въртене.\n3. Кликнете върху обект за редактиране на PBR материалите.");
});

// ⚡ Ултра-бърз On-Demand Render Loop
// Рендира кадри САМО при реална нужда (движение на камерата, селекция, промяна на материали).
// При покой GPU и CPU товарът пада до 0%, гарантирайки висока кадрова честота без лаг и влачене!
function animate() {
    requestAnimationFrame(animate);

    let needsRender = (engine && engine.renderFrames > 0);

    // 1. Проверка за движение на камерата (OrbitControls Damping / First-Person)
    if (cameraManager?.update) {
        const cameraMoved = cameraManager.update();
        if (cameraMoved) needsRender = true;
    }

    // 2. Обновяване на околната среда
    if (envManager?.update) {
        const envUpdated = envManager.update();
        if (envUpdated) needsRender = true;
    }

    // 3. Изпълнение на рендера само при нужда
    if (needsRender && engine) {
        if (engine.renderFrames > 0) {
            engine.renderFrames--;
        }
        engine.render();
    }
}

animate();
