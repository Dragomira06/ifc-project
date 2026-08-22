import { Engine } from './core/Engine.js';
import { CameraManager } from './core/CameraManager.js';
import { IFCLoaderService } from './bim/IFCLoaderService.js';
import { BIMDataInspector } from './bim/BIMDataInspector.js';

// Структура за моделите
const models = {
    1: { modelID: null, meshes: [] },
    2: { modelID: null, meshes: [] }
};

// 1. Инициализиране на Сцената и Камерата
const engine = new Engine('app');
const cameraManager = new CameraManager(engine, models);

// 2. Инициализиране на Зареждащата услуга
const ifcLoaderService = new IFCLoaderService(engine, models, () => {
    if (inspector) inspector.buildElementPanel();
});

// 3. Инициализиране на Инспектора
const inspector = new BIMDataInspector(engine, models, ifcLoaderService, cameraManager);

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
    engine.renderer.render(engine.scene, engine.camera);
}
animate();