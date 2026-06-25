// @ts-check
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

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
		
		const ACE_MODS 	= ACE_MODS_PATH && fs.existsSync(ACE_MODS_PATH) ? ACE_MODS_PATH : null;
		this.TEMPLATES 	= path.join(ROOT, 'templates');
		this.ACE_MODS 	= ACE_MODS;
		this.OUTPUT 	= ACE_MODS ? path.join(ACE_MODS, 'content\\cars') : path.join(ROOT, 'outputs');
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