import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
    constructor(camera, domElement) {
        this.controls = new OrbitControls(camera, domElement);
        this.setupControls();
    }

    setupControls() {
        // Професионални настройки за мазна навигация
        this.controls.enableDamping = true;      // Активира инерцията
        this.controls.dampingFactor = 0.05;      // Плавно спиране
        this.controls.screenSpacePanning = true; // Плавно преместване (Pan)
        this.controls.zoomSpeed = 1.2;
        this.controls.rotateSpeed = 0.8;
    }

    update() {
        // Трябва да се извиква в анимационния цикъл (requestAnimationFrame)
        this.controls.update();
    }

    fitToBox(box) {
        // Полезен метод за автоматично фокусиране върху сградата
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        this.controls.target.copy(center);
        this.controls.update();
    }
}