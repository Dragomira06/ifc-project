import * as THREE from 'three';

export function createTriplanarMaterial(map, normalMap, color = new THREE.Color(0xffffff), options = {}) {
    // 1. Създаваме Uniform обект за скалата, който може да се променя динамично
    const scaleUniform = { value: options.scale || 1.0 };

    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: options.roughness !== undefined ? options.roughness : 0.8,
        metalness: options.metalness !== undefined ? options.metalness : 0.1
    });

    material.onBeforeCompile = (shader) => {
        // Добавяме uniform променливата
        shader.uniforms.uScale = scaleUniform;
        shader.uniforms.uTextureMap = { value: map };
        shader.uniforms.uNormalMap = { value: normalMap };
        shader.uniforms.uNormalScale = { value: options.normalScale || 1.5 };

        // Записваме я в material.userData, за да може MaterialManager да я достъпва
        material.userData.uScale = scaleUniform;

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
            // Изчисляване на Triplanar Blending тегла въз основа на нормалите
            vec3 blendWeights = abs(vWorldNormal);
            blendWeights = max(blendWeights - 0.2, 0.0);
            blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

            // Скалиране на световните координати
            vec3 coord = vWorldPosition * uScale;

            // Вземане на текстурата от 3-те прожекции (X, Y, Z)
            vec4 colX = texture2D(uTextureMap, coord.yz);
            vec4 colY = texture2D(uTextureMap, coord.xz);
            vec4 colZ = texture2D(uTextureMap, coord.xy);

            vec4 triplanarColor = colX * blendWeights.x + colY * blendWeights.y + colZ * blendWeights.z;
            diffuseColor *= triplanarColor;
            `
        ).replace(
            '#include <normal_fragment_maps>',
            `
            // Triplanar Normal Mapping за релеф
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