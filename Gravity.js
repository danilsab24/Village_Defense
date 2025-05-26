import * as THREE from 'https://esm.sh/three@0.150.1';

/**
 * Calcola se un blocco supporta altri oggetti sopra di sé
 */
export function isSupporting(scene, obj) {
	if (!obj.userData?.isWall) return false;

	const bbox = new THREE.Box3().setFromObject(obj);
	const size = new THREE.Vector3();
	bbox.getSize(size);
	const halfHeight = size.y / 2;
	const topY = obj.position.y + halfHeight;

	let supportingHouse = false;

	scene.traverse(other => {
		if (
			other === obj ||
			!other.userData?.isHouse // ora consideriamo solo case
		) return;

		const obox = new THREE.Box3().setFromObject(other);
		const osize = new THREE.Vector3();
		obox.getSize(osize);
		const bottomY = other.position.y - osize.y / 2;

		const dx = Math.abs(other.position.x - obj.position.x);
		const dz = Math.abs(other.position.z - obj.position.z);
		const dy = Math.abs(bottomY - topY);

		if (dx < 0.1 && dz < 0.1 && dy < 0.11) {
			supportingHouse = true;
		}
	});

	return supportingHouse;
}


export function computeTargetY(scene, obj, spans) {
	const box = new THREE.Box3().setFromObject(obj);
	const size = new THREE.Vector3();
	box.getSize(size);
	const halfHeight = size.y / 2;

	const ix0 = Math.round(obj.position.x);
	const iz0 = Math.round(obj.position.z);

	const positions = [];
	for (let dx = -Math.floor((spans.sx - 1) / 2); dx <= Math.floor(spans.sx / 2); dx++) {
		for (let dz = -Math.floor((spans.sz - 1) / 2); dz <= Math.floor(spans.sz / 2); dz++) {
			positions.push({ x: ix0 + dx, z: iz0 + dz });
		}
	}

	let maxBelowY = -Infinity;

	positions.forEach(pos => {
		scene.traverse(other => {
			if (other === obj || !(other.userData?.isWall || other.userData?.isHouse)) return;

			const otherBox = new THREE.Box3().setFromObject(other);
			const otherSize = new THREE.Vector3();
			otherBox.getSize(otherSize);

			const dx = Math.abs(other.position.x - pos.x);
			const dz = Math.abs(other.position.z - pos.z);
			if (dx < 0.1 && dz < 0.1) {
				const topY = other.position.y + otherSize.y / 2;
				if (topY > maxBelowY) maxBelowY = topY;
			}
		});
	});

	return maxBelowY > -Infinity ? maxBelowY + halfHeight : halfHeight;
}

export function getRotatedSpans(obj) {
	const rotationSteps = Math.round(obj.rotation.y / (Math.PI / 2));
	const isRotated = rotationSteps % 2 !== 0;
	return isRotated ? { sx: 1, sz: 2 } : { sx: 2, sz: 1 };
}
