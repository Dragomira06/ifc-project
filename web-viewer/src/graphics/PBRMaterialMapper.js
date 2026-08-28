import * as THREE from 'three';
import * as WebIFC from 'web-ifc';

export class PBRMaterialMapper {
    constructor() {
        this.materials = new Map();
        this.initDefaultMaterials();
    }

    initDefaultMaterials() {
        // 1. Прозорци - стъкло със светлосин оттенък и стабилна прозрачност
        this.materials.set(WebIFC.IFCWINDOW, new THREE.MeshStandardMaterial({
            color: 0x66bbff,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.45
        }));

        // 2. Стени - матово бяло/сиво
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            roughness: 0.8,
            metalness: 0.05
        });
        this.materials.set(WebIFC.IFCWALL, wallMat);
        this.materials.set(WebIFC.IFCWALLSTANDARDCASE, wallMat);

        // 3. Врати - масивно дърво
        this.materials.set(WebIFC.IFCDOOR, new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            roughness: 0.5,
            metalness: 0.05
        }));

        // 4. Подове и Плочи - бетон
        this.materials.set(WebIFC.IFCSLAB, new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.6,
            metalness: 0.1
        }));

        // 5. Покрив
        this.materials.set(WebIFC.IFCROOF, new THREE.MeshStandardMaterial({
            color: 0x5a2d2d,
            roughness: 0.7,
            metalness: 0.1
        }));

        // 6. Метални елементи и парапети
        this.materials.set(WebIFC.IFCRAILING, new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.3,
            metalness: 0.8
        }));
    }

    applyPBRMaterials(models) {
        Object.values(models).forEach(slot => {
            if (!slot.meshes) return;

            slot.meshes.forEach(mesh => {
                const typeCode = mesh.userData.typeCode;
                if (this.materials.has(typeCode)) {
                    const pbrMat = this.materials.get(typeCode).clone();

                    if (mesh.userData.modelSlot === 2) {
                        pbrMat.transparent = true;
                        pbrMat.opacity = 0.5;
                    }

                    mesh.material = pbrMat;
                    mesh.material.needsUpdate = true;
                }
            });
        });
    }
}