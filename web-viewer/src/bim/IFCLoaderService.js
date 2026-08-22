// --- Оцветяването по IFC типове, Web-IFC парсирането, зареждането на Слот 1 & 2 и Drag & Drop файловете. ---
import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export class IFCLoaderService {
    constructor(engine, models, onModelLoaded) {
        this.engine = engine;
        this.models = models;
        this.onModelLoaded = onModelLoaded;
        this.ifcApi = null;
    }

    getColorForType(typeCode) {
        switch (typeCode) {
            case WebIFC.IFCWALLSTANDARDCASE:
            case WebIFC.IFCWALL: return 0xd9d2c7;
            case WebIFC.IFCWINDOW: return 0x88ccee;
            case WebIFC.IFCDOOR: return 0x8b5a2b;
            case WebIFC.IFCSLAB: return 0xaaaaaa;
            case WebIFC.IFCROOF: return 0x4a7c4a;
            case WebIFC.IFCSTAIR:
            case WebIFC.IFCSTAIRFLIGHT: return 0xcc8844;
            case WebIFC.IFCRAILING: return 0x555555;
            case WebIFC.IFCFURNISHINGELEMENT: return 0xbb6644;
            default: return 0xcccccc;
        }
    }

    async loadIfcFile(arrayBuffer, slot) {
        if (!this.ifcApi) {
            this.ifcApi = new WebIFC.IfcAPI();
            this.ifcApi.SetWasmPath("/");
            await this.ifcApi.Init();
        }

        const modelID = this.ifcApi.OpenModel(new Uint8Array(arrayBuffer));
        this.models[slot].modelID = modelID;

        this.ifcApi.StreamAllMeshes(modelID, (mesh) => {
            const typeCode = this.ifcApi.GetLineType(modelID, mesh.expressID);
            const baseColor = this.getColorForType(typeCode);

            const placedGeometries = mesh.geometries;
            for (let i = 0; i < placedGeometries.size(); i++) {
                const placedGeometry = placedGeometries.get(i);
                const ifcGeometry = this.ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID);

                const verts = this.ifcApi.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
                const indices = this.ifcApi.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize());

                const bufferGeometry = new THREE.BufferGeometry();
                const positions = [];
                for (let j = 0; j < verts.length; j += 6) {
                    positions.push(verts[j], verts[j+1], verts[j+2]);
                }
                bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                bufferGeometry.setIndex(Array.from(indices));
                bufferGeometry.computeVertexNormals();

                const material = new THREE.MeshLambertMaterial({
                    color: baseColor,
                    transparent: slot === 2,
                    opacity: slot === 2 ? 0.6 : 1
                });
                const meshObject = new THREE.Mesh(bufferGeometry, material);

                const matrix = new THREE.Matrix4().fromArray(placedGeometry.flatTransformation);
                meshObject.applyMatrix4(matrix);

                meshObject.geometry.computeBoundingBox();
                meshObject.userData.expressID = mesh.expressID;
                meshObject.userData.modelSlot = slot;
                meshObject.userData.originalColor = baseColor;
                meshObject.userData.typeCode = typeCode;

                this.engine.scene.add(meshObject);
                this.models[slot].meshes.push(meshObject);
            }
        });

        console.log(`Модел ${slot} зареден! (${this.models[slot].meshes.length} обекта)`);
        if (this.onModelLoaded) this.onModelLoaded();
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

        zone.addEventListener('click', (e) => {
            e.stopPropagation();
            input.click();
        });

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