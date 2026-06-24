// @ts-check
import path from "path";
import { ModParts, ModSwap } from './classes.mjs';
import { Logger, FileSystem, resolveFileIdentity } from './helpers.mjs';
import { decode, encode, setValue, toRows, appendVarint, setOrAppend, setOrAppend_v2 } from "./protobuf.js";

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
	tyresLib; mechTyres;
	parts; swap;
	logger;

	/** Module to create car (a swap)
	 * @param {import('./helpers.mjs').MainPaths} MAIN_PATHS
	 * @param {string} o_id original_car_id @param {string} m_id modded_car_id @param {string} mech modded car mech
	 * @param {import('./classes.mjs').TyresLib} tyresLib The full set of tyres (pathes)
	 * @param {import('./classes.mjs').SetOfMechTyres} mechTyres The original tyres of mechs
	 * @param {import('./classes.mjs').SetOfModParts} [parts] Optional parts lib, required id swap is passed
	 * @param {ModSwap} [swap] Optional swap @param {Logger} [logger] */
	constructor(MAIN_PATHS, o_id, m_id, mech, tyresLib, mechTyres, parts, swap, logger = new Logger()) {
		this.MAIN_PATHS = MAIN_PATHS;
		this.o_id = o_id;
		this.m_id = m_id;
		this.mech = mech;
		this.tyresLib = tyresLib;
		this.mechTyres = mechTyres;
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
			const { part, car_id, mech } = this.swap?.getPartBasedOnPath(a) || {};
			const s = part && car_id && mech && this.parts ? this.parts[car_id][mech].get(part) : null;
			if (s) this.logger.log(`SWAP!!
	from > ${a}
	swap > ${s}`, false);
			this.corrections[a] = s || b; // swap or new part
		}
	}
	prepareTyresCorrections() {
		if (!this.swap?.tyres) return;

		const mechTyres = this.mechTyres[this.o_id]?.[this.mech];
		if (!mechTyres) return;

		for (const key in this.swap.tyres) {
			const m_tyreSet = this.swap.tyres[key];
			const m_f_path = this.tyresLib.get(m_tyreSet.front.category, m_tyreSet.front.tyre);
			const m_r_path = this.tyresLib.get(m_tyreSet.rear.category, m_tyreSet.rear.tyre);

			const o_TyreSet = mechTyres[key];
			const o_f_Path = this.tyresLib.get(o_TyreSet.front.category, o_TyreSet.front.tyre);
			const o_r_path = this.tyresLib.get(o_TyreSet.rear.category, o_TyreSet.rear.tyre);

			this.corrections[o_f_Path] = m_f_path;
			if (o_f_Path === o_r_path) continue; // unable double patch different front/rear
			this.corrections[o_r_path] = m_r_path;
			console.log('tyre')
		}
	}
	prepareSoundCorrections() {
		const { car_id } = this.swap?.getPart(".carengine") || {};
		if (!car_id) return; // no engine swap

		this.corrections[`event:/evo_cars/${this.o_id}/`] = `event:/evo_cars/${car_id}/`;
		this.corrections[`content\\sfx\\${this.o_id}.bank`] = `content\\sfx\\${car_id}.bank`;
		this.logger.log(`SWAP!!
	event_origin > event:/evo_cars/${this.o_id}/
	event_swap > event:/evo_cars/${car_id}
	bank_origin > content\\sfx\\${this.o_id}.bank
	bank_swap > content\\sfx\\${car_id}.bank/`, false);
	}
	
	/** Function to process a dir an his children @param {string} p path to dir */
	processDir(p) {
		for (const dir of FileSystem.listDirs(p)) this.processDir(path.join(p, dir)); // recursive
		this.#processDirFiles(p);
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

	/** @param {string} p path to dir */
	#processDirFiles(p) {
		const files = FileSystem.listFiles(p);
		const { TEMPLATES, INPUT, OUTPUT } = this.MAIN_PATHS;
		const outputDirPath = (p).replace(TEMPLATES, OUTPUT).replace(INPUT, OUTPUT);
		FileSystem.createDirIfNot(outputDirPath);
	
		for (const file of files) {
			const fileIdentity = resolveFileIdentity(file);
			const filePath = path.join(p, file);
			this.patch_info.files_count++;
			
			let decoded = decode(FileSystem.readFileSync(filePath));
			if (fileIdentity === 'CarDataCar') decoded = this.#processCarDataCar(decoded); // ADD NECESSARY PRESETS (ELECTRONICS DEFAULT)
			if (fileIdentity === 'CarSetupLimits') decoded = this.#processCarSetupLimits(decoded);
			
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
	/** @param {any} decoded */
	#processCarDataCar(decoded) {
		return decoded; // DEV
		let patched = false;

		let TC_freq = 0;
		const ESP_values = { fHz: 0, mSKmh: 0 };
		const ABS_pathes = { fHz: [], mSKmh: [] };
		const ABS_values = { fHz: 0, mSKmh: 0 };
		for (const row of toRows(decoded.fields)) {
			if (row.label === '7.1.2') TC_freq = Number(row.value);

			if (row.label === '7.2.2') ABS_values.fHz = Number(row.value);
				{ ABS_values.fHz = Number(row.value); ABS_pathes.fHz = row.path };
			if (row.label === '7.2.4') ABS_values.mSKmh = Number(row.value);
				{ ABS_values.mSKmh = Number(row.value); ABS_pathes.mSKmh = row.path };

			if (row.label === '7.4.1') ESP_values.fHz = Number(row.value);
			if (row.label === '7.4.2') ESP_values.mSKmh = Number(row.value);
		}

		if (!TC_freq) { // SET DEFAULT TC
			/*setOrAppend(decoded, [6,0,0], 'float', 1, 1, [7,1,1]); // bypass 'Has TC2' + init
			setOrAppend(decoded, [6,0,0], 'float', 1, 0, [7,1,1]); // bypass 'Has TC2' + init
			setOrAppend(decoded, [6,0,0], 'float', 2, 50, [7,1,2]); // bypass force
			setOrAppend(decoded, [6,0,0], 'float', 2, 50, [7,1,2]); // fHz
			setOrAppend(decoded, [6,0,1], 'float', 3, 20, [7,1,3]);
			setOrAppend(decoded, [6,0,2], 'float', 4, 0.08, [7,1,4]);
			setOrAppend(decoded, [6,0,3], 'float', 5, 10, [7,1,5]);
			setOrAppend(decoded, [6,0,4], 'float', 6, 1, [7,1,6]);

			setOrAppend(decoded, [6,0,5,0], 'float', 1, 0, [7,1,7,1]); // bypass init
			setOrAppend(decoded, [6,0,5,0], 'float', 1, -1, [7,1,7,1]); // bypass init
			setOrAppend(decoded, [6,0,5,1], 'float', 2, -1, [7,1,7,2]);

			setOrAppend(decoded, [6,0,6,0], 'float', 1, 0, [7,1,7,1]); // bypass init
			setOrAppend(decoded, [6,0,6,0], 'float', 1, 0.15, [7,1,7,1]);
			setOrAppend(decoded, [6,0,6,1], 'float', 2, 0.2, [7,1,7,2]);
			setOrAppend(decoded, [6,0,6,2], 'float', 3, 15, [7,1,7,3]);
			setOrAppend(decoded, [6,0,6,3], 'float', 4, 0.5, [7,1,7,4]);
			setOrAppend(decoded, [6,0,6,4], 'float', 5, 1, [7,1,7,5]);
			setOrAppend(decoded, [6,0,6,5], 'float', 6, 1, [7,1,7,6]);
			setOrAppend(decoded, [6,0,6,6], 'float', 7, 4, [7,1,7,7]);

			setOrAppend(decoded, [6,0,7,0], 'float', 1, 0, [7,1,7,1]); // bypass init
			setOrAppend(decoded, [6,0,7,0], 'float', 1, 0.2, [7,1,7,1]);
			setOrAppend(decoded, [6,0,7,1], 'float', 2, 0.25, [7,1,7,2]);
			setOrAppend(decoded, [6,0,7,2], 'float', 3, 15, [7,1,7,3]);
			setOrAppend(decoded, [6,0,7,3], 'float', 4, 0.5, [7,1,7,4]);
			setOrAppend(decoded, [6,0,7,4], 'float', 5, 1, [7,1,7,5]);
			setOrAppend(decoded, [6,0,7,5], 'float', 6, 2, [7,1,7,6]);
			setOrAppend(decoded, [6,0,7,6], 'float', 7, 4, [7,1,7,7]);*/
		}

		if (ABS_values.fHz > 40 || ABS_values.mSKmh > 20) {// SET DEFAULT ABS
			setOrAppend(decoded, [6,1,2], 'float', ABS_pathes.fHz[ABS_pathes.fHz.length - 1], 40, ABS_pathes.fHz);
			setOrAppend(decoded, [6,1,4], 'float', ABS_pathes.mSKmh[ABS_pathes.mSKmh.length - 1], 20, ABS_pathes.mSKmh);
		}

		if (!ESP_values.fHz && !ESP_values.mSKmh) { // SET DEFAULT ESP
			setOrAppend(decoded, [6,2,0], 'varint', 1, 0, [7,3,1]); // bypass
			setOrAppend(decoded, [6,2,0], 'varint', 1, 1, [7,3,1]);
			setOrAppend(decoded, [6,2,1], 'float', 2, 500, [7,3,2]);
			setOrAppend(decoded, [6,2,2], 'float', 3, 200, [7,3,3]);
			setOrAppend(decoded, [6,2,3], 'float', 4, 0.05, [7,3,4]);
			setOrAppend(decoded, [6,2,4], 'float', 5, 0.1, [7,3,5]);
			setOrAppend(decoded, [6,2,5], 'float', 6, 0.12, [7,3,6]);
			setOrAppend(decoded, [6,2,6], 'float', 7, 0.3, [7,3,7]);
			setOrAppend(decoded, [6,2,7], 'float', 8, 27, [7,3,8]);

			setOrAppend(decoded, [6,3,0], 'float', 1, 50, [7,4,1]);
			setOrAppend(decoded, [6,3,1], 'float', 2, 27, [7,4,2]);
			setOrAppend(decoded, [6,3,2], 'float', 3, 0, [7,4,3]); // bypass 'kind: bytes    | value: '
			setOrAppend(decoded, [6,3,3,0], 'float', 1, 0, [7,4,3,1]); // bypass init
			setOrAppend(decoded, [6,3,3,0], 'float', 1, 1, [7,4,3,1]); // gain
			setOrAppend(decoded, [6,3,3,1], 'float', 2, 3, [7,4,3,2]); // steer gain
			setOrAppend(decoded, [6,3,3,2], 'float', 4, 3, [7,4,3,4]);
			setOrAppend(decoded, [6,3,3,3], 'float', 5, 0.05, [7,4,3,5]);
			setOrAppend(decoded, [6,3,3,4], 'float', 6, 0.5, [7,4,3,6]);
			setOrAppend(decoded, [6,3,3,5], 'float', 10, 0.7, [7,4,3,10]);
			setOrAppend(decoded, [6,3,3,6], 'float', 11, 0.4, [7,4,3,11]);
			setOrAppend(decoded, [6,3,3,7], 'float', 12, 2, [7,4,3,12]);
			setOrAppend(decoded, [6,3,3,8], 'float', 13, 360, [7,4,3,13]);
		}

		if (patched) this.patch_info.changed_count++;
		return decode(encode(decoded.fields)); // return final state
	}
	/** @param {any} decoded */
	#processCarSetupLimits(decoded) {
		return decoded; // DEV
		/*setOrAppendByField(decoded, [5,1,1], 'float', 1); 	// TC Step: 1
		setOrAppendByField(decoded, [5,1,3], 'float', 0); 	// TC max: 0

		setOrAppendByField(decoded, [5,3,1], 'float', 1); 	// ABS Step: 1
		setOrAppendByField(decoded, [5,3,2], 'float', 0); 	// ABS min: 0

		setOrAppendByField(decoded, [5,6,1], 'float', 1);	// ESC Step: 1
		setOrAppendByField(decoded, [5,6,3], 'float', 1); 	// ESC max: 1*/
		setOrAppend(decoded, [13,0,0], 'float', 1, 1, [5,1,1]); // TC Step: 1
		setOrAppend(decoded, [13,0,1], 'float', 3, 1, [5,1,3]); // TC max: 1

		setOrAppend(decoded, [13,2,0], 'float', 1, 1, [5,1,1]); // ABS Step: 1
		setOrAppend(decoded, [13,2,1], 'float', 2, 0, [5,2,2]); // ABS min: 0
		setOrAppend(decoded, [13,2,2], 'float', 3, 1, [5,2,3]); // ABS max: 1

		setOrAppend(decoded, [13,5,0], 'float', 1, 1, [5,6,1]);	// ESC Step: 1
		setOrAppend(decoded, [13,5,1], 'float', 3, 1, [5,6,3]); // ESC max: 1

		decoded = decode(encode(decoded.fields));

		// Pass 1: collect paths to patch
		const rows = toRows(decoded.fields);
		const toBool = [];
		let data_batch = { step: 0, min: 0, max: 0 };
		let lastPath;
		let lastFieldPath;
		let lastField = 1;
		for (const row of rows) {
			if (lastPath && lastField < 4 && data_batch.step && data_batch.max !== data_batch.min)
				toBool.push({ path: [...lastPath], fieldPath: [lastFieldPath] });

			if (lastField <= row.field) {
				lastPath = [...row.path];
				lastFieldPath = [...row.label.split('.')];
				//lastFieldPath = row.label.split('.').map((/** @param {string} str */ str => Number(str)));
				data_batch = { step: 0, min: 0, max: 0 };
			}

			if (row.field === 1) data_batch.step = Number(row.value);
			if (row.field === 2) data_batch.min  = Number(row.value);
			if (row.field === 3) data_batch.max  = Number(row.value);
			lastField = row.field;
			lastFieldPath = row.label.split('.');
		}

		// Don't forget the last batch
		if (lastPath && lastField < 4 && data_batch.step && data_batch.max !== data_batch.min)
			toBool.push({ path: [...lastPath], fieldPath: [lastFieldPath] });

		console.log('toBool sample:', toBool[0], 'decoded field count:', decoded.fields.length);

		if (toBool.length) { // Pass 2: apply patches
			for (const { path, fieldPath } of toBool) {
				let current = decoded.fields;
				for (const index of path.slice(0, -1)) current = current[index].message; // descend through nested submessages
				if (!appendVarint(current, 4, 1)) console.warn('toto');
				//setOrAppend(decoded, path, 'varint', 4, 1, fieldPath);
				
				//const res = appendVarint(current, 3, 1);
				//const res = appendVarint(current, 4, 1); // field 4, not 3
				//console.log(`${p} should be modifiable! ${res.ok ? 'ok' : res.error}`);
			}
				//setOrAppend(decoded, p, 'varint', 4, 1);
				//setOrAppendByField(decoded, p, 'varint', 1);
			this.patch_info.changed_count++;
		}

		const encoded = encode(decoded.fields);
		const decoded2 = decode(encoded);
		//for (const row of toRows(decoded2.fields)) { // useless test
			//if (row.kind !== 'varint' || row.path[row.path.length -1] !== 3) continue;
			//if (row.field !== 4 || row.kind !== 'varint') continue;
			//console.warn(`>>> BOOL`, [row]);
		//}

		return decoded2; // return final state
	}
}