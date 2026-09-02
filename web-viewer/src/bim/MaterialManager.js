import * as THREE from 'three';

// Излизаме от папка bim (..) и влизаме в assets/textures/
import stoneDiffuseUrl from '../assets/textures/stone_diffuse.jpg';
import stoneNormalUrl from '../assets/textures/stone_normal.jpg';

export class MaterialManager {
    constructor(engine) {
        this.engine = engine;
        this.isRealisticMode = false;
        this.originalMaterials = new Map();
        this.textureLoader = new THREE.TextureLoader();
        this.textures = {};

        this.loadTextures();
    }

     loadTextures() {
        const stoneColor = this.textureLoader.load(stoneDiffuseUrl);
        const stoneNormal = this.textureLoader.load(stoneNormalUrl);
        
        // Включваме повторението
        stoneColor.wrapS = THREE.RepeatWrapping;
        stoneColor.wrapT = THREE.RepeatWrapping;

        stoneNormal.wrapS = THREE.RepeatWrapping;
        stoneNormal.wrapT = THREE.RepeatWrapping;

        // Всичко останало се контролира директно от 'scale' в applyTriplanarUVs!

        this.textures.stoneColor = stoneColor;
        this.textures.stoneNormal = stoneNormal;
    }

      applyTriplanarUVs(geometry) {
        if (!geometry || !geometry.attributes.position) return;

        geometry.computeVertexNormals();

        const pos = geometry.attributes.position;
        const norm = geometry.attributes.normal;
        const uvs = new Float32Array(pos.count * 2);

        // Увеличаваме стойността, за да се виждат фините плочки и фуги (вместо замазано)
        const scale = 0.5; 

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);

            const nx = Math.abs(norm.getX(i));
            const ny = Math.abs(norm.getY(i));
            const nz = Math.abs(norm.getZ(i));

            if (ny > nx && ny > nz) {
                uvs[i * 2] = x * scale;
                uvs[i * 2 + 1] = z * scale;
            } 
            else if (nz > nx) {
                uvs[i * 2] = x * scale;
                uvs[i * 2 + 1] = y * scale;
            } 
            else {
                uvs[i * 2] = z * scale;
                uvs[i * 2 + 1] = y * scale;
            }
        }

        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.attributes.uv.needsUpdate = true;
    }

    toggleRealisticMode(models) {
        this.isRealisticMode = !this.isRealisticMode;

        for (const slot of [1, 2]) {
            if (!models[slot] || !models[slot].meshes) continue;

            for (const mesh of models[slot].meshes) {
                if (this.isRealisticMode) {
                    if (!this.originalMaterials.has(mesh.uuid)) {
                        this.originalMaterials.set(mesh.uuid, mesh.material);
                    }
                    this.applyPBRMaterial(mesh);
                } else {
                    if (this.originalMaterials.has(mesh.uuid)) {
                        mesh.material = this.originalMaterials.get(mesh.uuid);
                    }
                }
            }
        }

        return this.isRealisticMode;
    }

    applyPBRMaterial(mesh, matType = null, targetColor = null) {
        this.applyTriplanarUVs(mesh.geometry);
        const typeCode = mesh.userData.typeCode;
        const currentColor = targetColor || (mesh.material.color ? mesh.material.color.clone() : new THREE.Color(0xffffff));

        let newMaterial;
        const selectedType = matType || this.detectMaterialType(typeCode);

        switch (selectedType) {
            case 'stone':
                newMaterial = new THREE.MeshStandardMaterial({
                    map: this.textures.stoneColor,
                    normalMap: this.textures.stoneNormal,
                    normalScale: new THREE.Vector2(1.5, 1.5),
                    color: currentColor,
                    roughness: 0.8,
                    metalness: 0.1
                });
                break;

            case 'glass':
                newMaterial = new THREE.MeshPhysicalMaterial({
                    color: new THREE.Color(0x112233),
                    transparent: true,
                    opacity: 0.35,
                    roughness: 0.05,
                    metalness: 0.1,
                    transmission: 0.9,
                    ior: 1.5
                });
                break;

            case 'wood':
                newMaterial = new THREE.MeshStandardMaterial({
                    color: currentColor.getHex() === 0xffffff ? new THREE.Color(0x5c4033) : currentColor,
                    roughness: 0.6,
                    metalness: 0.0
                });
                break;

            default:
                newMaterial = new THREE.MeshStandardMaterial({
                    color: currentColor,
                    roughness: 0.9,
                    metalness: 0.0
                });
                break;
        }

        mesh.material = newMaterial;
        mesh.userData.materialType = selectedType;
    }

    detectMaterialType(typeCode) {
        if (typeCode === 1603610542) return 'glass';
        if (typeCode === 3999 || typeCode === 3998) return 'stone';
        if (typeCode === 3270591038) return 'wood';
        return 'plaster';
    }

    updateObjectColorAndMaterial(mesh, hexColor, matType) {
        const color = new THREE.Color(hexColor);
        this.applyPBRMaterial(mesh, matType, color);
    }
}