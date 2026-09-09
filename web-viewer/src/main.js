import { Engine } from './core/Engine.js';
import { CameraManager } from './core/CameraManager.js';
import { IFCLoaderService } from './bim/IFCLoaderService.js';
import { BIMDataInspector } from './bim/BIMDataInspector.js';
import { OctreeManager } from './core/OctreeManager.js';
import { MaterialManager } from './bim/MaterialManager.js'; // 1. Промяна: Импортираме MaterialManager
import { EnvironmentManager } from './graphics/EnvironmentManager.js';
import { SelectionManager } from './editor/SelectionManager.js';
// Структура за моделите
const models = {
    1: { modelID: null, meshes: [] },
    2: { modelID: null, meshes: [] }
};

// 1. Инициализиране на Сцената, Камерата и MaterialManager
const engine = new Engine('app');
const cameraManager = new CameraManager(engine, models);
const octreeManager = new OctreeManager(engine.camera);
const materialManager = new MaterialManager(engine); // 2. Промяна: Инициализираме новия MaterialManager
const envManager = new EnvironmentManager(engine);
const selectionManager = new SelectionManager(engine, materialManager);

// 2. Инициализиране на Зареждащата услуга
const ifcLoaderService = new IFCLoaderService(engine, models, () => {
    // Моделът зарежда бързо в суров IFC вариант. 
    // PBR се активира само при клик на Switch бутона.
    if (inspector) inspector.buildElementPanel();
});

// 3. Инициализиране на Инспектора
const inspector = new BIMDataInspector(engine, models, ifcLoaderService, cameraManager, materialManager, envManager);

// Свързваме инспектора със SelectionManager
selectionManager.setInspector(inspector);

// 4. Настройка на Drop-зоните
const addModelBtn = document.getElementById('addModelBtn');
const clashBtn = document.getElementById('clashBtn');

ifcLoaderService.setupDropZone('dropZone1', 'fileInput1', 1, () => {
    if (addModelBtn) addModelBtn.classList.remove('hidden');
});

ifcLoaderService.setupDropZone('dropZone2', 'fileInput2', 2, () => {
    if (clashBtn) clashBtn.classList.remove('hidden');
});

if (addModelBtn) {
    addModelBtn.addEventListener('click', () => {
        document.getElementById('dropZone2')?.classList.remove('hidden');
        addModelBtn.classList.add('hidden');
    });
}

const textureScaleInput = document.getElementById('textureScale');
const textureScaleValue = document.getElementById('textureScaleValue');

if (textureScaleInput) {
    textureScaleInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (textureScaleValue) textureScaleValue.textContent = val;
        
        // Предаваме новата стойност и обекта с моделите
        materialManager.setTextureScale(val, models);
    });
}

// 5. Главен Анимационен цикъл (Оптимизиран за 60 FPS)
function animate() {
    requestAnimationFrame(animate);

    // 1. Обновяване на енджина и CameraController (за супер гладка мишка)
    if (engine && typeof engine.update === 'function') {
        engine.update();
    }

    // 2. Безопасно обновяване на cameraManager (ако има допълнителни анимации)
    if (cameraManager && typeof cameraManager.update === 'function') {
        cameraManager.update();
    }

    // 3. Обновяване на средата/дъжда
    if (envManager && typeof envManager.update === 'function') {
        envManager.update();
    }

    // 4. ОПТИМИЗИРАН Octree Frustum Culling (БЕЗ постоянно заделяне на памет)
    if (octreeManager && typeof octreeManager.updateFrustumCulling === 'function' && models) {
        // Проверяваме Frustum Culling само ако камерата всъщност се се движи
        const model1Meshes = models[1]?.meshes || [];
        const model2Meshes = models[2]?.meshes || [];
        
        if (model1Meshes.length > 0 || model2Meshes.length > 0) {
            // Използваме concat или подаваме масивите без заделяне на нови обекти на всеки кадър
            const combinedMeshes = model1Meshes.concat(model2Meshes);
            octreeManager.updateFrustumCulling(combinedMeshes);
        }
    }

    // 5. Безопасно рендериране
    if (engine && engine.renderer && engine.scene && engine.camera) {
        engine.renderer.render(engine.scene, engine.camera);
    }
}

animate();