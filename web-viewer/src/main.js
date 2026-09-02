import { Engine } from './core/Engine.js';
import { CameraManager } from './core/CameraManager.js';
import { IFCLoaderService } from './bim/IFCLoaderService.js';
import { BIMDataInspector } from './bim/BIMDataInspector.js';
import { OctreeManager } from './core/OctreeManager.js';
import { MaterialManager } from './bim/MaterialManager.js'; // 1. Промяна: Импортираме MaterialManager

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

// 2. Инициализиране на Зареждащата услуга
const ifcLoaderService = new IFCLoaderService(engine, models, () => {
    // Моделът зарежда бързо в суров IFC вариант. 
    // PBR се активира само при клик на Switch бутона.
    if (inspector) inspector.buildElementPanel();
});

// 3. Инициализиране на Инспектора (3. Промяна: Подаваме materialManager като 5-ти аргумент)
const inspector = new BIMDataInspector(engine, models, ifcLoaderService, cameraManager, materialManager);

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

// 5. Главен Анимационен цикъл
function animate() {
    requestAnimationFrame(animate);
    cameraManager.update();

    const allMeshes = [...models[1].meshes, ...models[2].meshes];
    if (allMeshes.length > 0) {
        octreeManager.updateFrustumCulling(allMeshes);
    }

    engine.renderer.render(engine.scene, engine.camera);
}
animate();