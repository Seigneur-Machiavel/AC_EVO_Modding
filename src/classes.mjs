// @ts-check

import { PART_KEYS } from './parts-table.mjs';
import { DATA_KEYS, DATA_LABEL_DESC } from './data-table.mjs';

export { PART_KEYS };
export { DATA_KEYS };

/**
 * @typedef {Object} PartSwap
 * @property {null | string} PartSwap.car_id
 * @property {null | string} PartSwap.mech
 * 
 * @typedef {Object} TyreSet
 * @property {{ category: string, tyre: string}} TyreSet.front
 * @property {{ category: string, tyre: string}} TyreSet.rear
 * 
 * @typedef {Record<string, Record<string, ModParts>>} SetOfModParts
 * @typedef {Record<string, Record<string, ModData>>} SetOfModSetups
 * key: car_id, key: mech, key: mod, value: TyreSet @typedef {Record<string, Record<string, Record<string, TyreSet>>>} SetOfMechTyres
 * @typedef {Record<string, Record<string, string>>} SetOfTyres
 * @typedef {Record<string, Record<string, ModSwap>>} RawSwaps
 * 
*/

export class ModSwapsLib {
	total_swaps_count = 0;

	/** @param {RawSwaps} [raw_swaps] */
	constructor(raw_swaps) {
		if (!raw_swaps) return;
		
		for (const car_id in raw_swaps) {
			if (car_id === 'total_swaps_count') continue; // @ts-ignore
			if (!this[car_id]) this[car_id] = {};
			for (const mech in raw_swaps[car_id]) { // @ts-ignore
				this[car_id][mech] = new ModSwap(raw_swaps[car_id][mech]);
				this.total_swaps_count++
			};
		};
	}

	/** @param {string} car_id @param {string} mech @returns {ModSwap | undefined} */ // @ts-ignore
	get(car_id, mech) { return this[car_id]?.[mech]; }

	/** @param {string} car_id @param {string} mech @param {ModSwap} [swap] */
	set(car_id, mech, swap = new ModSwap()) { // @ts-ignore
		if (!this[car_id]) this[car_id] = {}; // @ts-ignore
		this[car_id][mech] = swap;
	}

	/** @param {string} car_id @param {string} mech */
	delete(car_id, mech) {  			// @ts-ignore
		if (!this[car_id]) return; 		// @ts-ignore
		delete this[car_id][mech]; 		// @ts-ignore
		if (!Object.keys(this[car_id]).length) delete this[car_id];
	}
}

export class ModSwap { // @ts-ignore
	/** Key: part @type {Record<string, { car_id: string, mech: string }>} */
	parts = {}; // CONTAINS CAR PARTS
	/** Key: mod ex: 'stock' @type {Record<string, TyreSet>} */
	tyres = {}; // CONTAINS TYRES SETS // @ts-ignore
	setup = new ModData(); 	// CONTAINS CAR SETUP
	aero = 'stock';

	/** @param {ModSwap} [swap] */
	constructor(swap) {
		if (!swap) return;
		for (const key in swap.parts) this.parts[key] = swap.parts[key];
		for (const key in swap.tyres) this.tyres[key] = swap.tyres[key];
		if (swap.setup) this.setup = ModData.from(swap.setup);
		if (swap.aero) this.aero = swap.aero;
	}

	/** @param {string} part The part name @param {string} car_id ex: ks_mini_jcs_1990 @param {string} [mech] default: 'mech_1' */
	setPart(part, car_id, mech = 'mech_1') { this.parts[part] = { car_id, mech }; }
	/** @returns {{ car_id: string, mech: string } | undefined } */
	getPart(part = '.carengine') { return this.parts[part]; }

	/** @param {string} partPath The part path */
	getPartBasedOnPath(partPath) { // very simple version to test swap
		for (const part in this.parts)
			if (!partPath.endsWith(part)) continue
			else if (!this.parts[part].car_id || !this.parts[part].mech) continue
			else return { part, car_id: this.parts[part].car_id, mech: this.parts[part].mech };
	}
}

export class ModParts { // @ts-ignore
	constructor() { for (const key of PART_KEYS) this[key] = ''; }
	
	/** @param {string} part The part name @param {string} path The path pointing to the part */ // @ts-ignore
	set(part, path) { this[part] = path; }

	/** @param {string} part The part name @returns {string | undefined} */ // @ts-ignore
	get(part) { return this[part]; }

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
	 * @param {string} valuePath The protobuff path	ex: '1.2'
	 * @param {string} value 						ex: 'Mini John Cooper S' */ // @ts-ignore
	set(fileExt, valuePath, value) { this[fileExt][valuePath] = value; }

	/** @param {string} fileExt The file extension 	ex: '.cardata' @param {string} rowLabel The protobuff path	ex: '1.2' @returns {string | undefined} */ // @ts-ignore
	get(fileExt, rowLabel) { return this[fileExt]?.[rowLabel]; }

	/** @param {string} fileExt The file extension 	ex: '.cardata' @param {string} rowLabel The protobuff path	ex: '1.2' */
	isRequired(fileExt, rowLabel) { // @ts-ignore
		if (DATA_LABEL_DESC[fileExt]?.[rowLabel]) return true;
	}

	/** @param {ModData} setup */
	static from(setup) {
		const md = new ModData(); // @ts-ignore
		for (const fileExt in setup) // @ts-ignore
			for (const rowLabel in setup[fileExt]) // @ts-ignore
				md.set(fileExt, rowLabel, setup[fileExt][rowLabel]);
		return md;
	}
}

export class TyresLib { // TYRES
	categories;
	store;

	/** @param {SetOfTyres} raw_tyres_set */
	constructor(raw_tyres_set) {
		this.store = raw_tyres_set;
		this.categories = Object.keys(raw_tyres_set);
	}

	get(category = 'eco', tyre = 'supercar_175_50_13') {
		return this.store[category]?.[tyre];
	}
}

export class AeroLib {
	store;
	
	/** Aero pathes by car (no mech) | key: car_id, value: path[]
	 * @param {Record<string, string[]>} raw_store */
	constructor(raw_store = {}) { this.store = raw_store }

	/** @param {string} car_id ex: 'ks_porsche_992_gt3_rs' @param {string[]} aero_parts */
	add(car_id = 'ks_porsche_992_gt3_rs', aero_parts = []) { this.store[car_id] = aero_parts; }

	/** @param {string} car_id ex: 'ks_porsche_992_gt3_rs' */
	get(car_id) { return this.store[car_id]; }
}