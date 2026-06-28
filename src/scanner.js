// @ts-check
/**
 * This file is standalone content cloner that made the templates.
 * Also used to understand the game, files, and patching result
 * 
 * @typedef {import('./classes.mjs').TyreSet} TyreSet
 * @typedef {import('./classes.mjs').SetOfMechTyres} SetOfMechTyres
 */


import path from "path";
import { MainPaths } from './helpers.mjs';
import { ModParts, ModData, AeroLib, PART_KEYS } from './classes.mjs';
import { extract_all_tyres } from './tyres-extractor.mjs';
import { Logger, FileSystem, resolveFileIdentity } from './helpers.mjs';
import { decode, encode, toRows } from "./protobuf.js";

const TYRES = extract_all_tyres();
const MAIN_PATHS = new MainPaths();
const CARS_DIR = 'D:\\_Projects\\ACEvo.Package\\content.extracted\\content\\cars';
const CARS_LIST = FileSystem.listDirs(CARS_DIR).filter(d => d.startsWith('ks_'));

function extractMechList(car_dir = 'ks_porsche_992_gt3_rs') {
	/** @type {string[]} */
	const mechList = [];
	const filesList = FileSystem.listFiles(path.join(CARS_DIR, car_dir, 'presets'));
	for (let i = 1; i < 10; i++)
		for (const file of filesList)
			if (!file.includes('.mechanicalcarpreset')) continue;
			else if (!file.includes(`mech_${i}`)) continue;
			else { mechList.push(`mech_${i}`); break };

	return mechList;
}

// DEV
const DEV_MODE = true; // MORE LOGS & STOP THE LOOP AFTER THE FIRST CAR | Prod: false.
const LOG_PARTS = false; // LOG ANY PARTS THAT ARE IN "PART_KEYS"
const DEV_SCAN_ALL_CARS = false; // If falsy, only: 'ks_abarth_695_biposto', 'ks_mini_jcs_1990'
const APPLY_LABEL_ANTI_REPETITION = false;
/** Only trigger on this file (Actor | CarDataCar | CarSetup | CarSetupLimits | CompatibleTyres) */
const fileIdentityTrigger = 'CarSetupLimits';
/** Full file values log. (one shot) | leave empty for no log.
 * ex: ['Mini John Cooper S', '360'] */ // @ts-ignore
const valTriggers = ['230'];
// NOTES (Abarth TRIGGERS): ESP='27', ABS='0.4000000059604645', EDL=500, TC: 150
const fieldTrigger = null; // ex: '4.2.2'; -> work on 12.10 (12.)
const pathTrigger = null; // '6,'; // (null | string) ex: '0,0,'; '13,6'
//const list = DEV_MODE && !DEV_SCAN_ALL_CARS ? ['ks_abarth_695_biposto', 'ks_mini_jcs_1990'] : CARS_LIST;
const list = ['ks_mini_jcs_1990']; // DEV CUSTOM LIST
console.log(`${CARS_LIST.length} cars found | ${list.length} cars to scan`);

// NOTES:
// carsetuplimits -> path > x,x,0= Step | x,x,0= Min | x,x,0= Min
// CompatibleTyres :
// -> 2.1=modval? | 2.2=front_mod_1 | 2.3=read_mod_1

class DeepCloner {
	/** @type {Record<string, string | null>} */
	carSetupFiles = { // Files spotted in cardata.car (STOCK)
		'.carsetuplimits': null,
		'.carsetup': null,
	};

	carSetupFound = false;
	carSetupLimitsFound = false;
	car_id; mech;

	/** @type {Record<string, TyreSet>} */
	tyres		= {};
	/** Nullified if unable to swap aero @type {string[] | null} */
	aero_parts	= [];
	mod_parts 	= new ModParts();
	mod_data 	= new ModData();
	constructor(car_id = 'car_1', mech = 'mech_1') { this.car_id = car_id; this.mech = mech };
	
	/** @param {string[]} files_list list of files @param {string} p path to dir @param {string} dest destination path */
	deepCopy = (files_list, p, dest) => {
		const isDataDir = p.endsWith('\\data');
		for (const f of files_list) {
			if (f.endsWith('.carfinalstate') && !f.includes(this.mech)) continue;

			// ONLY COPY THE .carsetup/limits THAT WE NEEDS.
			const decoded = decode(FileSystem.readFileSync(path.join(p, f)));
			const rows = toRows(decoded.fields);
			const fileIdentity = resolveFileIdentity(f);
			if (fileIdentity === 'CarDataCar') this.#extractCarDataCarInfo(rows);
			if (fileIdentity === 'CompatibleTyres') this.#storeCompatibleTyres(rows);
			if (fileIdentity === 'CarSetup' && this.carSetupFiles['.carsetup'] !== f) continue;
			if (fileIdentity === 'CarSetupLimits' && this.carSetupFiles['.carsetuplimits'] !== f) continue;
			
			const endFile = `.${f.split('.').pop()}`;
			if (DEV_MODE) this.logDevData(rows, endFile, fileIdentity);

			for (const row of rows) // STORE DATAS
				if (!this.mod_data.isRequired(endFile, row.label)) continue;
				else this.mod_data.set(endFile, row.label, row.value)
			
			const COPY_FILE = !isDataDir || fileIdentity === 'CarDataCar'; // 'data' dir -> we only needs 'cardata.car'
			if (!DEV_MODE && COPY_FILE) FileSystem.copyFile(f, p, dest);
			if (fileIdentity === 'CarSetup') this.carSetupFound = true;
			if (fileIdentity === 'CarSetupLimits') this.carSetupLimitsFound = true;
		}
	}
	
	#extractCarDataCarInfo(/** @type {any} */ rows) {
		/** @type {{front: { category: string, tyre: string} | null, rear: { category: string, tyre: string} | null}} */
		let tyreSet = { front: null, rear: null };
		for (const row of rows) {
			const value = row.value;
			if (typeof value !== 'string') continue;

			const fileName = row.value.split('\\').pop();
			if (!fileName) continue;

			const cleanPath = value.toLowerCase();
			const fileExt = `.${row.value.split('.').pop()}`;
			const fName = fileName.toLowerCase();
			if (fileExt !== '.tyre' && this.carSetupFiles[fileExt] === null)
				this.carSetupFiles[fileExt] = fName; // store part path

			 // STORE PARTS: DETECT BY LABEL IS MORE CONSISTENT
			if (row.label === '16') this.carSetupFiles['.carsetuplimits'] = fName;
			if (row.label === '19') this.carSetupFiles['.carsetup'] = fName; // .carsetup

			if (row.label === '20') this.mod_parts.set('.carengine', cleanPath);
			if (row.label === '22') this.mod_parts.set('.drivetrain', cleanPath);
			if (row.label === '24') this.mod_parts.set('.gearbox', cleanPath);
			if (row.label === '26') this.mod_parts.set('.clutch', cleanPath);
			if (row.label === '27') this.mod_parts.set('.brakesystem', cleanPath);
			if (row.label === '2.20') this.mod_parts.set('front.coilover', cleanPath);
			if (row.label === '2.21') this.mod_parts.set('rear.coilover', cleanPath);
			if (row.label === '2.22') this.mod_parts.set('front.suspension', cleanPath);
			if (row.label === '2.23') this.mod_parts.set('rear.suspension', cleanPath);

			// DEV LOOP // WHAT IS "25.24" ?? ks_dallara_stradale_coupe
			if (LOG_PARTS) for (const part of PART_KEYS) {
				if (this.car_id !== 'ks_mini_jcs_1990') continue;
				if (!fName.endsWith(part)) continue;
				console.log(`${part} -> ${row.label}`)
				console.log(`-- ${cleanPath}`);
			}

			if (!value.includes('\\')) continue; // path only
			if (!row.label.startsWith('12.')) continue; // only aero
			if (fileExt !== '.curve' && fileExt !== '.wing') this.aero_parts = null; // Unable to manage this aero!
			if (!this.aero_parts) continue;
			
			// AERO SPECIFIC (if we needs NAME it's label: '12.3.2')
			if (row.label === '12.10') this.aero_parts.push(row.value.toLowerCase()); // store aero part
		}

		if (tyreSet.front && tyreSet.rear) this.tyres['stock'] = { front: tyreSet.front, rear: tyreSet.rear };
	}
	#storeCompatibleTyres(/** @type {any} */ rows) {
		/** @type {{front: { category: string, tyre: string} | null, rear: { category: string, tyre: string} | null}} */
		let tyreSet = { front: null, rear: null };
		let index = 1;
		for (const row of rows) {
			const value = row.value;
			if (typeof value !== 'string') continue;
			if (!value.endsWith('.tyre')) continue;
			
			const split = value.split('\\');
			const tyre = split.pop()?.split('.')[0];
			const category = split.pop();
			if (!category || !tyre) throw new Error('Unable to parse .tyre!!');

			if (!tyreSet.front) tyreSet.front = { category, tyre };
			else tyreSet.rear = { category, tyre };
			if (!tyreSet.front || !tyreSet.rear) continue; // wait for the set to be filled

			this.tyres[`Mod_${index++}`] = { front: tyreSet.front, rear: tyreSet.rear };
			tyreSet = { front: null, rear: null }; // reset
		}
	}
	#loggedLabels = new Set(); // DEV VAR
	logDevData(/** @type {any} */ rows, endFile = '.car', fileIdentity = 'unknown') { // DEV METHOD
		this.#loggedLabels = new Set();
		for (const row of rows) {
			if (fileIdentity !== fileIdentityTrigger) continue; // CONTROL VALUES FOR SPECIFIC FILE OPNLY
			//if (this.#loggedLabels.has(row.label)) continue;

			// @ts-ignore
			for (const trigger of valTriggers) { // Use trigger to avoid log spam.
				if (row.value !== trigger) continue;
				console.info(`${endFile} [${this.car_id} trigger: ${trigger} | p:${row.path}] | l:${row.label}`);
				this.#logRowDataInfo(rows, row.path, row.label);
			}

			if (fieldTrigger && row.label === fieldTrigger) {
				console.info(`${endFile} [${this.car_id} fieldTrigger: ${fieldTrigger}] | p:${row.path}] | l:${row.label}`);
				this.#logRowDataInfo(rows, row.path, row.label);
			}
			
			if (pathTrigger && row.path.toString().startsWith(pathTrigger)) {
				console.info(`${endFile} [${this.car_id} pathTrigger: ${pathTrigger}] | p:${row.path}] | l:${row.label}`);
				this.#logRowDataInfo(rows, row.path, row.label);
			}

			//if (row.kind === 'varint')
				//this.#logRowDataInfo(`${endFile} BOOL ${row.label}`, row.path, row.label);
		}
	}
	/** @param {any[]} rows @param {number[]} path @param {string} label */
	#logRowDataInfo(rows, path, label) { // DEV METHOD
		const labelSplit = label.split('.');
		labelSplit.pop();
		const labelStartWidth = labelSplit.join('.');

		for (const row of rows) {
			const pathStr = path.toString();
			if (APPLY_LABEL_ANTI_REPETITION && this.#loggedLabels.has(row.label)) continue;
			if (!row.label.startsWith(labelStartWidth)) continue;
			this.#loggedLabels.add(row.label);
			console.info(`> path: ${(pathStr).padEnd(12)} | label: ${row.label.padEnd(12)} | kind: ${row.kind.padEnd(8)} | value: ${row.value}`);
		}
		console.log('');
	}
}

/** key: car_id, key: mech, value: ModParts,  @type {Record<string, Record<string, ModParts>>} */
const MECHS = {}; // PART'S PATH STORE

/** key: car_id, key: mech, value: ModData,  @type {Record<string, Record<string, ModData>>} */
const SETUPS = {}; // SETUP VALUES STORE

/** key: car_id, key: mech, key: mod, value: TyreSet @type {SetOfMechTyres} */
const MECHS_TYRES = {}; // MECH'S TYRES STORE

const AEROS = new AeroLib();

if (!DEV_MODE) // CLEAR TEMPLATES DIRS (NOT FILES!)
	for (const dir of FileSystem.listDirs(MAIN_PATHS.TEMPLATES))
		FileSystem.removeDirIfExist(path.join(MAIN_PATHS.TEMPLATES, dir));

let total_mech_count = 0;
for (const car_dir of list) {
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
		const deepCloner = new DeepCloner(car_dir, mech);
		const template_path = 			path.join(MAIN_PATHS.TEMPLATES, `${car_dir}_mod_${mech}`);
		const template_data_path = 		path.join(template_path, 'data');
		const template_setup_path = 	path.join(template_data_path, 'setup');
		const template_presets_path =	path.join(template_path, 'presets');
		if (!DEV_MODE) FileSystem.copyFile(car_dir_files[0], car_dir_path, template_path, `_mod_${mech}`);
		else {
			const actorPath = path.join(car_dir_path, car_dir_files[0]);
			const decoded = decode(FileSystem.readFileSync(actorPath));
			deepCloner.logDevData(toRows(decoded.fields), '.actor', 'Actor');
		}

		deepCloner.deepCopy(data_files, car_data_path, template_data_path); 			// first DATA
		deepCloner.deepCopy(setup_files, car_setup_path, template_setup_path);			// then  SETUP
		deepCloner.deepCopy(presets_files, car_presets_path, template_presets_path);	// then  PRESETS

		if (!deepCloner.carSetupFound) throw new Error('.carsetup not found!!');
		if (!deepCloner.carSetupLimitsFound) throw new Error('.carsetuplimits not found!!');

		if (!MECHS[car_dir]) MECHS[car_dir] = {};
		if (!SETUPS[car_dir]) SETUPS[car_dir] = {};
		if (!MECHS_TYRES[car_dir]) MECHS_TYRES[car_dir] = {};
		MECHS[car_dir][mech] = deepCloner.mod_parts;
		SETUPS[car_dir][mech] = deepCloner.mod_data;
		MECHS_TYRES[car_dir][mech] = deepCloner.tyres;
		if (deepCloner.aero_parts) AEROS.add(car_dir, deepCloner.aero_parts);
		total_mech_count++;

		if (!DEV_MODE) { console.info(`${car_dir} ${mech}`); continue };

		//console.info(`#TYRES | ${car_dir} ${mech}`);
		//for (const key in deepCloner.tyres)
			//console.info(`#TyreSet: ${key} -> ${JSON.stringify(deepCloner.tyres[key])}`);
	}
}

if (!DEV_MODE) {
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'tyres.json'), JSON.stringify(TYRES));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'aeros.json'), JSON.stringify(AEROS));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs.json'), JSON.stringify(MECHS));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_setups.json'), JSON.stringify(SETUPS));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs_tyres.json'), JSON.stringify(MECHS_TYRES));
	console.log(`${total_mech_count} mechs cloned!`);
}