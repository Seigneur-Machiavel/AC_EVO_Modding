// @ts-check
import path from "path";
import { decode, encode, setValue, toRows } from "./protobuf.js";
import { Logger, FileSystem } from './helpers.mjs';

const CARS_DIR = 'D:\\_Projects\\ACEvo.Package\\content.extracted\\content\\cars';
const CARS_LIST = FileSystem.listDirs(CARS_DIR).filter(d => d.startsWith('ks_'));
console.log(`${CARS_LIST.length} cars found`);

// CLEAR TEMPLATES DIRS (NOT FILES!)
const templates_dirs = FileSystem.listDirs(path.join('templates'));
for (const dir of templates_dirs) FileSystem.removeDirIfExist(path.join('templates', dir));

function extractMechList(car_dir_path = '.../ks_porsche_992_gt3_rs') {
	// preset_gt3rs_mech_1.mechanicalcarpreset
	const mechList = [];
	const filesList = FileSystem.listFiles(path.join(car_dir_path, 'presets'));
	for (let i = 1; i < 10; i++)
		for (const file of filesList) {
			if (!file.includes('.mechanicalcarpreset')) continue;
			else if (!file.includes(`mech_${i}`)) continue;
			else mechList.push(`mech_${i}`);
			break;
		}

	return mechList;
}

for (const car_dir of CARS_LIST) {
	const car_dir_path = 	path.join(CARS_DIR, car_dir);
	const car_data_path = 	path.join(car_dir_path, 'data');
	const car_setup_path = 	path.join(car_data_path, 'setup');
	const car_presets_path=	path.join(car_dir_path, 'presets');
	const mech_list = extractMechList(car_dir_path);
	if (mech_list.length === 0) { console.info(`Missing mech for ${car_dir}`); continue; }

	// ONLY MECH_1 ATM
	const mech = mech_list[0];
	const car_dir_files = 	FileSystem.listFiles(car_dir_path).filter(f => f.endsWith('.actor'));
	const data_files = 		FileSystem.listFiles(car_data_path);
	const setup_files = 	FileSystem.listFiles(car_setup_path)
	const presets_files = 	FileSystem.listFiles(car_presets_path);

	// COPY FILES WITH RENAMING
	const template_path = 		path.join('templates', `${car_dir}_mod_${mech}`);
	const template_data_path = 	path.join(template_path, 'data');
	const template_setup_path = path.join(template_data_path, 'setup');
	const template_presets_path=path.join(template_path, 'presets');

	FileSystem.createDirIfNot(template_setup_path); // create 'data' dir at the same time.
	FileSystem.createDirIfNot(template_presets_path);

	FileSystem.copyFile(car_dir_files[0], car_dir_path, template_path, `_mod_${mech}`);
	for (const f of data_files) 	FileSystem.copyFile(f, car_data_path, template_data_path);
	for (const f of setup_files) 	FileSystem.copyFile(f, car_setup_path, template_setup_path);
	for (const f of presets_files)
		if (f.endsWith('.carfinalstate') && !f.includes(mech)) continue;
		else FileSystem.copyFile(f, car_presets_path, template_presets_path);
}