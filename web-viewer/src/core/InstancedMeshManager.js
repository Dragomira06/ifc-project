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
            case WebIFC.IFCFLOWSEGMENT:
            case WebIFC.IFCFLOWFITTING: return 0x7f8c8d;
            default: return 0xcccccc;
        }
    }

    buildInstancedMeshes(parsedGeometries, slot, modelsArray) {
        const dummyMatrix = new THREE.Matrix4();

        if (!modelsArray[slot]) {
            modelsArray[slot] = { meshes: [] };
        } else if (!modelsArray[slot].meshes) {
            modelsArray[slot].meshes = [];
        }

        parsedGeometries.forEach((item) => {
            const bufferGeometry = new THREE.BufferGeometry();
            
            // Задаваме атрибута за позиции
            const posAttr = new THREE.Float32BufferAttribute(item.positions, 3);
            bufferGeometry.setAttribute('position', posAttr);

            if (item.indices && item.indices.length > 0) {
                bufferGeometry.setIndex(new THREE.BufferAttribute(item.indices, 1));
            }

            // Бързо изчисляване на нормалите
            bufferGeometry.computeVertexNormals();

            // ⚡ МНОГО БЪРЗ UV ГЕНЕРАТОР (Без тежки JavaScript цикли, които замразяват браузъра)
            if (!bufferGeometry.attributes.uv) {
                const count = posAttr.count;
                const uvs = new Float32Array(count * 2);
                const array = posAttr.array;
                for (let i = 0; i < count; i++) {
                    uvs[i * 2] = array[i * 3];     // X
                    uvs[i * 2 + 1] = array[i * 3 + 1]; // Y
                }
                bufferGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            }

            // Изчисляваме сферата за бързо скриване извън екрана
            bufferGeometry.computeBoundingSphere();

            const count = item.instances.length;
            const typeCode = item.typeCode;
            const baseColor = this.getColorForType(typeCode);
            const isWindow = (typeCode === WebIFC.IFCWINDOW);

            // Лек материал за максимално висока кадрова честота (FPS)
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.5,
                metalness: 0.1,
                transparent: isWindow,
                opacity: isWindow ? 0.45 : 1.0,
                depthWrite: !isWindow // Оптимизация за прозрачните детайли
            });

            const instancedMesh = new THREE.InstancedMesh(bufferGeometry, material, count);
            
            // ⚡ Изключваме сенките по подразбиране (Сенките са основна причина за лаг при 3 модела)
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;

            // ⚡ Скрива обекти извън погледа на камерата
            instancedMesh.frustumCulled = true;

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