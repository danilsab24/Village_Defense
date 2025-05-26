import * as THREE from 'https://esm.sh/three@0.150.1';

/**
 * Calcola se un blocco supporta altri oggetti sopra di sé
 */
// helper function
function cellsCovered(ix, iz, sx, sz) {
    const startX = ix - Math.floor((sx - 1) / 2);
    const startZ = iz - Math.floor((sz - 1) / 2);
    const cells = [];
    for (let dx = 0; dx < sx; dx++) {
        for (let dz = 0; dz < sz; dz++) {
            cells.push({ ix: startX + dx, iz: startZ + dz });
        }
    }
    return cells;
}

export function isSupporting(scene, obj) {
    if (!obj.userData?.isWall) return false;

    // Verifica se supporta case
    let isCritical = false;
    const cellSize = 1; // Assumendo griglia 1x1

    scene.traverse(other => {
        if (!other.userData?.isHouse) return;

        // Calcola celle coperte dalla casa
        const spans = getRotatedSpans(other);
        const ix = Math.floor(other.position.x / cellSize + 0.5);
        const iz = Math.floor(other.position.z / cellSize + 0.5);
        const cells = cellsCovered(ix, iz, spans.sx, spans.sz);

        // Conta quanti muri stanno supportando la casa
        let supportCount = 0;
        cells.forEach(({ix, iz}) => {
            scene.traverse(wall => {
                if (!wall.userData?.isWall) return;
                const wx = Math.floor(wall.position.x / cellSize + 0.5);
                const wz = Math.floor(wall.position.z / cellSize + 0.5);
                if (wx === ix && wz === iz) {
                    supportCount++;
                }
            });
        });

        // Se il muro è uno degli unici due supporti, non può essere rimosso
        const wx = Math.floor(obj.position.x / cellSize + 0.5);
        const wz = Math.floor(obj.position.z / cellSize + 0.5);
        if (cells.some(c => c.ix === wx && c.iz === wz) && supportCount <= 2) {
            isCritical = true;
        }
    });

    return isCritical;
}

// Gravity.js
export function computeTargetY(scene, obj, spans) {
    const box  = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const halfH = size.y / 2;

    const cellSize = 1;
    const ix = Math.floor(obj.position.x / cellSize + 0.5);
    const iz = Math.floor(obj.position.z / cellSize + 0.5);

    const startX = ix - Math.floor((spans.sx - 1) / 2);
    const startZ = iz - Math.floor((spans.sz - 1) / 2);

    // celle coperte dall’oggetto
    const cells = [];
    for (let dx = 0; dx < spans.sx; dx++) {
        for (let dz = 0; dz < spans.sz; dz++) {
            cells.push({ x: startX + dx, z: startZ + dz });
        }
    }

    let maxBelowY = -Infinity;

    cells.forEach(cell => {
        const cx = cell.x * cellSize;
        const cz = cell.z * cellSize;

        scene.traverse(other => {
            if (other === obj) return;
            if (!(other.userData?.isWall || other.userData?.isHouse)) return;

            // deve stare nella stessa colonna (dx/dz ≈ 0)
            const dx = Math.abs(other.position.x - cx);
            const dz = Math.abs(other.position.z - cz);
            if (dx > cellSize / 2 - 0.01 || dz > cellSize / 2 - 0.01) return;

            // --- solo blocchi SOTTO ---
            const otherBox  = new THREE.Box3().setFromObject(other);
            const otherSize = new THREE.Vector3();
            otherBox.getSize(otherSize);
            const otherTopY = other.position.y + otherSize.y / 2;

            if (otherTopY < obj.position.y - halfH - 0.01) {
                maxBelowY = Math.max(maxBelowY, otherTopY);
            }
        });
    });

    // se nulla sotto → poggia a terra (y = halfH)
    return maxBelowY > -Infinity ? maxBelowY + halfH : halfH;
}


export function getRotatedSpans(obj) {
	const rotationSteps = Math.round(obj.rotation.y / (Math.PI / 2));
	const isRotated = rotationSteps % 2 !== 0;
	return isRotated ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
}
