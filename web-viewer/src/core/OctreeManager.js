import * as THREE from 'three';

export class OctreeManager {
    constructor(camera) {
        this.camera = camera;
        this.projScreenMatrix = new THREE.Matrix4();
        this.frustum = new THREE.Frustum();
    }

    updateFrustumCulling(meshes) {
        this.projScreenMatrix.multiplyMatrices(
            this.camera.projectionMatrix, 
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            
            // Проверка дали обектът се вижда в камерата
            mesh.visible = this.frustum.intersectsObject(mesh);
        }
    }
}