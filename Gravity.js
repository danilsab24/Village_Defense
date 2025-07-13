import * as THREE from 'https://esm.sh/three@0.150.1';

// Helper function to get the dimensions (span) of an object in grid cell units
export function getObjectSpans(obj) {
    if (obj.userData?.isWall || obj.userData?.isStrongBlock) {
        return { sx: 1, sz: 1 };
    }
    if (obj.userData?.isHouse) {
        return { sx: 2, sz: 2 }; 
    }
    return { sx: 1, sz: 1 };
}

// Calculates the grid cell indices covered by an object
function cellsCovered(position, spans, cellSize) {
    const cells = [];
    const halfCell = cellSize / 2;

    // Calculate the bottom-left corner of the object's bounding box
    const cornerX = position.x - (spans.sx * cellSize) / 2;
    const cornerZ = position.z - (spans.sz * cellSize) / 2;

    for (let dx = 0; dx < spans.sx; dx++) {
        for (let dz = 0; dz < spans.sz; dz++) {
            // Calculate the center of each cell the object covers
            const cellCenterX = cornerX + (dx * cellSize) + halfCell;
            const cellCenterZ = cornerZ + (dz * cellSize) + halfCell;
            cells.push({ 
                ix: Math.round(cellCenterX / cellSize), 
                iz: Math.round(cellCenterZ / cellSize) 
            });
        }
    }
    return cells;
}

/* 
    Checks if a given object is part of a pillar that is currently supporting a house
    This is used to prevent the player from removing critical support blocks
*/
export function isSupporting(scene, obj, cellSize) {
    // Create a map of all wall and strong block objects in the scene.
    // This map will help us later to follow "pillars" upwards
    const wallMap = new Map();
    scene.traverse(w => {
        if (w.userData?.isWall || w.userData?.isStrongBlock) {
            wallMap.set(w.uuid, w);
        }
    });

    /*
        A recursive helper function that checks whether this specific wall/strong block
        (or anything stacked on top of it) is supporting a house above 
    */
    function isPillarSupporting(scene, wall) {
        if (!wall) return false;
        
        const wallCell = cellsCovered(wall.position, { sx: 1, sz: 1 }, cellSize)[0];
        let isDirectSupport = false;

        // Check all objects in the scene to see if there is a house immediately above
        scene.traverse(house => {
            if (isDirectSupport || !house.userData?.isHouse) return;
            // Compute vertical alignment: the top of this wall and the bottom of the house
            const wallTopY = wall.position.y + 0.5;
            const houseBottomY = house.position.y - house.geometry.parameters.height / 2;
            // If they're very close in height (within 0.1), check horizontal grid overlap
            if (Math.abs(wallTopY - houseBottomY) < 0.1) {
                const houseCells = cellsCovered(house.position, getObjectSpans(house), cellSize);
                if (houseCells.some(c => c.ix === wallCell.ix && c.iz === wallCell.iz)) {
                    isDirectSupport = true;
                }
            }
        });

        if (isDirectSupport) return true;
        // Recursive step: check if there is another wall or strong block stacked on top
        // and whether THAT is supporting a house
        const wallAbove = wallMap.get(wall.uuid)?.wallAbove;
        return isPillarSupporting(scene, wallAbove);
    }
    
    return isPillarSupporting(scene, obj);
}

/*
    Calculates the target Y-coordinate for an object by finding the highest
    supporting surface directly beneath it
*/
export function computeTargetY(scene, obj, spans, cellSize, knownPositions, objCurrentTargetY) {
    // Use the provided target Y if available (for iterative calculations),
    // otherwise use the object's current live position
    const startY = objCurrentTargetY !== undefined ? objCurrentTargetY : obj.position.y;
    const objBottomY = startY - (obj.geometry.parameters.height / 2);

    const objCells = cellsCovered(obj.position, spans, cellSize);
    let highestSupportY = 0;

    const potentialSupporters = [];
    scene.traverse(other => {
        // A potential supporter is any other placeable object
        if (other !== obj && (other.userData?.isWall || other.userData?.isHouse || other.userData?.isStrongBlock)) {
            potentialSupporters.push(other);
        }
    });

    for (const other of potentialSupporters) {
        let otherCurrentY = other.position.y;
        if (knownPositions) {
            const knownState = knownPositions.get(other);
            if (knownState) {
                otherCurrentY = knownState.y;
            }
        }
        const otherTopY = otherCurrentY + (other.geometry.parameters.height / 2);

        // Condition 1 -> The other object must be below the current object.
        if (otherTopY < objBottomY + 0.01) {
            const otherSpans = getObjectSpans(other);
            const otherCells = cellsCovered(other.position, otherSpans, cellSize);
            // Condition 2 -> The objects must overlap horizontally on the grid
            const isOverlapping = objCells.some(c1 =>
                otherCells.some(c2 => c1.ix === c2.ix && c1.iz === c2.iz)
            );

            // If both conditions are met, this is a valid supporter.
            // We keep track of the highest one found so far
            if (isOverlapping && otherTopY > highestSupportY) {
                highestSupportY = otherTopY;
            }
        }
    }
    // The final target position is the top of the highest supporter, plus half the object's own height
    return highestSupportY + (obj.geometry.parameters.height / 2);
}