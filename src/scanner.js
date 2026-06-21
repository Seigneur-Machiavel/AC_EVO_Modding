// @ts-check
import path from "path";
import { MainPaths } from './helpers.mjs';
import { ModParts, ModData } from './classes.mjs';
import { Logger, FileSystem } from './helpers.mjs';
import { decode, encode, setValue, toRows, appendVarint } from "./protobuf.js";

const MAIN_PATHS = new MainPaths();
const CARS_DIR = 'D:\\_Projects\\ACEvo.Package\\content.extracted\\content\\cars';
const CARS_LIST = FileSystem.listDirs(CARS_DIR).filter(d => d.startsWith('ks_'));
console.log(`${CARS_LIST.length} cars found`);

// CLEAR TEMPLATES DIRS (NOT FILES!)
const templates_dirs = FileSystem.listDirs(MAIN_PATHS.TEMPLATES);
for (const dir of templates_dirs) FileSystem.removeDirIfExist(path.join(MAIN_PATHS.TEMPLATES, dir));

function extractMechList(car_dir = 'ks_porsche_992_gt3_rs') {
	/** @type {string[]} */
	const mechList = [];
	const filesList = FileSystem.listFiles(path.join(CARS_DIR, car_dir, 'presets'));
	for (let i = 1; i < 10; i++) {
		const mech = `mech_${i}`;
		for (const file of filesList)
			if (!file.includes('.mechanicalcarpreset')) continue;
			else if (!file.includes(`mech_${i}`)) continue;
			else { mechList.push(mech); break };
	}

	return mechList;
}

// DEBUG
const valTriggers = ['Mini John Cooper S']; // DEV
//const fileExtTriggers = ['.carsetuplimits']; // DEV
const valTriggers2 = ['24500', '6000']; // 20', '35', '41000']; // 1834
const labelTrigger = '0,0,';

// NOTE: carsetuplimits -> path > x,x,0= Step | x,x,0= Min | x,x,0= Min

class DeepCloner {
	/** @type {Record<string, string | null>} */
	carSetupFiles = { // Files spotted in cardata.car (STOCK)
		'.carsetuplimits': null,
		'.carsetup': null
	}
	carSetupFound = false;
	carSetupLimitsFound = false;
	mech;
	mod_parts 	= new ModParts();
	mod_data 	= new ModData();
	constructor(mech = 'mech_1') { this.mech = mech };
	
	/** @param {string[]} files_list list of files @param {string} p path to dir @param {string} dest destination path */
	deepCopy = (files_list, p, dest) => {
		for (const f of files_list) {
			if (f.endsWith('.carfinalstate') && !f.includes(this.mech)) continue;
			const isCarData = f.endsWith('.car');
			if (isCarData) this.#storeAssociatedCarSetup(p, f);
			
			const isCarSetup = f.endsWith('.carsetup');
			const isCarSetupLimits = f.endsWith('.carsetuplimits');
			if (isCarSetup && this.carSetupFiles['.carsetup'] !== f) continue;
			if (isCarSetupLimits && this.carSetupFiles['.carsetuplimits'] !== f) continue;
			
			this.#storeRequestsData(p, f, isCarSetup, isCarSetupLimits);
			this.#storeRequestedParts(p, f);
			
			if (isCarSetupLimits) this.#patchAndCopyCarSetupLimits(p, f, dest);
			else FileSystem.copyFile(f, p, dest);

			if (isCarSetup) this.carSetupFound = true;
			if (isCarSetupLimits) this.carSetupLimitsFound = true;
		}
	}
	
	#storeAssociatedCarSetup(p = 'C:\...', f = 'cardata.car') {
		const decoded = decode(FileSystem.readFileSync(path.join(p, f)));
		for (const row of toRows(decoded.fields)) {
			const value = row.value;
			if (typeof value !== 'string') continue;

			const fileName = value.split('\\').pop();
			if (!fileName) continue;

			const fileExt = `.${value.split('.').pop()}`;
			if (this.carSetupFiles[fileExt] !== null) continue; // filled or undefined

			this.carSetupFiles[fileExt] = fileName.toLowerCase();
			console.log(`Handle ${fileExt} for ${this.mech} > ${fileName}`);
		}
	}
	#storeRequestedParts(p = 'C:\...', f = 'cardata.car') {
		for (const endFile in this.mod_parts) // STORE PARTS
			if (!f.endsWith(endFile)) continue;
			else this.mod_parts.set(endFile, `content\\${path.join(p, f).split('\\content\\')[1]}`);
	}
	#storeRequestsData(p = 'C:\...', f = 'cardata.car', isCarSetup = false, isCarSetupLimits = false) {
		for (const endFile in this.mod_data) { // STORE PARTS
			if (!f.endsWith(endFile)) continue;

			const decoded = decode(FileSystem.readFileSync(path.join(p, f)));
			const rows = toRows(decoded.fields);
			for (const row of rows) {
				if (this.mod_data.isRequired(endFile, row.path))
					this.mod_data.set(endFile, row.path, row.value)

				if (isCarSetupLimits) {
					//if (valTriggers2.includes(row.value)) 
						//this.#logRowDataInfo(endFile, [row]);
					//if (row.path.toString().startsWith(labelTrigger))
						this.#logRowDataInfo(endFile, [row]);

					if (row.kind === 'varint')
						this.#logRowDataInfo(`${endFile} BOOL ${row.label}`, [row]);
				}

				if (valTriggers.includes(row.value)) // Use carName trigger to avoid log spam.
					this.#logRowDataInfo(endFile, rows); // DEV INFO
			}
		}
	}
	#patchAndCopyCarSetupLimits(p = 'C:\...', f = 'toto.carsetuplimits', dest = 'C:\...') {
		const carcontentFile = FileSystem.readFileSync(path.join(p, f));
		const decoded = decode(carcontentFile);
		const patches = [];
		let data_batch = { step: 0, min: 0, max: 0 };
		let lastPath
		let lastField = 1;
		for (const row of toRows(decoded.fields)) {
			if (lastField < 4 && data_batch.step
				&& data_batch.max !== data_batch.min) // valid
				patches.push(lastPath);

			if (lastField <= row.field) {
				lastPath = row.path;
				data_batch = { step: 0, min: 0, max: 0 }; // reset
			}

			if (row.field === 1) data_batch.step = Number(row.value);
			if (row.field === 2) data_batch.min  = Number(row.value);
			if (row.field === 3) data_batch.max  = Number(row.value);
			lastField = row.field;
		}
		
		/*for (const targetPath of patches) {
			const res = setValue(decoded.fields, targetPath, 'varint', 1);
			console.log(`${targetPath} should be modifiable! ${res.ok ? 'ok' : res.error}`);
		}*/
		for (const targetPath of patches) {
			//const parentMessage = this.#getParentMessage(decoded.fields, targetPath.slice(0, -1));
			let current = decoded.fields;
			for (const index of targetPath.slice(0, -1)) current = current[index].message; // descend through nested submessages
			
			//const res = appendVarint(current, 3, 1);
			const res = appendVarint(current, 4, 1); // field 4, not 3
			console.log(`${targetPath} should be modifiable! ${res.ok ? 'ok' : res.error}`);
		}

		const encoded = encode(decoded.fields);
		for (const row of toRows(decode(encoded).fields)) {
			//if (row.kind !== 'varint' || row.path[row.path.length -1] !== 3) continue;
			if (row.field !== 4 || row.kind !== 'varint') continue;
			this.#logRowDataInfo(`>>> BOOL`, [row]);
		}

		FileSystem.createDirIfNot(dest);
		FileSystem.writeFileSync(path.join(dest, f), encoded);
	}
	#logRowDataInfo(endFile = '.car', /** @type {any} */ rows = []) { // DEV METHOD
		for (const row of rows)
			console.info(`${endFile}: ${row.path} | ${row.kind} | ${row.value}`);
	}
}

/** key: car_id, key: mech, value: ModParts,  @type {Record<string, Record<string, ModParts>>} */
const MECHS = {}; // PART'S PATH STORE

/** key: car_id, key: mech, value: ModData,  @type {Record<string, Record<string, ModData>>} */
const SETUPS = {}; // SETUP VALUES STORE

let total_mech_count = 0;
for (const car_dir of CARS_LIST) {
	const mech_list = extractMechList(car_dir);
	const car_dir_path = 	path.join(CARS_DIR, car_dir);
	const car_data_path = 	path.join(car_dir_path, 'data');
	const car_setup_path = 	path.join(car_data_path, 'setup');
	const car_presets_path=	path.join(car_dir_path, 'presets');
	if (mech_list.length === 0) { console.info(`Missing mech for ${car_dir}`); continue; }

	// ONLY MECH_1 ATM
	for (let i = 0; i < 1; i++) {
		const car_dir_files = 	FileSystem.listFiles(car_dir_path).filter(f => f.endsWith('.actor'));
		const data_files = 		FileSystem.listFiles(car_data_path);
		const setup_files = 	FileSystem.listFiles(car_setup_path)
		const presets_files = 	FileSystem.listFiles(car_presets_path);

		// COPY FILES WITH RENAMING
		const mech = mech_list[0];
		const template_path = 			path.join(MAIN_PATHS.TEMPLATES, `${car_dir}_mod_${mech}`);
		const template_data_path = 		path.join(template_path, 'data');
		const template_setup_path = 	path.join(template_data_path, 'setup');
		const template_presets_path =	path.join(template_path, 'presets');
		FileSystem.copyFile(car_dir_files[0], car_dir_path, template_path, `_mod_${mech}`);

		const deepCloner = new DeepCloner(mech);
		deepCloner.deepCopy(data_files, car_data_path, template_data_path); 			// DATA
		deepCloner.deepCopy(setup_files, car_setup_path, template_setup_path);			// SETUP
		deepCloner.deepCopy(presets_files, car_presets_path, template_presets_path);	// PRESETS

		if (!deepCloner.carSetupFound) throw new Error('.carsetup not found!!');
		if (!deepCloner.carSetupLimitsFound) throw new Error('.carsetuplimits not found!!');

		if (!MECHS[car_dir]) MECHS[car_dir] = {};
		if (!SETUPS[car_dir]) SETUPS[car_dir] = {};
		MECHS[car_dir][mech] = deepCloner.mod_parts;
		SETUPS[car_dir][mech] = deepCloner.mod_data;
		total_mech_count++;
	}
	//break; // DEV
}

FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs.json'), JSON.stringify(MECHS));
FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_setups.json'), JSON.stringify(SETUPS));
console.log(`${total_mech_count} mechs cloned!`);