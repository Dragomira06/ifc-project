import * as THREE from 'three';

export class EnvironmentManager {
    constructor(engine) {
        this.engine = engine;
        this.currentMode = 'day';
        this.sunRotation = 0;
        this.lightIntensity = 1.0;
        
        // Създаваме основата и небето веднага при стартиране
        this.setupArchitecturalStage();
        this.setEnvironment('day');
    }

    setupArchitecturalStage() {
        if (!this.engine || !this.engine.scene) return;

        // 1. ПОД С МРЕЖА (Архитектурна прозрачна мрежа)
        this.gridHelper = new THREE.GridHelper(100, 50, 0x4a90e2, 0x444444);
        this.gridHelper.position.y = -0.01;
        
        if (this.gridHelper.material) {
            this.gridHelper.material.opacity = 0.4;
            this.gridHelper.material.transparent = true;
        }
        this.engine.scene.add(this.gridHelper);

        // 2. НЕВИДИМ ПОД ЗА СЕНКИ
        const planeGeo = new THREE.PlaneGeometry(200, 200);
        const planeMat = new THREE.ShadowMaterial({ opacity: 0.2 });
        this.shadowPlane = new THREE.Mesh(planeGeo, planeMat);
        this.shadowPlane.rotation.x = -Math.PI / 2;
        this.shadowPlane.receiveShadow = false; // Изключено за пестене на ресурси
        this.engine.scene.add(this.shadowPlane);
    }

    setEnvironment(type) {
        this.currentMode = type;
        if (!this.engine || !this.engine.scene) return;

        const container = this.engine.container;
        this.engine.scene.background = null;

        if (type === 'night') {
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
            container.style.background = 'linear-gradient(to bottom, #8ca8c8 0%, #c4d3e3 50%, #eef2f7 100%)';

            if (this.engine.renderer) this.engine.renderer.toneMappingExposure = 1.0;
            if (this.engine.dirLight) {
                this.engine.dirLight.intensity = 1.4;
                this.engine.dirLight.color.setHex(0xffffff);
            }
            if (this.gridHelper && this.gridHelper.material) {
                this.gridHelper.material.opacity = 0.4;
            }
        }

        if (this.engine) this.engine.requestRender(2);
    }

    setSunRotation(degrees) {
        this.sunRotation = degrees;
        if (!this.engine || !this.engine.dirLight) return;
        
        const rad = (degrees * Math.PI) / 180;
        const radius = 40;
        this.engine.dirLight.position.x = Math.cos(rad) * radius;
        this.engine.dirLight.position.z = Math.sin(rad) * radius;

        if (this.engine) this.engine.requestRender(2);
    }

    setLightIntensity(value) {
        this.lightIntensity = value;
        if (this.engine && this.engine.renderer) {
            this.engine.renderer.toneMappingExposure = value;
        }

        if (this.engine) this.engine.requestRender(2);
    }

    getSunRotation() {
        return this.sunRotation !== undefined ? this.sunRotation : 0;
    }

    getLightIntensity() {
        return this.lightIntensity !== undefined ? this.lightIntensity : (this.engine?.renderer?.toneMappingExposure || 1.0);
    }

    update() {
        return false;
    }
}
