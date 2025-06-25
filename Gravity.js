import * as THREE from 'https://esm.sh/three@0.150.1';

// Funzione ausiliaria per ottenere le dimensioni di un oggetto
function getObjectSpans(obj) {
    if (obj.userData?.isWall) {
        return { sx: 1, sz: 1 };
    }
    if (obj.userData?.isHouse) {
        const rotationSteps = Math.round(obj.rotation.y / (Math.PI / 2)) % 4;
        const isRotated = rotationSteps % 2 !== 0;
        return isRotated ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
    }
    return { sx: 1, sz: 1 };
}

export { getObjectSpans as getRotatedSpans };

// Funzione ausiliaria per calcolare le celle coperte da un oggetto
function cellsCovered(position, spans, cellSize) {
    const cells = [];
    let startX, startZ;

    if (spans.sx % 2 === 1) { // Oggetti con centro nella cella (es. Wall)
        startX = Math.floor(position.x / cellSize);
    } else { // Oggetti con centro sul bordo (es. House)
        startX = Math.round(position.x / cellSize) - spans.sx / 2;
    }

    if (spans.sz % 2 === 1) {
        startZ = Math.floor(position.z / cellSize);
    } else {
        startZ = Math.round(position.z / cellSize) - spans.sz / 2;
    }
    
    for (let dx = 0; dx < spans.sx; dx++) {
        for (let dz = 0; dz < spans.sz; dz++) {
            cells.push({ ix: startX + dx, iz: startZ + dz });
        }
    }
    return cells;
}

// Funzione ricorsiva che controlla l'intera colonna
function isPillarSupporting(scene, wall, cellSize, wallMap) {
    if (!wall) return false;

    // Controlla se il muro corrente supporta direttamente una casa
    let isDirectSupport = false;
    const wallCell = cellsCovered(wall.position, {sx: 1, sz: 1}, cellSize)[0];
    scene.traverse(house => {
        if (isDirectSupport || !house.userData?.isHouse) return;
        const wallTopY = wall.position.y + 0.5;
        const houseBottomY = house.position.y - (house.geometry.parameters.height / 2);

        if (Math.abs(wallTopY - houseBottomY) < 0.1) {
            const houseSpans = getObjectSpans(house);
            const houseCells = cellsCovered(house.position, houseSpans, cellSize);
            if (houseCells.some(c => c.ix === wallCell.ix && c.iz === wallCell.iz)) {
                isDirectSupport = true;
            }
        }
    });

    if (isDirectSupport) return true;

    // Se non è un supporto diretto, cerca un muro sopra e controlla ricorsivamente
    const ix = Math.floor(wall.position.x / cellSize);
    const iz = Math.floor(wall.position.z / cellSize);
    
    let wallAbove = null;
    for (const otherWall of wallMap.values()) {
        if (otherWall.id === wall.id) continue;
        const otherIx = Math.floor(otherWall.position.x / cellSize);
        const otherIz = Math.floor(otherWall.position.z / cellSize);
        // Controlla se è nella stessa colonna (ix, iz) e 1 unità più in alto
        if (otherIx === ix && otherIz === iz && Math.abs(otherWall.position.y - (wall.position.y + 1)) < 0.1) {
            wallAbove = otherWall;
            break;
        }
    }

    if (wallAbove) {
        return isPillarSupporting(scene, wallAbove, cellSize, wallMap);
    }

    return false;
}

/**
 * Calcola se un blocco 'wall' fa parte di un pilastro che supporta una 'house'.
 */
export function isSupporting(scene, obj, cellSize) {
    if (!obj.userData?.isWall) return false;
    
    // Creiamo una mappa di tutti i muri per passarla alla funzione ricorsiva
    const wallMap = new Map();
    scene.traverse(w => {
        if (w.userData?.isWall) {
            wallMap.set(w.uuid, w);
        }
    });

    return isPillarSupporting(scene, obj, cellSize, wallMap);
}


/**
 * Calcola l'altezza Y di destinazione per un oggetto che cade a causa della gravità.
 */
export function computeTargetY(scene, obj, spans, cellSize) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const halfH = size.y / 2;
    const objCells = cellsCovered(obj.position, spans, cellSize);
    let maxBelowY = -Infinity;

    scene.traverse(other => {
        if (other === obj || (!other.userData?.isWall && !other.userData?.isHouse)) return;

        const otherSpans = getObjectSpans(other);
        const otherCells = cellsCovered(other.position, otherSpans, cellSize);
        const isOverlapping = objCells.some(c1 => otherCells.some(c2 => c1.ix === c2.ix && c1.iz === c2.iz));

        if (isOverlapping) {
            const otherTopY = other.position.y + (other.geometry.parameters.height / 2);
            if (otherTopY < obj.position.y) {
                maxBelowY = Math.max(maxBelowY, otherTopY);
            }
        }
    });
    
    const groundY = 0;
    const supportY = maxBelowY > -Infinity ? maxBelowY : groundY;
    
    return supportY + halfH;
}