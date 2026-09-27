import * as THREE from 'three';

export class OctreeManager {
    constructor(camera) {
        this.camera = camera;
        this.projScreenMatrix = new THREE.Matrix4();
        this.frustum = new THREE.Frustum();
    }

    updateFrustumCulling(meshes) {
        // Методът е оставен празен нарочно!
        // Three.js върши Frustum Culling автоматично чрез frustumCulled = true.
        // Премахването на JS цикъла спестява стотици матрични операции на всеки кадър.
        return;
    }
}