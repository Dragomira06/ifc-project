import * as THREE from 'three';

export function createTriplanarMaterial(map, normalMap, color = new THREE.Color(0xffffff), options = {}) {
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: options.roughness !== undefined ? options.roughness : 0.8,
        metalness: options.metalness !== undefined ? options.metalness : 0.1
    });

    // Создаваме uScale в userData ОЩЕ ТУК, за да съществува от самото начало
    material.userData = {
        uScale: { value: options.scale || 1.0 }
    };

    material.onBeforeCompile = (shader) => {
        // Използваме същата референция към uScale
        shader.uniforms.uScale = material.userData.uScale;
        shader.uniforms.uTextureMap = { value: map };
        shader.uniforms.uNormalMap = { value: normalMap };
        shader.uniforms.uNormalScale = { value: options.normalScale || 1.5 };

        shader.vertexShader = `
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            ${shader.vertexShader}
        `.replace(
            '#include <worldpos_vertex>',
            `
            #include <worldpos_vertex>
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            `
        );

        shader.fragmentShader = `
            uniform float uScale;
            uniform sampler2D uTextureMap;
            uniform sampler2D uNormalMap;
            uniform float uNormalScale;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            ${shader.fragmentShader}
        `.replace(
            '#include <map_fragment>',
            `
            vec3 blendWeights = abs(vWorldNormal);
            blendWeights = max(blendWeights - 0.2, 0.0);
            blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

            vec3 coord = vWorldPosition * uScale;

            vec4 colX = texture2D(uTextureMap, coord.yz);
            vec4 colY = texture2D(uTextureMap, coord.xz);
            vec4 colZ = texture2D(uTextureMap, coord.xy);

            vec4 triplanarColor = colX * blendWeights.x + colY * blendWeights.y + colZ * blendWeights.z;
            diffuseColor *= triplanarColor;
            `
        ).replace(
            '#include <normal_fragment_maps>',
            `
            vec3 nX = texture2D(uNormalMap, coord.yz).xyz * 2.0 - 1.0;
            vec3 nY = texture2D(uNormalMap, coord.xz).xyz * 2.0 - 1.0;
            vec3 nZ = texture2D(uNormalMap, coord.xy).xyz * 2.0 - 1.0;

            vec3 triplanarNormal = normalize(nX * blendWeights.x + nY * blendWeights.y + nZ * blendWeights.z);
            normal = normalize(mix(normal, triplanarNormal, uNormalScale));
            `
        );
    };

    return material;
}