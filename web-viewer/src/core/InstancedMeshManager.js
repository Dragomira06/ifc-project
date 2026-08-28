import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export class InstancedMeshManager {
    constructor(scene) {
        this.scene = scene;
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

    buildInstancedMeshes(parsedGeometries, slot, modelsArray) {
        const dummyMatrix = new THREE.Matrix4();

        parsedGeometries.forEach((item) => {
            const bufferGeometry = new THREE.BufferGeometry();
            bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(item.positions, 3));

            if (item.indices && item.indices.length > 0) {
                bufferGeometry.setIndex(new THREE.BufferAttribute(item.indices, 1));
            }
            bufferGeometry.computeVertexNormals();

            const count = item.instances.length;
            const typeCode = item.typeCode;
            const baseColor = this.getColorForType(typeCode);

            const material = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.6,
            metalness: 0.2,
            transparent: slot === 2,
            opacity: slot === 2 ? 0.6 : 1
            });

            const instancedMesh = new THREE.InstancedMesh(bufferGeometry, material, count);
            
            // Връщаме критичните метаданни за Инспектора и Панела с елементи
            instancedMesh.userData.typeCode = typeCode;
            instancedMesh.userData.modelSlot = slot;
            instancedMesh.userData.originalColor = baseColor;
            instancedMesh.userData.expressID = item.instances[0].expressID;
            instancedMesh.userData.instancesData = item.instances;

            item.instances.forEach((inst, index) => {
                dummyMatrix.fromArray(inst.matrix);
                instancedMesh.setMatrixAt(index, dummyMatrix);
            });

            instancedMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(instancedMesh);
            modelsArray[slot].meshes.push(instancedMesh);
        });
    }
}