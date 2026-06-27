// @ts-check
import fs from 'fs';
import path from "path";
import http from 'http';
import { WebSocketServer } from 'ws';
import { CarCreator, Patch_Info } from "./src/car-creator.mjs";
import { MainPaths, FileSystem, Logger, MIME_TYPES, Timer } from './src/helpers.mjs';
import { ModSwap, ModParts, ModData, ModSwapsLib, TyresLib, AeroLib } from './src/classes.mjs';

process.on("exit", () => logger.save());

/**
 * @typedef {import('./src/classes.mjs').SetOfModParts} SetOfModParts
 * @typedef {import('./src/classes.mjs').SetOfModSetups} SetOfModSetups
 * @typedef {import('./src/classes.mjs').SetOfMechTyres} SetOfMechTyres
 * 
 * @typedef {import('./src/classes.mjs').SetOfTyres} SetOfTyres
 * @typedef {import('./src/classes.mjs').RawSwaps} RawSwaps
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
const TIMING_LOGS = false; // DEV
const PORT = 4639;
let FRESH_START = true; // Flag Indicate to clear mods\content\cars at startup
/** @type {any} */				const USER_PREFERENCES = {};
/** @type {SetOfMechTyres} */ 	let MECHS_TYRES = {};
/** @type {SetOfModSetups} */ 	const SETUPS = {};
/** @type {SetOfModParts} */ 	const MECHS = {};
/** @type {SetOfTyres} */ 		let TYRES = {};
/** @type {TyresLib} */ 		let TYRES_LIB;
/** @type {AeroLib} */ 			let AERO_LIB;
/** @type {ModSwapsLib} */ 	let SWAPS = new ModSwapsLib();

let MAIN_PATHS = new MainPaths(); // @ts-ignore
let VERSION = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'package.json'))).version;

// NOTES FOR DEV
// In .actor
// Driver model type : Street | Racing
// ks_mini_jcs_1990_mod_mech_1 | ks_porsche_992_gt3_rs_mod_mech_1 | ks_toyota_supra_mkiv_mod_mech_1

/* WORKING
'road_165_60_12.tyre':		{ newValue: 'supercar_165_60_12.tyre', oldValue: 'road_165_60_12.tyre' }
 */

function init() { // @ts-ignore
	MECHS_TYRES = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs_tyres.json'))); // @ts-ignore
	TYRES = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'tyres.json')));
	TYRES_LIB = new TyresLib(TYRES); // @ts-ignore
	AERO_LIB = new AeroLib(JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'aeros.json'))).store);

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
		/** key: car_id, key: mech, value: ModParts,  @type {SetOfModParts} */ // @ts-ignore
		const RAW_MECHS = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'mod_mechs.json')));
		let total_mechs_count = 0;
		for (const car_id in RAW_MECHS) {
			if (!MECHS[car_id]) MECHS[car_id] = {};
			for (const mech in RAW_MECHS[car_id])
				{ MECHS[car_id][mech] = ModParts.from(RAW_MECHS[car_id][mech]); total_mechs_count++ };
		} logger.log(`${total_mechs_count} MECHS LOADED!`);
	} catch (error) { throw new Error('NO MECHS TO LOAD!') };

	// LAOD SETUPS
	try {
		/** key: car_id, key: mech, value: ModParts,  @type {SetOfModSetups} */ // @ts-ignore
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
		/** key: car_id, key: mech, value: ModParts,  @type {RawSwaps} */ // @ts-ignore
		const RAW_USER_SWAPS = JSON.parse(FileSystem.readFileSync(path.join(MAIN_PATHS.ROOT, 'user_swaps.json')));
		const swapsLib = new ModSwapsLib(RAW_USER_SWAPS);
		SWAPS = swapsLib;
		logger.log(`${SWAPS.total_swaps_count} SWAPS LOADED!`);
	} catch (error) { logger.log('NO SWAPS TO LOAD!') };

	// CLONE "pink_mods" DIR TO "mods\uiresources\branding\oem"
	if (!MAIN_PATHS.ACE_MODS) return;
	try { FileSystem.readFileSync(path.join(MAIN_PATHS.ACE_MODS, 'uiresources', 'branding', 'oem', 'pink_mods', 'logo.texture')); }
	catch { FileSystem.copyDir('pink_mods', path.join(MAIN_PATHS.ACE_MODS, 'uiresources', 'branding', 'oem', 'pink_mods')); };

	FileSystem.createDirIfNot(MAIN_PATHS.INPUT);
	if (FRESH_START) { FileSystem.removeDirIfExist(MAIN_PATHS.OUTPUT); FRESH_START = false };
	FileSystem.createDirIfNot(MAIN_PATHS.OUTPUT);
	clone_all_missing_cars();

	return true;
}
async function clone_all_missing_cars() {
	const start = Date.now();
	const EXISTING_MOD_CARS = FileSystem.listDirs(MAIN_PATHS.OUTPUT);
	const TEMPLATES_CARS = FileSystem.listDirs(MAIN_PATHS.TEMPLATES);
	for (const m_id of TEMPLATES_CARS) {
		if (!EXISTING_MOD_CARS.includes(m_id)) clone_car(m_id);
		await new Promise(res => setTimeout(res, 1)); // micro pause to breath and serve front
	}
	
	console.info(`[clone_all_missing_cars] ${(Date.now() - start)}ms`);
}

/** @param {ModSwap} [swap] Optionnal swap */
function clone_car(m_id = 'ks_toyota_supra_mkiv_mod_mech_1', swap) {
	const o_id = m_id.split('_mod_')[0]; // original car id
	const mech = m_id.split('_mod_')[1];
	const s = swap || SWAPS.get(o_id, mech);
	const carCreator = new CarCreator(MAIN_PATHS, o_id, m_id, mech, TYRES_LIB, AERO_LIB, MECHS_TYRES, MECHS, s, logger);
	const timer = new Timer();
	carCreator.prepareArch(path.join(MAIN_PATHS.TEMPLATES, m_id)); timer.mark('prepareArch');
	carCreator.prepareTyresCorrections(); timer.mark('prepareTyresCorrections');
	carCreator.prepareSoundCorrections(); timer.mark('prepareSoundCorrections');
	carCreator.prepareSetupCorrections(); timer.mark('prepareSetupCorrections');
	carCreator.prepareModFilesCorrections(); timer.mark('prepareModFilesCorrections');
	carCreator.preparePartsCorrections(); timer.mark('preparePartsCorrections');
	carCreator.processArch(); timer.mark('processArch');
	carCreator.createModdedCarContent(); timer.mark('createModdedCarContent');
	patch_infos[m_id] = carCreator.patch_info;

	logger.log(`${m_id} => ${carCreator.patch_info.changed_count}/${carCreator.patch_info.unchanged_count} changes in ${carCreator.patch_info.files_count} files.`);
	if (!TIMING_LOGS) return;
	for (const entry of timer.timings) console.info(entry);
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
		const swap = new ModSwap(mod_swap);
		clone_car(`${car_id}_mod_${mech}`, swap);

		SWAPS.set(car_id, mech, swap);
		FileSystem.writeFileSync(path.join(MAIN_PATHS.ROOT, 'user_swaps.json'), JSON.stringify(SWAPS));
		return { type: 'swap_result', reason: 'na', ok: true, car_id, mech };
	} catch (/** @type {any} */ error) {
		console.error(error.stack);
		return { type: 'swap_result', reason: error.message, ok: false, car_id, mech };
	}
}

if (MAIN_PATHS.ACE_MODS) init(); // INIT FIRST > LOADING PREFERENCES, MECHS, SWAPS.
const wss = new WebSocketServer({ server });
const initMessage = () => { return { type: 'init', VERSION, ace_mods_path: MAIN_PATHS.ACE_MODS, MECHS, SETUPS, SWAPS, TYRES, MECHS_TYRES, AERO_LIB } }
wss.on('connection', (socket) => {
	console.log('[ws] client connected');

	let hasInit = init();
	if (hasInit) socket.send(JSON.stringify(initMessage()));

	socket.on('message', (/** @type {any} */ data) => {
		/** @type {Message} */
		const message = JSON.parse(data);
		const { type, payload } = message;
		
		if (type === 'set_ace_mods_path') {// @ts-ignore
			socket.send(JSON.stringify(handleModsPath(payload.path)));
			hasInit = init(); // LOAD & INIT AGAIN
			socket.send(JSON.stringify(initMessage()));
		}
		
		if (type === 'update_swap_and_build') // @ts-ignore
			socket.send(JSON.stringify(handleSwapUpdate(payload)));
	});

	socket.on('close', () => { console.log('[ws] client disconnected'); logger.save(); });
});

server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));