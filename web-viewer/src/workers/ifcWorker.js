import * as WebIFC from 'web-ifc';

let ifcApi = null;

self.onmessage = async (e) => {
    const { action, arrayBuffer, modelSlot } = e.data;

    if (action === 'PARSE_IFC') {
        if (!ifcApi) {
            ifcApi = new WebIFC.IfcAPI();
            ifcApi.SetWasmPath("/");
            await ifcApi.Init();
        }

        const modelID = ifcApi.OpenModel(new Uint8Array(arrayBuffer));
        const geometryMap = new Map();

        ifcApi.StreamAllMeshes(modelID, (mesh) => {
            const typeCode = ifcApi.GetLineType(modelID, mesh.expressID);
            const placedGeometries = mesh.geometries;
            const placedCount = placedGeometries.size();

            for (let i = 0; i < placedCount; i++) {
                const placed = placedGeometries.get(i);
                const geomExpressID = placed.geometryExpressID;

                const cacheKey = `${typeCode}_${geomExpressID}`;

                if (!geometryMap.has(cacheKey)) {
                    const ifcGeom = ifcApi.GetGeometry(modelID, geomExpressID);
                    const rawVerts = ifcApi.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
                    const rawIndices = ifcApi.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

                    const vertCount = rawVerts.length / 6;
                    const positions = new Float32Array(vertCount * 3);
                    const normals = new Float32Array(vertCount * 3);

                    // Извличаме позиции И нормали директно от WASM паметта
                    for (let j = 0, k = 0; j < rawVerts.length; j += 6, k += 3) {
                        positions[k]     = rawVerts[j];
                        positions[k + 1] = rawVerts[j + 1];
                        positions[k + 2] = rawVerts[j + 2];

                        normals[k]     = rawVerts[j + 3];
                        normals[k + 1] = rawVerts[j + 4];
                        normals[k + 2] = rawVerts[j + 5];
                    }

                    geometryMap.set(cacheKey, {
                        geomExpressID,
                        typeCode,
                        positions,
                        normals,
                        indices: new Uint32Array(rawIndices),
                        instances: []
                    });
                }

                geometryMap.get(cacheKey).instances.push({
                    expressID: mesh.expressID,
                    matrix: Array.from(placed.flatTransformation)
                });
            }
        });

        const parsedGeometries = Array.from(geometryMap.values());
        
        // Прехвърляме буферите чрез Transferable Objects за бързина
        const transferables = [];
        parsedGeometries.forEach(g => {
            transferables.push(g.positions.buffer, g.normals.buffer, g.indices.buffer);
        });

        self.postMessage({ action: 'IFC_PARSED', parsedGeometries, modelSlot, modelID }, transferables);
    }
};