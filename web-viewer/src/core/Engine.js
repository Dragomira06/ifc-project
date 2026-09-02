// --- Сцената, светлините, рендъръра и Resize логиката. ---
import * as THREE from 'three';

export class Engine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x333333);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
        this.camera.position.set(15, 15, 15);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // --- НОВИ РЕДОВЕ: Активиране на физически сенки и тонална настройка ---
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        // ----------------------------------------------------------------------

        this.container.appendChild(this.renderer.domElement);

        // Основно разсеяно осветление
        this.light = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
        this.scene.add(this.light);

        // --- НОВИ РЕДОВЕ: Направлявана слънчева светлина за създаване на релеф и сенки ---
        this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
        this.dirLight.position.set(20, 40, 20);
        this.dirLight.castShadow = true;
        this.scene.add(this.dirLight);
        // -----------------------------------------------------------------------------------

        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}