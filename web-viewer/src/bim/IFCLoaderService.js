import { InstancedMeshManager } from '../core/InstancedMeshManager.js';

export class IFCLoaderService {
    constructor(engine, models, onModelLoaded) {
        this.engine = engine;
        this.models = models;
        this.onModelLoaded = onModelLoaded;
        this.instancedMeshManager = new InstancedMeshManager(engine.scene);
        
        // Стартираме Worker-а правилно като ES Модул
        this.worker = new Worker(new URL('../workers/ifcWorker.js', import.meta.url), { type: 'module' });
        this.initWorkerListener();
    }

    initWorkerListener() {
        this.worker.onmessage = (e) => {
            const { action, parsedGeometries, modelSlot, modelID } = e.data;

            if (action === 'IFC_PARSED') {
                if (!this.models[modelSlot]) {
                    this.models[modelSlot] = {};
                }
                
                this.models[modelSlot].modelID = modelID;
                
                // Изграждаме Instanced Meshes в главната нишка
                this.instancedMeshManager.buildInstancedMeshes(parsedGeometries, modelSlot, this.models);

                console.log(`Модел ${modelSlot} зареден чрез Worker + Smart Instancing!`);
                if (this.onModelLoaded) this.onModelLoaded();

                // Принудително прерисуваме 1 кадър след пълно зареждане
                if (this.engine && typeof this.engine.render === 'function') {
                    this.engine.render();
                }
            }
        };

        this.worker.onerror = (error) => {
            console.error("Грешка при обработката в IFC Worker:", error);
        };
    }

    async loadIfcFile(arrayBuffer, slot) {
        // Почистваме старата GPU памет
        if (this.models[slot] && this.models[slot].meshes) {
            this.models[slot].meshes.forEach(mesh => {
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) {
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach(m => m.dispose());
                    } else {
                        mesh.material.dispose();
                    }
                }
                this.engine.scene.remove(mesh);
            });
            this.models[slot].meshes = [];
        }

        this.worker.postMessage({
            action: 'PARSE_IFC',
            arrayBuffer: arrayBuffer,
            modelSlot: slot
        }, [arrayBuffer]); 
    }

    setupLandingCard(cardId, inputId, browseBtnId, slot, onDone) {
        const card = document.getElementById(cardId);
        const input = document.getElementById(inputId);
        const browseBtn = document.getElementById(browseBtnId);
        if (!card || !input) return;

        const handleFile = (file) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                await this.loadIfcFile(e.target.result, slot);
                if (onDone) onDone();
            };
            reader.readAsArrayBuffer(file);
        };

        if (browseBtn) {
            browseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                input.click();
            });
        }

        card.addEventListener('click', () => input.click());

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });

        card.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
            card.style.borderColor = '#00d2d3'; 
            card.style.background = 'rgba(10, 189, 227, 0.1)'; 
        });

        card.addEventListener('dragleave', () => { 
            card.style.borderColor = 'rgba(10, 189, 227, 0.4)'; 
            card.style.background = 'rgba(255, 255, 255, 0.03)'; 
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.style.borderColor = 'rgba(10, 189, 227, 0.4)'; 
            card.style.background = 'rgba(255, 255, 255, 0.03)';
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }
}