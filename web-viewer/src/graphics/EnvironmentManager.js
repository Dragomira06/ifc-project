import * as THREE from 'three';

export class EnvironmentManager {
    constructor(engine) {
        this.engine = engine;
        
        // Създаваме основата и небето веднага при стартиране
        this.setupArchitecturalStage();
        this.setEnvironment('day');
    }

    setupArchitecturalStage() {
        if (!this.engine || !this.engine.scene) return;

        // 1. ПОД С МРЕЖА (Архитектурна прозрачна мрежа)
        // Размери: 100x100 метра, деления: 50
        this.gridHelper = new THREE.GridHelper(100, 50, 0x4a90e2, 0x444444);
        this.gridHelper.position.y = -0.01; // Леко под кота 0, за да няма трептене
        
        // Правим я леко прозрачна и стилна
        if (this.gridHelper.material) {
            this.gridHelper.material.opacity = 0.4;
            this.gridHelper.material.transparent = true;
        }
        this.engine.scene.add(this.gridHelper);

        // 2. НЕВИДИМ ПОД ЗА СЕНКИ (Сградата хвърля сянка върху мрежата)
        const planeGeo = new THREE.PlaneGeometry(200, 200);
        const planeMat = new THREE.ShadowMaterial({ opacity: 0.2 }); // Улавя само сянката
        this.shadowPlane = new THREE.Mesh(planeGeo, planeMat);
        this.shadowPlane.rotation.x = -Math.PI / 2;
        this.shadowPlane.receiveShadow = true;
        this.engine.scene.add(this.shadowPlane);
    }

    setEnvironment(type) {
    if (!this.engine || !this.engine.scene) return;

    const container = this.engine.container;
    this.engine.scene.background = null; // Правим сцената прозрачна за CSS градиента

    if (type === 'night') {
        // Нов, по-тъмен нощен градиент (от почти черно #122a5a към много тъмно нощно синьо)
        container.style.background = 'linear-gradient(to bottom, #23407b 0%, #1f4387 55%, #152032 100%)';

        if (this.engine.renderer) this.engine.renderer.toneMappingExposure = 0.4;
        if (this.engine.dirLight) {
            this.engine.dirLight.intensity = 0.25;
            this.engine.dirLight.color.setHex(0x5577aa);
        }
        if (this.gridHelper && this.gridHelper.material) {
            this.gridHelper.material.opacity = 0.15;
        }
    } else {
        // Дневен режим (напълно идентичен)
        container.style.background = 'linear-gradient(to bottom, #8ca8c8 0%, #c4d3e3 50%, #eef2f7 100%)';

        if (this.engine.renderer) this.engine.renderer.toneMappingExposure = 1.0;
        if (this.engine.dirLight) {
            this.engine.dirLight.intensity = 1.4;
            this.engine.dirLight.color.setHex(0xffffff);
            this.engine.dirLight.castShadow = true;
        }
        if (this.gridHelper && this.gridHelper.material) {
            this.gridHelper.material.opacity = 0.4;
        }
    }
}

    setSunRotation(degrees) {
        if (!this.engine || !this.engine.dirLight) return;
        
        // Въртим слънцето в кръг около сградата за динамични сенки
        const rad = (degrees * Math.PI) / 180;
        const radius = 40;
        this.engine.dirLight.position.x = Math.cos(rad) * radius;
        this.engine.dirLight.position.z = Math.sin(rad) * radius;
    }

    setLightIntensity(value) {
        if (this.engine && this.engine.renderer) {
            this.engine.renderer.toneMappingExposure = value;
        }
    }

    update() {
        // За бъдещи анимации (ако добавяш вятър/дървета)
    }
}