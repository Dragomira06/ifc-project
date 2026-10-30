import * as THREE from 'three';

export class Engine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // 1. Сцена
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x333333);

        // 2. Камера
        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.01, 
            1000
        );
        this.camera.position.set(15, 15, 15);
        this.camera.lookAt(0, 0, 0);

        // 3. Рендерер - Оптимизиран за максимален FPS и нисък GPU товар
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance",
            stencil: false // Спестява GPU памет и пропуска излишен stencil буфер
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // ⚡ GPU Оптимизация: Ограничаваме до 1.5x pixel ratio (при 2x/3x Retina/4K екрани
        // това спестява до 50% GPU fillrate товар без видима разлика в детайла)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        
        // Сенки - Изключени за висока производителност при тежки BIM сцени
        this.renderer.shadowMap.enabled = false; 

        // Tone Mapping за реалистични архитектурни цветове
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0; 

        this.container.appendChild(this.renderer.domElement);

        // 4. Осветление (Комбинирано за перфектна видимост)
        this.light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        this.scene.add(this.light);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.5);
        this.dirLight.position.set(20, 40, 20);
        this.scene.add(this.dirLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
        fillLight.position.set(-20, -20, -20);
        this.scene.add(fillLight);

        // 5. On-Demand Rendering мениджмънт
        // Рендира първите 2 кадъра при стартиране, след което рендира само при нужда/промяна
        this.renderFrames = 2;

        // 6. Обработка на преоразмеряването на екран
        window.addEventListener('resize', () => this.onWindowResize());
    }

    // Заявка за рендиране на кадър(и) при промяна в сцената или камерата
    requestRender(frames = 2) {
        this.renderFrames = Math.max(this.renderFrames, frames);
    }

    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.requestRender(2);
    }
}
