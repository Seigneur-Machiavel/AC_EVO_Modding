// @ts-check
import path from "path";
import { decode, encode, setValue, toRows } from "./protobuf.js";
import { Logger, FileSystem } from './helpers.mjs';

class Patch_Info {
	unchanged_count = 0; changed_count = 0; files_count = 0; car_id;
	constructor(car_id = 'ks_modded_car') { this.car_id = car_id; };
}

/** @type {Record<string, Patch_Info>} */
const patch_infos = {};
const logger = new Logger();
const BRAND = 'pink_mods';
const YEAR = 2026;
const INPUT_DIR = 'inputs';
const OUTPUT_DIR = 'C:\\Users\\Pink Parrot\\Saved Games\\ACE\\mods\\content\\cars' // 'outputs';
/** If empty -> clone all cars @type {string | []} */
const cars_to_clone = []; // DEBUG - Done by user. 
// ks_mini_jcs_1990_mod_mech_1 | ks_porsche_992_gt3_rs_mod_mech_1

/** @type {Record<string, string>} */
const available_cars = {};
const TEMPLATES_PATH = 'templates';
for (const t of FileSystem.listDirs(TEMPLATES_PATH)) available_cars[t] = path.join(TEMPLATES_PATH, t);

// NOTES FOR DEV
// In .actor
// Driving side : LHS | RHS | Centre
// Driver model type : Street | Racing

/** @type {Record<string, any>} */
let corrections = {};
function prepareCorrections(o_id = 'ks_mini_jcs_1990', m_id = 'ks_mini_jcs_1990_mod_mech_1', p = '...\\ks_mini_jcs_1990_mod_mech_1') {
	for (const d of FileSystem.listDirs(p))
		prepareCorrections(o_id, m_id, path.join(p, d));

	const lastParts 	= p.split(m_id)[1].split('\\');
	lastParts.shift(); // remove 'mech_x' || empry ex: [data, setup]
	
	const lastPart 		= `\\${lastParts.join('\\')}\\`; // ex: \\data\\setup
	const prefix = 'content\\cars\\';
	for (const f of FileSystem.listFiles(p)) {
		//const ext = f.split('.')[1];
		//console.log(f.split('_mod_')[0]);
		//const original_f = `${f.split('_mod_')[0]}${ext}`; // in case we changed filename
		const original_f = !f.includes('_mod_') ? f : `${f.split('_mod_')[0]}.${f.split('.')[1]}`;
		const a = `${prefix}${o_id}${lastPart}${original_f}`.replaceAll('\\\\', '\\');
		const b = `${prefix}${m_id}${lastPart}${f}`.replaceAll('\\\\', '\\');
		corrections[a] = b;
	}
}
// 'content\\cars\\ks_porsche_992_gt3_rs\\data\\setuplimitsporsche992gt3rs.carsetuplimits'
// 'content\\cars\\ks_porsche_992_gt3_rs\\data\\setuplimitsporsche992gt3rs.carsetuplimits'
// 'content\\cars\\ks_porsche_992_gt3_rs\\ks_porsche_992_gt3_rs.actor'
// 'content\\cars\\ks_porsche_992_gt3_rs_mod_mech_1\\ks_porsche_992_gt3_rs.actor'


/** @type {Record<string, any>} */
const corrections_old = { // pathInclude: new_target_id
	//'content\\cars\\ks_mini_jcs_1990\\ks_mini_jcs_1990.actor':
		//'content\\cars\\ks_mini_modded\\ks_mini_modded.actor',

	// DATA
	'content\\cars\\ks_mini_jcs_1990\\data\\cardata.car':
		'content\\cars\\ks_mini_modded\\data\\cardata.car',
	'content\\cars\\ks_mini_jcs_1990\\data\\setup\\mini_jcs_1990.carsetup':
		'content\\cars\\ks_mini_modded\\data\\setup\\mini_modded.carsetup',

	'content\\cars\\ks_mini_jcs_1990\\presets\\preset_jcs_mech_1.mechanicalcarpreset':
		'content\\cars\\ks_mini_modded\\presets\\preset_jcs_mech_1.mechanicalcarpreset',
	'content\\cars\\ks_mini_jcs_1990\\presets\\preset_jcs_mech_2.mechanicalcarpreset':
		'content\\cars\\ks_mini_modded\\presets\\preset_jcs_mech_2.mechanicalcarpreset',
	
	// TODO?
	'content\\cars\\ks_mini_jcs_1990\\presets\\preset_jcs_visual_1.visualcarpreset':
		'content\\cars\\ks_mini_modded\\presets\\preset_jcs_visual_1.visualcarpreset',
	'content\\cars\\ks_mini_jcs_1990\\presets\\preset_jcs_visual_2.visualcarpreset':
		'content\\cars\\ks_mini_modded\\presets\\preset_jcs_visual_2.visualcarpreset',
	/*'content\\cars\\ks_mini_modded\\presets\\preset_jcs_visual_1.visualcarpreset':
		'content\\cars\\ks_mini_jcs_1990\\presets\\preset_jcs_visual_1.visualcarpreset',
	'content\\cars\\ks_mini_modded\\presets\\preset_jcs_visual_2.visualcarpreset':
		'content\\cars\\ks_mini_jcs_1990\\presets\\preset_jcs_visual_2.visualcarpreset',*/

	// PHYSICS - CAN BE REMOVE ON FINALIZED SAMPLE
	// content\\cars\\ks_mini_jcs_1990\\presets\\parts\\physics\\minimkvi_setup_tune
	'content\\cars\\ks_mini_modded\\presets\\parts\\physics\\minimkvi_diff_tune':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\physics\\minimkvi_diff_tune',
	'content\\cars\\ks_mini_modded\\presets\\parts\\physics\\minimkvi_engine_tune':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\physics\\minimkvi_engine_tune',
	'content\\cars\\ks_mini_modded\\presets\\parts\\physics\\minimkvi_setup_tune.compatiblepart':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\physics\\minimkvi_setup_tune',
	'content\\cars\\ks_mini_modded\\presets\\parts\\physics\\minimkvi_am_tune_kit.carkit':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\physics\\minimkvi_am_tune_kit.carkit',

	// INSTRUMENTS - CAN BE REMOVE ON FINALIZED SAMPLE
	'content\\cars\\ks_mini_modded\\instruments\\ks_mini_modded.caranalogicsystem':
		'content\\cars\\ks_mini_jcs_1990\\instruments\\ks_mini_jcs_1990.caranalogicsystem',
	'content\\cars\\ks_mini_modded\\instruments\\ks_mini_modded.carexhaustbackfire':
		'content\\cars\\ks_mini_jcs_1990\\instruments\\ks_mini_jcs_1990.carexhaustbackfire',
	'content\\cars\\ks_mini_modded\\instruments\\ks_mini_modded.carledsystem':
		'content\\cars\\ks_mini_jcs_1990\\instruments\\ks_mini_jcs_1990.carledsystem',
	'content\\cars\\ks_mini_modded\\instruments\\ks_mini_modded.carlightingsystem':
		'content\\cars\\ks_mini_jcs_1990\\instruments\\ks_mini_jcs_1990.carlightingsystem',

	// COMPATIBLE PARTS - CAN BE REMOVE ON FINALIZED SAMPLE
	// content\\cars\\ks_mini_modded\\presets\\parts\\minimkvi_spotlights_dual.compatiblepart
	'content\\cars\\ks_mini_modded\\presets\\parts\\minimkvi_spotlights_dual':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\minimkvi_spotlights_dual',
	'content\\cars\\ks_mini_modded\\presets\\parts\\minimkvi_spotlights_quad':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\minimkvi_spotlights_quad',
	'content\\cars\\ks_mini_modded\\presets\\parts\\minimkvi_exhaust_tune':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\minimkvi_exhaust_tune',
	'content\\cars\\ks_mini_modded\\presets\\parts\\minimkvi_caliper_minisport_lf':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\minimkvi_caliper_minisport_lf',
	'content\\cars\\ks_mini_modded\\presets\\parts\\minimkvi_caliper_minisport_rf':
		'content\\cars\\ks_mini_jcs_1990\\presets\\parts\\minimkvi_caliper_minisport_rf',

	/* WORKING
	'event:/evo_cars/ks_mini_jcs_1990/': 'event:/evo_cars/ks_chevrolet_camaro_zl1/',
	'content\\sfx\\ks_mini_modded.bank': 'content\\sfx\\ks_chevrolet_camaro_zl1.bank',

	'ks_mini_modded_front.coilover': { newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded_rear.coilover': { newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded_front.suspension': { newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded_rear.suspension': { newValue: 'ks_toyota_supra_mkiv' },

	'ks_mini_modded.drivetrain': { newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded.gearbox': 	{ newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded.clutch':	{ newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded.carengine':	{ newValue: 'ks_toyota_supra_mkiv' },
	'ks_mini_modded.brakesystem': { newValue: 'ks_toyota_supra_mkiv' },

	'road_165_60_12.tyre':		{ newValue: 'supercar_165_60_12.tyre', oldValue: 'road_165_60_12.tyre' }*/
}

/** Recursive function to process a dir an his child dirs
 * @param {string} p path to dir @param {string} m_id modded_car_id @param {string} o_id original_car_id */
function processDir(p, m_id, o_id) {
	const dirs = FileSystem.listDirs(p);
	for (const dir of dirs) processDir(path.join(p, dir), m_id, o_id);

	processDirFiles(p, m_id, o_id);
}

function processDirFiles(p = 'C:', m_id = 'ks_modded_car', o_id = 'ks_mini_jcs_1990') {
	const files = FileSystem.listFiles(p);
	const outputDirPath = (p).replace(TEMPLATES_PATH, OUTPUT_DIR).replace(INPUT_DIR, OUTPUT_DIR);
	FileSystem.createDirIfNot(outputDirPath);

	for (const file of files) {
		const filePath = path.join(p, file);
		patch_infos[m_id].files_count++;

		const decoded = decode(FileSystem.readFileSync(filePath));
		for (const row of toRows(decoded.fields)) {
			if (typeof row.value !== 'string') continue;
			if (!row.editable || row.kind !== 'string') continue;
			if (processRow(decoded, row, file, m_id)) continue;
			patch_infos[m_id].unchanged_count++;
		}

		const newBin = encode(decoded.fields);
		const outputFilename = !file.endsWith('.carfinalstate') ? file : file.replace(o_id, m_id);
		FileSystem.writeFileSync(path.join(outputDirPath, outputFilename), newBin);
	}
}

/** @param {any} decoded @param {any} row @param {string} file */
function processRow(decoded, row, file, car_id = 'ks_modded_car') {
	const value = (row.value).toLowerCase();
	let patched = false;
	for (const oldValue in corrections) {
		/* COOL IDEA BUT NOT COMPATIBLE WITH OLD VERSION
		const index = value.indexOf(oldValue);
		if (index === -1) continue;

		const after = value[index + oldValue.length];
		if (after !== undefined && after !== '\\' && after !== '/') continue; // "carsetup" inside "carsetuplimits" -> rejected*/
		if (!value.includes(oldValue)) continue;

		// CHECK IF A PERFECT PATCH CORRESPOND
		if (value !== oldValue && corrections[value]) continue;
		
		const o_ext = oldValue.split('.')[1] || null;
		const m_ext = corrections[oldValue].split('.')[1] || null;
		if (o_ext !== m_ext) continue;
		
		const newValue = !o_ext || (o_ext && corrections[oldValue].includes('.'))
						? corrections[oldValue]
						: `${corrections[oldValue]}.${o_ext}`;
		const patch = value.replaceAll(oldValue, newValue);
			//.replaceAll(`\\${'ks_mini_jcs_1990'}\\`, `\\${car_id}\\`); // DEBUG

		if (patched) console.warn(`-- DOUBLE PATCH! ${file}
	value > ${value}
	oldValue > ${oldValue}
	newValue > ${newValue}`);

		setValue(decoded.fields, row.path, row.kind, patch);
		patched = true;
		
		patch_infos[car_id].changed_count++;
		logger.log(`${file} patch: ${oldValue}
	> ${newValue}`);
	}

	return patched;
}


function createModdedCarContent(m_id = 'ks_modded_car') {
	const DISPLAY_NAME = (m_id).replaceAll('_', ' ');
	const carcontentFile = FileSystem.readFileSync(path.join('templates', '.moddedcarcontent'));
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
	FileSystem.writeFileSync(path.join(OUTPUT_DIR, m_id, `${m_id}.moddedcarcontent`), newBin);
}

function run() {
	FileSystem.removeDirIfExist(OUTPUT_DIR);
	FileSystem.createDirIfNot(INPUT_DIR);
	FileSystem.createDirIfNot(OUTPUT_DIR);

	//const inputs_dirs = FileSystem.listDirs(INPUT_DIR).filter((id) => !id.startsWith('_') );

	// HERE DO A LOOP...
	const to_clone_list = cars_to_clone.length ? cars_to_clone : Object.keys(available_cars);
	for (const m_id of to_clone_list) { // for each modded_car_id
		if (!available_cars[m_id]) console.error(`Missing car to clone: ${m_id}!!`);
		
		const o_id = m_id.split('_mod_')[0]; // original car id
		patch_infos[m_id] = new Patch_Info(m_id); // prepare space to store patch infos.
	
		//const base_actor = FileSystem.readFileSync(path.join('actors', `${BASE_CAR_ID}.actor`));
		//FileSystem.writeFileSync(path.join(INPUT_DIR, m_id, `${m_id}.actor`), base_actor);
		
		corrections = {};
		prepareCorrections(o_id, m_id, path.join(TEMPLATES_PATH, m_id));
		processDir(path.join(TEMPLATES_PATH, m_id), m_id, o_id);
		createModdedCarContent(m_id);
	}

	for (const m_id of FileSystem.listDirs(INPUT_DIR)) { // DUPLICATE
		if (m_id.startsWith('_')) continue;

		patch_infos[m_id] = new Patch_Info(m_id); // prepare space to store patch infos.
		corrections = corrections_old;

		// NOT MATCH...
		/*corrections = {};
		prepareCorrections('ks_mini_jcs_1990', m_id, path.join(INPUT_DIR, m_id));
		corrections['ks_mini_jcs_1990_preset_jcs_mech_1_preset_jcs']
			= 'ks_mini_modded_preset_jcs_mech_1_preset_jcs_visual_1'*/

		processDir(path.join(INPUT_DIR, m_id), m_id);
		createModdedCarContent(m_id);
	}


	// LOOP AGAIN TO LOG CHANGES COUNT
	for (const id in patch_infos) logger.log(`${id} => ${patch_infos[id].changed_count}/${patch_infos[id].unchanged_count} changes.`);
}

run();