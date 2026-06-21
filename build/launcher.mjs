// @ts-check
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { Updater } from './updater.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`__dirname: ${__dirname}`);
const NEUTRALINO_EXE = path.join(__dirname, 'neutralino-win_x64.exe');
//const APP_EXE = path.join(__dirname, 'pink_acevo_modding.exe');
const CONFIG_PATH = path.join(__dirname, 'launcher-config.json');
const RESOURCES_DIR = path.join(__dirname, '..');
const GITHUB_API = 'https://api.github.com/repos/Seigneur-Machiavel/AC_EVO_Modding/releases';
const pkg = JSON.parse(fs.readFileSync(path.join(RESOURCES_DIR, 'package.json'), 'utf8'));
const version = pkg.version; // ex: '0.6.12'
let tryUpdateInterval = null;

process.on('uncaughtException', async (err) => {
	console.error('Uncaught Exception:', err);
	setTimeout(() => process.exit(1), 5000); // allow log reading, then force exit.
});

// ---- CONFIG ------------------------------------------------------------------------
/** @typedef {{ autoUpdate: boolean, ignorePreRelease: boolean, installedVersion?: string }} LauncherConfig */
/** @type {LauncherConfig} */
const DEFAULT_CONFIG = { autoUpdate: true, ignorePreRelease: true };

/** @returns {LauncherConfig} */
function loadConfig() {
	if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
	try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; }
	catch { return { ...DEFAULT_CONFIG }; }
}

// ---- MAIN --------------------------------------------------------------------------
async function main() {
	const cfg = loadConfig();
	const updater = new Updater(GITHUB_API, version, cfg.ignorePreRelease);

	// Auto-update check before starting
	if (cfg.autoUpdate)
		try { await updater.run(RESOURCES_DIR); }
		catch (/** @type {any} */ e) { console.log('[update] check failed:', e.message); }

	console.log('WILL START MAIN.mjs...');
	await import('../main.mjs');

	console.log('WILL START NEUTRALINO...');
	const neu = spawn(NEUTRALINO_EXE, [], { cwd: __dirname, stdio: ['ignore', 'inherit', 'inherit'], detached: false });
	neu.on('close', () => { throw new Error('Neutralino has been neutralized!') });
	//spawn(APP_EXE, [], { stdio: ['ignore', 'inherit', 'inherit'] });

	// autoUpdate interval setup (check every 20 minutes)
	if (cfg.autoUpdate) tryUpdateInterval = setInterval(async () => {
		try { await updater.run(RESOURCES_DIR); }
		catch (/** @type {any} */ e) { console.log('[update] check failed:', e.message); }
	}, 20 * 60 * 1000);
}

main().catch(e => console.error('[launcher] fatal:', e));
