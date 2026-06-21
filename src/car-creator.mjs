// @ts-check
import path from "path";
import { ModParts, ModSwap } from './classes.mjs';
import { Logger, FileSystem } from './helpers.mjs';
import { decode, encode, setValue, toRows } from "./protobuf.js";

const BRAND = 'pink_mods';
const YEAR = 2026;

export class Patch_Info {
	unchanged_count = 0;
	changed_count = 0;
	files_count = 0;
}

export class CarCreator {
	/** @type {Record<string, any>} */
	corrections = {};
	patch_info = new Patch_Info(); // prepare space to store patch infos.
	MAIN_PATHS;
	o_id; m_id; mech;
	parts; swap;
	logger;

	/** Module to create car (a swap)
	 * @param {import('./helpers.mjs').MainPaths} MAIN_PATHS
	 * @param {string} o_id original_car_id @param {string} m_id modded_car_id @param {string} mech modded car mech
	 * @param {import('./classes.mjs').ModPartsLib} [parts] Optional parts lib, required id swap is passed
	 * @param {ModSwap} [swap] Optional swap @param {Logger} [logger] */
	constructor(MAIN_PATHS, o_id, m_id, mech, parts, swap, logger = new Logger()) {
		this.MAIN_PATHS = MAIN_PATHS;
		this.o_id = o_id;
		this.m_id = m_id;
		this.mech = mech;
		this.parts = parts;
		this.swap = swap;
		this.logger = logger;
	}

	prepareCorrections(p = '...\\ks_mini_jcs_1990_mod_mech_1') {
		for (const d of FileSystem.listDirs(p)) this.prepareCorrections(path.join(p, d));
	
		const lastParts = p.split(this.m_id)[1].split('\\');
		lastParts.shift(); // remove 'mech_x' || empry ex: [data, setup]
		
		const prefix = 'content\\cars\\';
		const lastPart = `\\${lastParts.join('\\')}\\`; // ex: \\data\\setup
		for (const f of FileSystem.listFiles(p)) {
			const original_f = !f.includes('_mod_') ? f : `${f.split('_mod_')[0]}.${f.split('.')[1]}`;
			const a = `${prefix}${this.o_id}${lastPart}${original_f}`.replaceAll('\\\\', '\\');
			const b = `${prefix}${this.m_id}${lastPart}${f}`.replaceAll('\\\\', '\\');
			const swap = this.swap?.getPartBasedOnPath(a);
			const s = swap && this.parts ? this.parts[swap.car_id][swap.mech].get(swap.part) : null;
			if (s) this.logger.log(`SWAP!!
	from > ${a}
	swap > ${s}`, false);
			this.corrections[a] = s || b; // swap or new part
		}
	}

	prepareSoundCorrections() {
		const { car_id } = this.swap?.get(".carengine") || {};
		if (!car_id) return; // no engine swap

		this.corrections[`event:/evo_cars/${this.o_id}/`] = `event:/evo_cars/${car_id}/`;
		this.corrections[`content\\sfx\\${this.o_id}.bank`] = `content\\sfx\\${car_id}.bank`;
		this.logger.log(`SWAP!!
	event_origin > event:/evo_cars/${this.o_id}/
	event_swap > event:/evo_cars/${car_id}
	bank_origin > content\\sfx\\${this.o_id}.bank
	bank_swap > content\\sfx\\${car_id}.bank/`, false);
	}
	
	/** Recursive function to process a dir an his child dirs @param {string} p path to dir */
	processDir(p) {
		const dirs = FileSystem.listDirs(p);
		for (const dir of dirs) this.processDir(path.join(p, dir));
		this.processDirFiles(p);
	}

	/** @param {string} p path to dir */
	processDirFiles(p) {
		const files = FileSystem.listFiles(p);
		const { TEMPLATES, INPUT, OUTPUT } = this.MAIN_PATHS;
		const outputDirPath = (p).replace(TEMPLATES, OUTPUT).replace(INPUT, OUTPUT);
		FileSystem.createDirIfNot(outputDirPath);
	
		for (const file of files) {
			const filePath = path.join(p, file);
			this.patch_info.files_count++;
	
			const decoded = decode(FileSystem.readFileSync(filePath));
			for (const row of toRows(decoded.fields)) {
				const patch_1 = this.#processRowValues(row, file);
				const patch_2 = this.#processRowPathes(row, file);
				if (!patch_1 && !patch_2) { this.patch_info.unchanged_count++; continue };
				if (patch_1 && patch_2) throw new Error('FATAL ERROR!! DOUBLE PATCHING THE SAME ROW!');

				setValue(decoded.fields, row.path, row.kind, patch_1 || patch_2);
				this.patch_info.changed_count++;
			}
	
			const newBin = encode(decoded.fields);
			const outputFilename = !file.endsWith('.carfinalstate') ? file : file.replace(this.o_id, this.m_id);
			FileSystem.writeFileSync(path.join(outputDirPath, outputFilename), newBin);
		}
	}

	/** @param {any} row @param {string} file */
	#processRowValues(row, file) {
		if (!this.swap) return;

		for (const endFile in this.swap.setup)
			if (!file.endsWith(endFile)) continue; // @ts-ignore
			else if (this.swap.setup[endFile][row.path] === undefined) continue; // @ts-ignore
			else return this.swap.setup[endFile][row.path];
	}
	
	/** @param {any} row @param {string} file */
	#processRowPathes(row, file) {
		if (typeof row.value !== 'string') return; 			// path only
		if (!row.editable || row.kind !== 'string') return; // path only

		const value = (row.value).toLowerCase();
		for (const oldValue in this.corrections) {
			const o_ext = oldValue.split('.')[1] || null;
			const m_ext = this.corrections[oldValue].split('.')[1] || null;
			if (o_ext !== m_ext) continue;
			if (!value.includes(oldValue)) continue;
			if (value !== oldValue && this.corrections[value]) continue; // HAS PERFECT PATCH -> SKIP
			
			const newValue = !o_ext || (o_ext && this.corrections[oldValue].includes('.'))
							? this.corrections[oldValue]
							: `${this.corrections[oldValue]}.${o_ext}`;
			const patch = value.replaceAll(oldValue, newValue);
			this.logger.log(`${file} patch: ${oldValue}
	> ${newValue}`, false);
			
			return patch;
		}
	}
	
	createModdedCarContent() {
		const DISPLAY_NAME = (this.m_id).replaceAll('_', ' ').replace('ks ', '');
		const carcontentFile = FileSystem.readFileSync(path.join(this.MAIN_PATHS.TEMPLATES, '.moddedcarcontent'));
		const decoded = decode(carcontentFile);
		for (const row of toRows(decoded.fields)) {
			if (row.label === '4') setValue(decoded.fields, row.path, row.kind, DISPLAY_NAME);
			if (row.label === '10') setValue(decoded.fields, row.path, row.kind, BRAND);
			if (row.label === '5') setValue(decoded.fields, row.path, row.kind, YEAR);
		}
	
		/*const subCategories = [2, 11, 21, 71].map((value) => protoMessage(30, protoInt(1, value)));
		const newBin = Buffer.concat([
			protoString(4, DISPLAY_NAME || "Modded Car"),
			protoInt(5, YEAR),
			protoString(10, BRAND),
			...subCategories,
			protoInt(41, 1), // Property1_Race, matching the public sample package.
		]);*/
	
		const newBin = encode(decoded.fields);
		FileSystem.writeFileSync(path.join(this.MAIN_PATHS.OUTPUT, this.m_id, `${this.m_id}.moddedcarcontent`), newBin);
	}
}