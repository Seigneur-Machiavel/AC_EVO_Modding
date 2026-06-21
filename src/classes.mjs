// @ts-check

/* RIEN A VOIR
hypercar_245_40_15.tyre
content\cars\common_phsx\tyres\hypercar\hypercar_245_40_15.tyre
	ks_audi_rs_6_avant
content\cars\ks_audi_rs_6_avant\data\ks_audi_rs_6_avant.drivetrain
content\cars\ks_porsche_992_gt3_rs\data\ks_porsche_992_gt3_rs.gearbox
content\cars\ks_porsche_992_gt3_rs\data\ks_porsche_992_gt3_rs.clutch
*/

import { PART_KEYS } from './parts-table.mjs';
import { DATA_KEYS, DATA_PATH_LABEL_LINKS } from './data-table.mjs';

export { PART_KEYS };
export { DATA_KEYS };

/**
 * @typedef {Object} PartSwap
 * @property {null | string} PartSwap.car_id
 * @property {null | string} PartSwap.mech
 * 
 * @typedef {Record<string, Record<string, ModParts>>} ModPartsLib
 * @typedef {Record<string, Record<string, ModData>>} ModSetupsLib
 * @typedef {Record<string, Record<string, ModSwap>>} ModSwapsLib
 */

export class ModSwap { // @ts-ignore
	constructor() { for (const key in PART_KEYS) this[key] = { car_id: null, mech: null }; }

	setup = {}; // WILL CONTAINS CAR SETUP

	/** @param {string} part The part name @param {string} car_id ex: ks_mini_jcs_1990 @param {string} [mech] default: 'mech_1' */  // @ts-ignore
	setPart(part, car_id, mech = 'mech_1') { this[part] = { car_id, mech }; }

	/** @param {string} car_id ex: ks_mini_jcs_1990 @param {string} [mech] default: 'mech_1' */  // @ts-ignore
	setParts(car_id, mech = 'mech_1') { for (const part in this) this[part] = { car_id, mech }; }

	/** @param {string} part The part name */  // @ts-ignore
	removePart(part) { this[part] = { car_id: null, mech: null }; }
	// @ts-ignore
	reset() { for (const part in this) this[part] = { car_id: null, mech: null }; }

	/** @param {string} part The part name @returns {PartSwap | undefined} */ // @ts-ignore
	get(part) { return this[part]?.car_id ? this[part] : undefined; }

	/** @param {string} partPath The part path */
	getPartBasedOnPath(partPath) { // very simple version to test swap
		for (const p in this) {
			/** @type {string} */
			const part = p;
			if (part === 'setup') continue;
			else if (!partPath.endsWith(part)) continue

			const { car_id, mech } = this.get(part) || {};
			if (car_id && mech) return { car_id, mech, part };
		}
	}

	/** @param {ModSwap} swap */
	static from(swap) {
		const ms = new ModSwap(); // @ts-ignore
		for (const key in swap) if (key !== 'setup') ms[key] = swap[key]; // @ts-ignore
		if (swap.setup) for (const key in swap.setup) ms.setup[key] = swap.setup[key];
		
		return ms;
	}
}

export class ModParts { // @ts-ignore
	constructor() { for (const key of PART_KEYS) this[key] = ''; }
	
	/** @param {string} part The part name @param {string} path The path pointing to the part */ // @ts-ignore
	set(part, path) { this[part] = path; }

	/** @param {string} part The part name @returns {string | undefined} */ // @ts-ignore
	get(part) { return this[part]?.length > 1 ? this[part] : undefined; }

	/** @param {ModParts} parts */
	static from(parts) {
		const mp = new ModParts(); // @ts-ignore
		for (const key in parts) mp.set(key, parts[key]);
		return mp;
	}
}

export class ModData { // @ts-ignore
	constructor() {  for (const key of DATA_KEYS) this[key] = {}; }
	
	/** 
	 * @param {string} fileExt 	The file extension 	ex: '.cardata'
	 * @param {string} valuePath The protobuff path	ex: '1,1'
	 * @param {string} value 						ex: 'Mini John Cooper S' */ // @ts-ignore
	set(fileExt, valuePath, value) { this[fileExt][valuePath] = value; }

	/** @param {string} fileExt The file extension 	ex: '.cardata' @param {string} valuePath The protobuff path	ex: '1,1' */
	isRequired(fileExt, valuePath) { // @ts-ignore
		if (DATA_PATH_LABEL_LINKS[fileExt]?.[valuePath]) return true;
	}

	/** @param {ModData} setup */
	static from(setup) {
		const md = new ModData(); // @ts-ignore
		for (const fileExt in setup) // @ts-ignore
			for (const valuePath in setup[fileExt]) // @ts-ignore
				md.set(fileExt, valuePath, setup[fileExt][valuePath]);
		return md;
	}
}