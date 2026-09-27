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

        // 3. Рендерер - Добавен powerPreference и оптимизиран за производителност
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance" // Принуждава браузъра да ползва бързата видеокарта
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Сенки - Изключваме ги или оптимизираме картaта им за CAD/BIM сцени
        // В BIM моделите тежките сенки в реално време не са нужни и бавят сцената
        this.renderer.shadowMap.enabled = false; 

        // Tone Mapping за реалистични цветове
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0; 

        this.container.appendChild(this.renderer.domElement);

        // 5. Осветление (Комбинирано за перфектна видимост без тежки сенки)
        this.light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        this.scene.add(this.light);

        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.5);
        this.dirLight.position.set(20, 40, 20);
        this.scene.add(this.dirLight);

        // Допълнителна светлина за по-добра видимост отдолу и отстрани
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
        fillLight.position.set(-20, -20, -20);
        this.scene.add(fillLight);

        // 6. Обработка на преоразмеряването на екран
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}