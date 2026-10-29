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
        this.models = null;

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

    saveOriginalMaterial(mesh) {
        if (!mesh || this.originalMaterials.has(mesh.uuid)) return;
        // Ако материалът вече е Triplanar (PBR), генерираме чист CAD материал за оригинален
        if (mesh.material?.userData?.uScale) {
            const orig = this.createCADMaterial(mesh);
            this.originalMaterials.set(mesh.uuid, orig);
            return;
        }
        this.originalMaterials.set(mesh.uuid, mesh.material.clone ? mesh.material.clone() : mesh.material);
    }

    createCADMaterial(mesh, colorHex = null) {
        const typeCode = mesh?.userData?.typeCode;
        let baseColor;
        if (colorHex) {
            baseColor = colorHex instanceof THREE.Color ? colorHex.clone() : new THREE.Color(colorHex);
        } else if (mesh?.userData?.customColor) {
            baseColor = new THREE.Color(mesh.userData.customColor);
        } else if (mesh?.userData?.originalColor !== undefined) {
            baseColor = new THREE.Color(mesh.userData.originalColor);
        } else {
            baseColor = new THREE.Color(0xcccccc);
        }
        const isWindow = (typeCode === 1603610542); // IFCWINDOW

        return new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.5,
            metalness: 0.1,
            transparent: isWindow,
            opacity: isWindow ? 0.45 : 1.0,
            depthWrite: !isWindow
        });
    }

    getOriginalMaterial(mesh) {
        if (!mesh) return null;
        if (this.originalMaterials.has(mesh.uuid)) {
            return this.originalMaterials.get(mesh.uuid);
        }
        const cadMat = this.createCADMaterial(mesh);
        this.originalMaterials.set(mesh.uuid, cadMat);
        return cadMat;
    }

    /* =========================================================
       КОНТРОЛ НА РЕЖИМА ЗА ТЕКСТУРИ / МАТЕРИАЛИ
       ========================================================= */
    setRealisticMode(enable, models = null) {
        this.isRealisticMode = !!enable;
        if (models) this.models = models;
        const targetModels = this.models;

        if (!targetModels) return this.isRealisticMode;

        Object.keys(targetModels).forEach(slot => {
            const model = targetModels[slot];
            if (!model || !model.meshes) return;

            model.meshes.forEach(mesh => {
                if (!mesh) return;
                this.saveOriginalMaterial(mesh);

                if (this.isRealisticMode) {
                    // РЕЖИМЪТ Е ВКЛЮЧЕН:
                    // Качваме и възстановяваме съответните текстури върху обектите!
                    const matType = mesh.userData?.materialType;
                    const targetColor = mesh.userData?.customColor ? new THREE.Color(mesh.userData.customColor) : null;
                    const textureScale = mesh.userData?.textureScale;

                    if (matType && matType !== 'default') {
                        // Потребителска или импортирана текстура (камък, дърво, мазилка, метал, стъкло)
                        this.applyPBRMaterial(mesh, matType, targetColor, textureScale);
                    } else if (matType === 'default') {
                        // Чертожен вид по изричен избор за този обект
                        const cadMat = this.createCADMaterial(mesh, mesh.userData?.customColor);
                        mesh.material = cadMat;
                        mesh.material.needsUpdate = true;
                    } else {
                        // Автоматична PBR текстура според типа на елемента
                        const autoType = this.detectMaterialType(mesh.userData?.typeCode);
                        this.applyPBRMaterial(mesh, autoType, targetColor, textureScale);
                    }
                } else {
                    // РЕЖИМЪТ Е ИЗКЛЮЧЕН:
                    // ВСИЧКИ специални материали/текстури СЕ СКРИВАТ от обектите!
                    // Обектите преминават към стандартния/базов CAD вид.
                    const cadMat = this.createCADMaterial(mesh, mesh.userData?.customColor);
                    mesh.material = cadMat;
                    mesh.material.needsUpdate = true;
                }
            });
        });

        return this.isRealisticMode;
    }

    toggleRealisticMode(models = null) {
        return this.setRealisticMode(!this.isRealisticMode, models);
    }

    getScaleForType(matType) {
        switch (matType) {
            case 'stone': return 1.2;
            case 'wood': return 1.0;
            case 'plaster': return 1.5;
            case 'metal': return 2.0;
            default: return 1.0;
        }
    }

    applyPBRMaterial(mesh, matType = null, targetColor = null, customTextureScale = null) {
        if (!mesh) return;

        this.saveOriginalMaterial(mesh);

        const typeCode = mesh.userData?.typeCode || mesh.typeCode;
        const selectedType = matType || mesh.userData?.materialType || this.detectMaterialType(typeCode);

        // Ако е 'default' -> връщаме чист CAD материал без triplanar текстури
        if (selectedType === 'default') {
            const cadMat = this.createCADMaterial(mesh, targetColor || mesh.userData?.customColor);
            mesh.material = cadMat;
            mesh.material.needsUpdate = true;
            if (!mesh.userData) mesh.userData = {};
            mesh.userData.materialType = 'default';
            mesh.userData.hasUniqueMaterial = false;
            return;
        }

        let finalColor;
        if (targetColor) {
            finalColor = targetColor instanceof THREE.Color ? targetColor.clone() : new THREE.Color(targetColor);
        } else if (mesh.userData?.customColor) {
            finalColor = new THREE.Color(mesh.userData.customColor);
        } else if (['stone', 'wood', 'plaster', 'metal'].includes(selectedType)) {
            finalColor = new THREE.Color(0xffffff);
        } else {
            let baseMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            finalColor = (baseMat && baseMat.color) ? baseMat.color.clone() : new THREE.Color(0xffffff);
        }

        let currentScale = this.getScaleForType(selectedType);
        if (customTextureScale !== null && customTextureScale !== undefined) {
            currentScale = customTextureScale;
        } else if (mesh.userData?.textureScale !== undefined) {
            currentScale = mesh.userData.textureScale;
        } else if (mesh.material?.userData?.uScale?.value !== undefined) {
            currentScale = mesh.material.userData.uScale.value;
        }

        let newMaterial;

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
                    color: finalColor,
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

        if (!newMaterial.userData) {
            newMaterial.userData = {};
        }

        if (newMaterial.userData.uScale) {
            newMaterial.userData.uScale.value = currentScale;
        }

        mesh.material = newMaterial;
        
        if (!mesh.userData) mesh.userData = {};
        mesh.userData.materialType = selectedType;
        mesh.userData.customColor = '#' + finalColor.getHexString();
        mesh.userData.textureScale = currentScale;
        if (matType) {
            mesh.userData.hasUniqueMaterial = (selectedType !== 'default');
        }
    }

    detectMaterialType(typeCode) {
        if (typeCode === 1603610542) return 'glass';
        if (typeCode === 3999 || typeCode === 3998) return 'stone';
        if (typeCode === 3270591038) return 'wood';
        if (typeCode === 3270591039) return 'plaster';
        if (typeCode === 123456) return 'metal';
        return 'default';
    }

    updateObjectColorAndMaterial(mesh, hexColor, matType, textureScale = null) {
        if (!mesh) return;

        this.saveOriginalMaterial(mesh);

        if (!mesh.userData) mesh.userData = {};

        const selectedType = matType || 'default';
        mesh.userData.materialType = selectedType;
        mesh.userData.hasUniqueMaterial = (selectedType !== 'default');

        if (hexColor) {
            mesh.userData.customColor = hexColor;
        }

        if (textureScale !== null && textureScale !== undefined) {
            mesh.userData.textureScale = textureScale;
        } else if (mesh.userData.textureScale === undefined) {
            mesh.userData.textureScale = this.getScaleForType(selectedType);
        }

        // Ако режимът в момента е изключен или типът е 'default':
        // Показваме чистия CAD материал с новия цвят
        if (!this.isRealisticMode || selectedType === 'default') {
            const cadMat = this.createCADMaterial(mesh, hexColor || mesh.userData.customColor);
            mesh.material = cadMat;
            mesh.material.needsUpdate = true;
            return;
        }

        // Ако режимът е включен: нанасяме PBR текстурата
        const color = hexColor ? new THREE.Color(hexColor) : (mesh.userData.customColor ? new THREE.Color(mesh.userData.customColor) : new THREE.Color(0xffffff));
        const scale = mesh.userData.textureScale;

        this.applyPBRMaterial(mesh, selectedType, color, scale);
    }

    getState() {
        return {
            isRealisticMode: this.isRealisticMode
        };
    }

    restoreState(state, models = null) {
        if (!state) return;
        if (state.isRealisticMode !== undefined) {
            this.setRealisticMode(state.isRealisticMode, models);
        }
    }
}
