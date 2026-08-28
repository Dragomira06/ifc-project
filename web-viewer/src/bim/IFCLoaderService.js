import { InstancedMeshManager } from '../core/InstancedMeshManager.js';

export class IFCLoaderService {
    constructor(engine, models, onModelLoaded) {
        this.engine = engine;
        this.models = models;
        this.onModelLoaded = onModelLoaded;
        this.instancedMeshManager = new InstancedMeshManager(engine.scene);
        
        // Стартираме Worker-а
        this.worker = new Worker(new URL('../workers/ifcWorker.js', import.meta.url), { type: 'module' });
        this.initWorkerListener();
    }

    initWorkerListener() {
        this.worker.onmessage = (e) => {
            const { action, parsedGeometries, modelSlot, modelID } = e.data;

            if (action === 'IFC_PARSED') {
                this.models[modelSlot].modelID = modelID;
                
                // Изграждаме Instanced Meshes в главната нишка
                this.instancedMeshManager.buildInstancedMeshes(parsedGeometries, modelSlot, this.models);

                console.log(`Модел ${modelSlot} зареден чрез Worker + Smart Instancing!`);
                if (this.onModelLoaded) this.onModelLoaded();
            }
        };
    }

    async loadIfcFile(arrayBuffer, slot) {
        // Изпращаме файла към фоновата нишка (Worker)
        this.worker.postMessage({
            action: 'PARSE_IFC',
            arrayBuffer: arrayBuffer,
            modelSlot: slot
        }, [arrayBuffer]); // Transferable за 0% загуба на време при трансфер
    }

    setupDropZone(zoneId, inputId, slot, onDone) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        if (!zone || !input) return;

        const handleFile = (file) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                zone.classList.add('hidden');
                await this.loadIfcFile(e.target.result, slot);
                if (onDone) onDone();
            };
            reader.readAsArrayBuffer(file);
        };

        zone.addEventListener('click', () => input.click());

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });

        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }
}