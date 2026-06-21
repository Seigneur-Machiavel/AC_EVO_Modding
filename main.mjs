// @ts-check
import fs from 'fs';
import path from "path";
import http from 'http';
import { WebSocketServer } from 'ws';
import { ModSwap, ModParts, ModData } from './src/classes.mjs';
import { CarCreator, Patch_Info } from "./src/car-creator.mjs";
import { MainPaths, FileSystem, Logger, MIME_TYPES } from './src/helpers.mjs';

process.on("uncaughtException", () => logger.save());

/**
 * @typedef {import('./src/classes.mjs').ModPartsLib} ModPartsLib
 * @typedef {import('./src/classes.mjs').ModSetupsLib} ModSetupsLib
 * @typedef {import('./src/classes.mjs').ModSwapsLib} ModSwapsLib
 * 
 * @typedef {Object} Message 
 * @property {string} Message.type
 * @property {string | Object} Message.payload
 * 
 * @typedef {Object} SwapPayload 
 * @property {string} SwapPayload.car_id
 * @property {string} SwapPayload.mech
 * @property {ModSwap} SwapPayload.mod_swap
 */

/** @type {Record<string, Patch_Info>} */
const patch_infos = {};
const logger = new Logger();
const PORT = 4639;
/** @type {any} */			const USER_PREFERENCES = {};
/** @type {ModPartsLib} */ 	const MECHS = {};
/** @type {ModSetupsLib} */ const SETUPS = {};
/** @type {ModSwapsLib} */ 	const SWAPS = {};
let MAIN_PATHS = new MainPaths();

// NOTES FOR DEV
// In .actor
// Driving side : LHS | RHS | Centre
// Driver model type : Street | Racing
// ks_mini_jcs_1990_mod_mech_1 | ks_porsche_992_gt3_rs_mod_mech_1 | ks_toyota_supra_mkiv_mod_mech_1

/* WORKING
'event:/evo_cars/ks_mini_jcs_1990/': 'event:/evo_cars/ks_chevrolet_camaro_zl1/',
'content\\sfx\\ks_mini_jcs_1990.bank': 'content\\sfx\\ks_chevrolet_camaro_zl1.bank'
'road_165_60_12.tyre':		{ newValue: 'supercar_165_60_12.tyre', oldValue: 'road_165_60_12.tyre' }

'ks_mini_modded_front.coilover': { newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded_rear.coilover': { newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded_front.suspension': { newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded_rear.suspension': { newValue: 'ks_toyota_supra_mkiv' },

'ks_mini_modded.drivetrain': { newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded.gearbox': 	{ newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded.clutch':	{ newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded.carengine':	{ newValue: 'ks_toyota_supra_mkiv' },
'ks_mini_modded.brakesystem': { newValue: 'ks_toyota_supra_mkiv' }, */

function init() {
	// LOAD USER PREFERENCES
	try {
		/** @type {any} */ // @ts-ignore
		const RAW_USER_PREFERENCES = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'user_preferences.json')));
		for (const key in RAW_USER_PREFERENCES) USER_PREFERENCES[key] = RAW_USER_PREFERENCES[key];
		if (USER_PREFERENCES.ACE_MODS_PATH) MAIN_PATHS = new MainPaths(USER_PREFERENCES.ACE_MODS_PATH);
		logger.log('USER_PREFERENCES LOADED!');
	} catch (error) { logger.log('FAILED TO LOAD USER_PREFERENCES!') };

	if (!MAIN_PATHS.ACE_MODS) return;
	
	// LOAD MECHS
	try {
		/** key: car_id, key: mech, value: ModParts,  @type {ModPartsLib} */ // @ts-ignore
		const RAW_MECHS = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs.json')));
		let total_mechs_count = 0;
		for (const car_id in RAW_MECHS) {
			if (!MECHS[car_id]) MECHS[car_id] = {};
			for (const mech in RAW_MECHS[car_id])
				{ MECHS[car_id][mech] = ModParts.from(RAW_MECHS[car_id][mech]); total_mechs_count++ };
		} logger.log(`${total_mechs_count} MECHS LOADED!`);
	} catch (error) { throw new Error('NO MECHS TO LOAD!') };

	// LAOD SATUPS
	try {
		/** key: car_id, key: mech, value: ModParts,  @type {ModSetupsLib} */ // @ts-ignore
		const RAW_SETUPS = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'mod_setups.json')));
		let total_setups_count = 0;
		for (const car_id in RAW_SETUPS) {
			if (!SETUPS[car_id]) SETUPS[car_id] = {};
			for (const mech in RAW_SETUPS[car_id])
				{ SETUPS[car_id][mech] = ModData.from(RAW_SETUPS[car_id][mech]); total_setups_count++ };
		} logger.log(`${total_setups_count} SETUPS LOADED!`);
	} catch (error) { throw new Error('NO SETUPS TO LOAD!') };
	
	// LOAD SWAPS
	try {
		/** key: car_id, key: mech, value: ModParts,  @type {ModSwapsLib} */ // @ts-ignore
		const RAW_USER_SWAPS = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'user_swaps.json')));
		let total_swaps_count = 0;
		for (const car_id in RAW_USER_SWAPS) {
			if (!SWAPS[car_id]) SWAPS[car_id] = {};
			for (const mech in RAW_USER_SWAPS[car_id])
				{ SWAPS[car_id][mech] = ModSwap.from(RAW_USER_SWAPS[car_id][mech]); total_swaps_count++ };
		} logger.log(`${total_swaps_count} SWAPS LOADED!`);
	} catch (error) { logger.log('NO SWAPS TO LOAD!') };

	// CLONE "pink_mods" DIR TO "mods\uiresources\branding\oem"
	if (!MAIN_PATHS.ACE_MODS) return;
	try { FileSystem.readFileSync(path.join(MAIN_PATHS.ACE_MODS, 'uiresources', 'branding', 'oem', 'pink_mods', 'logo.texture')); }
	catch { FileSystem.copyDir('pink_mods', path.join(MAIN_PATHS.ACE_MODS, 'uiresources', 'branding', 'oem', 'pink_mods')); };

	//FileSystem.removeDirIfExist(MAIN_PATHS.OUTPUT); 	// only if user haven't set ACE/mods
	//FileSystem.createDirIfNot(MAIN_PATHS.OUTPUT);		// only if user haven't set ACE/mods
	FileSystem.createDirIfNot(MAIN_PATHS.INPUT);
	clone_all_missing_cars();
	return true;
}

function clone_all_missing_cars() {
	const EXISTING_MOD_CARS = FileSystem.listDirs(MAIN_PATHS.OUTPUT);
	for (const m_id of FileSystem.listDirs(MAIN_PATHS.TEMPLATES))
		if (!EXISTING_MOD_CARS.includes(m_id)) clone_car(m_id);
}

/** @param {ModSwap} [swap] Optionnal swap */
function clone_car(m_id = 'ks_toyota_supra_mkiv_mod_mech_1', swap) {
	const o_id = m_id.split('_mod_')[0]; // original car id
	const mech = m_id.split('_mod_')[1];
	const s = swap || SWAPS[o_id]?.[mech];
	const carCreator = new CarCreator(MAIN_PATHS, o_id, m_id, mech, MECHS, s, logger);
	carCreator.prepareSoundCorrections();
	carCreator.prepareCorrections(path.join(MAIN_PATHS.TEMPLATES, m_id));
	carCreator.processDir(path.join(MAIN_PATHS.TEMPLATES, m_id));
	carCreator.createModdedCarContent();
	patch_infos[m_id] = carCreator.patch_info;

	// LOOP AGAIN TO LOG CHANGES COUNT
	for (const id in patch_infos) logger.log(`${id} => ${patch_infos[id].changed_count}/${patch_infos[id].unchanged_count} changes.`);
}

// SERVER
const server = http.createServer((req, res) => { // @ts-ignore
	const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
	let filePath = path.join(MAIN_PATHS.FRONT, urlPath);
	if (!fs.existsSync(filePath)) filePath = path.join(MAIN_PATHS.SRC, urlPath); // try from src

	// prevent escaping the src / front folder via "../"
	if (!filePath.startsWith(MAIN_PATHS.SRC)) { res.writeHead(403); res.end('Forbidden'); return; }

	let file;
	try { file = FileSystem.readFileSync(filePath); }
	catch { res.writeHead(404); res.end('Not found'); return; }

	const ext = path.extname(filePath); // @ts-ignore
	res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
	res.end(file);
});

function handleModsPath(p = 'C:\\') {
	const main_paths = new MainPaths(p);
	if (!main_paths.ACE_MODS) return { type: 'path_result', reason: 'Wrong path', ok: false, path: p };
	
	USER_PREFERENCES.ACE_MODS_PATH = p;
	FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'user_preferences.json'), JSON.stringify(USER_PREFERENCES));
	return { type: 'path_result', reason: 'na', ok: true, path: p };
}

/** @param {SwapPayload} payload */
function handleSwapUpdate(payload) {
	const { car_id, mech, mod_swap } = payload;
	try { // CLONE CAR & SAVE SWAPS
		const swap = ModSwap.from(mod_swap);
		clone_car(`${car_id}_mod_${mech}`, swap);

		if (!SWAPS[car_id]) SWAPS[car_id] = {};
		SWAPS[car_id][mech] = swap;
		FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'user_swaps.json'), JSON.stringify(SWAPS));
		return { type: 'swap_result', reason: 'na', ok: true, car_id, mech };
	} catch (/** @type {any} */ error) {
		return { type: 'swap_result', reason: error.message, ok: false, car_id, mech };
	}
}

if (MAIN_PATHS.ACE_MODS) init(); // INIT FIRST > LOADING PREFERENCES, MECHS, SWAPS.
const wss = new WebSocketServer({ server });
wss.on('connection', (socket) => {
	console.log('[ws] client connected');

	let hasInit = init();
	if (hasInit) socket.send(JSON.stringify({ type: 'init', ace_mods_path: MAIN_PATHS.ACE_MODS, mechs: MECHS, setups: SETUPS, swaps: SWAPS }));

	socket.on('message', (/** @type {any} */ data) => {
		/** @type {Message} */
		const message = JSON.parse(data);
		const { type, payload } = message;
		
		if (type === 'set_ace_mods_path') {// @ts-ignore
			socket.send(JSON.stringify(handleModsPath(payload.path)));
			hasInit = init(); // LOAD & INIT AGAIN
			socket.send(JSON.stringify({ type: 'init', ace_mods_path: MAIN_PATHS.ACE_MODS, mechs: MECHS, setups: SETUPS, swaps: SWAPS }));
		}
		
		if (type === 'update_swap_and_build') // @ts-ignore
			socket.send(JSON.stringify(handleSwapUpdate(payload)));
	});

	socket.on('close', () => { console.log('[ws] client disconnected'); logger.save(); });
});

server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));