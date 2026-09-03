import * as THREE from 'three';

// Излизаме от папка bim (..) и влизаме в assets/textures/
import stoneDiffuseUrl from '../assets/textures/stone_diffuse.jpg';
import stoneNormalUrl from '../assets/textures/stone_normal.jpg';

// Новите импорти за дървото:
import woodDiffuseUrl from '../assets/textures/wood_diffuse.jpg';
import woodNormalUrl from '../assets/textures/wood_normal.jpg';

// Мазилка 
import plasterDiffuseUrl from '../assets/textures/plaster_diffuse.jpg';
import plasterNormalUrl from '../assets/textures/plaster_normal.jpg';

//Метал
import metalDiffuseUrl from '../assets/textures/metal_diffuse.jpg';
import metalNormalUrl from '../assets/textures/metal_normal.jpg';

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
        // Камък
        const stoneColor = this.textureLoader.load(stoneDiffuseUrl);
        const stoneNormal = this.textureLoader.load(stoneNormalUrl);
        stoneColor.wrapS = THREE.RepeatWrapping;
        stoneColor.wrapT = THREE.RepeatWrapping;
        stoneNormal.wrapS = THREE.RepeatWrapping;
        stoneNormal.wrapT = THREE.RepeatWrapping;

        // Дърво
        const woodColor = this.textureLoader.load(woodDiffuseUrl);
        const woodNormal = this.textureLoader.load(woodNormalUrl);
        woodColor.wrapS = THREE.RepeatWrapping;
        woodColor.wrapT = THREE.RepeatWrapping;
        woodNormal.wrapS = THREE.RepeatWrapping;
        woodNormal.wrapT = THREE.RepeatWrapping;

        // Мазилка
        const plasterColor = this.textureLoader.load(plasterDiffuseUrl);
        const plasterNormal = this.textureLoader.load(plasterNormalUrl);
        plasterColor.wrapS = THREE.RepeatWrapping;
        plasterColor.wrapT = THREE.RepeatWrapping;
        plasterNormal.wrapS = THREE.RepeatWrapping;
        plasterNormal.wrapT = THREE.RepeatWrapping;

        // Метал
        const metalColor = this.textureLoader.load(metalDiffuseUrl);
        const metalNormal = this.textureLoader.load(metalNormalUrl);
        metalColor.wrapS = THREE.RepeatWrapping;
        metalColor.wrapT = THREE.RepeatWrapping;
        metalNormal.wrapS = THREE.RepeatWrapping;
        metalNormal.wrapT = THREE.RepeatWrapping;

        this.textures.stoneColor = stoneColor;
        this.textures.stoneNormal = stoneNormal;
        this.textures.woodColor = woodColor;
        this.textures.woodNormal = woodNormal;
        this.textures.plasterColor = plasterColor;
        this.textures.plasterNormal = plasterNormal;
        this.textures.metalColor = metalColor;
        this.textures.metalNormal = metalNormal;
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
                // Използваме currentColor, за да работи смяната на цвят от менюто!
                // Ако обектът няма цвят, слагаме модерен, лек небесносин оттенък (0x88ccff)
                const glassColor = (currentColor && currentColor.getHex() !== 0xffffff) 
                    ? currentColor 
                    : new THREE.Color(0x88ccff);

                newMaterial = new THREE.MeshPhysicalMaterial({
                    color: glassColor,
                    transparent: true,
                    opacity: 0.65,           // По-плътно стъкло (вече се вижда, че го има!)
                    roughness: 0.1,          // Почти идеално гладко
                    metalness: 0.1,          // Лека металност
                    transmission: 0.6,        // Балансирано пропускане на светлина
                    ior: 1.52,               // Стандартен индекс на пречупване за стъкло
                    clearcoat: 1.0,          // Допълнителен гланцов слой (лак) за силни отражения
                    clearcoatRoughness: 0.1
                });
                break;

            case 'wood':
                newMaterial = new THREE.MeshStandardMaterial({
                    map: this.textures.woodColor,
                    normalMap: this.textures.woodNormal,
                    normalScale: new THREE.Vector2(1.0, 1.0),
                    color: currentColor.getHex() === 0xffffff ? new THREE.Color(0xffffff) : currentColor,
                    roughness: 0.4, // Дървото е по-гладко от камъка
                    metalness: 0.0
                });
                break;

            case 'plaster': // Вече мазилката си има собствен опционален случай
                newMaterial = new THREE.MeshStandardMaterial({
                    map: this.textures.plasterColor,
                    normalMap: this.textures.plasterNormal,
                    normalScale: new THREE.Vector2(0.8, 0.8),
                    color: currentColor,
                    roughness: 0.9,
                    metalness: 0.0
                });
                break;

            case 'metal':
                newMaterial = new THREE.MeshStandardMaterial({
                    map: this.textures.metalColor,
                    normalMap: this.textures.metalNormal,
                    normalScale: new THREE.Vector2(0.5, 0.5), // По-фин релеф за метала
                    color: currentColor.getHex() === 0x000000 ? new THREE.Color(0xaaaaaa) : currentColor,
                    roughness: 0.4,   // Позволява на обикновената светлина да го осветява
                    metalness: 0.5    // Балансирана металност (за да не отразява просто "черно")
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
        if (typeCode === 3270591039) return 'plaster';
        if (typeCode === 123456) return 'metal';
        return 'default';
    }

    updateObjectColorAndMaterial(mesh, hexColor, matType) {
        const color = new THREE.Color(hexColor);
        this.applyPBRMaterial(mesh, matType, color);
    }
}