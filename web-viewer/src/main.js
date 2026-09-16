import { Engine } from './core/Engine.js';
import { CameraManager } from './core/CameraManager.js';
import { IFCLoaderService } from './bim/IFCLoaderService.js';
import { BIMDataInspector } from './bim/BIMDataInspector.js';
import { OctreeManager } from './core/OctreeManager.js';
import { MaterialManager } from './bim/MaterialManager.js';
import { EnvironmentManager } from './graphics/EnvironmentManager.js';
import { SelectionManager } from './editor/SelectionManager.js';

const models = {
    1: { modelID: null, meshes: [] },
    2: { modelID: null, meshes: [] }
};

const engine = new Engine('app');
const cameraManager = new CameraManager(engine, models);
const octreeManager = new OctreeManager(engine.camera);
const materialManager = new MaterialManager(engine);
const envManager = new EnvironmentManager(engine);
const selectionManager = new SelectionManager(engine, materialManager);

const ifcLoaderService = new IFCLoaderService(engine, models, () => {
    if (inspector) inspector.buildElementPanel();
});

const inspector = new BIMDataInspector(engine, models, ifcLoaderService, cameraManager, materialManager, envManager);
selectionManager.setInspector(inspector);

const addModelBtn = document.getElementById('addModelBtn');
const clashBtn = document.getElementById('clashBtn');
const landingScreen = document.getElementById('landingScreen');

// Настройка на Landing Card за Модел 1
ifcLoaderService.setupLandingCard('dropCard1', 'fileInput1', 'browseBtn1', 1, () => {
    hideLandingScreen();
});

function hideLandingScreen() {
    if (landingScreen) {
        landingScreen.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        landingScreen.style.opacity = '0';
        landingScreen.style.transform = 'scale(1.05)';
        setTimeout(() => landingScreen.classList.add('hidden'), 600);
    }
    if (addModelBtn) addModelBtn.classList.remove('hidden');
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
            // Теглене на демо файла от папка public/demo/
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error("Файлът не бе намерен на сървъра.");
            
            const arrayBuffer = await response.arrayBuffer();
            
            // Зареждане на модела на сцената
            await ifcLoaderService.loadIfcFile(arrayBuffer, 1);

            // Затваряне на прозорците
            demoLoading.classList.add('hidden');
            demoModal.classList.add('hidden');
            hideLandingScreen();

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

// Анимационен цикъл
function animate() {
    requestAnimationFrame(animate);

    if (engine?.update) engine.update();
    if (cameraManager?.update) cameraManager.update();
    if (envManager?.update) envManager.update();

    if (octreeManager?.updateFrustumCulling && models) {
        const model1Meshes = models[1]?.meshes || [];
        const model2Meshes = models[2]?.meshes || [];
        if (model1Meshes.length > 0 || model2Meshes.length > 0) {
            octreeManager.updateFrustumCulling(model1Meshes.concat(model2Meshes));
        }
    }

    if (engine?.renderer && engine?.scene && engine?.camera) {
        engine.renderer.render(engine.scene, engine.camera);
    }
}

animate();