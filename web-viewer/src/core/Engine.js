import * as THREE from 'three';

export class Engine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // 1. Сцена
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x333333);

        // 2. Камера (Връщаме стартовото позициониране на (15, 15, 15))
        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.01, 
            1000
        );
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);

        // 3. Рендерер с пълна поддръжка на сенки и PBR Tone Mapping
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Сенки
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Tone Mapping за реалистични цветове
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0; 

        this.container.appendChild(this.renderer.domElement);

        // 4. Осветление (Комбинираме стабилното HemisphereLight от стария и DirectionalLight)
        this.light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        this.scene.add(this.light);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.5);
        this.dirLight.position.set(20, 40, 20);
        this.dirLight.castShadow = true;
        
        // Настройки на резолюцията на сянката
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.scene.add(this.dirLight);

        // 5. Обработка на преоразмеряването на екран
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}