import * as THREE from 'three';
import { createTriplanarMaterial } from '../workers/TriplanarShader.js';

import stoneDiffuseUrl from '../assets/textures/stone_diffuse.jpg';
import stoneNormalUrl from '../assets/textures/stone_normal.jpg';
import woodDiffuseUrl from '../assets/textures/wood_diffuse.jpg';
import woodNormalUrl from '../assets/textures/wood_normal.jpg';
import plasterDiffuseUrl from '../assets/textures/plaster_diffuse.jpg';
import plasterNormalUrl from '../assets/textures/plaster_normal.jpg';
import metalDiffuseUrl from '../assets/textures/metal_diffuse.jpg';
import metalNormalUrl from '../assets/textures/metal_normal.jpg';

export class MaterialManager {
    constructor(engine) {
        this.engine = engine;
        this.isRealisticMode = false;
        this.originalMaterials = new Map();
        this.textureLoader = new THREE.TextureLoader();
        this.textures = {};

        // Глобален мащаб на текстурите (управлява се от UI плъзгача)
        this.globalScale = 1.0; 

        this.loadTextures();
    }

    loadTextures() {
        const setup = (url) => {
            const t = this.textureLoader.load(url);
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            return t;
        };

        this.textures.stoneColor = setup(stoneDiffuseUrl);
        this.textures.stoneNormal = setup(stoneNormalUrl);
        this.textures.woodColor = setup(woodDiffuseUrl);
        this.textures.woodNormal = setup(woodNormalUrl);
        this.textures.plasterColor = setup(plasterDiffuseUrl);
        this.textures.plasterNormal = setup(plasterNormalUrl);
        this.textures.metalColor = setup(metalDiffuseUrl);
        this.textures.metalNormal = setup(metalNormalUrl);
    }

    toggleRealisticMode(models) {
        this.isRealisticMode = !this.isRealisticMode;

        if (!models) return this.isRealisticMode;

        Object.keys(models).forEach(slot => {
            const model = models[slot];
            if (!model || !model.meshes) return;

            model.meshes.forEach(mesh => {
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
            });
        });

        return this.isRealisticMode;
    }

    // Метод за промяна на скалата в реално време от UI
    setTextureScale(newScale, models) {
        this.globalScale = parseFloat(newScale);

        if (!models) return;

        // При обхождането променяме стойността в GPU шейдърите мигновено
        Object.keys(models).forEach(slot => {
            const model = models[slot];
            if (!model || !model.meshes) return;

            model.meshes.forEach(mesh => {
                if (mesh.material && mesh.material.userData && mesh.material.userData.uScale) {
                    const matType = mesh.userData?.materialType;
                    mesh.material.userData.uScale.value = this.getScaleForType(matType);
                }
            });
        });
    }

    getScaleForType(matType) {
        const base = this.globalScale || 1.0;
        switch (matType) {
            case 'stone': return 1.2 * base;
            case 'wood': return 1.0 * base;
            case 'plaster': return 1.5 * base;
            case 'metal': return 2.0 * base;
            default: return 1.0 * base;
        }
    }

    applyPBRMaterial(mesh, matType = null, targetColor = null) {
        if (!mesh) return;

        const typeCode = mesh.userData?.typeCode || mesh.typeCode;
        const selectedType = matType || this.detectMaterialType(typeCode);

        let finalColor;
        if (targetColor) {
            finalColor = targetColor;
        } else if (['stone', 'wood', 'plaster', 'metal'].includes(selectedType)) {
            finalColor = new THREE.Color(0xffffff);
        } else {
            let baseMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            finalColor = (baseMat && baseMat.color) ? baseMat.color.clone() : new THREE.Color(0xffffff);
        }

        let newMaterial;
        const currentScale = this.getScaleForType(selectedType);

        switch (selectedType) {
            case 'stone':
                newMaterial = createTriplanarMaterial(
                    this.textures.stoneColor,
                    this.textures.stoneNormal,
                    finalColor,
                    { scale: currentScale, normalScale: 2.0, roughness: 0.85 }
                );
                break;

            case 'wood':
                newMaterial = createTriplanarMaterial(
                    this.textures.woodColor,
                    this.textures.woodNormal,
                    finalColor,
                    { scale: currentScale, normalScale: 1.5, roughness: 0.5 }
                );
                break;

            case 'plaster':
                newMaterial = createTriplanarMaterial(
                    this.textures.plasterColor,
                    this.textures.plasterNormal,
                    finalColor,
                    { scale: currentScale, normalScale: 1.2, roughness: 0.9 }
                );
                break;

            case 'metal':
                newMaterial = createTriplanarMaterial(
                    this.textures.metalColor,
                    this.textures.metalNormal,
                    finalColor,
                    { scale: currentScale, normalScale: 1.0, roughness: 0.3, metalness: 0.8 }
                );
                break;

            case 'glass':
                newMaterial = new THREE.MeshPhysicalMaterial({
                    color: targetColor || new THREE.Color(0x88ccff),
                    transparent: true,
                    opacity: 0.4,
                    transmission: 0.85,
                    ior: 1.52
                });
                break;

            default:
                newMaterial = new THREE.MeshStandardMaterial({
                    color: finalColor,
                    roughness: 0.8
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