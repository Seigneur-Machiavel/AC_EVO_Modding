// @ts-check
import path from "path";
import { ModParts, ModSwap, PART_KEYS } from './classes.mjs';
import { decode, encode, setValue, toRows } from "./protobuf.js";
import { Logger, FileSystem, resolveFileIdentity, detectCarStockInfo, enableCarSetupLimits,
	assignDefaultElectronic, patchCarSetupLimits, assignAeroParts } from './helpers.mjs';

const DEV_MODE = false; // more logs
const BRAND = 'pink_mods';
const YEAR = 2026;

export class Patch_Info {
	unchanged_count = 0;
	changed_count = 0;
	files_count = 0;
}

class Correction {
	newValue; fileExtMatch;
	/** @type {string | undefined} */ rowValueEndWith;
	/** @type {string | undefined} */ rowLabelEndWith;
	/** @type {string | undefined} */ rowValueMatch;
	/** @type {string | undefined} */ rowLabelMatch;
	
	/** @param {any} newValue @param {string} [fileExtMatch] */
	constructor(newValue, fileExtMatch) { this.newValue = newValue; this.fileExtMatch = fileExtMatch; }
}

export class CarCreator {
	//** @type {Record<string, Correction>} */
	//corrections = {};
	/** @type {Correction[]} */
	corrections = [];
	patch_info = new Patch_Info(); // prepare space to store patch infos.
	MAIN_PATHS;
	o_id; m_id; mech;
	tyresLib; aeroLib; mechTyres;
	parts; swap;
	logger;

	stock_info = {
		HAS_TC: false, HAS_EDL: false,
		ESP_freq: 0, ESP_mSpeed: 0,
		ABS_freq: 0, ABS_mSpeed: 0,
	};
	modding_info = { HAS_REBUILD_TC: false, HAS_REBUILD_ABS: false, HAS_REBUILD_ESP: false };

	/** @type {{input: string, output: string, files: string[]}[]} */
	arch = [];
	filesToSimplyCopy = new Set(['.visualcarpreset']);
	contentCarsPrefix = 'content\\cars\\';

	/** Module to create car (a swap)
	 * @param {import('./helpers.mjs').MainPaths} MAIN_PATHS
	 * @param {string} o_id original_car_id @param {string} m_id modded_car_id @param {string} mech modded car mech
	 * @param {import('./classes.mjs').TyresLib} tyresLib The full set of tyres (pathes)
	 * @param {import('./classes.mjs').AeroLib} aeroLib The full set of aeros (pathes)
	 * @param {import('./classes.mjs').SetOfMechTyres} mechTyres The original tyres of mechs
	 * @param {import('./classes.mjs').SetOfModParts} [parts] Optional parts lib, required id swap is passed
	 * @param {ModSwap} [swap] Optional swap @param {Logger} [logger] */
	constructor(MAIN_PATHS, o_id, m_id, mech, tyresLib, aeroLib, mechTyres, parts, swap, logger = new Logger()) {
		this.MAIN_PATHS = MAIN_PATHS;
		this.o_id = o_id;
		this.m_id = m_id;
		this.mech = mech;
		this.tyresLib = tyresLib;
		this.aeroLib = aeroLib;
		this.mechTyres = mechTyres;
		this.parts = parts;
		this.swap = swap;
		this.logger = logger;
	}

	prepareArch(p = '...\\ks_mini_jcs_1990_mod_mech_1') {
		const filesList = FileSystem.listFiles(p);
		const { TEMPLATES, INPUT, OUTPUT } = this.MAIN_PATHS;
		const output = (p).replace(TEMPLATES, OUTPUT).replace(INPUT, OUTPUT);
		FileSystem.createDirIfNot(output); // ensure dir exist
		this.arch.push({ input: p, output, files: filesList });

		for (const d of FileSystem.listDirs(p)) this.prepareArch(path.join(p, d)); // recursive
	}
	prepareModFilesCorrections() {
		for (const entry of this.arch) {
			const { input, output, files } = entry;
			const lastParts = input.split(this.m_id)[1].split('\\');
			lastParts.shift(); // remove 'mech_x' || empry ex: [data, setup]
			
			const lastPart = `\\${lastParts.join('\\')}\\`; // ex: \\data\\setup
			for (const f of files) {
				const original_f = !f.includes('_mod_') ? f : `${f.split('_mod_')[0]}.${f.split('.')[1]}`;
				const a = `${this.contentCarsPrefix}${this.o_id}${lastPart}${original_f}`.replaceAll('\\\\', '\\');
				const b = `${this.contentCarsPrefix}${this.m_id}${lastPart}${f}`.replaceAll('\\\\', '\\');
				const { part, car_id, mech } = this.swap?.getPartBasedOnPath(a) || {};
				const s = part && car_id && mech && this.parts ? this.parts[car_id][mech].get(part) : undefined;
				if (s) this.logger.log(`SWAP!!
		from > ${a}
		swap > ${s}`, DEV_MODE);
				
				const correction = new Correction(s || b);
				correction.rowValueMatch = a;
				this.corrections.push(correction);
			}
		}
	}
	preparePartsCorrections() {
		if (!this.parts) return;

		const o_parts = this.parts[this.o_id][this.mech];
		for (const partName of PART_KEYS) {
			const o_path = o_parts.get(partName);
			if (!o_path) 
				throw new Error('Missing part!!');

			const { part, car_id, mech } = this.swap?.getPartBasedOnPath(o_path) || {};
			if (!part || !car_id || !mech) continue;

			const s_path = this.parts[car_id][mech].get(part);
			if (!s_path) continue;

			this.logger.log(`[PART] SWAP!!
	from > ${o_path}
	swap > ${s_path}`, DEV_MODE);

			const correction = new Correction(s_path);
			correction.rowValueMatch = o_path;
			this.corrections.push(correction);
		}
	}
	prepareTyresCorrections() {
		if (!this.swap?.tyres) return;

		const mechTyres = this.mechTyres[this.o_id]?.[this.mech];
		if (!mechTyres) return;

		/** @param {import("./classes.mjs").TyreSet} o_TyreSet @param {import("./classes.mjs").TyreSet} m_TyreSet @param {'front' | 'rear'} side */
		const setTyreCorrection = (o_TyreSet, m_TyreSet, side) => {
			const m_path = this.tyresLib.get(m_TyreSet[side].category, m_TyreSet[side].tyre);
			const o_Path = this.tyresLib.get(o_TyreSet[side].category, o_TyreSet[side].tyre);
			const correction = new Correction(m_path, '.compatibletyres');
			correction.rowValueMatch = o_Path;
			correction.rowLabelEndWith = side === 'front' ? '.2' : '.3';
			this.corrections.push(correction);
		}

		for (const key in this.swap.tyres) {
			setTyreCorrection(mechTyres[key], this.swap.tyres[key], 'front');
			setTyreCorrection(mechTyres[key], this.swap.tyres[key], 'rear');
		}
	}
	prepareSoundCorrections() { // Here we patch based path match for a predictible result, simple and efficient.
		const { car_id } = this.swap?.getPart(".carengine") || {};
		if (!car_id) return; // no engine swap

		const c1 = new Correction(`event:/evo_cars/${car_id}/engine_int`, '.actor');

		c1.rowValueMatch = `event:/evo_cars/${this.o_id}/engine_int`;
		this.corrections.push(c1);

		const c2 = new Correction(`event:/evo_cars/${car_id}/engine_ext`, '.actor');
		c2.rowValueMatch = `event:/evo_cars/${this.o_id}/engine_ext`;
		this.corrections.push(c2);

		const c3 = new Correction(`content\\sfx\\${car_id}.bank`, '.actor');
		c3.rowValueMatch = `content\\sfx\\${this.o_id}.bank`;
		this.corrections.push(c3);

		this.logger.log(`[SFX] SWAP!!
	event_origin > event:/evo_cars/${this.o_id}/engine_...
	event_swap > event:/evo_cars/${car_id}/engine_...
	bank_origin > content\\sfx\\${this.o_id}.bank
	bank_swap > content\\sfx\\${car_id}.bank/`, DEV_MODE);
	}
	prepareSetupCorrections() {
		if (!this.swap) return;
		for (const endFile in this.swap.setup) // @ts-ignore
			for (const rowLabel in this.swap.setup[endFile]) { // @ts-ignore
				const newValue = this.swap.setup[endFile][rowLabel];
				const correction = new Correction(newValue, endFile);
				correction.rowLabelMatch = rowLabel;
				this.corrections.push(correction);
			}
	}
	
	processArch() {
		for (const entry of this.arch) {
			const { input, output, files } = entry;
			for (const file of files) {
				const fileExt = `.${file.split('.').pop()}`;
				const outputFilename = !file.endsWith('.carfinalstate') ? file : file.replace(this.o_id, this.m_id);
				if (this.filesToSimplyCopy.has(fileExt)) { // fast copy
					FileSystem.fastCopy(path.join(input, file), path.join(output, outputFilename));
					continue;
				}

				const fileIdentity = resolveFileIdentity(file);
				const filePath = path.join(input, file);
				this.patch_info.files_count++;
				
				let decoded = decode(FileSystem.readFileSync(filePath));
				if (fileIdentity === 'CarDataCar') decoded = this.#processCarDataCar(decoded); // ADD NECESSARY PRESETS (ELECTRONICS DEFAULT)
				if (fileIdentity === 'CarSetupLimits') decoded = this.#processCarSetupLimits(decoded);

				for (const row of toRows(decoded.fields)) {
					const { newValue, oldValue } = this.#processRowCorrection(row, fileExt) || {};
					if (newValue === undefined) { this.patch_info.unchanged_count++; continue };

					this.patch_info.changed_count++;
					setValue(decoded.fields, row.path, row.kind, newValue);
					this.logger.log(`[APPLY PATCH] ${file}
		${oldValue}
		> ${newValue}`, DEV_MODE);
				}
				
				const newBin = encode(decoded.fields);
				FileSystem.writeFileSync(path.join(output, outputFilename), newBin);
			}
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
	
		const newBin = encode(decoded.fields);
		FileSystem.writeFileSync(path.join(this.MAIN_PATHS.OUTPUT, this.m_id, `${this.m_id}.moddedcarcontent`), newBin);
	}

	/** @param {any} row @param {string} fileExt ex: '.car' */
	#processRowCorrection(row, fileExt) {
		const isValuePath = row.value.includes('\\');
		const value = isValuePath ? row.value.toLowerCase() : row.value;

		for (const c of this.corrections) {
			if (c.fileExtMatch && c.fileExtMatch !== fileExt) continue;
			if (c.rowLabelEndWith && !row.label.endsWith(c.rowLabelEndWith)) continue;
			if (c.rowValueEndWith && !value.endsWith(c.rowValueEndWith)) continue;
			if (c.rowLabelMatch && row.label !== c.rowLabelMatch) continue;
			if (c.rowValueMatch && value !== c.rowValueMatch) continue;

			return { newValue: c.newValue, oldValue: row.value };
		}
	}
	/** @param {any} decoded */
	#processCarDataCar(decoded) {
		this.stock_info = detectCarStockInfo(toRows(decoded.fields)); // DETECTION

		const res = assignDefaultElectronic(decoded, this.stock_info); // Default: all
		this.patch_info.changed_count += res.changes;
		this.modding_info = res.electronic_update_info;

		if (!this.swap || this.swap.aero === 'stock') return res.decoded; // early return if no aero change

		const aeroPathes = this.aeroLib.get(this.swap.aero);
		const res2 = assignAeroParts(res.decoded, aeroPathes);
		return res2.decoded;
	}
	/** @param {any} decoded */
	#processCarSetupLimits(decoded) { // APPLY HARDCODED PATCHES
		const maxFuel = this.swap?.setup.get('.car', '1.6'); // ALIGNED MAX FUEL TO CarDataCar
		const patchRes = patchCarSetupLimits(decoded, this.modding_info, maxFuel);
		this.patch_info.changed_count += patchRes.changes;

		const enableRes = enableCarSetupLimits(patchRes.decoded);
		this.patch_info.changed_count += enableRes.changes;

		return enableRes.decoded; // return final state
	}
}