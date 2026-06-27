// @ts-check
import fs from "fs";
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { toRows, decode, encode, appendVarint, setOrAppend, appendMessage, deleteByLabel } from './protobuf.js';

export class Timer {
	/** @type {string[]} */ timings = [];
	start = performance.now();

	mark(marker = 'toto') {
		const n = performance.now();
		const m = `[${marker}]`;
		this.timings.push(`${m.padEnd(30, ' ')} ${(n - this.start).toFixed(3)}ms`);
		this.start = n;
	};
} 

export class MainPaths {
	TEMPLATES;
	ACE_MODS;
	OUTPUT;
	INPUT;
	FRONT;
	ROOT;
	SRC;

	/** @param {string} [ACE_MODS_PATH] */
	constructor(ACE_MODS_PATH) {
		let ROOT = path.dirname(fileURLToPath(import.meta.url));
		if (!ROOT.endsWith('AC_EVO_Modding')) ROOT = path.resolve((ROOT), '..');
		
		let ACE_MODS 	= ACE_MODS_PATH && fs.existsSync(ACE_MODS_PATH) ? ACE_MODS_PATH : null; 
		if (!ACE_MODS) { // try searching the dir
			const findACE = path.join(os.homedir(), 'Saved Games', 'ACE');
			const findACE_mods = path.join(os.homedir(), 'Saved Games', 'ACE', 'mods');
			if (fs.existsSync(findACE) && !fs.existsSync(findACE_mods)) // ACE found but no "mods"...
				FileSystem.createDirIfNot(findACE_mods); // create missing "mods" dir
			ACE_MODS = findACE_mods;
		}

		this.TEMPLATES 	= path.join(ROOT, 'templates');
		this.ACE_MODS 	= ACE_MODS;
		this.OUTPUT 	= ACE_MODS ? path.join(ACE_MODS, 'content', 'cars') : path.join(ROOT, 'outputs');
		this.INPUT 		= path.join(ROOT, 'inputs');
		this.FRONT		= path.join(ROOT, 'src', 'front');
		this.ROOT 		= ROOT;
		this.SRC		= path.join(ROOT, 'src');
	}
}

export class FileSystem {
	/** @param {string | NodeJS.ArrayBufferView} content */
	static writeFileSync(p = 'C:', content) { fs.writeFileSync(p, content); }
	static readFileSync(p = 'C:') { return fs.readFileSync(p); }
	static createDirIfNot(p = 'C:') { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
	static removeDirIfExist(p = 'C:') { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true }); }
	static fastCopy(src = '', dest = '') { fs.copyFileSync(src, dest); }

	/** List files (not dirs) in a folder, sorted. Returns [] if dir is null/missing. */
	static listFiles(p = 'C:') {
		if (!p || !fs.existsSync(p)) return [];
		return fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isFile()).map(f => f.toLowerCase()).sort();
	}

	/** List subdirs in a folder, sorted. Returns [] if dir is null/missing. */
	static listDirs(p = 'C:') {
		if (!p || !fs.existsSync(p)) return [];
		return fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory()).sort();
	}

	/** @param {string} [destFileNameMod] */
	static copyFile(file = 'toto.js', p = 'C:', dest = 'D:', destFileNameMod) {
		const read = this.readFileSync(path.join(p, file));
		this.createDirIfNot(dest);
		const fName = !destFileNameMod ? file : `${file.split('.')[0]}${destFileNameMod}.${file.split('.')[1]}`
		this.writeFileSync(path.join(dest, fName), read);
	}

	/** @param {string} [destFileNameMod] */
	static copyDir(p = 'C:', dest = 'D:', destFileNameMod) {
		for (const folder of this.listDirs(p)) // recursive
			this.copyDir(path.join(p, folder), path.join(dest, folder), destFileNameMod);

		for (const file of this.listFiles(p)) this.copyFile(file, p, dest, destFileNameMod);
	}
}

export class Logger {
	hasSaved = false;
	/** @type {string[]} */ logs = [];

	log(message = 'toto', logToConsole = true) {
		this.logs.push(message);
		if (logToConsole) console.log(message);
	};

	save() {
		if (this.hasSaved || !this.logs.length) return;

		this.hasSaved = true;
		console.info('SAVING LOGS...');
		const fileName = Date.now();
		const logs = this.logs.join('\r\n');
		const main_paths = new MainPaths();
		FileSystem.createDirIfNot('logs');		
		FileSystem.writeFileSync(path.join(main_paths.ROOT, 'logs', `${fileName}.txt`), logs);
	}
}

export const MIME_TYPES = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
};

const FILE_IDENTITIES = {
	'.car': 'CarDataCar',
	'.carsetup': 'CarSetup',
	'.carsetuplimits': 'CarSetupLimits',
	'.compatibletyres': 'CompatibleTyres',
	'.carmechanicalpreset': 'CarMechanicalPreset'
};
/** @returns {'CarDataCar' | 'CarSetup' | 'CarSetupLimits' | 'CompatibleTyres' | undefined} */
export function resolveFileIdentity(f = '...cardata.car') { // @ts-ignore
	for (const key in FILE_IDENTITIES) if (f.endsWith(key)) return FILE_IDENTITIES[key];
}

class ElectronicStockInfo {
	HAS_TC = false; HAS_EDL = false;
	ESP_freq = 0; ESP_mSpeed = 0;
	ABS_freq = 0; ABS_mSpeed = 0
}

class ElectronicModdingInfo {
	HAS_REBUILD_TC = false;
	HAS_REBUILD_ABS = false;
	HAS_REBUILD_ESP = false
}

/** Detect the stock electronics @param {any[]} rows 'toRows()' of CarDataCar decoded */
export function detectCarStockInfo(rows) {
	const stock_info = new ElectronicStockInfo();

	for (const row of rows) {
		if (row.label === '7.1.2') if (Number(row.value)) stock_info.HAS_TC = true;
		if (row.label === '7.2.2') stock_info.ABS_freq = Number(row.value);
		if (row.label === '7.2.4') stock_info.ABS_mSpeed = Number(row.value);
		if (row.label === '7.3.1') if (Number(row.value)) stock_info.HAS_TC = true;
		if (row.label === '7.4.1') stock_info.ABS_freq = Number(row.value);
		if (row.label === '7.4.2') stock_info.ABS_mSpeed = Number(row.value);
	}

	return stock_info;
}

/** Set default value (from Abarth bis) to electronics @param {any} decoded @param {ElectronicStockInfo} stock_info */
export function assignDefaultElectronic(decoded, stock_info, req = { TC: true, ABS: true, ESP: true }) {
	let changes = 0;
	const electronic_update_info = new ElectronicModdingInfo();

	if (req.TC && !stock_info.HAS_TC) { // SET DEFAULT TC
		setOrAppend(decoded, '7.1.1', 'varint', 0);		// HAS TC2
		setOrAppend(decoded, '7.1.2', 'float', 150); 	// FREQ
		setOrAppend(decoded, '7.1.3', 'float', 20);
		setOrAppend(decoded, '7.1.4', 'float', 0.08);
		setOrAppend(decoded, '7.1.5', 'float', 10);
		setOrAppend(decoded, '7.1.6', 'float', 1);

		deleteByLabel(decoded.fields, '7.1.7'); // ensure there is nothing

		// Settings 1
		let msg = appendMessage(decoded, '7.1.7');
		setOrAppend({ fields: msg }, '1', 'float', -1);
		setOrAppend({ fields: msg }, '2', 'float', -1);

		// Settings 2
		msg = appendMessage(decoded, '7.1.7');
		setOrAppend({ fields: msg }, '1', 'float', 0.15);
		setOrAppend({ fields: msg }, '2', 'float', 0.2);
		setOrAppend({ fields: msg }, '3', 'float', 15);
		setOrAppend({ fields: msg }, '4', 'float', 0.5);
		setOrAppend({ fields: msg }, '5', 'float', 1);
		setOrAppend({ fields: msg }, '6', 'float', 1);
		setOrAppend({ fields: msg }, '7', 'float', 4);

		// Settings 3
		msg = appendMessage(decoded, '7.1.7');
		setOrAppend({ fields: msg }, '1', 'float', 0.2);
		setOrAppend({ fields: msg }, '2', 'float', 0.25);
		setOrAppend({ fields: msg }, '3', 'float', 15);
		setOrAppend({ fields: msg }, '4', 'float', 0.5);
		setOrAppend({ fields: msg }, '5', 'float', 1);
		setOrAppend({ fields: msg }, '6', 'float', 2);
		setOrAppend({ fields: msg }, '7', 'float', 4);

		changes += 22;
		electronic_update_info.HAS_REBUILD_TC = true;
	}

	const ABS_IS_SHITTY = stock_info.ABS_freq > 40 || stock_info.ABS_mSpeed > 20;
	if (req.ABS && ABS_IS_SHITTY) { // SET DEFAULT ABS
		setOrAppend(decoded, '7.2.2', 'float', 40); // FREQ
		setOrAppend(decoded, '7.2.4', 'float', 20);	// MIN SPEED
		electronic_update_info.HAS_REBUILD_ABS = true; changes += 2;
	}

	if ((req.ABS || req.ESP) && !stock_info.HAS_EDL) { // SET DEFAULT EDL
		deleteByLabel(decoded.fields, '7.3'); // ensure there is nothing

		// Settings 1
		let msg = appendMessage(decoded, '7.3');
		setOrAppend({ fields: msg }, '1', 'varint', 1);
		setOrAppend({ fields: msg }, '2', 'float', 500);
		setOrAppend({ fields: msg }, '3', 'float', 200);
		setOrAppend({ fields: msg }, '4', 'float', 0.05);
		setOrAppend({ fields: msg }, '5', 'float', 0.1);
		setOrAppend({ fields: msg }, '6', 'float', 0.12);
		setOrAppend({ fields: msg }, '7', 'float', 0.3);
		setOrAppend({ fields: msg }, '8', 'float', 27);
		changes += 8;
	}

	const HAS_NULL_ESP = !stock_info.ESP_freq && !stock_info.ESP_mSpeed;
	if (req.ESP && HAS_NULL_ESP) { // SET DEFAULT ESP
		deleteByLabel(decoded.fields, '7.4'); // ensure there is nothing

		// Settings 1
		let msg = appendMessage(decoded, '7.4');
		setOrAppend({ fields: msg }, '1', 'float', 50);
		setOrAppend({ fields: msg }, '2', 'float', 27);

		appendMessage(msg, '3'); // empty placeholder, like the reference file
		msg = appendMessage(msg, '3'); // settings 2
		setOrAppend({ fields: msg }, '1', 'float', 1);
		setOrAppend({ fields: msg }, '2', 'float', 3);
		setOrAppend({ fields: msg }, '4', 'float', 3);
		setOrAppend({ fields: msg }, '5', 'float', 0.05);
		setOrAppend({ fields: msg }, '6', 'float', 0.5);
		setOrAppend({ fields: msg }, '10', 'float', 0.7);
		setOrAppend({ fields: msg }, '11', 'float', 0.4);
		setOrAppend({ fields: msg }, '12', 'float', 2);
		setOrAppend({ fields: msg }, '13', 'float', 360);

		changes += 11;
		electronic_update_info.HAS_REBUILD_ESP = true;
	}

	return { decoded: decode(encode(decoded.fields)), electronic_update_info, changes };
}

/** @param {any} decoded @param {ElectronicModdingInfo} electronic_update_info @param {string} [maxFuel] if updated, ex: '62' */
export function patchCarSetupLimits(decoded, electronic_update_info, maxFuel) {
	let changes = 0; if (maxFuel) changes++;
	if (maxFuel) setOrAppend(decoded, '7.1.3', 'float', maxFuel); // ALIGN VALUES

	setOrAppend(decoded, '1.2.1', 'float', .1); 	// STEER RATIO Step
	setOrAppend(decoded, '1.2.2', 'float', -36); 	// STEER RATIO Min
	setOrAppend(decoded, '1.2.3', 'float', 36); 	// STEER RATIO Max

	setOrAppend(decoded, '1.3.1.1', 'float', 1); 	// FRONT BIAS Step
	setOrAppend(decoded, '1.3.1.2', 'float', 0); 	// FRONT BIAS Min
	setOrAppend(decoded, '1.3.1.3', 'float', 100); 	// FRONT BIAS Max

	setOrAppend(decoded, '1.3.2.1', 'float', 1); 	// TORQUE MULTIPLIER Step
	setOrAppend(decoded, '1.3.2.2', 'float', 0); 	// TORQUE MULTIPLIER Min
	setOrAppend(decoded, '1.3.2.3', 'float', 100); 	// TORQUE MULTIPLIER Max

	setOrAppend(decoded, '4.2.1', 'float', .1); 	// CAMBER Step
	setOrAppend(decoded, '4.2.2', 'float', -10); 	// CAMBER Min
	setOrAppend(decoded, '4.2.3', 'float', 2); 		// CAMBER Max
	changes += 12;

	const { HAS_REBUILD_TC, HAS_REBUILD_ABS, HAS_REBUILD_ESP } = electronic_update_info;
	if (HAS_REBUILD_TC) { // TC_1
		setOrAppend(decoded, '5.1.1', 'float', 1); 	// TC Step: 1
		setOrAppend(decoded, '5.1.2', 'float', 0); 	// TC min: 1
		setOrAppend(decoded, '5.1.3', 'float', 1); 	// TC max: 1
		changes += 3;
	}

	if (HAS_REBUILD_ABS) {
		setOrAppend(decoded, '5.3.1', 'float', 1); 	// ABS Step: 1
		setOrAppend(decoded, '5.3.2', 'float', 0); 	// ABS min: 0
		setOrAppend(decoded, '5.3.3', 'float', 1); 	// ABS max: 1
		changes += 3;
	}

	if (HAS_REBUILD_ESP) {
		setOrAppend(decoded, '5.6.1', 'float', 1); 	// ESC Step: 1
		setOrAppend(decoded, '5.6.2', 'float', 0); 	// ESC min: 0
		setOrAppend(decoded, '5.6.3', 'float', 1); 	// ESC max: 1
		changes += 3;
	}

	return { decoded: decode(encode(decoded.fields)), changes };
}

/** @param {any} decoded */
export function enableCarSetupLimits(decoded) {
	// ENABLE ANY SETUP_LIMIT THAT HAVE VALID 'STEP & MIN & MAX'
	// Pass 1: collect paths to patch
	let data_batch = { step: 0, min: 0, max: 0 };
	let lastPath, lastFieldPath;
	let lastField = 1;
	let changes = 0;
	const toBool = []; // pending boolean updates
	for (const row of toRows(decoded.fields)) {
		if (lastPath && lastField < 4 && data_batch.step && data_batch.max !== data_batch.min)
			toBool.push({ path: [...lastPath], fieldPath: [lastFieldPath] });

		if (lastField <= row.field) {
			lastPath = [...row.path];
			lastFieldPath = [...row.label.split('.')];
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

	if (toBool.length) { // Pass 2: apply patches
		for (const { path, fieldPath } of toBool) {
			let current = decoded.fields;
			for (const index of path.slice(0, -1)) current = current[index].message; // descend through nested submessages
			if (!appendVarint(current, 4, 1)) throw new Error('UNABLE TO PATCH!!');
		}
		changes++;
	}

	return { decoded: decode(encode(decoded.fields)), changes };
}

/** @param {any} decoded @param {string[]} aeroPathes */
export function assignAeroParts(decoded, aeroPathes) {
	deleteByLabel(decoded.fields, '12'); // ensure there is nothing

	let changes = 0;
	for (const path of aeroPathes) {
		const msg = appendMessage(decoded, '12');
		setOrAppend({ fields: msg }, '10', 'string', path);
	}

	return { decoded: decode(encode(decoded.fields)), changes };
}