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
import { ModParts, ModData } from './classes.mjs';
import { extract_all_tyres } from './tyres-extractor.mjs';
import { Logger, FileSystem, resolveFileIdentity } from './helpers.mjs';
import { decode, encode, toRows } from "./protobuf.js";

const TYRES = extract_all_tyres();
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
	for (let i = 1; i < 10; i++)
		for (const file of filesList)
			if (!file.includes('.mechanicalcarpreset')) continue;
			else if (!file.includes(`mech_${i}`)) continue;
			else { mechList.push(`mech_${i}`); break };

	return mechList;
}

// DEV
const DEV_MODE = false; // MORE LOGS & STOP THE LOOP AFTER THE FIRST CAR | Prod: false.
const fileIdentityTrigger = 'CompatibleTyres'; 	// Only trigger on this file (CarDataCar | CarSetup | CarSetupLimits | CompatibleTyres)
/** Full file values log. (one shot) | leave empty for no log.
 * ex: ['Mini John Cooper S', '360'] */ // @ts-ignore
const valTriggers = ['content\\cars\\common_phsx\\tyres\\supercar\\supercar_215_35_18.tyre'];
// NOTES (Abarth TRIGGERS): ESP='27', ABS='0.4000000059604645', EDL=500, TC: 150

const pathTrigger = null; // '6,'; // (null | string) ex: '0,0,'; '13,6'

// NOTES:
// carsetuplimits -> path > x,x,0= Step | x,x,0= Min | x,x,0= Min
// CompatibleTyres :
// -> 2.1=modval? | 2.2=front_mod_1 | 2.3=read_mod_1

/*

> path: 1,0          | label: 2.1          | kind: varint   | value: 91
> path: 1,1          | label: 2.2          | kind: string   | value: content\cars\common_phsx\tyres\supercar\supercar_215_35_18.tyre
> path: 1,2          | label: 2.3          | kind: string   | value: content\cars\common_phsx\tyres\supercar\supercar_215_35_18.tyre
> path: 2,0          | label: 2.1          | kind: varint   | value: 304
> path: 2,1          | label: 2.2          | kind: string   | value: content\cars\common_phsx\tyres\road\road_215_35_18.tyre
> path: 2,2          | label: 2.3          | kind: string   | value: content\cars\common_phsx\tyres\road\road_215_35_18.tyre*/

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
	mod_parts 	= new ModParts();
	mod_data 	= new ModData();
	constructor(car_id = 'car_1', mech = 'mech_1') { this.car_id = car_id; this.mech = mech };
	
	/** @param {string[]} files_list list of files @param {string} p path to dir @param {string} dest destination path */
	deepCopy = (files_list, p, dest) => {
		for (const f of files_list) {
			if (f.endsWith('.carfinalstate') && !f.includes(this.mech)) continue;

			// ONLY COPY THE .carsetup/limits THAT WE NEEDS.
			const decoded = decode(FileSystem.readFileSync(path.join(p, f)));
			const rows = toRows(decoded.fields);
			const fileIdentity = resolveFileIdentity(f);
			if (fileIdentity === 'CarDataCar') this.#storeAssociatedCarDataCar(rows);
			if (fileIdentity === 'CompatibleTyres') this.#storeCompatibleTyres(rows);
			if (fileIdentity === 'CarSetup' && this.carSetupFiles['.carsetup'] !== f) continue;
			if (fileIdentity === 'CarSetupLimits' && this.carSetupFiles['.carsetuplimits'] !== f) continue;
			
			const endFile = `.${f.split('.')[f.split('.').length]}`;
			this.#storeRequestedParts(p, f); // STORE PARTS
			this.#storeRequestsData(rows, endFile, fileIdentity); // STORE DATA (simpler, see if we don't get bug)
			//for (const endFile in this.mod_data) // STORE DATA
				//if (f.endsWith(endFile)) this.#storeRequestsData(rows, endFile, fileIdentity) 

			FileSystem.copyFile(f, p, dest);

			if (fileIdentity === 'CarSetup') this.carSetupFound = true;
			if (fileIdentity === 'CarSetupLimits') this.carSetupLimitsFound = true;
		}
	}
	
	#storeAssociatedCarDataCar(/** @type {any} */ rows) {
		/** @type {{front: { category: string, tyre: string} | null, rear: { category: string, tyre: string} | null}} */
		let tyreSet = { front: null, rear: null };
		for (const row of rows) {
			const value = row.value;
			if (typeof value !== 'string') continue;

			const fileName = value.split('\\').pop();
			if (!fileName) continue;

			const fileExt = `.${value.split('.').pop()}`;
			const fName = fileName.toLowerCase();
			if (fileExt !== '.tyre' && this.carSetupFiles[fileExt] === null)
				this.carSetupFiles[fileExt] = fName; // store part path

			/*if (fileExt === '.tyre') { // WE DONT USE STOCK TYRES!
				const split = value.split('\\');
				const tyre = split.pop()?.split('.')[0];
				const category = split.pop();
				if (!category || !tyre) continue; //throw new Error('Unable to parse .tyre!!');

				if (row.path.length === 1 && row.path[0] === 9) tyreSet.front = { category, tyre };
				if (row.path.length === 1 && row.path[0] === 10) tyreSet.rear = { category, tyre };
			}

			// console.log(`Handle ${fileExt} for ${this.mech} > ${fileName}`);*/
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
	#storeRequestedParts(p = 'C:\...', f = 'cardata.car') {
		for (const endFile in this.mod_parts) // STORE PARTS
			if (!f.endsWith(endFile)) continue;
			else this.mod_parts.set(endFile, `content\\${path.join(p, f).split('\\content\\')[1]}`);
	}
	#storeRequestsData(/** @type {any} */ rows, endFile = '.car', fileIdentity = 'unknown') {
		for (const row of rows) {
			if (this.mod_data.isRequired(endFile, row.path))
				this.mod_data.set(endFile, row.path, row.value)

			if (!DEV_MODE) continue;
			if (fileIdentity !== fileIdentityTrigger) continue; // CONTROL VALUES FOR SPECIFIC FILE OPNLY

			// @ts-ignore
			for (const trigger of valTriggers) { // Use trigger to avoid log spam.
				if (row.value !== trigger) continue;
				console.info(`${endFile} [${this.car_id} Trigger: ${trigger} | ${row.path}]`);
				this.#logRowDataInfo(rows, [...row.path]); // DEV INFO
			}
			
			if (pathTrigger && row.path.toString().startsWith(pathTrigger)) {
				console.info(`${endFile} [${this.car_id} PathTrigger: ${pathTrigger}]`);
				this.#logRowDataInfo(rows, [...row.path]);
			}

			//if (row.kind === 'varint')
				//this.#logRowDataInfo(`${endFile} BOOL ${row.label}`, [row]);
		}
	}
	#logRowDataInfo(/** @type {any} */ rows = [], /** @type {any} */ path = []) { // DEV METHOD
		path.pop(); // remove last path index
		const pathStartWith = `${path.toString()},`;
		for (const row of rows) {
			const pathStr = row.path.toString();
			if (!pathStr.startsWith(pathStartWith)) continue;
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

let total_mech_count = 0;
const list = DEV_MODE ? ['ks_abarth_695_biposto', 'ks_mini_jcs_1990'] : CARS_LIST;
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
		const template_path = 			path.join(MAIN_PATHS.TEMPLATES, `${car_dir}_mod_${mech}`);
		const template_data_path = 		path.join(template_path, 'data');
		const template_setup_path = 	path.join(template_data_path, 'setup');
		const template_presets_path =	path.join(template_path, 'presets');
		FileSystem.copyFile(car_dir_files[0], car_dir_path, template_path, `_mod_${mech}`);

		const deepCloner = new DeepCloner(car_dir, mech);
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
		total_mech_count++;

		if (!DEV_MODE) { console.info(`${car_dir} ${mech}`); continue };

		//console.info(`#TYRES | ${car_dir} ${mech}`);
		//for (const key in deepCloner.tyres)
			//console.info(`#TyreSet: ${key} -> ${JSON.stringify(deepCloner.tyres[key])}`);
	}
}

if (!DEV_MODE) {
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'tyres.json'), JSON.stringify(TYRES));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs.json'), JSON.stringify(MECHS));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_setups.json'), JSON.stringify(SETUPS));
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs_tyres.json'), JSON.stringify(MECHS_TYRES));
	console.log(`${total_mech_count} mechs cloned!`);
}